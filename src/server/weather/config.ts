import "server-only";
import { safeId } from "@/contracts/usage";

export function weatherEnabled(): boolean {
  return process.env.BMO_WEATHER_ENABLED === "true";
}
export function weatherDeviceIds(): string[] {
  const raw = (process.env.BMO_WEATHER_DEVICE_IDS ?? "[]").trim();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        value = JSON.parse(raw.replace(/'/g, '"'));
      } catch {}
    }
    if (!value && raw.length > 0 && !raw.startsWith("{")) {
      value = raw
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    }
    if (!value) {
      throw new Error("Invalid BMO_WEATHER_DEVICE_IDS");
    }
  }
  if (
    !Array.isArray(value) ||
    value.some((x) => !safeId.safeParse(x).success) ||
    new Set(value).size !== value.length
  )
    throw new Error("Invalid BMO_WEATHER_DEVICE_IDS");
  return value as string[];
}
