import { loadEnvConfig } from "@next/env";
import { closeDbForTests } from "../src/server/db";
import { enrollNative } from "../src/server/ingestion/enroll";
async function main() {
  const explicit = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(BMO_|TURSO_|SESSION_SECRET$|ADMIN_PASSWORD_HASH$)/.test(key),
    ),
  );
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  Object.assign(process.env, explicit);
  const [collectorId, keyId, providerId] = process.argv.slice(2);
  if (!collectorId || !keyId || !providerId) {
    console.error(
      "Usage: BMO_ALLOW_NATIVE_SETUP=true pnpm collector:enroll <collectorId> <keyId> <providerId>",
    );
    process.exitCode = 1;
    return;
  }
  const generation = await enrollNative({
    collectorId,
    keyId,
    providerId: providerId as "codex" | "claude" | "antigravity",
    name: "Local native collector",
  });
  console.log(
    JSON.stringify({
      collectorId,
      keyId,
      providerId,
      ownershipGeneration: generation,
      synthetic: false,
      verification: "unverified",
    }),
  );
}
void main()
  .catch((error: unknown) => {
    console.error(
      "Native enrollment failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  })
  .finally(() => closeDbForTests());
