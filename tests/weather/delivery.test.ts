import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDbForTests, getDb, writeTransaction } from "@/server/db";
import { saveWeatherLocation } from "@/server/weather/settings";
import {
  enqueueDeviceWeather,
  enqueueWeatherTombstone,
} from "@/server/weather/projection";
import { buildDeviceTopic } from "@/contracts/mqtt";
import { enqueueDeviceConfig } from "@/server/mqtt/outbox";
import { drainOutbox } from "@/server/mqtt/drain";
import type { MqttClient } from "@/server/mqtt/publisher";
import { retireDevice } from "@/server/devices/repository";
const location = {
  provider: "open-meteo" as const,
  id: 12,
  name: "Da Nang",
  admin1: null,
  country: "Vietnam",
  countryCode: "VN",
  latitude: 16.06,
  longitude: 108.22,
  timezone: "Asia/Ho_Chi_Minh",
};
describe("weather retained projection", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "bmo-weather-delivery-"));
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
    vi.stubEnv("BMO_WEATHER_ENABLED", "true");
    vi.stubEnv("BMO_WEATHER_DEVICE_IDS", '["bmo-local"]');
  });
  afterEach(async () => {
    await closeDbForTests();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  it("uses durable increasing revisions after outbox pruning and clears old place", async () => {
    const now = Date.parse("2026-11-15T00:01:00.000Z");
    await saveWeatherLocation(
      { expectedRevision: 1, locationId: 12 },
      async () => location,
    );
    await writeTransaction(async (tx) => {
      await tx.execute({
        sql: "UPDATE weather_cache SET observation_json=?,data_at=? WHERE id=1",
        args: [
          JSON.stringify({
            condition: "clear",
            temperatureC: 28,
            isDay: true,
            dataAt: "2026-11-15T00:00:00.000Z",
          }),
          now - 60000,
        ],
      });
      await enqueueDeviceWeather(tx, "bmo-local", now);
    });
    const db = await getDb();
    const topic = buildDeviceTopic("bmo-local", "weather");
    const first = (
      await db.$client.execute({
        sql: "SELECT revision,payload FROM mqtt_outbox WHERE topic=? ORDER BY revision DESC LIMIT 1",
        args: [topic],
      })
    ).rows[0];
    expect(JSON.parse(String(first.payload)).status).toBe("ok");
    await db.$client.execute({
      sql: "DELETE FROM mqtt_outbox WHERE topic=?",
      args: [topic],
    });
    await saveWeatherLocation(
      { expectedRevision: 2, locationId: 13 },
      async () => ({ ...location, id: 13, name: "Hue" }),
    );
    const latest = (
      await db.$client.execute({
        sql: "SELECT revision,payload FROM mqtt_outbox WHERE topic=? ORDER BY revision DESC LIMIT 1",
        args: [topic],
      })
    ).rows[0];
    expect(Number(latest.revision)).toBeGreaterThan(Number(first.revision));
    expect(JSON.parse(String(latest.payload))).toMatchObject({
      status: "unavailable",
      locationRevision: 3,
    });
    await writeTransaction(async (tx) => {
      await enqueueWeatherTombstone(tx, "bmo-local", now);
    });
    const tombstone = (
      await db.$client.execute({
        sql: "SELECT payload,is_tombstone FROM mqtt_outbox WHERE topic=? ORDER BY revision DESC LIMIT 1",
        args: [topic],
      })
    ).rows[0];
    expect(tombstone).toMatchObject({ payload: "", is_tombstone: 1 });
  });
  it("checks weather row fencing during unscoped drain instead of batch publishing", async () => {
    await saveWeatherLocation(
      { expectedRevision: 1, locationId: 12 },
      async () => location,
    );
    await writeTransaction(async (tx) => {
      await enqueueDeviceConfig(tx, "bmo-local", 2, [
        { screenId: "pet-home", kind: "pet" },
      ]);
    });
    const publish = vi.fn(async () => ({
      topic: "",
      bytesWritten: 0,
      qos: 1 as const,
      retained: true,
      durationMs: 0,
    }));
    const publishBatch = vi.fn(async () => []);
    await drainOutbox({
      publisher: { publish, publishBatch } as unknown as MqttClient,
    });
    expect(publishBatch).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(2);
  });
  it("does not revive a superseded weather retry after location changes during publish", async () => {
    await saveWeatherLocation(
      { expectedRevision: 1, locationId: 12 },
      async () => location,
    );
    const publish = vi.fn(async () => {
      await saveWeatherLocation(
        { expectedRevision: 2, locationId: 13 },
        async () => ({ ...location, id: 13, name: "Hue" }),
      );
      throw new Error("Broker unavailable");
    });
    const result = await drainOutbox({
      publisher: { publish } as unknown as MqttClient,
      topicKinds: ["weather"],
    });
    expect(result.failed).toBe(1);
    const rows = (
      await (
        await getDb()
      ).$client.execute(
        "SELECT revision,state FROM mqtt_outbox WHERE topic LIKE '%/weather' ORDER BY revision",
      )
    ).rows;
    expect(rows.map((row) => row.state)).toEqual(["superseded", "pending"]);
  });
  it("queues retained weather tombstone when an enabled weather device is retired", async () => {
    await saveWeatherLocation(
      { expectedRevision: 1, locationId: 12 },
      async () => location,
    );
    await retireDevice({ deviceId: "bmo-local", expectedRevision: 1 });
    const row = (
      await (
        await getDb()
      ).$client.execute(
        "SELECT is_tombstone,payload FROM mqtt_outbox WHERE topic LIKE '%/weather' ORDER BY revision DESC LIMIT 1",
      )
    ).rows[0];
    expect(row).toMatchObject({ is_tombstone: 1, payload: "" });
  });
  it("reconciles identical weather after broker loss using the original revision", async () => {
    const now = Date.parse("2026-11-15T00:01:00.000Z");
    await saveWeatherLocation(
      { expectedRevision: 1, locationId: 12 },
      async () => location,
    );
    await writeTransaction(async (tx) => {
      await tx.execute({
        sql: "UPDATE weather_cache SET observation_json=?,data_at=? WHERE id=1",
        args: [
          JSON.stringify({
            condition: "clear",
            temperatureC: 28,
            isDay: true,
            dataAt: "2026-11-15T00:00:00.000Z",
          }),
          now - 60000,
        ],
      });
      await enqueueDeviceWeather(tx, "bmo-local", now);
    });
    const db = await getDb();
    await db.$client.execute(
      "UPDATE mqtt_outbox SET state='published' WHERE topic LIKE '%/weather'",
    );
    const before = (
      await db.$client.execute(
        "SELECT revision,payload FROM mqtt_outbox WHERE topic LIKE '%/weather' ORDER BY revision DESC LIMIT 1",
      )
    ).rows[0];
    await writeTransaction(async (tx) => {
      await enqueueDeviceWeather(tx, "bmo-local", now + 900000, true);
    });
    const after = (
      await db.$client.execute(
        "SELECT revision,payload,state FROM mqtt_outbox WHERE topic LIKE '%/weather' ORDER BY revision DESC LIMIT 1",
      )
    ).rows[0];
    expect(after.revision).toBe(before.revision);
    expect(after.payload).toBe(before.payload);
    expect(after.state).toBe("pending");

    // While pending, force republish preserves the row and does not duplicate
    await writeTransaction(async (tx) => {
      const result = await enqueueDeviceWeather(
        tx,
        "bmo-local",
        now + 950000,
        true,
      );
      expect(result).toBeNull();
    });

    // While failed with backoff, force republish preserves failed backoff
    await db.$client.execute({
      sql: "UPDATE mqtt_outbox SET state='failed', next_attempt_at=? WHERE topic LIKE '%/weather'",
      args: [now + 1200000],
    });
    await writeTransaction(async (tx) => {
      const result = await enqueueDeviceWeather(
        tx,
        "bmo-local",
        now + 960000,
        true,
      );
      expect(result).toBeNull();
    });
    const failedRow = (
      await db.$client.execute(
        "SELECT state, next_attempt_at FROM mqtt_outbox WHERE topic LIKE '%/weather'",
      )
    ).rows[0];
    expect(failedRow.state).toBe("failed");
    expect(Number(failedRow.next_attempt_at)).toBe(now + 1200000);

    // If outbox row was pruned, force republish reconstructs with the original revision
    await db.$client.execute(
      "DELETE FROM mqtt_outbox WHERE topic LIKE '%/weather'",
    );
    await writeTransaction(async (tx) => {
      const result = await enqueueDeviceWeather(
        tx,
        "bmo-local",
        now + 970000,
        true,
      );
      expect(result).not.toBeNull();
    });
    const reconstructed = (
      await db.$client.execute(
        "SELECT revision,payload,state FROM mqtt_outbox WHERE topic LIKE '%/weather' ORDER BY revision DESC LIMIT 1",
      )
    ).rows[0];
    expect(reconstructed.revision).toBe(before.revision);
    expect(reconstructed.payload).toBe(before.payload);
    expect(reconstructed.state).toBe("pending");
  });
});
