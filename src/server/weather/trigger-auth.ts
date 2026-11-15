import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
export type WeatherTriggerAuth =
  "authorized" | "unauthorized" | "misconfigured";
export function verifyWeatherTrigger(request: Request): WeatherTriggerAuth {
  const digest = process.env.BMO_WEATHER_TRIGGER_TOKEN_SHA256;
  if (!digest || !/^[0-9a-fA-F]{64}$/.test(digest)) return "misconfigured";
  const suppliedHeader = request.headers.get("authorization");
  const params = new URL(request.url).searchParams;
  const suppliedQuery = params.getAll("token");
  if (suppliedQuery.length > 1 || (suppliedHeader && suppliedQuery.length))
    return "unauthorized";
  const match = suppliedHeader?.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  if (suppliedHeader && !match) return "unauthorized";
  const token = match?.[1] ?? suppliedQuery[0];
  if (!token || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token))
    return "unauthorized";
  const actual = createHash("sha256").update(token, "utf8").digest();
  return timingSafeEqual(actual, Buffer.from(digest, "hex"))
    ? "authorized"
    : "unauthorized";
}
