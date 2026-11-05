import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync as fsChmodSync,
  closeSync,
  constants,
  lstatSync as fsLstatSync,
  mkdirSync as fsMkdirSync,
  openSync as fsOpenSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
import type { ParsedQuota } from "./adapters/parse.js";
import { sanitizeAntigravityQuota } from "./adapters/antigravity.js";
import { sanitizeClaudeQuota } from "./adapters/claude.js";

const MAX_BYTES = 256 * 1024;
const MAX_RECORDS = 128;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DROPPED = 1_000_000_000;

export type StatuslinePending = {
  id: string;
  providerId: "claude" | "antigravity";
  sourceVersion: string;
  ownershipGeneration: number;
  quota: ParsedQuota;
  collectedAt: string;
};

export type StatuslineDiagnostics = {
  pending: number;
  bytes: number;
  dropped: number;
};

type SpoolRow = {
  id: string;
  provider: string;
  source_version: string;
  generation: number;
  body: string;
  collected_at: string;
};

function ownFile(info: Stats) {
  return (
    info.isFile() &&
    !info.isSymbolicLink() &&
    (info.mode & 0o077) === 0 &&
    (typeof process.getuid !== "function" || info.uid === process.getuid())
  );
}

function ownDirectory(info: Stats) {
  return (
    info.isDirectory() &&
    !info.isSymbolicLink() &&
    (info.mode & 0o077) === 0 &&
    (typeof process.getuid !== "function" || info.uid === process.getuid())
  );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function fixedError(error: unknown) {
  if (
    error instanceof Error &&
    /^(?:STATE_BUSY|STATE_PERMISSIONS|STATE_UNAVAILABLE|INVALID_QUOTA|INVALID_SOURCE_VERSION|INVALID_CAPTURE_TIME)$/.test(
      error.message,
    )
  )
    return error.message;
  if (error instanceof Error && /busy|locked/i.test(error.message))
    return "STATE_BUSY";
  return "STATE_UNAVAILABLE";
}

export class StatuslineSpool {
  private constructor(private readonly database: DatabaseSync) {}

  static open(stateDirectory: string): StatuslineSpool {
    const directory = resolve(stateDirectory);
    try {
      const info = lstatSync(directory);
      if (!ownDirectory(info)) throw new Error("STATE_PERMISSIONS");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      mkdirSync(directory);
    }
    const info = lstatSync(directory);
    if (!ownDirectory(info)) throw new Error("STATE_PERMISSIONS");
    const path = join(directory, "statusline.db");
    try {
      const existing = lstatSync(path);
      if (!ownFile(existing)) throw new Error("STATE_PERMISSIONS");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      createPrivateFile(path);
    }
    const database = new DatabaseSync(path);
    try {
      database.exec(
        "PRAGMA busy_timeout=100; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;",
      );
      database.exec(`
        CREATE TABLE IF NOT EXISTS spool_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
        INSERT OR IGNORE INTO spool_meta(key,value) VALUES('dropped',0);
        CREATE TABLE IF NOT EXISTS spool_state (provider TEXT PRIMARY KEY, semantic TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS spool_seen (provider TEXT PRIMARY KEY,generation INTEGER NOT NULL,last_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS spool_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          provider TEXT NOT NULL,
          source_version TEXT NOT NULL,
          body TEXT NOT NULL,
          collected_at TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          bytes INTEGER NOT NULL
        );
      `);
      const columns = database
        .prepare("PRAGMA table_info(spool_events)")
        .all() as { name: string }[];
      if (!columns.some((c) => c.name === "generation"))
        database.exec(
          "ALTER TABLE spool_events ADD COLUMN generation INTEGER NOT NULL DEFAULT 1",
        );
      chmodSync(path, 0o600);
      return new StatuslineSpool(database);
    } catch (error) {
      database.close();
      throw new Error(fixedError(error));
    }
  }

  enqueue(
    provider: "claude" | "antigravity",
    version: string,
    quota: ParsedQuota,
    capturedAt = new Date().toISOString(),
    generation = 1,
  ): { code: string } {
    if (
      !["claude", "antigravity"].includes(provider) ||
      !Number.isSafeInteger(generation) ||
      generation < 1
    )
      return { code: "INVALID_QUOTA" };
    let safeQuota: ParsedQuota;
    try {
      safeQuota =
        provider === "claude"
          ? sanitizeClaudeQuota(quota)
          : sanitizeAntigravityQuota(quota);
    } catch {
      return { code: "INVALID_QUOTA" };
    }
    if (
      !(
        provider === "claude"
          ? /^claude-code\/2\.1\.299$/
          : /^antigravity\/(?:1\.4\.9|1\.5\.1)$/
      ).test(version)
    )
      return { code: "INVALID_SOURCE_VERSION" };
    const capturedMs = Date.parse(capturedAt);
    if (
      !Number.isFinite(capturedMs) ||
      new Date(capturedMs).toISOString() !== capturedAt
    )
      return { code: "INVALID_CAPTURE_TIME" };
    const semantic = createHash("sha256")
      .update(canonical({ provider, version, generation, quota: safeQuota }))
      .digest("hex");
    const body = JSON.stringify(safeQuota);
    const bytes = Buffer.byteLength(body);
    if (bytes > MAX_BYTES) return { code: "INVALID_QUOTA" };
    let duplicate = false;
    try {
      this.transaction(() => {
        const now = Date.now();
        this.database
          .prepare(
            "INSERT INTO spool_seen(provider,generation,last_at) VALUES(?,?,?) ON CONFLICT(provider) DO UPDATE SET generation=excluded.generation,last_at=excluded.last_at",
          )
          .run(provider, generation, now);
        this.prune(now);
        const prior = this.database
          .prepare("SELECT semantic FROM spool_state WHERE provider=?")
          .get(provider) as { semantic: string } | undefined;
        if (prior?.semantic === semantic) {
          duplicate = true;
          return;
        }
        const capacity = this.database
          .prepare(
            "SELECT COUNT(*) AS count, COALESCE(SUM(bytes),0) AS bytes FROM spool_events",
          )
          .get() as { count: number; bytes: number };
        if (
          Number(capacity.count) >= MAX_RECORDS ||
          Number(capacity.bytes) + bytes > MAX_BYTES
        ) {
          throw new Error("QUEUE_FULL");
        }
        this.database
          .prepare(
            "INSERT INTO spool_events(id,provider,source_version,body,collected_at,created_at,bytes,generation) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            provider,
            version,
            body,
            capturedAt,
            capturedMs,
            bytes,
            generation,
          );
        this.database
          .prepare(
            "INSERT INTO spool_state(provider,semantic) VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET semantic=excluded.semantic",
          )
          .run(provider, semantic);
      });
      return { code: duplicate ? "DUPLICATE" : "QUEUED" };
    } catch (error) {
      if (error instanceof Error && error.message === "QUEUE_FULL") {
        try {
          this.incrementDropped();
        } catch {
          return { code: "STATE_BUSY" };
        }
        return { code: "QUEUE_FULL" };
      }
      if (error instanceof Error && error.message === "DUPLICATE")
        return { code: error.message };
      return { code: fixedError(error) };
    }
  }

  pending(): StatuslinePending[] {
    try {
      this.transaction(() => this.prune(Date.now()));
      const rows = this.database
        .prepare(
          "SELECT id,provider,source_version,body,collected_at,generation FROM spool_events ORDER BY sequence LIMIT ?",
        )
        .all(MAX_RECORDS) as unknown as SpoolRow[];
      if (rows.some((row) => !["claude", "antigravity"].includes(row.provider)))
        throw new Error("STATE_UNAVAILABLE");
      return rows.map((row) => ({
        id: row.id,
        providerId: row.provider === "antigravity" ? "antigravity" : "claude",
        sourceVersion: row.source_version,
        ownershipGeneration: Number(row.generation),
        quota:
          row.provider === "antigravity"
            ? sanitizeAntigravityQuota(JSON.parse(row.body) as ParsedQuota)
            : sanitizeClaudeQuota(JSON.parse(row.body) as ParsedQuota),
        collectedAt: row.collected_at,
      }));
    } catch (error) {
      throw new Error(fixedError(error));
    }
  }

  acknowledge(id: string): void {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("INVALID_EVENT_ID");
    try {
      this.transaction(() => {
        this.database.prepare("DELETE FROM spool_events WHERE id=?").run(id);
      });
    } catch (error) {
      throw new Error(fixedError(error));
    }
  }

  discard(id: string): void {
    this.transaction(() => {
      const deleted = this.database
        .prepare("DELETE FROM spool_events WHERE id=?")
        .run(id);
      if (deleted.changes) this.incrementDropped();
    });
  }

  lastCallbackAt(
    provider: "claude" | "antigravity",
    generation: number,
  ): number | null {
    const row = this.database
      .prepare(
        "SELECT last_at FROM spool_seen WHERE provider=? AND generation=?",
      )
      .get(provider, generation) as { last_at: number } | undefined;
    return row ? Number(row.last_at) : null;
  }

  inspect(): StatuslineDiagnostics {
    try {
      this.transaction(() => this.prune(Date.now()));
      const result = this.database
        .prepare(
          "SELECT COUNT(*) AS count, COALESCE(SUM(bytes),0) AS bytes FROM spool_events",
        )
        .get() as { count: number; bytes: number };
      const dropped = this.database
        .prepare("SELECT value FROM spool_meta WHERE key='dropped'")
        .get() as { value: number };
      return {
        pending: Number(result.count),
        bytes: Number(result.bytes),
        dropped: Number(dropped.value),
      };
    } catch (error) {
      throw new Error(fixedError(error));
    }
  }

  close(): void {
    try {
      this.database.close();
    } catch {
      throw new Error("STATE_UNAVAILABLE");
    }
  }

  private transaction(action: () => void) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      action();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private prune(now: number) {
    const expired = this.database
      .prepare("SELECT COUNT(*) AS count FROM spool_events WHERE created_at<?")
      .get(now - MAX_AGE_MS) as { count: number };
    const count = Number(expired.count);
    if (count > 0) {
      this.database
        .prepare("DELETE FROM spool_events WHERE created_at<?")
        .run(now - MAX_AGE_MS);
      this.incrementDropped(count);
    }
  }

  private incrementDropped(amount = 1) {
    this.database
      .prepare("UPDATE spool_meta SET value=MIN(?,value+?) WHERE key='dropped'")
      .run(MAX_DROPPED, amount);
  }
}

function lstatSync(path: string) {
  return fsLstatSync(path);
}

function mkdirSync(path: string) {
  fsMkdirSync(path, { recursive: true, mode: 0o700 });
  fsChmodSync(path, 0o700);
}

function chmodSync(path: string, mode: number) {
  fsChmodSync(path, mode);
}

function createPrivateFile(path: string) {
  const fd = fsOpenSync(
    path,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  closeSync(fd);
}
