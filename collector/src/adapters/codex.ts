import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, opendir, open, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { ParsedQuota } from "./parse.js";

const MAX_RECORD_BYTES = 32 * 1024;
const MAX_FILES_PER_SCAN = 64;
const MAX_BYTES_PER_FILE = 256 * 1024;
const MAX_BYTES_PER_SCAN = 1024 * 1024;
const MAX_DIRECTORIES_PER_SCAN = 512;
const MAX_DIRECTORY_ENTRIES_PER_SCAN = 4096;
const MAX_DIRECTORY_DEPTH = 8;

export type CodexCursor = {
  identity: string;
  offset: number;
  discarding: boolean;
};

export type CodexObservation = { quota: ParsedQuota; recordAt: string };

export type CodexSink = {
  load(streamId: string): Promise<CodexCursor | null>;
  commit(
    streamId: string,
    cursor: CodexCursor,
    observation: CodexObservation | null,
  ): Promise<{ code: string; queued: boolean }>;
};

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const parseTimestamp = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 64) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

const parseReset = (value: unknown): string | null => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  const ms = value * 1000;
  return Number.isSafeInteger(ms) && Number.isFinite(new Date(ms).getTime())
    ? new Date(ms).toISOString()
    : null;
};

/** Extract only the installed Codex token_count quota allowlist. */
export function parseCodex(raw: string): CodexObservation | null {
  if (Buffer.byteLength(raw, "utf8") > MAX_RECORD_BYTES) return null;
  let root: Record<string, unknown> | null;
  try {
    root = object(JSON.parse(raw));
  } catch {
    return null;
  }
  const payload = object(root?.payload);
  if (root?.type !== "event_msg" || payload?.type !== "token_count")
    return null;
  const rateLimits = object(payload.rate_limits);
  const recordAt = parseTimestamp(root.timestamp);
  if (!rateLimits || !recordAt) return null;
  const limitId = rateLimits.limit_id;
  if (
    limitId !== undefined &&
    limitId !== null &&
    (typeof limitId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(limitId))
  )
    return null;

  const windows: ParsedQuota["windows"] = [];
  for (const id of ["primary", "secondary"] as const) {
    if (!(id in rateLimits) || rateLimits[id] === null) continue;
    const bucket = object(rateLimits[id]);
    const used = bucket?.used_percent;
    if (
      !bucket ||
      typeof used !== "number" ||
      !Number.isFinite(used) ||
      used < 0 ||
      used > 100
    ) {
      continue;
    }
    const minutes = bucket.window_minutes;
    const duration =
      typeof minutes === "number" &&
      Number.isSafeInteger(minutes) &&
      minutes > 0 &&
      Number.isSafeInteger(minutes * 60)
        ? minutes * 60
        : null;
    const windowId =
      typeof limitId === "string" ? `${limitId}.${id}` : `codex.${id}`;
    if (windowId.length > 128) return null;
    windows.push({
      windowId,
      label: id === "primary" ? "Primary" : "Secondary",
      duration,
      used,
      reset: parseReset(bucket.resets_at),
    });
  }
  if (windows.length === 0) return null;
  return {
    quota: {
      status: "ok",
      errorCode: null,
      windows,
      // Rollout timestamps mark local record emission, not an upstream read.
      observedAt: null,
    },
    recordAt,
  };
}

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function findRollouts(
  root: string,
): Promise<{ paths: string[]; limited: boolean }> {
  const found: string[] = [];
  let directories = 0;
  let entriesSeen = 0;
  let limited = false;
  const visit = async (directory: string, depth: number) => {
    if (
      directories >= MAX_DIRECTORIES_PER_SCAN ||
      depth > MAX_DIRECTORY_DEPTH
    ) {
      limited = true;
      return;
    }
    directories++;
    let dir;
    try {
      dir = await opendir(directory);
    } catch {
      return;
    }
    const entries = [];
    for await (const entry of dir) {
      entriesSeen++;
      if (entriesSeen > MAX_DIRECTORY_ENTRIES_PER_SCAN) {
        limited = true;
        break;
      }
      entries.push(entry);
    }
    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      try {
        const info = await lstat(path);
        if (info.isSymbolicLink()) continue;
        if (info.isDirectory()) await visit(path, depth + 1);
        else if (info.isFile() && entry.name.endsWith(".jsonl"))
          found.push(path);
      } catch {
        // A session may be rotating while a scan is in progress.
      }
    }
  };
  await visit(root, 0);
  const modified = await Promise.all(
    found.map(async (path) => ({
      path,
      mtime: (await lstat(path).catch(() => null))?.mtimeMs ?? 0,
    })),
  );
  modified.sort((a, b) => b.mtime - a.mtime || b.path.localeCompare(a.path));
  if (modified.length > MAX_FILES_PER_SCAN) limited = true;
  return {
    paths: modified.slice(0, MAX_FILES_PER_SCAN).map((item) => item.path),
    limited,
  };
}

export class CodexObserver {
  private readonly rootDirectory: string;
  private readonly sink: CodexSink;
  private scanning = false;

  constructor(rootDirectory: string, sink: CodexSink) {
    this.rootDirectory = resolve(rootDirectory);
    this.sink = sink;
  }

  async scan(): Promise<{ files: number; records: number; code: string }> {
    if (this.scanning)
      return { files: 0, records: 0, code: "SCAN_IN_PROGRESS" };
    this.scanning = true;
    try {
      let root: string;
      try {
        root = await realpath(this.rootDirectory);
        const stat = await lstat(this.rootDirectory);
        if (!stat.isDirectory() || stat.isSymbolicLink())
          return { files: 0, records: 0, code: "SOURCE_UNAVAILABLE" };
      } catch {
        return { files: 0, records: 0, code: "SOURCE_UNAVAILABLE" };
      }
      const rootMarker = `codex-root-v1:${sha(root)}`;
      let initialized = await this.sink.load(rootMarker);
      if (!initialized) {
        // Filesystems can report sub-millisecond birth times; round the persisted
        // baseline boundary forward by 2 ms to keep already-created files in it.
        initialized = {
          identity: "v1",
          offset: Date.now() + 2,
          discarding: false,
        };
        const saved = await this.sink.commit(rootMarker, initialized, null);
        if (saved.code !== "CHECKPOINTED")
          return { files: 0, records: 0, code: "STATE_ERROR" };
      }
      const { paths, limited } = await findRollouts(root);
      let records = 0;
      let bytesRemaining = MAX_BYTES_PER_SCAN;
      for (const path of paths) {
        const info = await lstat(path).catch(() => null);
        if (!info?.isFile() || info.isSymbolicLink()) continue;
        const streamId = sha(`${sha(root)}:${relative(root, path)}`);
        const identity = sha(`${info.dev}:${info.ino}:${info.birthtimeMs}`);
        const saved = await this.sink.load(streamId);
        if (!saved && info.birthtimeMs <= initialized.offset) {
          const baseline = await this.baseline(
            path,
            streamId,
            identity,
            info.size,
          );
          if (!baseline)
            return { files: paths.length, records, code: "STATE_ERROR" };
          continue;
        }
        let offset = saved?.offset ?? 0;
        let discarding = saved?.discarding ?? false;
        if (saved && (saved.identity !== identity || offset > info.size)) {
          offset = 0;
          discarding = false;
        }
        const byteLimit = Math.min(MAX_BYTES_PER_FILE, bytesRemaining);
        if (byteLimit <= 0) break;
        const result = await this.readFile(
          path,
          streamId,
          identity,
          offset,
          discarding,
          byteLimit,
        );
        bytesRemaining -= result.bytes;
        records += result.records;
        if (result.code !== "OK")
          return { files: paths.length, records, code: result.code };
      }
      return {
        files: paths.length,
        records,
        code: limited ? "SCAN_LIMIT_REACHED" : "OK",
      };
    } finally {
      this.scanning = false;
    }
  }

  private async baseline(
    path: string,
    streamId: string,
    identity: string,
    size: number,
  ) {
    let offset = size;
    let discarding = false;
    const handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    ).catch(() => null);
    if (!handle) return false;
    try {
      const opened = await handle.stat();
      if (sha(`${opened.dev}:${opened.ino}:${opened.birthtimeMs}`) !== identity)
        return false;
      const tailLength = Math.min(size, MAX_RECORD_BYTES + 1);
      if (tailLength > 0) {
        const tail = Buffer.alloc(tailLength);
        const { bytesRead } = await handle.read(
          tail,
          0,
          tailLength,
          size - tailLength,
        );
        if (bytesRead) {
          const newline = tail.subarray(0, bytesRead).lastIndexOf(0x0a);
          if (newline < 0) {
            offset = size;
            discarding = true;
          } else if (newline < bytesRead - 1) {
            offset = size;
            discarding = true;
          }
        }
      }
    } finally {
      await handle.close();
    }
    const result = await this.sink.commit(
      streamId,
      { identity, offset, discarding },
      null,
    );
    return result.code === "CHECKPOINTED";
  }

  private async readFile(
    path: string,
    streamId: string,
    identity: string,
    startOffset: number,
    startDiscarding: boolean,
    byteLimit: number,
  ): Promise<{ bytes: number; records: number; code: string }> {
    const handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    ).catch(() => null);
    if (!handle) return { bytes: 0, records: 0, code: "FILE_UNAVAILABLE" };
    const opened = await handle.stat().catch(() => null);
    if (
      !opened ||
      sha(`${opened.dev}:${opened.ino}:${opened.birthtimeMs}`) !== identity
    ) {
      await handle.close();
      return { bytes: 0, records: 0, code: "FILE_CHANGED" };
    }
    let bytes = 0;
    let cursor = startOffset;
    let lineStart = startOffset;
    let discarding = startDiscarding;
    let line: Buffer[] = [];
    let lineBytes = 0;
    let records = 0;
    try {
      const chunk = Buffer.alloc(Math.min(16 * 1024, byteLimit));
      while (bytes < byteLimit) {
        const { bytesRead } = await handle.read(
          chunk,
          0,
          Math.min(chunk.length, byteLimit - bytes),
          cursor,
        );
        if (!bytesRead) break;
        bytes += bytesRead;
        let index = 0;
        while (index < bytesRead) {
          if (discarding) {
            const newline = chunk.indexOf(0x0a, index);
            if (newline < 0 || newline >= bytesRead) {
              cursor += bytesRead - index;
              index = bytesRead;
              continue;
            }
            cursor += newline - index + 1;
            index = newline + 1;
            discarding = false;
            lineStart = cursor;
            const saved = await this.sink.commit(
              streamId,
              { identity, offset: cursor, discarding: false },
              null,
            );
            if (!isCommitted(saved.code))
              return { bytes, records, code: "STATE_ERROR" };
            continue;
          }
          const newline = chunk.indexOf(0x0a, index);
          const end = newline < 0 || newline >= bytesRead ? bytesRead : newline;
          const segment = chunk.subarray(index, end);
          if (lineBytes + segment.length > MAX_RECORD_BYTES) {
            discarding = true;
            line = [];
            lineBytes = 0;
            cursor += segment.length;
            index = end;
            continue;
          }
          if (segment.length) {
            line.push(Buffer.from(segment));
            lineBytes += segment.length;
          }
          cursor += segment.length;
          index = end;
          if (newline < 0 || newline >= bytesRead) break;
          cursor++;
          index++;
          const record = Buffer.concat(line, lineBytes)
            .toString("utf8")
            .replace(/\r$/, "");
          const observation = parseCodex(record);
          const next = { identity, offset: cursor, discarding: false };
          const saved = await this.sink.commit(streamId, next, observation);
          if (!isCommitted(saved.code))
            return {
              bytes,
              records,
              code: saved.code === "QUEUE_FULL" ? "QUEUE_FULL" : "STATE_ERROR",
            };
          records++;
          line = [];
          lineBytes = 0;
          lineStart = cursor;
        }
      }
      // Leave an incomplete line at its beginning so a later scan can finish it.
      if (lineBytes > 0 && !discarding && lineStart !== startOffset) {
        // Earlier complete records already committed the cursor at lineStart.
      }
      if (discarding && cursor > lineStart) {
        const saved = await this.sink.commit(
          streamId,
          { identity, offset: cursor, discarding: true },
          null,
        );
        if (saved.code !== "CHECKPOINTED")
          return { bytes, records, code: "STATE_ERROR" };
      }
      return { bytes, records, code: "OK" };
    } finally {
      await handle.close();
    }
  }
}

function isCommitted(code: string) {
  return [
    "CHECKPOINTED",
    "QUEUED",
    "DUPLICATE",
    "OLDER_SOURCE_RECORD",
  ].includes(code);
}
