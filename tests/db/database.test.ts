import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { applyMigrations, closeDbForTests, getDb } from "@/server/db";
import { readSettings, updateSettings } from "@/server/db/settings";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "bmo-db-"));
  vi.stubEnv("TURSO_DATABASE_URL", `file:${join(directory, "test.db")}`);
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv(
    "ADMIN_PASSWORD_HASH",
    "$argon2id$v=19$m=65536,t=3,p=4$c3ludGhldGlj$c3ludGhldGlj",
  );
  vi.stubEnv(
    "SESSION_SECRET",
    "synthetic-database-test-secret-over-32-characters",
  );
  vi.stubEnv("BMO_APP_ORIGIN", "http://127.0.0.1:3000");
});
afterEach(async () => {
  await closeDbForTests();
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it("applies clean and repeated actual migrations, seeds only unverified identities, and retains config across reconnect", async () => {
  let db = await getDb();
  const providers = await db.$client.execute(
    "SELECT provider_id, enabled, verification FROM provider_config ORDER BY provider_id",
  );
  expect(providers.rows).toHaveLength(3);
  for (const provider of providers.rows)
    expect(provider).toMatchObject({ enabled: 0, verification: "unverified" });
  const first = await readSettings();
  expect(first.updatedAt).toBeGreaterThan(1_000_000_000_000);
  await updateSettings({
    expectedRevision: first.revision,
    freshnessThresholdSeconds: 1200,
    historyRetentionDays: 8,
  });
  await closeDbForTests();
  db = await getDb();
  expect(await readSettings()).toMatchObject({
    revision: 2,
    freshnessThresholdSeconds: 1200,
    historyRetentionDays: 8,
  });
  expect(
    (await db.$client.execute("SELECT * FROM bmo_migrations")).rows,
  ).toHaveLength(4);
  await expect(
    updateSettings({
      expectedRevision: 1,
      freshnessThresholdSeconds: 900,
      historyRetentionDays: 7,
    }),
  ).rejects.toThrow("revision conflict");
});
it("enforces database singleton and throttle uniqueness constraints", async () => {
  const { $client: client } = await getDb();
  await expect(
    client.execute("INSERT INTO app_settings VALUES(2,1,900,7,0)"),
  ).rejects.toThrow();
  await client.execute(
    "INSERT INTO rate_limits(scope,subject_hash,window_start,attempts,expires_at) VALUES('test','test',0,1,1)",
  );
  await expect(
    client.execute(
      "INSERT INTO rate_limits(scope,subject_hash,window_start,attempts,expires_at) VALUES('test','test',0,1,1)",
    ),
  ).rejects.toThrow();
  await expect(
    client.execute("UPDATE provider_config SET verification='invented'"),
  ).rejects.toThrow();
});
it("detects changed migrations and does not silently reseed or reset settings", async () => {
  const { $client: client } = await getDb();
  await client.execute("UPDATE bmo_migrations SET checksum='changed'");
  await expect(applyMigrations(client)).rejects.toThrow("checksum mismatch");
  expect((await readSettings()).revision).toBe(1);
});
it("rolls failed migration transactions back and recovers from initialization failure", async () => {
  const client = createClient({ url: `file:${join(directory, "broken.db")}` });
  await client.execute("CREATE TABLE app_settings (unrelated TEXT)");
  await expect(applyMigrations(client)).rejects.toThrow();
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='provider_config'",
  );
  expect(tables.rows).toHaveLength(0);
  client.close();
  vi.stubEnv("SESSION_SECRET", "short");
  await expect(getDb()).rejects.toThrow();
  vi.stubEnv(
    "SESSION_SECRET",
    "synthetic-database-test-secret-over-32-characters",
  );
  expect((await readSettings()).revision).toBe(1);
});
