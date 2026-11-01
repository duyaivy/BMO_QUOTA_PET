import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import argon2 from "argon2";
async function main() {
  // Disposable synthetic owner and database. Never uses the local .env credentials.

  const port = Number(process.env.BMO_BROWSER_PORT ?? 3100);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("INVALID_TEST_PORT");
  const directory = await mkdtemp(join(tmpdir(), "bmo-browser-"));
  const env = {
    ...process.env,
    BMO_APP_ORIGIN: `http://127.0.0.1:${port}`,
    TURSO_DATABASE_URL: `file:${join(directory, "test.db")}`,
    TURSO_AUTH_TOKEN: "",
    BMO_ALLOW_LOCAL_DATABASE: "true",
    BMO_ALLOW_FIXTURE_SETUP: "true",
    BMO_INGEST_KEYS_JSON: JSON.stringify({ "fixture-key": "b".repeat(64) }),
    ADMIN_PASSWORD_HASH: await argon2.hash("local-browser-fixture-password", {
      type: argon2.argon2id,
    }),
    SESSION_SECRET: randomBytes(48).toString("hex"),
  };
  const migration = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/db-migrate.ts"],
    { env, stdio: "inherit" },
  );
  if (migration.status !== 0) {
    await rm(directory, { recursive: true, force: true });
    process.exit(migration.status ?? 1);
  }
  for (const provider of ["codex", "claude", "antigravity"]) {
    const setup = spawnSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "scripts/enroll-fixture.ts",
        "fixture-collector",
        "fixture-key",
        provider,
      ],
      { env, stdio: "inherit" },
    );
    if (setup.status !== 0) {
      await rm(directory, { recursive: true, force: true });
      process.exit(setup.status ?? 1);
    }
  }
  env.BMO_ALLOW_FIXTURE_SETUP = "false";
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/serve.ts", "--port", String(port)],
    { env, stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => child.kill(signal));
  child.on("exit", async (code) => {
    await rm(directory, { recursive: true, force: true });
    process.exit(code ?? 0);
  });
}
void main().catch(() => {
  console.error("Local setup failed");
  process.exitCode = 1;
});
