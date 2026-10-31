import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
export default defineConfig({
  dialect: "turso",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:./.data/bmo.db",
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  },
});
