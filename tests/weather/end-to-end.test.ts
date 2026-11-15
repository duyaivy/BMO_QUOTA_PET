import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDbForTests } from "@/server/db";
import { saveWeatherLocation } from "@/server/weather/settings";
import { refreshWeather } from "@/server/weather/refresh";
import { drainOutbox } from "@/server/mqtt/drain";
import { MqttClient } from "@/server/mqtt/publisher";
import { MockMqttBroker } from "../fixtures/mqtt-broker";
import { SimulatedDevice } from "../fixtures/device-simulator";

describe("weather durable delivery while device sleeps", () => {
  let directory: string;
  let broker: MockMqttBroker;
  let device: SimulatedDevice;
  let publisher: MqttClient;
  let clock = Date.parse("2026-11-15T00:01:00.000Z");
  beforeEach(async () => {
    clock = Date.parse("2026-11-15T00:01:00.000Z");
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    directory = await mkdtemp(join(tmpdir(), "bmo-weather-e2e-"));
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
    broker = new MockMqttBroker();
    const port = await broker.start();
    device = new SimulatedDevice("bmo-local", port);
    publisher = new MqttClient({ host: "127.0.0.1", port, useTls: false });
    await saveWeatherLocation(
      { expectedRevision: 1, locationId: 12 },
      async () => ({
        provider: "open-meteo",
        id: 12,
        name: "Đà Nẵng",
        admin1: "Đà Nẵng",
        country: "Việt Nam",
        countryCode: "VN",
        latitude: 16.06,
        longitude: 108.22,
        timezone: "Asia/Ho_Chi_Minh",
      }),
    );
  });
  afterEach(async () => {
    await device?.stop();
    await broker?.stop();
    await closeDbForTests();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("receives the latest retained weather after two refreshes offline and DB reconnect", async () => {
    const start = Date.parse("2026-11-15T00:01:00.000Z");
    const update = async (
      nowMs: number,
      sourceTime: string,
      temperatureC: number,
    ) => {
      clock = nowMs;
      const result = await refreshWeather({
        nowMs,
        fetchImpl: async () =>
          Response.json({
            current_units: { temperature_2m: "°C" },
            current: {
              time: sourceTime,
              temperature_2m: temperatureC,
              weather_code: 61,
              is_day: 1,
            },
          }),
      });
      expect(result.status).toBe("updated");
      const drained = await drainOutbox({
        publisher,
        nowMs,
        topicKinds: ["weather"],
      });
      expect(drained.failed).toBe(0);
      expect(drained.published).toBeGreaterThan(0);
    };
    await update(start, "2026-11-15T00:00", 27);
    await device.start();
    await vi.waitFor(() => expect(device.activeWeather?.temperatureC).toBe(27));
    await device.stop();
    const firstRevision = device.activeWeather!.revision;
    await update(start + 900_000, "2026-11-15T00:15", 28);
    await closeDbForTests();
    await update(start + 1_800_000, "2026-11-15T00:30", 29);
    expect(device.activeWeather?.temperatureC).toBe(27);
    await device.start();
    await vi.waitFor(() => expect(device.activeWeather?.temperatureC).toBe(29));
    expect(device.activeWeather!.revision).toBeGreaterThan(firstRevision);
    expect(device.activeWeather!.dataAt).toBe("2026-11-15T00:30:00.000Z");
    expect(device.activeWeather!.validUntil).toBe("2026-11-15T01:30:00.000Z");
  });
});
