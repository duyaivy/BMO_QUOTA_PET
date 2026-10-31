import { spawn } from "node:child_process";
import { once } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixtureCollector, type CollectorConfig } from "../../collector/src";
import { ingest } from "@/server/ingestion";
import { enrollFixture } from "@/server/ingestion/enroll";
import { closeDbForTests, getDb } from "@/server/db";
import { FIXTURE_KEY } from "../fixtures/usage";
import { eventSchema } from "@/contracts/usage";

let directory: string;
let collector: FixtureCollector | undefined;
let config: CollectorConfig;
function codex(used = 20, extra = 40) {
  return JSON.stringify({
    fixtureSchema: "codex-v1",
    type: "event_msg",
    payload: {
      type: "token_count",
      rate_limits: {
        "dynamic.a": { used_percent: used },
        "dynamic.b": { used_percent: extra },
      },
    },
  });
}
const cloud: typeof fetch = async (input, init) =>
  ingest(new Request(input, init));
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "bmo-pipeline-"));
  vi.stubEnv("TURSO_DATABASE_URL", "file:" + join(directory, "cloud.db"));
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv("BMO_APP_ORIGIN", "http://127.0.0.1:3000");
  vi.stubEnv("SESSION_SECRET", "synthetic-test-secret-at-least-32-characters");
  vi.stubEnv(
    "ADMIN_PASSWORD_HASH",
    "$argon2id$v=19$m=65536,t=3,p=4$c3ludGhldGlj$c3ludGhldGlj",
  );
  vi.stubEnv("BMO_ALLOW_FIXTURE_SETUP", "true");
  vi.stubEnv(
    "BMO_INGEST_KEYS_JSON",
    JSON.stringify({ "fixture-key": FIXTURE_KEY }),
  );
  const providers: CollectorConfig["providers"] = {};
  for (const providerId of ["codex", "claude", "antigravity"] as const) {
    const generation = await enrollFixture({
      collectorId: "fixture-collector",
      keyId: "fixture-key",
      name: "Synthetic pipeline",
      providerId,
    });
    providers[providerId] = { enabled: true, generation };
  }
  const secretFile = join(directory, "bmo.key");
  await writeFile(secretFile, FIXTURE_KEY, { mode: 0o600 });
  config = {
    collectorId: "fixture-collector",
    keyId: "fixture-key",
    secretFile,
    url: "http://127.0.0.1:3000/api/internal/usage/ingest",
    stateDirectory: join(directory, "collector"),
    allowLocalHttp: true,
    providers,
  };
  collector = await FixtureCollector.open(config);
});
afterEach(async () => {
  await collector?.close();
  collector = undefined;
  await closeDbForTests();
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it("parses synthetic source records, signs accepted requests and persists quota-only data", async () => {
  expect((await collector!.capture("codex", codex())).queued).toBe(true);
  const event = (await collector!.pendingEvents())[0];
  expect(eventSchema.safeParse(event).success).toBe(true);
  expect(event.sequence).toBe(1);
  await collector!.uploadOnce(cloud);
  expect((await collector!.inspect()).pending).toBe(0);
  const rows = await (
    await getDb()
  ).$client.execute("SELECT payload FROM quota_observations");
  expect(rows.rows).toHaveLength(1);
  expect(JSON.parse(String(rows.rows[0].payload))).toMatchObject({
    eventId: event.eventId,
    providerId: "codex",
  });
});
it("retries the exact event after a lost acknowledgement and restart with fresh HMAC nonce", async () => {
  await collector!.capture("codex", codex());
  const eventId = (await collector!.pendingEvents())[0].eventId;
  const bodies: string[] = [],
    nonces: string[] = [];
  const lostAck: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    bodies.push(await request.clone().text());
    nonces.push(request.headers.get("X-BMO-Nonce")!);
    expect((await ingest(request)).status).toBe(200);
    throw new TypeError("synthetic lost acknowledgement");
  };
  await collector!.uploadOnce(lostAck);
  expect((await collector!.inspect()).pending).toBe(1);
  await collector!.close();
  collector = await FixtureCollector.open(config);
  expect((await collector.pendingEvents())[0].eventId).toBe(eventId);
  const retry: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    bodies.push(await request.clone().text());
    nonces.push(request.headers.get("X-BMO-Nonce")!);
    const response = await ingest(request);
    expect((await response.clone().json()).data.outcome).toBe("duplicate");
    return response;
  };
  await collector.uploadOnce(retry, Date.now() + 10000);
  expect((await collector.inspect()).pending).toBe(0);
  expect(bodies[1]).toBe(bodies[0]);
  expect(nonces[1]).not.toBe(nonces[0]);
  expect(
    (await (await getDb()).$client.execute("SELECT * FROM quota_observations"))
      .rows,
  ).toHaveLength(1);
});
it("preserves cached and untouched bucket capture times across meaningful partial changes", async () => {
  const first = new Date(Date.now() - 60000).toISOString(),
    second = new Date(Date.now() - 1000).toISOString();
  await collector!.capture("codex", codex(), first);
  const initial = (await collector!.pendingEvents())[0];
  expect(initial.kind).toBe("observation");
  expect((await collector!.capture("codex", codex(), second)).queued).toBe(
    false,
  );
  await collector!.capture("codex", codex(30), second);
  const events = await collector!.pendingEvents();
  const latest = events.at(-1)!;
  if (latest.kind !== "observation") throw new Error("Expected observation");
  const unchanged = latest.windows.find(
    (window) => window.windowId === "dynamic.b",
  );
  // A partial event may omit unchanged B entirely; if included its original capture is retained.
  if (unchanged) expect(unchanged.collectedAt).toBe(first);
  expect(
    latest.windows.find((window) => window.windowId === "dynamic.a")
      ?.collectedAt,
  ).toBe(second);
  expect(latest.sequence).toBeGreaterThan(initial.sequence);
});
it("pauses an invalid source while another provider can upload independently", async () => {
  await collector!.capture("codex", codex());
  await (
    await getDb()
  ).$client.execute(
    "UPDATE provider_config SET enabled=0 WHERE provider_id='codex'",
  );
  await collector!.uploadOnce(cloud);
  expect((await collector!.inspect()).pausedSources).toContain("codex");
  await collector!.capture(
    "claude",
    JSON.stringify({
      fixtureSchema: "claude-v1",
      rate_limits: { flex: { used_percentage: 12 } },
    }),
  );
  await collector!.uploadOnce(cloud);
  const rows = await (
    await getDb()
  ).$client.execute("SELECT provider_id FROM quota_observations");
  expect(rows.rows.map((row) => row.provider_id)).toContain("claude");
  expect(
    (await collector!.pendingEvents()).some(
      (event) => event.providerId === "codex",
    ),
  ).toBe(true);
});

it("rotates a BMO transport key without losing the collector sequence or immutable queue", async () => {
  await collector!.capture("codex", codex());
  const event = (await collector!.pendingEvents())[0];
  await collector!.close();
  await (
    await getDb()
  ).$client.execute({
    sql: "INSERT INTO collector_keys(key_id,collector_id,active_from) VALUES('rotated-key','fixture-collector',?)",
    args: [Date.now()],
  });
  vi.stubEnv(
    "BMO_INGEST_KEYS_JSON",
    JSON.stringify({ "rotated-key": "c".repeat(64) }),
  );
  await writeFile(config.secretFile, "c".repeat(64), { mode: 0o600 });
  collector = await FixtureCollector.open({ ...config, keyId: "rotated-key" });
  expect((await collector.pendingEvents())[0].eventId).toBe(event.eventId);
  await collector.uploadOnce(cloud);
  expect((await collector.inspect()).pending).toBe(0);
});

it("marks a disabled bucket unavailable while retaining previous good quota", async () => {
  const raw = (disabled: boolean) =>
    JSON.stringify({
      fixtureSchema: "antigravity-v1",
      quota: {
        a: { remaining_fraction: 0.5 },
        b: disabled ? { disabled: true } : { remaining_fraction: 0.25 },
      },
    });
  await collector!.capture("antigravity", raw(false));
  await collector!.uploadOnce(cloud);
  await collector!.capture("antigravity", raw(true));
  await collector!.uploadOnce(cloud);
  const rows = await (
    await getDb()
  ).$client.execute(
    "SELECT payload,data_status FROM current_windows WHERE provider_id='antigravity' AND window_id='b'",
  );
  expect(rows.rows[0].data_status).toBe("unavailable");
  expect(JSON.parse(String(rows.rows[0].payload)).usedPercent).toBe(75);
});

it("recovers the committed event and checkpoint after an actual collector process crash", async () => {
  await collector!.close();
  collector = undefined;
  const configFile = join(directory, "child-config.json");
  await writeFile(configFile, JSON.stringify(config));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/collector-child.ts", configFile],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: undefined },
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ready = await Promise.race([
      new Promise<string>((resolve, reject) => {
        child.stdout!.once("data", (data) => resolve(String(data).trim()));
        child.once("error", reject);
        child.once("exit", () =>
          reject(new Error("Fixture exited before commit")),
        );
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Fixture commit timeout")),
          10000,
        );
      }),
    ]);
    expect(ready).toMatch(/^READY:/);
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
    collector = await FixtureCollector.open(config);
    expect((await collector.pendingEvents())[0].eventId).toBe(ready.slice(6));
    expect(await collector.checkpoint("codex")).toEqual({
      streamId: "crash-fixture",
      offset: 7,
    });
    await collector.capture("codex", codex(32));
    expect(
      Math.max(
        ...(await collector.pendingEvents()).map((event) => event.sequence),
      ),
    ).toBe(2);
  } finally {
    if (timer) clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
});
