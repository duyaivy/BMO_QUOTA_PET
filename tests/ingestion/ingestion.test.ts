import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest } from "@/server/ingestion";
import { enrollFixture } from "@/server/ingestion/enroll";
import { getDb, closeDbForTests } from "@/server/db";
import { effectiveWindow, semanticInput, eventSchema } from "@/contracts/usage";
import {
  observation,
  heartbeat,
  fixtureWindow,
  signedRequest,
  FIXTURE_KEY,
} from "../fixtures/usage";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "bmo-ingest-"));
  vi.stubEnv("TURSO_DATABASE_URL", "file:" + join(directory, "test.db"));
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
  for (const providerId of ["codex", "claude", "antigravity"] as const)
    await enrollFixture({
      collectorId: "fixture-collector",
      keyId: "fixture-key",
      name: "Synthetic fixtures",
      providerId,
    });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await closeDbForTests();
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
const send = async (
  event: unknown,
  options: Parameters<typeof signedRequest>[1] = {},
) => ingest(signedRequest(event, options));
const rows = async (table: string) =>
  (await (await getDb()).$client.execute("SELECT * FROM " + table)).rows;
const projected = async () =>
  JSON.parse(String((await rows("current_windows"))[0].payload));
async function code(response: Response, status: number, expected: string) {
  expect(response.status).toBe(status);
  expect((await response.json()).error).toMatchObject({ code: expected });
}
it("persists dynamic synthetic windows, amount-only nulls and provider isolation", async () => {
  const event = observation({
    windows: [
      fixtureWindow("flexible", 20),
      fixtureWindow("amount-only", null),
    ],
  });
  expect((await send(event)).status).toBe(200);
  expect(await rows("quota_observations")).toHaveLength(1);
  expect(await rows("quota_windows")).toHaveLength(2);
  const current = await rows("current_windows");
  expect(current.every((row) => row.provider_id === "codex")).toBe(true);
  expect(
    JSON.parse(
      String(current.find((row) => row.window_id === "amount-only")!.payload),
    ),
  ).toMatchObject({
    usedPercent: null,
    remainingPercent: null,
    windowDurationSeconds: null,
  });
  expect(await rows("mqtt_outbox").catch(() => [])).toHaveLength(0);
});
it("rejects tampering, unknown key/association, request skew, revocation and browser origins", async () => {
  const event = observation();
  const tampered = signedRequest(event);
  tampered.headers.set("X-BMO-Signature", "0".repeat(64));
  await code(await ingest(tampered), 401, "AUTH_FAILED");
  await code(await send(event, { keyId: "unknown" }), 401, "AUTH_FAILED");
  await code(
    await send({ ...event, collectorId: "not-enrolled" }),
    401,
    "AUTH_FAILED",
  );
  await code(
    await send(event, { timestamp: Math.floor(Date.now() / 1000) - 301 }),
    401,
    "REQUEST_TIME_INVALID",
  );
  await code(
    await send(event, { headers: { Origin: "http://127.0.0.1:3000" } }),
    403,
    "POLICY_BLOCKED",
  );
  await (
    await getDb()
  ).$client.execute("UPDATE collector_keys SET revoked_at=1");
  await code(await send(event), 403, "COLLECTOR_REVOKED");
  expect(await rows("quota_observations")).toHaveLength(0);
});
it("atomically rejects nonce replay and makes same-event new-nonce retries idempotent", async () => {
  const event = observation();
  const nonce = "c".repeat(32);
  const first = await (await send(event, { nonce })).json();
  await code(await send(event, { nonce }), 409, "REPLAY_DETECTED");
  const duplicate = await (await send(event)).json();
  expect(duplicate.data).toMatchObject({
    outcome: "duplicate",
    receivedAt: first.data.receivedAt,
  });
  await code(
    await send({ ...event, sourceVersion: "changed" }),
    409,
    "IDEMPOTENCY_CONFLICT",
  );
  expect(await rows("quota_observations")).toHaveLength(1);
  expect(await rows("ingestion_nonces")).toHaveLength(2);
});
it("handles simultaneous duplicate and nonce transactions without double persistence", async () => {
  const event = observation();
  const result = await Promise.all([send(event), send(event)]);
  expect(result.map((response) => response.status)).toEqual([200, 200]);
  expect(
    (await Promise.all(result.map((response) => response.json())))
      .map((body) => body.data.outcome)
      .sort(),
  ).toEqual(["accepted", "duplicate"]);
  const second = observation({ sequence: 2 });
  const nonce = "d".repeat(32);
  const replay = await Promise.all([
    send(second, { nonce }),
    send(second, { nonce }),
  ]);
  expect(replay.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(await rows("quota_observations")).toHaveLength(2);
});
it("stores late sequences historically and rejects sequence reuse", async () => {
  const first = observation();
  await send(first);
  await send(
    observation({
      sequence: 3,
      windows: [fixtureWindow("dynamic.bucket", 80)],
    }),
  );
  const late = await (
    await send(
      observation({
        sequence: 2,
        windows: [fixtureWindow("dynamic.bucket", 10)],
      }),
    )
  ).json();
  expect(late.data.outcome).toBe("superseded");
  expect(await projected()).toMatchObject({ usedPercent: 80 });
  await code(
    await send(observation({ sequence: 3 })),
    409,
    "SEQUENCE_CONFLICT",
  );
  expect(await rows("quota_observations")).toHaveLength(3);
});
it("preserves independent partial-window times and refuses older or ambiguous upstream replacements", async () => {
  const old = new Date(Date.now() - 600000).toISOString();
  const recent = new Date(Date.now() - 1000).toISOString();
  await send(
    observation({
      collectedAt: recent,
      windows: [fixtureWindow("a", 20, old), fixtureWindow("b", 40, recent)],
    }),
  );
  await send(
    observation({
      sequence: 2,
      collectedAt: recent,
      windows: [fixtureWindow("a", 50, recent)],
    }),
  );
  let current = await rows("current_windows");
  expect(
    JSON.parse(String(current.find((row) => row.window_id === "b")!.payload))
      .collectedAt,
  ).toBe(recent);
  const outcome = await (
    await send(
      observation({
        sequence: 3,
        collectedAt: recent,
        windows: [fixtureWindow("a", 5, recent, { upstreamObservedAt: old })],
      }),
    )
  ).json();
  expect(outcome.data.outcome).toBe("superseded");
  await send(
    observation({
      sequence: 4,
      windows: [
        fixtureWindow("a", 1, recent, {
          upstreamObservedAt: null,
          freshnessBasis: "session_snapshot",
          sourceFreshness: "unknown",
        }),
      ],
    }),
  );
  current = await rows("current_windows");
  expect(
    JSON.parse(String(current.find((row) => row.window_id === "a")!.payload))
      .usedPercent,
  ).toBe(50);
});
it("requires verified complete-set semantics and retires only eligible missing windows", async () => {
  const event = observation({
    snapshotMode: "complete",
    windows: [fixtureWindow("a"), fixtureWindow("b")],
  });
  await code(await send(event), 403, "POLICY_BLOCKED");
  await (
    await getDb()
  ).$client.execute(
    "UPDATE provider_config SET complete_set_verified=1 WHERE provider_id='codex'",
  );
  expect((await send(event)).status).toBe(200);
  expect(
    (
      await send(
        observation({
          sequence: 2,
          snapshotMode: "complete",
          windows: [fixtureWindow("a")],
        }),
      )
    ).status,
  ).toBe(200);
  expect((await rows("current_windows")).map((row) => row.window_id)).toEqual([
    "a",
  ]);
});
it("source switches clear projections and reject old generations even for an existing receipt", async () => {
  const old = observation();
  await send(old);
  const generation = await enrollFixture({
    collectorId: "fixture-collector",
    name: "Synthetic switch",
    keyId: "fixture-key",
    providerId: "codex",
  });
  expect(await rows("current_windows")).toHaveLength(0);
  await code(await send(old), 409, "SOURCE_OWNERSHIP_CONFLICT");
  expect(
    (await send(observation({ ownershipGeneration: generation, sequence: 1 })))
      .status,
  ).toBe(200);
  await (
    await getDb()
  ).$client.execute(
    "UPDATE provider_config SET enabled=0 WHERE provider_id='codex'",
  );
  await code(
    await send(observation({ ownershipGeneration: generation, sequence: 2 })),
    403,
    "SOURCE_DISABLED",
  );
});
it("keeps prior good data through unavailable observations and heartbeat/upload cannot freshen quota", async () => {
  const first = observation();
  await send(first);
  const saved = await projected();
  await send(
    heartbeat({ sequence: 1000, lastSourceEventAt: first.collectedAt }),
  );
  expect(await projected()).toEqual(saved);
  await send(
    observation({
      sequence: 2,
      dataStatus: "unavailable",
      sourceAvailability: "inactive",
      errorCode: "SOURCE_INACTIVE",
      windows: [],
    }),
  );
  expect(await projected()).toEqual(saved);
  expect(await rows("quota_observations")).toHaveLength(2);
  const provider = (await rows("provider_config")).find(
    (row) => row.provider_id === "codex",
  )!;
  expect(provider.latest_sequence).toBe(2);
  expect(provider.data_status).toBe("unavailable");
});
it("bounds streamed bytes and rejects paths, compression, nested/duplicate keys and forbidden fields", async () => {
  const event = observation();
  await code(
    await send(event, {
      raw: " ".repeat(32769),
      stream: true,
      headers: { "Content-Length": "1" },
    }),
    413,
    "PAYLOAD_TOO_LARGE",
  );
  await code(
    await send(event, { headers: { "Content-Encoding": "gzip" } }),
    415,
    "UNSUPPORTED_MEDIA_TYPE",
  );
  await code(
    await send(event, { path: "/api/internal/usage/ingest?x=1" }),
    400,
    "INVALID_PAYLOAD",
  );
  await code(
    await send(event, { path: "/api/internal/usage/%69ngest" }),
    400,
    "INVALID_PAYLOAD",
  );
  await code(
    await send({ ...event, providerCredentials: "forbidden synthetic marker" }),
    400,
    "INVALID_PAYLOAD",
  );
  await code(
    await send(event, {
      raw: JSON.stringify(event).replace(
        '"schemaVersion":1',
        '"schemaVersion":1,"schema\\u0056ersion":1',
      ),
    }),
    400,
    "INVALID_PAYLOAD",
  );
  await code(
    await send(event, { raw: '{"deep":'.repeat(14) + "null" + "}".repeat(14) }),
    400,
    "INVALID_PAYLOAD",
  );
});
it("rejects malformed values, contradictory evidence, duplicate buckets and provider-source mismatch", async () => {
  for (const window of [
    { usedPercent: "20" },
    { usedPercent: true },
    { usedPercent: 101 },
    { usedPercent: 20, remainingPercent: 90 },
    { windowDurationSeconds: -1 },
    { upstreamObservedAt: null, sourceFreshness: "fresh" },
  ]) {
    await code(
      await send(
        observation({ windows: [{ ...fixtureWindow(), ...window } as never] }),
      ),
      400,
      "INVALID_PAYLOAD",
    );
  }
  await code(
    await send(
      observation({ windows: [fixtureWindow("a"), fixtureWindow("a")] }),
    ),
    400,
    "INVALID_PAYLOAD",
  );
  await code(
    await send(observation({ sourceType: "claude-statusline" })),
    400,
    "INVALID_PAYLOAD",
  );
  const future = new Date(Date.now() + 301000).toISOString();
  await code(
    await send(
      observation({
        collectedAt: future,
        upstreamObservedAt: future,
        windows: [fixtureWindow("a", 10, future)],
      }),
    ),
    400,
    "INVALID_SOURCE_TIME",
  );
});
it("rejects new captures past queue age but acknowledges an authenticated exact old receipt", async () => {
  const event = observation();
  const original = await (await send(event)).json();
  const clock = Date.now() + 25 * 3600000;
  vi.spyOn(Date, "now").mockReturnValue(clock);
  const duplicate = await (await send(event)).json();
  expect(duplicate.data).toMatchObject({
    outcome: "duplicate",
    receivedAt: original.data.receivedAt,
  });
  await code(
    await send({ ...event, eventId: crypto.randomUUID(), sequence: 2 }),
    400,
    "EVENT_TOO_OLD",
  );
});
it("rolls back observation, receipt and nonce on transaction failure and retries the immutable event", async () => {
  const db = await getDb();
  await db.$client.executeMultiple(
    "CREATE TRIGGER fixture_failure BEFORE INSERT ON quota_windows BEGIN SELECT RAISE(ABORT,'synthetic transaction failure'); END;",
  );
  const event = observation();
  const failure = await send(event);
  await code(failure, 503, "TEMPORARY_FAILURE");
  for (const table of [
    "quota_observations",
    "ingestion_receipts",
    "ingestion_nonces",
  ])
    expect(await rows(table)).toHaveLength(0);
  await db.$client.execute("DROP TRIGGER fixture_failure");
  expect((await send(event)).status).toBe(200);
  db.$client.close();
  await code(await send(event), 503, "TEMPORARY_FAILURE");
  await closeDbForTests();
  expect((await (await send(event)).json()).data.outcome).toBe("duplicate");
});
it("keeps durable authenticated throttling across client recreation", async () => {
  const event = observation();
  for (let i = 0; i < 120; i++)
    expect((await send({ ...event, forbidden: true })).status).toBe(400);
  await closeDbForTests();
  const limited = await send(event);
  expect(limited.headers.get("Retry-After")).toBe("60");
  await code(limited, 429, "RATE_LIMITED");
});
it("canonical dedup excludes callback/capture clocks but preserves meaningful source evidence", () => {
  const first = observation();
  const next = observation({
    sequence: 2,
    windows: first.windows.map((window) => ({
      ...window,
      collectedAt: new Date().toISOString(),
    })),
  });
  expect(
    semanticInput({
      ...next,
      collectedAt: first.collectedAt,
      upstreamObservedAt: first.upstreamObservedAt,
    }),
  ).toBe(semanticInput(first));
  expect(
    semanticInput({ ...next, upstreamObservedAt: new Date().toISOString() }),
  ).not.toBe(semanticInput(first));
  expect(eventSchema.safeParse({ ...heartbeat(), windows: [] }).success).toBe(
    false,
  );
});
it("derives freshness per window and never resets expired quota to zero", () => {
  const old = new Date(Date.now() - 901000).toISOString();
  const unknown = fixtureWindow("a", null, old, {
    upstreamObservedAt: null,
    freshnessBasis: "session_snapshot",
    sourceFreshness: "unknown",
  });
  expect(effectiveWindow(unknown, Date.now())).toMatchObject({
    usedPercent: null,
    effectiveFreshness: "stale",
  });
  const expired = fixtureWindow("b", 70, undefined, {
    resetAt: new Date(Date.now() - 1).toISOString(),
  });
  expect(effectiveWindow(expired, Date.now())).toMatchObject({
    usedPercent: 70,
    effectiveStatus: "unavailable",
    resetExpired: true,
  });
});

it("keeps old cached window evidence stale in a new candidate", async () => {
  const old = new Date(Date.now() - 25 * 3600000).toISOString();
  expect(
    (await send(observation({ windows: [fixtureWindow("cached", 60, old)] })))
      .status,
  ).toBe(200);
  expect(
    effectiveWindow(await projected(), Date.now()).effectiveFreshness,
  ).toBe("stale");
});

it("updates partial window availability without freshening prior known upstream evidence", async () => {
  const first = observation();
  await send(first);
  const original = await projected();
  const now = new Date().toISOString();
  await send(
    observation({
      sequence: 2,
      collectedAt: now,
      windows: [
        fixtureWindow("dynamic.bucket", null, now, {
          upstreamObservedAt: null,
          freshnessBasis: "unknown",
          sourceFreshness: "unknown",
          dataStatus: "unavailable",
        }),
      ],
    }),
  );
  const state = (await rows("current_windows"))[0];
  expect(state.data_status).toBe("unavailable");
  expect(JSON.parse(String(state.payload))).toEqual(original);
});
