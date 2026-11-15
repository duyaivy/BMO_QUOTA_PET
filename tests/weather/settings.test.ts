import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDbForTests } from "@/server/db";
import {
  readWeatherSettings,
  saveWeatherLocation,
} from "@/server/weather/settings";

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
describe("durable weather settings", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "bmo-weather-settings-"));
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
  });
  afterEach(async () => {
    await closeDbForTests();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  it("persists location across DB reconnect and checks stale revision", async () => {
    expect(await readWeatherSettings()).toMatchObject({
      revision: 1,
      location: null,
      status: "unconfigured",
    });
    const saved = await saveWeatherLocation(
      { expectedRevision: 1, locationId: 12 },
      async () => location,
    );
    expect(saved).toMatchObject({
      changed: true,
      settings: { revision: 2, status: "pending", location: { id: 12 } },
    });
    await closeDbForTests();
    expect(await readWeatherSettings()).toMatchObject({
      revision: 2,
      location: { id: 12 },
    });
    await expect(
      saveWeatherLocation(
        { expectedRevision: 1, locationId: 12 },
        async () => location,
      ),
    ).rejects.toThrow();
    expect(
      await saveWeatherLocation(
        { expectedRevision: 2, locationId: 12 },
        async () => location,
      ),
    ).toMatchObject({ changed: false, settings: { revision: 2 } });
  });
  it("does not alter saved location if resolve fails", async () => {
    await expect(
      saveWeatherLocation({ expectedRevision: 1, locationId: 12 }, async () => {
        throw new Error("upstream");
      }),
    ).rejects.toThrow();
    expect((await readWeatherSettings()).location).toBeNull();
  });
});
