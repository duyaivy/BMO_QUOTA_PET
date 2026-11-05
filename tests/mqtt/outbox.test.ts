import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDbForTests, getDb, writeTransaction } from "@/server/db";
import {
  enqueueDeviceConfig,
  enqueueDeviceTombstones,
} from "@/server/mqtt/outbox";
import { ingest } from "@/server/ingestion";
import { enrollFixture } from "@/server/ingestion/enroll";
import { signedRequest, FIXTURE_KEY, observation } from "../fixtures/usage";

describe("MQTT Outbox", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "bmo-outbox-"));
    vi.stubEnv("TURSO_DATABASE_URL", "file:" + join(directory, "test.db"));
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    vi.stubEnv("BMO_APP_ORIGIN", "http://127.0.0.1:3000");
    vi.stubEnv(
      "SESSION_SECRET",
      "synthetic-test-secret-at-least-32-characters",
    );
    vi.stubEnv(
      "ADMIN_PASSWORD_HASH",
      "$argon2id$v=19$m=65536,t=3,p=4$c3ludGhldGlj$c3ludGhldGlj",
    );
    vi.stubEnv("BMO_ALLOW_FIXTURE_SETUP", "true");
    vi.stubEnv(
      "BMO_INGEST_KEYS_JSON",
      JSON.stringify({ "fixture-key": FIXTURE_KEY }),
    );
  });

  afterEach(async () => {
    await closeDbForTests();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("enqueues device config and safely supersedes older pending revisions", async () => {
    const db = await getDb();

    // Enqueue revision 1
    await writeTransaction(async (tx) => {
      await enqueueDeviceConfig(tx, "bmo-local", 1, [
        { screenId: "pet-home", kind: "pet" },
      ]);
    });

    let rows = (
      await db.$client.execute(
        "SELECT revision, state FROM mqtt_outbox WHERE device_id='bmo-local' ORDER BY revision ASC",
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].revision).toBe(1);
    expect(rows[0].state).toBe("pending");

    // Enqueue revision 2 (supersedes pending revision 1)
    await writeTransaction(async (tx) => {
      await enqueueDeviceConfig(tx, "bmo-local", 2, [
        { screenId: "pet-home", kind: "pet" },
      ]);
    });

    rows = (
      await db.$client.execute(
        "SELECT revision, state FROM mqtt_outbox WHERE device_id='bmo-local' ORDER BY revision ASC",
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].revision).toBe(1);
    expect(rows[0].state).toBe("superseded"); // superseded!
    expect(rows[1].revision).toBe(2);
    expect(rows[1].state).toBe("pending");
  });

  it("enqueues tombstones with empty payload and is_tombstone = 1", async () => {
    const db = await getDb();

    await writeTransaction(async (tx) => {
      await enqueueDeviceTombstones(tx, "bmo-local");
    });

    const rows = (
      await db.$client.execute(
        "SELECT topic, is_tombstone, payload FROM mqtt_outbox WHERE device_id='bmo-local'",
      )
    ).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.is_tombstone).toBe(1);
      expect(row.payload).toBe("");
    }
  });

  it("automatically enqueues device snapshot on accepted usage ingestion", async () => {
    const db = await getDb();

    // First enroll provider & add quota screen to bmo-local
    await enrollFixture({
      collectorId: "fixture-collector",
      keyId: "fixture-key",
      name: "Fixture",
      providerId: "codex",
    });

    await writeTransaction(async (tx) => {
      await tx.execute({
        sql: "INSERT INTO device_screens(device_id, screen_id, position, kind, provider_id, window_id) VALUES('bmo-local', 'screen-codex', 1, 'quota', 'codex', 'codex-window')",
      });
      await tx.execute({
        sql: "UPDATE provider_config SET enabled=1 WHERE provider_id='codex'",
      });
    });

    // Ingest quota observation
    const nowIso = new Date().toISOString();
    const event = observation({
      collectedAt: nowIso,
      upstreamObservedAt: nowIso,
      providerId: "codex",
      windows: [
        {
          windowId: "codex-window",
          label: "Codex Limit",
          windowDurationSeconds: 18000,
          usedPercent: 25,
          remainingPercent: 75,
          resetAt: new Date(Date.now() + 3600000).toISOString(),
          dataStatus: "ok",
          collectedAt: nowIso,
          upstreamObservedAt: nowIso,
          freshnessBasis: "upstream_timestamp",
          sourceFreshness: "fresh",
        },
      ],
    });

    const response = await ingest(signedRequest(event));
    expect(response.status).toBe(200);

    // Verify mqtt_outbox contains the enqueued snapshot!
    const outboxRows = (
      await db.$client.execute(
        "SELECT topic, payload, state FROM mqtt_outbox WHERE device_id='bmo-local' AND topic LIKE '%/snapshot'",
      )
    ).rows;

    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].state).toBe("pending");
    const payload = JSON.parse(String(outboxRows[0].payload));
    expect(payload.schemaVersion).toBe(1);
    expect(payload.windows).toHaveLength(1);
    expect(payload.windows[0].windowId).toBe("codex-window");
    expect(payload.windows[0].usedPercent).toBe(25);
  });
});
