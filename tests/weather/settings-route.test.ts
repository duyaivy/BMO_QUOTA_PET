import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDbForTests } from "@/server/db";
import { admitWeatherLookup } from "@/server/weather/rate-limit";
describe("weather location request budget", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "bmo-weather-limit-"));
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
  it("allows 30 shared search/resolve uses per session per minute", async () => {
    for (let i = 0; i < 30; i++) await admitWeatherLookup("session-a", 60000);
    await expect(admitWeatherLookup("session-a", 60000)).rejects.toMatchObject({
      status: 429,
    });
    await expect(
      admitWeatherLookup("session-b", 60000),
    ).resolves.toBeUndefined();
    await expect(
      admitWeatherLookup("session-a", 120000),
    ).resolves.toBeUndefined();
  });
});
