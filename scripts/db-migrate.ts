import { loadEnvConfig } from "@next/env";
import { closeDbForTests, getDb } from "../src/server/db";
async function main() {
  const explicit = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(BMO_|TURSO_|SESSION_SECRET$|ADMIN_PASSWORD_HASH$)/.test(key),
    ),
  );
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  Object.assign(process.env, explicit);
  try {
    await getDb();
    console.log("Database migrations applied");
  } catch {
    console.error(
      "Database migration failed; check local configuration and database availability",
    );
    process.exitCode = 1;
  } finally {
    await closeDbForTests();
  }
}
void main().catch(() => {
  console.error("Local setup failed");
  process.exitCode = 1;
});
