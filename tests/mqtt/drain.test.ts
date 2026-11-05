import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDbForTests, getDb, writeTransaction } from "@/server/db";
import { enqueueDeviceConfig } from "@/server/mqtt/outbox";
import { drainOutbox } from "@/server/mqtt/drain";
import { MockMqttBroker } from "../fixtures/mqtt-broker";
import { MqttClient } from "@/server/mqtt/publisher";

describe("MQTT Outbox Drain", () => {
  let directory: string;
  let broker: MockMqttBroker;
  let brokerPort: number;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "bmo-drain-"));
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

    broker = new MockMqttBroker();
    brokerPort = await broker.start();
  });

  afterEach(async () => {
    await broker.stop();
    await closeDbForTests();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("drains pending outbox rows, publishes with QoS 1, and marks them published", async () => {
    const db = await getDb();

    // Enqueue 2 config revisions
    await writeTransaction(async (tx) => {
      await enqueueDeviceConfig(tx, "bmo-local", 1, [
        { screenId: "pet-home", kind: "pet" },
      ]);
    });

    const client = new MqttClient({
      host: "127.0.0.1",
      port: brokerPort,
      useTls: false,
    });

    const result = await drainOutbox({ publisher: client });
    expect(result.drained).toBe(1);
    expect(result.published).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.leaseAcquired).toBe(true);

    // Verify mock broker received message
    expect(broker.publishedMessages).toHaveLength(1);
    expect(broker.publishedMessages[0].topic).toBe(
      "bmo/v1/devices/bmo-local/config",
    );
    expect(broker.publishedMessages[0].qos).toBe(1);
    expect(broker.publishedMessages[0].retain).toBe(true);

    // Verify database row state
    const rows = (
      await db.$client.execute(
        "SELECT state, acknowledged_at, attempts FROM mqtt_outbox WHERE device_id='bmo-local'",
      )
    ).rows;
    expect(rows[0].state).toBe("published");
    expect(rows[0].acknowledged_at).toBeGreaterThan(0);
    expect(rows[0].attempts).toBe(0);
  });

  it("prevents concurrent drain when another worker holds lease", async () => {
    const db = await getDb();

    // Seed active lease
    await db.$client.execute({
      sql: "INSERT INTO operational_state(resource, updated_at, last_code, lease_owner, lease_expires_at, generation) VALUES('mqtt_outbox_drain', ?, 'BUSY', 'other-worker', ?, 1)",
      args: [Date.now(), Date.now() + 60000], // lease valid for next 60s
    });

    const result = await drainOutbox();
    expect(result.leaseAcquired).toBe(false);
    expect(result.drained).toBe(0);
  });

  it("schedules exponential backoff on broker failure", async () => {
    const db = await getDb();

    await writeTransaction(async (tx) => {
      await enqueueDeviceConfig(tx, "bmo-local", 1, [
        { screenId: "pet-home", kind: "pet" },
      ]);
    });

    // Client pointing to non-existent broker port
    const failingClient = new MqttClient({
      host: "127.0.0.1",
      port: 1, // closed port
      useTls: false,
      connectTimeoutMs: 100,
    });

    const result = await drainOutbox({ publisher: failingClient });
    expect(result.failed).toBe(1);
    expect(result.published).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);

    const rows = (
      await db.$client.execute(
        "SELECT state, attempts, next_attempt_at, last_error FROM mqtt_outbox WHERE device_id='bmo-local'",
      )
    ).rows;
    expect(rows[0].state).toBe("failed");
    expect(rows[0].attempts).toBe(1);
    expect(Number(rows[0].next_attempt_at)).toBeGreaterThan(Date.now());
    expect(String(rows[0].last_error)).toContain("MQTT");
  });

  it("recovers abandoned in_flight message from crashed worker", async () => {
    const db = await getDb();

    // Insert an in_flight row with updated_at in past
    await db.$client.execute({
      sql: `INSERT INTO mqtt_outbox(
        id, device_id, topic, revision, payload, is_tombstone,
        semantic_hash, state, attempts, next_attempt_at, created_at, updated_at
      ) VALUES('crashed-job', 'bmo-local', 'bmo/v1/devices/bmo-local/config', 1, '{"schemaVersion":1,"deviceId":"bmo-local","revision":1,"updatedAt":"2026-11-01T00:00:00.000Z","screens":[{"screenId":"pet-home","kind":"pet"}]}', 0, 'hash', 'in_flight', 0, ?, ?, ?)`,
      args: [Date.now(), Date.now() - 60000, Date.now() - 60000],
    });

    const client = new MqttClient({
      host: "127.0.0.1",
      port: brokerPort,
      useTls: false,
    });

    const result = await drainOutbox({ publisher: client });
    expect(result.published).toBe(1);

    const rows = (
      await db.$client.execute(
        "SELECT state, acknowledged_at FROM mqtt_outbox WHERE id='crashed-job'",
      )
    ).rows;
    expect(rows[0].state).toBe("published");
  });
});
