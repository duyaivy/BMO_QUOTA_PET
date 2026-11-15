import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDbForTests, getDb } from "@/server/db";
import { saveWeatherLocation } from "@/server/weather/settings";
import { refreshWeather, runWeatherJob } from "@/server/weather/refresh";
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
function provider(time = "2026-11-15T00:00", temperature = 28) {
  return async () =>
    Response.json({
      current_units: { temperature_2m: "°C" },
      current: {
        time,
        temperature_2m: temperature,
        weather_code: 0,
        is_day: 1,
      },
    });
}
describe("durable weather refresh", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "bmo-weather-refresh-"));
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
    await saveWeatherLocation(
      { expectedRevision: 1, locationId: 12 },
      async () => location,
    );
  });
  afterEach(async () => {
    await closeDbForTests();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  it("gates duplicate calls for 900 seconds and preserves source age", async () => {
    const start = Date.parse("2026-11-15T00:01:00.000Z");
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls++;
      return provider()();
    };
    const first = await refreshWeather({ nowMs: start, fetchImpl });
    expect(first.status).toBe("updated");
    const duplicate = await refreshWeather({
      nowMs: start + 899999,
      fetchImpl,
    });
    expect(duplicate.status).toBe("not_due");
    expect(duplicate.lastJobAt).toBe(first.lastJobAt);
    expect(duplicate.dataAt).toBe(first.dataAt);
    expect(calls).toBe(1);
    expect(
      (await refreshWeather({ nowMs: start + 900000, fetchImpl })).status,
    ).toBe("unchanged");
    expect(calls).toBe(2);
    const rows = (
      await (
        await getDb()
      ).$client.execute("SELECT data_at FROM weather_cache WHERE id=1")
    ).rows;
    expect(Number(rows[0].data_at)).toBe(
      Date.parse("2026-11-15T00:00:00.000Z"),
    );
  });
  it("keeps good data on provider failure and discards a previous location fetch", async () => {
    const start = Date.parse("2026-11-15T00:01:00.000Z");
    await refreshWeather({ nowMs: start, fetchImpl: provider() });
    const failed = await refreshWeather({
      nowMs: start + 900000,
      fetchImpl: async () => new Response("upstream", { status: 503 }),
    });
    expect(failed.status).toBe("failed");
    const before = (
      await (
        await getDb()
      ).$client.execute("SELECT observation_json FROM weather_cache WHERE id=1")
    ).rows[0].observation_json;
    expect(before).toContain("28");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = refreshWeather({
      nowMs: start + 1800000,
      fetchImpl: async () => {
        await gate;
        return provider()();
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await saveWeatherLocation(
      { expectedRevision: 2, locationId: 13 },
      async () => ({ ...location, id: 13, name: "Hue" }),
    );
    release();
    await pending;
    expect(
      (
        await (
          await getDb()
        ).$client.execute(
          "SELECT observation_json FROM weather_cache WHERE id=1",
        )
      ).rows[0].observation_json,
    ).toBeNull();
  });
  it("reports failed delivery when broker config is missing with durable pending weather", async () => {
    const db = await getDb();
    await db.$client.execute({
      sql: "UPDATE weather_cache SET next_attempt_at=? WHERE id=1",
      args: [Date.now() + 900000],
    });
    vi.stubEnv("MQTT_HOST", "");
    const result = await runWeatherJob({ deadlineMs: Date.now() + 25000 });
    expect(result.status).toBe("failed");
  });
});
