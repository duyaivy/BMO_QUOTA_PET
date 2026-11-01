import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  appendFile,
  stat,
  rename,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CodexObserver,
  parseCodex,
  type CodexCursor,
  type CodexObservation,
  type CodexSink,
} from "../src/adapters/codex.js";

const directories: string[] = [];
async function temp() {
  const path = await mkdtemp(join(tmpdir(), "bmo-codex-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function record(used = 27, timestamp = "2026-10-31T10:00:00.000Z") {
  return JSON.stringify({
    type: "event_msg",
    timestamp,
    payload: {
      type: "token_count",
      rate_limits: {
        limit_id: "codex-plan",
        limit_name: "ignored plan name",
        primary: {
          used_percent: used,
          window_minutes: 300,
          resets_at: 1793443200,
        },
        secondary: {
          used_percent: 61.5,
          window_minutes: 10080,
          resets_at: 1793875200,
        },
        surprise: { used_percent: 99 },
      },
      input_tokens: 123456,
      model: "sensitive-model-field",
    },
    conversation: "sensitive conversation content",
  });
}

class MemorySink implements CodexSink {
  cursors = new Map<string, CodexCursor>();
  observations: CodexObservation[] = [];
  failCommit = false;
  queueFull = false;
  async load(streamId: string) {
    return this.cursors.get(streamId) ?? null;
  }
  async commit(
    streamId: string,
    cursor: CodexCursor,
    observation: CodexObservation | null,
  ) {
    if (this.failCommit) return { code: "STATE_ERROR", queued: false };
    if (this.queueFull && observation)
      return { code: "QUEUE_FULL", queued: false };
    this.cursors.set(streamId, cursor);
    if (observation) this.observations.push(observation);
    return { code: "CHECKPOINTED", queued: observation !== null };
  }
}

describe("Codex quota extraction", () => {
  it("allowlists the two installed buckets and does not treat record time as upstream time", () => {
    const parsed = parseCodex(record())!;
    expect(parsed.recordAt).toBe("2026-10-31T10:00:00.000Z");
    expect(parsed.quota.observedAt).toBeNull();
    expect(parsed.quota.windows).toEqual([
      {
        windowId: "codex-plan.primary",
        label: "Primary",
        duration: 18000,
        used: 27,
        reset: "2026-10-31T10:40:00.000Z",
      },
      {
        windowId: "codex-plan.secondary",
        label: "Secondary",
        duration: 604800,
        used: 61.5,
        reset: "2026-11-05T10:40:00.000Z",
      },
    ]);
    expect(JSON.stringify(parsed)).not.toContain("sensitive");
    expect(JSON.stringify(parsed)).not.toContain("surprise");
  });

  it("ignores unrelated or unsafe events and rejects oversized records", () => {
    expect(
      parseCodex(
        JSON.stringify({ type: "response_item", conversation: "private" }),
      ),
    ).toBeNull();
    expect(
      parseCodex(
        JSON.stringify({
          type: "event_msg",
          timestamp: "bad",
          payload: { type: "token_count", rate_limits: {} },
        }),
      ),
    ).toBeNull();
    expect(
      parseCodex(record().replace('"codex-plan"', '"unsafe/id"')),
    ).toBeNull();
    expect(
      parseCodex(
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-10-31T10:00:00.000Z",
          payload: {
            type: "token_count",
            rate_limits: { primary: { used_percent: 101 } },
          },
        }),
      ),
    ).toBeNull();
    expect(
      parseCodex(record().replace('"codex-plan"', '"x"'.repeat(126))),
    ).toBeNull();
    expect(
      parseCodex(record().replace('"codex-plan"', "null"))?.quota.windows,
    ).toHaveLength(2);
    expect(parseCodex("x".repeat(32 * 1024 + 1))).toBeNull();
  });
});

describe("incremental Codex observation", () => {
  it("baselines existing files, then captures only complete appended quota events", async () => {
    const root = await temp();
    const day = join(root, "2026", "10", "31");
    await mkdir(day, { recursive: true });
    const file = join(day, "rollout.jsonl");
    await writeFile(file, record() + "\n");
    const sink = new MemorySink();
    const observer = new CodexObserver(root, sink);
    expect(await observer.scan()).toMatchObject({
      files: 1,
      records: 0,
      code: "OK",
    });
    expect(sink.observations).toHaveLength(0);
    const partial = record(31, "2026-10-31T10:01:00.000Z");
    await appendFile(file, partial.slice(0, -1));
    expect((await observer.scan()).records).toBe(0);
    await appendFile(
      file,
      partial.slice(-1) + "\n" + record(33, "2026-10-31T10:02:00.000Z") + "\n",
    );
    expect(await observer.scan()).toMatchObject({ records: 2, code: "OK" });
    expect(
      sink.observations.map((item) => item.quota.windows[0]?.used),
    ).toEqual([31, 33]);
    expect(await observer.scan()).toMatchObject({ records: 0, code: "OK" });
  });

  it("handles multiple streams and baselines a rotated or truncated identity", async () => {
    const root = await temp();
    const first = join(root, "first.jsonl");
    const second = join(root, "second.jsonl");
    await writeFile(first, "");
    const sink = new MemorySink();
    const observer = new CodexObserver(root, sink);
    await observer.scan();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await writeFile(second, record(44) + "\n");
    expect((await observer.scan()).records).toBe(1);
    await rm(first);
    await writeFile(first, "");
    const after = await stat(first);
    expect(after.ino).toBeGreaterThan(0);
    expect((await observer.scan()).records).toBe(0);
    expect(sink.observations).toHaveLength(1);
    await appendFile(first, record(55) + "\n");
    expect((await observer.scan()).records).toBe(1);
    expect(sink.observations).toHaveLength(2);
  });

  it("does not advance a quota cursor when durable commit or queueing fails", async () => {
    const root = await temp();
    const file = join(root, "rollout.jsonl");
    await writeFile(file, "");
    const sink = new MemorySink();
    const observer = new CodexObserver(root, sink);
    await observer.scan();
    await appendFile(file, record() + "\n");
    sink.queueFull = true;
    expect(await observer.scan()).toMatchObject({
      code: "QUEUE_FULL",
      records: 0,
    });
    sink.queueFull = false;
    sink.failCommit = true;
    expect(await observer.scan()).toMatchObject({
      code: "STATE_ERROR",
      records: 0,
    });
    sink.failCommit = false;
    expect(await observer.scan()).toMatchObject({ records: 1, code: "OK" });
  });

  it("persists discard state for an oversized line and resumes after its newline", async () => {
    const root = await temp();
    const file = join(root, "rollout.jsonl");
    await writeFile(file, "");
    const sink = new MemorySink();
    const observer = new CodexObserver(root, sink);
    await observer.scan();
    await appendFile(file, "x".repeat(300 * 1024));
    expect(await observer.scan()).toMatchObject({ records: 0, code: "OK" });
    const cursor = [...sink.cursors.entries()].find(
      ([key]) => !key.startsWith("codex-root-v1:"),
    )?.[1];
    expect(cursor?.discarding).toBe(true);
    expect(cursor?.offset).toBe(256 * 1024);
    await appendFile(file, "\n" + record(22) + "\n");
    expect(await observer.scan()).toMatchObject({ records: 1, code: "OK" });
    expect(sink.observations[0]?.quota.windows[0]?.used).toBe(22);
  });

  it("selects newly active sessions when the root contains more than 64 old files", async () => {
    const root = await temp();
    const oldTime = new Date("2025-01-01T00:00:00Z");
    for (let i = 0; i < 65; i++) {
      const file = join(root, `2025-${String(i).padStart(3, "0")}.jsonl`);
      await writeFile(file, record() + "\n");
      await utimes(file, oldTime, oldTime);
    }
    const sink = new MemorySink();
    const observer = new CodexObserver(root, sink);
    expect((await observer.scan()).code).toBe("SCAN_LIMIT_REACHED");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newest = join(root, "2026-current.jsonl");
    await writeFile(newest, record(48) + "\n");
    expect(await observer.scan()).toMatchObject({
      code: "SCAN_LIMIT_REACHED",
      records: 1,
    });
    expect(
      sink.observations.map((item) => item.quota.windows[0]?.used),
    ).toContain(48);
  });

  it("baselines preexisting files when the configured root changes", async () => {
    const firstRoot = await temp();
    const secondRoot = await temp();
    await writeFile(join(secondRoot, "old.jsonl"), record(72) + "\n");
    const sink = new MemorySink();
    await new CodexObserver(firstRoot, sink).scan();
    expect(await new CodexObserver(secondRoot, sink).scan()).toMatchObject({
      records: 0,
      code: "OK",
    });
    expect(sink.observations).toHaveLength(0);
  });

  it("reads quota from a replacement inode instead of moving its cursor to EOF", async () => {
    const root = await temp();
    const file = join(root, "rollout.jsonl");
    await writeFile(file, "");
    const sink = new MemorySink();
    const observer = new CodexObserver(root, sink);
    await observer.scan();
    const replacement = join(root, "replacement.tmp");
    await writeFile(replacement, record(84) + "\n");
    await rm(file);
    await rename(replacement, file);
    expect(await observer.scan()).toMatchObject({ records: 1, code: "OK" });
    expect(sink.observations[0]?.quota.windows[0]?.used).toBe(84);
  });
});
