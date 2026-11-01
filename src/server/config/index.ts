import "server-only";
import { z } from "zod";

const envSchema = z.object({
  BMO_APP_ORIGIN: z.url().default("http://127.0.0.1:3000"),
  TURSO_DATABASE_URL: z.string().min(1).default("file:./.data/bmo.db"),
  TURSO_AUTH_TOKEN: z.string().optional(),
  ADMIN_PASSWORD_HASH: z.string().refine((hash) => {
    const parts = hash.split("$");
    if (parts.length !== 6 || parts[1] !== "argon2id" || parts[2] !== "v=19")
      return false;
    const parameters = parts[3].split(",").sort();
    return (
      parameters.length === 3 &&
      /^m=[1-9][0-9]*$/.test(parameters[0]) &&
      /^p=[1-9][0-9]*$/.test(parameters[1]) &&
      /^t=[1-9][0-9]*$/.test(parameters[2]) &&
      parts.slice(4).every((part) => /^[A-Za-z0-9+/]+$/.test(part))
    );
  }, "Expected an Argon2id encoded hash"),
  SESSION_SECRET: z.string().min(32),
});
export type RuntimeConfig = z.infer<typeof envSchema>;
export function getRuntimeConfig(): RuntimeConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("; ");
    throw new Error(`BMO runtime configuration is invalid (${issues})`);
  }
  const origin = new URL(result.data.BMO_APP_ORIGIN);
  if (
    origin.origin !== result.data.BMO_APP_ORIGIN ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
      ))
  )
    throw new Error("BMO origin must be HTTPS or explicit loopback HTTP");
  const databaseUrl = result.data.TURSO_DATABASE_URL;
  if (
    !databaseUrl.startsWith("file:") &&
    !databaseUrl.startsWith("libsql://") &&
    !databaseUrl.startsWith("https://")
  )
    throw new Error("Unsupported database transport");
  if (
    databaseUrl.startsWith("file:") &&
    process.env.NODE_ENV === "production" &&
    process.env.BMO_ALLOW_LOCAL_DATABASE !== "true"
  )
    throw new Error("Local database mode is disabled in production");
  return result.data;
}
