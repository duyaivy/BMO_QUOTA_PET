import { createClient, type Client } from "@libsql/client";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  lstat,
  chmod,
  open as openFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  eventSchema,
  semanticInput,
  signingInput,
  type UsageEvent,
  type QuotaWindow,
} from "../../src/contracts/usage/index.js";
import { parseFixture } from "./adapters/parse.js";
import type {
  CaptureResult,
  CollectorConfig,
  Diagnostics,
  ProviderId,
} from "./types.js";
export type {
  CollectorConfig,
  CaptureResult,
  Diagnostics,
  ProviderId,
  UsageEvent,
};
const SRC = {
  codex: "codex-session-jsonl",
  claude: "claude-statusline",
  antigravity: "antigravity-statusline",
} as const;
const nowIso = (ms: number) => new Date(ms).toISOString();
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
function safeCode(code: string) {
  return /^[A-Z_]{1,48}$/.test(code) ? code : "INTERNAL_ERROR";
}
function semantic(event: UsageEvent) {
  return sha(semanticInput(event));
}
async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  const abort = () => {
    void reader.cancel();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw new Error("RESPONSE_TIMEOUT");
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(decoder.decode(item.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
const execute = promisify(execFile);
async function processIdentity(pid: number): Promise<string | null> {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("STATE_CORRUPT");
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return null;
    throw new Error("STATE_IDENTITY_UNAVAILABLE");
  }
  try {
    const { stdout } = await execute(
      "/bin/ps",
      ["-p", String(pid), "-o", "lstart="],
      {
        timeout: 1000,
        maxBuffer: 256,
        env: { NODE_ENV: process.env.NODE_ENV, LC_ALL: "C", TZ: "UTC" },
        encoding: "utf8",
      },
    );
    const value = stdout.trim().replace(/\s+/g, " ");
    if (!value) return null;
    return value;
  } catch {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return null;
    }
    throw new Error("STATE_IDENTITY_UNAVAILABLE");
  }
}
export class FixtureCollector {
  private client: Client;
  private secret: Buffer;
  private mutex = Promise.resolve();
  private closed = false;
  private closing = false;
  private closePromise: Promise<void> | null = null;
  private lockToken: string;
  private constructor(
    private config: CollectorConfig,
    client: Client,
    secret: Buffer,
    lockToken: string,
  ) {
    this.lockToken = lockToken;
    this.client = client;
    this.secret = secret;
  }
  static async open(config: CollectorConfig) {
    config = structuredClone(config);
    const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
    if (
      typeof config.secretFile !== "string" ||
      !config.secretFile ||
      typeof config.stateDirectory !== "string" ||
      !config.stateDirectory ||
      typeof config.url !== "string"
    )
      throw new Error("INVALID_CONFIG");
    if (!idPattern.test(config.collectorId) || !idPattern.test(config.keyId))
      throw new Error("INVALID_CONFIG");
    const maxQueueBytes = config.maxQueueBytes ?? 1048576;
    const maxAgeMs = config.maxAgeMs ?? 86400000;
    const timeoutMs = config.timeoutMs ?? 10000;
    if (
      !Number.isSafeInteger(maxQueueBytes) ||
      maxQueueBytes < 1 ||
      maxQueueBytes > 1048576 ||
      !Number.isSafeInteger(maxAgeMs) ||
      maxAgeMs < 1 ||
      maxAgeMs > 86400000 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 60000
    )
      throw new Error("INVALID_CONFIG");
    if (
      !config.providers ||
      typeof config.providers !== "object" ||
      Array.isArray(config.providers)
    )
      throw new Error("INVALID_CONFIG");
    for (const providerName of Object.keys(config.providers)) {
      if (
        !(["codex", "claude", "antigravity"] as string[]).includes(providerName)
      )
        throw new Error("INVALID_CONFIG");
      const provider = providerName as ProviderId;
      const item = config.providers[provider];
      if (
        !item ||
        typeof item.enabled !== "boolean" ||
        !Number.isSafeInteger(item.generation) ||
        item.generation < 1
      )
        throw new Error("INVALID_CONFIG");
    }
    const url = new URL(config.url);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/api/internal/usage/ingest" ||
      url.search ||
      url.hash
    )
      throw new Error("INVALID_INGEST_URL");
    if (
      url.protocol !== "https:" &&
      !(
        config.allowLocalHttp &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
      )
    )
      throw new Error("HTTPS_REQUIRED");
    const secretPath = resolve(config.secretFile),
      secretStat = await lstat(secretPath);
    if (
      !secretStat.isFile() ||
      secretStat.isSymbolicLink() ||
      secretStat.size > 66 ||
      (secretStat.mode & 0o077) !== 0 ||
      (typeof process.getuid === "function" &&
        secretStat.uid !== process.getuid())
    )
      throw new Error("SECRET_PERMISSIONS");
    const secretText = (await readFile(secretPath, "utf8")).trim();
    if (!/^[a-f0-9]{64}$/.test(secretText)) throw new Error("INVALID_SECRET");
    const dir = resolve(config.stateDirectory);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
    const dbPath = join(dir, "state.db");
    try {
      const existing = await lstat(dbPath);
      if (
        !existing.isFile() ||
        existing.isSymbolicLink() ||
        (existing.mode & 0o077) !== 0 ||
        (typeof process.getuid === "function" &&
          existing.uid !== process.getuid())
      )
        throw new Error("STATE_PERMISSIONS");
      const handle = await openFile(dbPath, "r");
      const header = Buffer.alloc(16);
      try {
        const read = await handle.read(header, 0, 16, 0);
        if (
          read.bytesRead !== 16 ||
          header.toString("binary") !== "SQLite format 3\u0000"
        )
          throw new Error("STATE_CORRUPT");
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (
        error instanceof Error &&
        ["STATE_PERMISSIONS", "STATE_CORRUPT"].includes(error.message)
      )
        throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("STATE_UNAVAILABLE");
    }
    const client = createClient({ url: `file:${dbPath}` });
    const lockToken = randomUUID();
    const selfIdentity = await processIdentity(process.pid);
    if (!selfIdentity) throw new Error("STATE_IDENTITY_UNAVAILABLE");
    let claimed = false;
    try {
      await client.execute("PRAGMA journal_mode=WAL");
      await client.execute("PRAGMA synchronous=FULL");
      await client.batch(
        [
          "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY,v TEXT NOT NULL)",
          "CREATE TABLE IF NOT EXISTS events (provider TEXT NOT NULL,seq INTEGER NOT NULL,id TEXT NOT NULL UNIQUE,body TEXT NOT NULL,semantic TEXT NOT NULL,created INTEGER NOT NULL,attempted INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(provider,seq))",
          "CREATE TABLE IF NOT EXISTS checkpoints (provider TEXT PRIMARY KEY,stream TEXT NOT NULL,offset INTEGER NOT NULL)",
          "CREATE TABLE IF NOT EXISTS dedup (provider TEXT PRIMARY KEY,semantic TEXT NOT NULL,event TEXT NOT NULL)",
          "CREATE TABLE IF NOT EXISTS pauses (provider TEXT PRIMARY KEY,code TEXT NOT NULL)",
          "CREATE TABLE IF NOT EXISTS window_cache (provider TEXT NOT NULL,window_id TEXT NOT NULL,semantic TEXT NOT NULL,window_json TEXT NOT NULL,PRIMARY KEY(provider,window_id))",
          "CREATE TABLE IF NOT EXISTS owner (singleton INTEGER PRIMARY KEY CHECK(singleton=1),pid INTEGER NOT NULL,token TEXT NOT NULL,start_identity TEXT)",
        ],
        "write",
      );
      await chmod(join(dir, "state.db"), 0o600).catch(() => {});
      const ownerColumns = await client.execute("PRAGMA table_info(owner)");
      if (!ownerColumns.rows.some((row) => row.name === "start_identity"))
        await client.execute(
          "ALTER TABLE owner ADD COLUMN start_identity TEXT",
        );

      const tx = await client.transaction("write");
      try {
        const row = await tx.execute(
          "SELECT pid,token,start_identity FROM owner WHERE singleton=1",
        );
        if (row.rows.length) {
          const currentIdentity = await processIdentity(
            Number(row.rows[0].pid),
          );
          if (
            currentIdentity &&
            (row.rows[0].start_identity === null ||
              currentIdentity === row.rows[0].start_identity)
          )
            throw new Error("STATE_LOCKED");
        }
        await tx.execute({
          sql: "INSERT OR REPLACE INTO owner(singleton,pid,token,start_identity) VALUES(1,?,?,?)",
          args: [process.pid, lockToken, selfIdentity],
        });
        const identity = JSON.stringify({ collectorId: config.collectorId });
        const prior = await tx.execute("SELECT v FROM meta WHERE k='identity'");
        if (prior.rows.length) {
          let stored: unknown;
          try {
            stored = JSON.parse(String(prior.rows[0].v));
          } catch {
            throw new Error("STATE_CORRUPT");
          }
          if (
            !stored ||
            typeof stored !== "object" ||
            !("collectorId" in stored) ||
            stored.collectorId !== config.collectorId
          )
            throw new Error("STATE_IDENTITY_MISMATCH");
        }
        await tx.execute({
          sql: "INSERT OR IGNORE INTO meta(k,v) VALUES('identity',?)",
          args: [identity],
        });
        await tx.commit();
        claimed = true;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
      return new FixtureCollector(
        config,
        client,
        Buffer.from(secretText, "hex"),
        lockToken,
      );
    } catch (error) {
      if (claimed)
        await client
          .execute({
            sql: "DELETE FROM owner WHERE singleton=1 AND token=?",
            args: [lockToken],
          })
          .catch(() => {});
      client.close();
      throw error;
    }
  }
  private run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.closing || this.closed) return Promise.reject(new Error("CLOSED"));
    const out = this.mutex.then(fn, fn);
    this.mutex = out.then(
      () => {},
      () => {},
    );
    return out;
  }
  async capture(
    providerId: ProviderId,
    raw: string,
    collectedAt = nowIso(Date.now()),
    checkpoint?: { streamId: string; offset: number },
  ): Promise<CaptureResult> {
    return this.run(async () => {
      const cfg = this.config.providers[providerId];
      if (!cfg?.enabled) return { code: "SOURCE_DISABLED", queued: false };
      if (this.closed) return { code: "CLOSED", queued: false };
      const generationKey = `generation:${providerId}`;
      const storedGeneration = await this.client.execute({
        sql: "SELECT v FROM meta WHERE k=?",
        args: [generationKey],
      });
      if (storedGeneration.rows[0]?.v !== String(cfg.generation)) {
        const generationTx = await this.client.transaction("write");
        try {
          await generationTx.execute({
            sql: "DELETE FROM dedup WHERE provider=?",
            args: [providerId],
          });
          await generationTx.execute({
            sql: "DELETE FROM window_cache WHERE provider=?",
            args: [providerId],
          });
          await generationTx.execute({
            sql: "DELETE FROM checkpoints WHERE provider=?",
            args: [providerId],
          });
          await generationTx.execute({
            sql: "INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)",
            args: [generationKey, String(cfg.generation)],
          });
          await generationTx.commit();
        } catch (error) {
          await generationTx.rollback();
          throw error;
        }
      }
      let parsed;
      try {
        parsed = parseFixture(providerId, raw);
      } catch {
        return { code: "MALFORMED_QUOTA", queued: false };
      }
      const captured = Date.parse(collectedAt);
      if (Number.isNaN(captured))
        return { code: "INVALID_CAPTURE_TIME", queued: false };
      const old = await this.client.execute({
        sql: "SELECT semantic,event FROM dedup WHERE provider=?",
        args: [providerId],
      });
      const availability =
        parsed.status === "ok"
          ? "available"
          : parsed.status === "unsupported"
            ? "unsupported"
            : parsed.status === "unavailable"
              ? "unavailable"
              : "error";
      const isOk = parsed.status === "ok";
      const windows: QuotaWindow[] = [];
      if (isOk)
        for (const w of parsed.windows) {
          const base = {
            windowId: w.windowId,
            label: w.label.slice(0, 80) || w.windowId,
            windowDurationSeconds: w.duration,
            usedPercent: w.used,
            remainingPercent: w.used === null ? null : 100 - w.used,
            resetAt: w.reset,
            upstreamObservedAt: parsed.observedAt,
            freshnessBasis: (parsed.observedAt
              ? "upstream_timestamp"
              : "unknown") as "upstream_timestamp" | "unknown",
            sourceFreshness: "unknown" as const,
            dataStatus: w.status ?? ("ok" as const),
          };
          const sem = sha(JSON.stringify(base));
          const cached = await this.client.execute({
            sql: "SELECT semantic,window_json FROM window_cache WHERE provider=? AND window_id=?",
            args: [providerId, w.windowId],
          });
          if (cached.rows[0]?.semantic === sem) {
            windows.push(JSON.parse(String(cached.rows[0].window_json)));
          } else windows.push({ ...base, collectedAt: nowIso(captured) });
        }
      const count = await this.client.execute({
        sql: "SELECT v FROM meta WHERE k=?",
        args: [`sequence:${providerId}`],
      });
      const seq = Number(count.rows[0]?.v ?? 0) + 1;
      const event: UsageEvent = {
        schemaVersion: 1,
        kind: "observation",
        collectorId: this.config.collectorId,
        eventId: randomUUID(),
        providerId,
        sourceType: SRC[providerId],
        sourceVersion: null,
        ownershipGeneration: cfg.generation,
        sequence: seq,
        collectedAt: nowIso(captured),
        upstreamObservedAt: parsed.observedAt,
        sourceAvailability: availability,
        dataStatus: isOk ? "ok" : parsed.status,
        errorCode: parsed.errorCode as UsageEvent["errorCode"],
        freshnessBasis: parsed.observedAt ? "upstream_timestamp" : "unknown",
        sourceFreshness: "unknown",
        snapshotMode: "partial",
        windows,
      };
      const valid = eventSchema.safeParse(event);
      if (!valid.success) return { code: "MALFORMED_QUOTA", queued: false };
      const semanticHash = semantic(event);
      if (old.rows[0]?.semantic === semanticHash) {
        if (checkpoint) {
          const tx = await this.client.transaction("write");
          try {
            await tx.execute({
              sql: "INSERT OR REPLACE INTO checkpoints(provider,stream,offset) VALUES(?,?,?)",
              args: [providerId, checkpoint.streamId, checkpoint.offset],
            });
            await tx.commit();
          } catch (e) {
            await tx.rollback();
            throw e;
          }
        }
        return { code: "DUPLICATE", queued: false };
      }
      const body = JSON.stringify(event);
      if (Buffer.byteLength(body) > 32768)
        return { code: "EVENT_TOO_LARGE", queued: false };
      const maxBytes = this.config.maxQueueBytes ?? 1048576;
      const maxAgeMs = this.config.maxAgeMs ?? 86400000;
      const expired = await this.client.execute({
        sql: "SELECT id FROM events WHERE created<?",
        args: [Date.now() - maxAgeMs],
      });
      if (expired.rows.length) {
        const prune = await this.client.transaction("write");
        try {
          for (const row of expired.rows)
            await prune.execute({
              sql: "DELETE FROM events WHERE id=?",
              args: [row.id],
            });
          await prune.commit();
        } catch (error) {
          await prune.rollback();
          throw error;
        }
        for (let i = 0; i < expired.rows.length; i++)
          await this.incrementDropped();
      }
      const rows = await this.client.execute(
        "SELECT provider,seq,id,body,attempted,created FROM events ORDER BY provider,seq",
      );
      const replaceIds: string[] = [];
      let replaceBytes = 0;
      // Replace only a pending, never-attempted snapshot that is fully covered by the new set.
      if (isOk)
        for (const row of rows.rows) {
          if (row.provider !== providerId || Number(row.attempted) !== 0)
            continue;
          try {
            const prior = JSON.parse(String(row.body)) as UsageEvent;
            if (
              prior.kind === "observation" &&
              prior.ownershipGeneration === cfg.generation &&
              prior.windows.every((w) =>
                windows.some((n) => n.windowId === w.windowId),
              )
            ) {
              replaceIds.push(String(row.id));
              replaceBytes += Buffer.byteLength(String(row.body));
            }
          } catch {}
        }
      const used = await this.client.execute(
        "SELECT COALESCE(SUM(length(CAST(body AS BLOB))),0) AS n FROM events",
      );
      if (
        Number(used.rows[0]?.n ?? 0) - replaceBytes + Buffer.byteLength(body) >
        maxBytes
      ) {
        await this.incrementDropped();
        return { code: "QUEUE_FULL", queued: false };
      }
      const tx = await this.client.transaction("write");
      try {
        for (const id of replaceIds)
          await tx.execute({
            sql: "DELETE FROM events WHERE id=?",
            args: [id],
          });
        await tx.execute({
          sql: "INSERT INTO events(provider,seq,id,body,semantic,created) VALUES(?,?,?,?,?,?)",
          args: [providerId, seq, event.eventId, body, semanticHash, captured],
        });
        await tx.execute({
          sql: "INSERT OR REPLACE INTO dedup(provider,semantic,event) VALUES(?,?,?)",
          args: [providerId, semanticHash, JSON.stringify(event)],
        });
        await tx.execute({
          sql: "INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)",
          args: [`sequence:${providerId}`, String(seq)],
        });
        const currentWindowIds = new Set(
          windows.map((window) => window.windowId),
        );
        const cachedIds = await tx.execute({
          sql: "SELECT window_id FROM window_cache WHERE provider=? ORDER BY window_id",
          args: [providerId],
        });
        const retained = new Set(currentWindowIds);
        for (const item of cachedIds.rows) {
          const id = String(item.window_id);
          if (retained.size >= 64) break;
          retained.add(id);
        }
        for (const item of cachedIds.rows) {
          const id = String(item.window_id);
          if (!retained.has(id))
            await tx.execute({
              sql: "DELETE FROM window_cache WHERE provider=? AND window_id=?",
              args: [providerId, id],
            });
        }
        for (const w of windows)
          await tx.execute({
            sql: "INSERT OR REPLACE INTO window_cache(provider,window_id,semantic,window_json) VALUES(?,?,?,?)",
            args: [
              providerId,
              w.windowId,
              sha(
                JSON.stringify({
                  windowId: w.windowId,
                  label: w.label,
                  windowDurationSeconds: w.windowDurationSeconds,
                  usedPercent: w.usedPercent,
                  remainingPercent: w.remainingPercent,
                  resetAt: w.resetAt,
                  upstreamObservedAt: w.upstreamObservedAt,
                  freshnessBasis: w.freshnessBasis,
                  sourceFreshness: w.sourceFreshness,
                  dataStatus: w.dataStatus,
                }),
              ),
              JSON.stringify(w),
            ],
          });
        if (checkpoint)
          await tx.execute({
            sql: "INSERT OR REPLACE INTO checkpoints(provider,stream,offset) VALUES(?,?,?)",
            args: [providerId, checkpoint.streamId, checkpoint.offset],
          });
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw e;
      }
      return { code: "QUEUED", queued: true };
    });
  }
  async checkpoint(
    providerId: ProviderId,
  ): Promise<{ streamId: string; offset: number } | null> {
    return this.run(async () => {
      const generation = await this.client.execute({
        sql: "SELECT v FROM meta WHERE k=?",
        args: ["generation:" + providerId],
      });
      if (
        generation.rows[0]?.v !==
        String(this.config.providers[providerId]?.generation)
      )
        return null;
      const rows = await this.client.execute({
        sql: "SELECT stream,offset FROM checkpoints WHERE provider=?",
        args: [providerId],
      });
      return rows.rows.length
        ? {
            streamId: String(rows.rows[0].stream),
            offset: Number(rows.rows[0].offset),
          }
        : null;
    });
  }
  async pendingEvents(): Promise<UsageEvent[]> {
    return this.run(async () => {
      const rows = await this.client.execute(
        "SELECT body FROM events ORDER BY provider,seq",
      );
      return rows.rows.map((r) => JSON.parse(String(r.body)) as UsageEvent);
    });
  }
  async inspect(): Promise<Diagnostics> {
    return this.run(async () => {
      const rows = await this.client.execute(
        "SELECT COUNT(*) n,COALESCE(SUM(length(CAST(body AS BLOB))),0) b FROM events",
      );
      const dropped = await this.client.execute(
        "SELECT v FROM meta WHERE k='dropped'",
      );
      const paused = await this.client.execute(
        "SELECT provider FROM pauses ORDER BY provider",
      );
      return {
        pending: Number(rows.rows[0]?.n ?? 0),
        bytes: Number(rows.rows[0]?.b ?? 0),
        dropped: Number(dropped.rows[0]?.v ?? 0),
        pausedSources: paused.rows.map((r) => String(r.provider)),
      };
    });
  }
  async resumeSource(providerId: ProviderId) {
    return this.run(async () => {
      await this.client.execute({
        sql: "DELETE FROM pauses WHERE provider=?",
        args: [providerId],
      });
    });
  }
  async uploadOnce(
    fetcher: typeof fetch = fetch,
    now = Date.now(),
  ): Promise<{ code: string }> {
    return this.run(async () => {
      const events = await this.client.execute({
        sql: "SELECT e.* FROM events e WHERE e.seq=(SELECT MIN(p.seq) FROM events p WHERE p.provider=e.provider) AND e.next_at<=? ORDER BY CASE e.provider WHEN 'codex' THEN 0 WHEN 'claude' THEN 1 ELSE 2 END,e.seq",
        args: [now],
      });
      for (const row of events.rows) {
        const provider = String(row.provider) as ProviderId;
        if (!this.config.providers[provider]?.enabled) continue;
        if (
          (
            await this.client.execute({
              sql: "SELECT 1 FROM pauses WHERE provider=?",
              args: [provider],
            })
          ).rows.length
        )
          continue;
        if (now - Number(row.created) > (this.config.maxAgeMs ?? 86400000)) {
          await this.client.execute({
            sql: "DELETE FROM events WHERE id=?",
            args: [row.id],
          });
          await this.incrementDropped();
          return { code: "EVENT_EXPIRED" };
        }
        const body = String(row.body),
          event = JSON.parse(body) as UsageEvent;
        if (
          event.ownershipGeneration !==
          this.config.providers[provider]?.generation
        ) {
          await this.client.execute({
            sql: "DELETE FROM events WHERE id=?",
            args: [row.id],
          });
          await this.incrementDropped();
          return { code: "STALE_GENERATION_DROPPED" };
        }
        await this.client.execute({
          sql: "UPDATE events SET attempted=1,attempts=attempts+1 WHERE id=?",
          args: [row.id],
        });
        const timestamp = String(Math.floor(now / 1000)),
          nonce = randomBytes(16).toString("hex"),
          bodyHash = sha(body);
        const signature = createHmac("sha256", this.secret)
          .update(
            signingInput({
              keyId: this.config.keyId,
              collectorId: this.config.collectorId,
              timestamp,
              nonce,
              eventId: event.eventId,
              bodyHash,
            }),
          )
          .digest("hex");
        const abort = new AbortController(),
          timer = setTimeout(
            () => abort.abort(),
            this.config.timeoutMs ?? 10000,
          );
        let response: Response;
        let payload: unknown = null;
        try {
          response = await fetcher(this.config.url, {
            method: "POST",
            redirect: "error",
            headers: {
              "content-type": "application/json",
              "x-bmo-key-id": this.config.keyId,
              "x-bmo-timestamp": timestamp,
              "x-bmo-nonce": nonce,
              "x-bmo-signature": signature,
              "idempotency-key": event.eventId,
            },
            body,
            signal: abort.signal,
          });
        } catch {
          clearTimeout(timer);
          await this.retry(row as unknown as Record<string, unknown>, now, 0);
          return { code: "NETWORK_RETRY" };
        }
        try {
          const responseText = await readBoundedResponse(
            response,
            8192,
            abort.signal,
          );
          if (responseText !== null) {
            try {
              payload = JSON.parse(responseText);
            } catch {
              payload = null;
            }
          }
        } catch {
          payload = null;
        } finally {
          clearTimeout(timer);
        }
        if (
          response.status === 200 &&
          (
            payload as {
              data?: { eventId?: unknown; outcome?: unknown };
            } | null
          )?.data?.eventId === event.eventId &&
          typeof (payload as { data?: { outcome?: unknown } } | null)?.data
            ?.outcome === "string" &&
          ["accepted", "duplicate", "superseded"].includes(
            (payload as { data?: { outcome?: string } } | null)?.data
              ?.outcome ?? "",
          )
        ) {
          await this.client.execute({
            sql: "DELETE FROM events WHERE id=?",
            args: [row.id],
          });
          return { code: "ACKNOWLEDGED" };
        }
        const responseData =
          payload !== null && typeof payload === "object"
            ? (payload as { error?: { code?: unknown } })
            : null;
        const code = safeCode(
          typeof responseData?.error?.code === "string"
            ? responseData.error.code
            : "INVALID_RESPONSE",
        );
        if (response.status === 401 && code === "REQUEST_TIME_INVALID") {
          await this.retry(
            row as unknown as Record<string, unknown>,
            now,
            1000,
          );
          return { code };
        }
        if (response.status === 401 || response.status === 403) {
          await this.client.execute({
            sql: "INSERT OR REPLACE INTO pauses(provider,code) VALUES(?,?)",
            args: [provider, code],
          });
          return { code };
        }
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get("retry-after")) * 1000;
          await this.retry(
            row,
            now,
            Number.isFinite(retryAfter) ? retryAfter : 0,
          );
          return { code };
        }
        if ([400, 409, 413, 415].includes(response.status)) {
          await this.client.execute({
            sql: "DELETE FROM events WHERE id=?",
            args: [row.id],
          });
          await this.incrementDropped();
          return { code };
        }
        await this.retry(row as unknown as Record<string, unknown>, now, 0);
        return { code: "INVALID_RESPONSE" };
      }
      return { code: "EMPTY" };
    });
  }
  private async retry(
    row: Record<string, unknown>,
    now: number,
    retryAfter: number,
  ) {
    const n = Number(row["attempts"]) || 1;
    const base = Math.min(300000, 1000 * 2 ** Math.min(n - 1, 8));
    const jitter = Math.floor(Math.random() * Math.min(base * 0.25, 30000));
    const delay = Math.min(
      300000,
      Math.max(base + jitter, Math.min(300000, Math.max(0, retryAfter))),
    );
    await this.client.execute({
      sql: "UPDATE events SET next_at=? WHERE id=?",
      args: [
        Math.min(
          now + delay,
          Number(row["created"]) + (this.config.maxAgeMs ?? 86400000),
        ),
        String(row["id"]),
      ],
    });
  }
  private async incrementDropped() {
    const n = await this.client.execute("SELECT v FROM meta WHERE k='dropped'");
    await this.client.execute({
      sql: "INSERT OR REPLACE INTO meta(k,v) VALUES('dropped',?)",
      args: [String(Number(n.rows[0]?.v ?? 0) + 1)],
    });
  }
  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = (async () => {
      await this.mutex;
      await this.client
        .execute({
          sql: "DELETE FROM owner WHERE singleton=1 AND token=?",
          args: [this.lockToken],
        })
        .catch(() => {});
      await this.client.close();
      this.closed = true;
    })();
    return this.closePromise;
  }
}
