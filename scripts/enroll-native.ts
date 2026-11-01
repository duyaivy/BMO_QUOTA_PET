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
  .catch(() => {
    console.error(
      "Native enrollment failed; requires explicit local setup and separate collector identity",
    );
    process.exitCode = 1;
  })
  .finally(() => closeDbForTests());
