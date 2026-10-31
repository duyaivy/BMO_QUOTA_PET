import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { FixtureCollector } from "../src/index.js";
import { createClient } from "@libsql/client";

const raw = (windows: Record<string, number>) =>
  JSON.stringify({
    fixtureSchema: "claude-v1",
    rate_limits: Object.fromEntries(
      Object.entries(windows).map(([id, used_percentage]) => [
        id,
        { used_percentage },
      ]),
    ),
  });
async function setup(
  options: {
    maxQueueBytes?: number;
    maxAgeMs?: number;
    timeoutMs?: number;
    providers?: Record<string, { enabled: boolean; generation: number }>;
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "bmo-reliability-"));
  const secretFile = join(dir, "secret");
  await writeFile(secretFile, "c".repeat(64));
  await chmod(secretFile, 0o600);
  const config = {
    collectorId: "fixture-collector",
    keyId: "fixture-key",
    secretFile,
    url: "http://127.0.0.1/api/internal/usage/ingest",
    allowLocalHttp: true,
    stateDirectory: join(dir, "state"),
    providers: options.providers ?? {
      claude: { enabled: true, generation: 1 },
      codex: { enabled: true, generation: 1 },
    },
    ...(options.maxQueueBytes === undefined
      ? {}
      : { maxQueueBytes: options.maxQueueBytes }),
    ...(options.maxAgeMs === undefined ? {} : { maxAgeMs: options.maxAgeMs }),
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs }),
  };
  return { dir, config, collector: await FixtureCollector.open(config) };
}

describe("queue and uploader reliability", () => {
  it("retains disjoint partial snapshots and coalesces only fully superseded pending data", async () => {
    const s = await setup();
    await s.collector.capture(
      "claude",
      raw({ a: 1 }),
      "2026-10-31T00:00:00.000Z",
    );
    await s.collector.capture(
      "claude",
      raw({ b: 2 }),
      "2026-10-31T00:00:01.000Z",
    );
    expect(await s.collector.pendingEvents()).toHaveLength(2);
    await s.collector.capture(
      "claude",
      raw({ a: 3 }),
      "2026-10-31T00:00:02.000Z",
    );
    const pending = await s.collector.pendingEvents();
    expect(pending).toHaveLength(2);
    expect(pending.map((event) => event.sequence)).toEqual([2, 3]);
    await s.collector.close();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("keeps provider order during backoff while another provider progresses", async () => {
    const s = await setup();
    const now = Date.now();
    await s.collector.capture(
      "claude",
      raw({ a: 1 }),
      new Date(now - 3000).toISOString(),
    );
    await s.collector.uploadOnce(
      async () => new Response("", { status: 503 }),
      now,
    );
    await s.collector.capture(
      "claude",
      raw({ b: 2 }),
      new Date(now - 2000).toISOString(),
    );
    let called = false;
    expect(
      (
        await s.collector.uploadOnce(async () => {
          called = true;
          throw new Error();
        }, now)
      ).code,
    ).toBe("EMPTY");
    expect(called).toBe(false);
    await s.collector.capture(
      "codex",
      JSON.stringify({
        fixtureSchema: "codex-v1",
        type: "event_msg",
        payload: {
          type: "token_count",
          rate_limits: { x: { used_percent: 4 } },
        },
      }),
      new Date(now - 1000).toISOString(),
    );
    await s.collector.uploadOnce(async (_url, init) => {
      const event = JSON.parse(String(init?.body));
      expect(event.providerId).toBe("codex");
      return Response.json({
        data: { eventId: event.eventId, outcome: "accepted" },
      });
    }, now);
    expect(
      (await s.collector.pendingEvents()).map((event) => event.sequence),
    ).toEqual([1, 2]);
    await s.collector.close();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("retries a lost acknowledgement with the same event body and a fresh nonce", async () => {
    const s = await setup();
    await s.collector.capture(
      "claude",
      raw({ a: 1 }),
      new Date(Date.now() - 1000).toISOString(),
    );
    const first = await s.collector.pendingEvents();
    const eventId = first[0]?.eventId;
    let originalBody = "";
    let originalNonce = "";
    const now = Date.now();
    await s.collector.uploadOnce(async (_url, init) => {
      originalBody = String(init?.body);
      originalNonce = String(new Headers(init?.headers).get("x-bmo-nonce"));
      throw new TypeError("simulated lost acknowledgement");
    }, now);
    let retryBody = "";
    let retryNonce = "";
    const result = await s.collector.uploadOnce(async (_url, init) => {
      retryBody = String(init?.body);
      retryNonce = String(new Headers(init?.headers).get("x-bmo-nonce"));
      return new Response(
        JSON.stringify({ data: { eventId, outcome: "duplicate" } }),
        { status: 200 },
      );
    }, now + 5000);
    expect(result.code).toBe("ACKNOWLEDGED");
    expect(retryBody).toBe(originalBody);
    expect(retryNonce).not.toBe(originalNonce);
    await s.collector.close();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("pauses one source after authorization failure while other providers continue", async () => {
    const s = await setup();
    await s.collector.capture(
      "codex",
      JSON.stringify({
        fixtureSchema: "codex-v1",
        type: "event_msg",
        payload: {
          type: "token_count",
          rate_limits: { x: { used_percent: 4 } },
        },
      }),
      new Date().toISOString(),
    );
    await s.collector.capture(
      "claude",
      raw({ a: 2 }),
      new Date().toISOString(),
    );
    const first = await s.collector.uploadOnce(
      async () =>
        new Response(JSON.stringify({ error: { code: "SOURCE_DISABLED" } }), {
          status: 403,
        }),
    );
    expect(first.code).toBe("SOURCE_DISABLED");
    const second = await s.collector.uploadOnce(async (_url, init) => {
      const event = JSON.parse(String(init?.body));
      expect(event.providerId).toBe("claude");
      return new Response(
        JSON.stringify({
          data: { eventId: event.eventId, outcome: "accepted" },
        }),
        { status: 200 },
      );
    });
    expect(second.code).toBe("ACKNOWLEDGED");
    expect((await s.collector.inspect()).pausedSources).toEqual(["codex"]);
    await s.collector.close();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("resets per-window cache on generation change and drops stale queued ownership", async () => {
    const s = await setup({
      providers: { claude: { enabled: true, generation: 1 } },
    });
    const rawState = raw({ a: 1 });
    await s.collector.capture(
      "claude",
      rawState,
      new Date(Date.now() - 5000).toISOString(),
    );
    await s.collector.close();
    const config = {
      ...s.config,
      providers: { claude: { enabled: true, generation: 2 } },
    };
    const next = await FixtureCollector.open(config);
    const capturedAt = new Date().toISOString();
    await next.capture("claude", rawState, capturedAt);
    const events = await next.pendingEvents();
    const newer = events.find((event) => event.ownershipGeneration === 2);
    expect(newer?.kind === "observation" && newer.windows[0]?.collectedAt).toBe(
      capturedAt,
    );
    expect(
      (
        await next.uploadOnce(async () => {
          throw new Error("stale event must not upload");
        })
      ).code,
    ).toBe("STALE_GENERATION_DROPPED");
    await next.close();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("honors Retry-After when a 429 body is malformed and bounds retry response work", async () => {
    const s = await setup();
    await s.collector.capture(
      "claude",
      raw({ a: 1 }),
      "2026-10-31T00:00:00.000Z",
    );
    const now = Date.parse("2026-10-31T00:00:01.000Z");
    const first = await s.collector.uploadOnce(
      async () =>
        new Response("not-json", {
          status: 429,
          headers: { "retry-after": "30" },
        }),
      now,
    );
    expect(first.code).toBe("INVALID_RESPONSE");
    let called = false;
    expect(
      (
        await s.collector.uploadOnce(async () => {
          called = true;
          return new Response("{}", { status: 200 });
        }, now + 5000)
      ).code,
    ).toBe("EMPTY");
    expect(called).toBe(false);
    await s.collector.close();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("reports queue overflow and prunes expired entries before enqueue", async () => {
    const s = await setup({ maxQueueBytes: 1 });
    const result = await s.collector.capture(
      "claude",
      raw({ a: 1 }),
      "2026-10-31T00:00:00.000Z",
    );
    expect(result.code).toBe("QUEUE_FULL");
    expect((await s.collector.inspect()).dropped).toBe(1);
    await s.collector.close();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("bounds oversized and stalled response bodies with a finite deadline", async () => {
    const s = await setup({ timeoutMs: 25 });
    await s.collector.capture(
      "claude",
      raw({ a: 1 }),
      new Date().toISOString(),
    );
    const overflow = await s.collector.uploadOnce(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(8193));
              controller.close();
            },
          }),
          { status: 200 },
        ),
    );
    expect(overflow.code).toBe("INVALID_RESPONSE");
    const before = Date.now();
    const timeout = await s.collector.uploadOnce(
      async () =>
        new Response(new ReadableStream({ start() {} }), { status: 200 }),
      Date.now() + 5000,
    );
    expect(Date.now() - before).toBeLessThan(1000);
    expect(timeout.code).toBe("INVALID_RESPONSE");
    await s.collector.close();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("prunes old queued events before checking new capacity", async () => {
    const s = await setup();
    await s.collector.capture(
      "claude",
      raw({ a: 1 }),
      new Date(Date.now() - 90000000).toISOString(),
    );
    await s.collector.capture(
      "claude",
      raw({ a: 2 }),
      new Date().toISOString(),
    );
    expect((await s.collector.inspect()).dropped).toBe(1);
    expect(await s.collector.pendingEvents()).toHaveLength(1);
    await s.collector.close();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("reclaims a dead SQLite owner and advances duplicate checkpoints durably", async () => {
    const s = await setup();
    const payload = raw({ a: 7 });
    await s.collector.capture("claude", payload, new Date().toISOString(), {
      streamId: "stream-a",
      offset: 10,
    });
    await s.collector.close();
    const client = createClient({
      url: `file:${join(s.config.stateDirectory, "state.db")}`,
    });
    await client.execute({
      sql: "INSERT OR REPLACE INTO owner(singleton,pid,token) VALUES(1,2147483647,'crashed-owner')",
    });
    await client.close();
    const restarted = await FixtureCollector.open(s.config);
    expect(
      await restarted.capture("claude", payload, new Date().toISOString(), {
        streamId: "stream-a",
        offset: 20,
      }),
    ).toMatchObject({ code: "DUPLICATE", queued: false });
    await restarted.close();
    const verify = createClient({
      url: `file:${join(s.config.stateDirectory, "state.db")}`,
    });
    const checkpoint = await verify.execute(
      "SELECT stream,offset FROM checkpoints WHERE provider='claude'",
    );
    expect(checkpoint.rows[0]).toMatchObject({
      stream: "stream-a",
      offset: 20,
    });
    await verify.close();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("does not silently reset a corrupt SQLite state file", async () => {
    const s = await setup();
    await s.collector.close();
    await writeFile(
      join(s.config.stateDirectory, "state.db"),
      "not a sqlite database",
    );
    await expect(FixtureCollector.open(s.config)).rejects.toBeDefined();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("reclaims an orphaned row whose PID was reused by an unrelated process", async () => {
    const s = await setup();
    await s.collector.close();
    const client = createClient({
      url: "file:" + join(s.config.stateDirectory, "state.db"),
    });
    await client.execute({
      sql: "INSERT OR REPLACE INTO owner(singleton,pid,token,start_identity) VALUES(1,?,'orphan','different-process-start')",
      args: [process.pid],
    });
    client.close();
    const recovered = await FixtureCollector.open(s.config);
    await recovered.close();
    await rm(s.dir, { recursive: true, force: true });
  });

  it("serializes ownership and rejects simultaneous state writers", async () => {
    const s = await setup();
    await expect(FixtureCollector.open(s.config)).rejects.toThrow(
      "STATE_LOCKED",
    );
    await s.collector.close();
    const reopened = await FixtureCollector.open(s.config);
    await reopened.close();
    await rm(s.dir, { recursive: true, force: true });
  });
});
