import "server-only";
import { safeId } from "@/contracts/usage";

export function weatherEnabled(): boolean {
  return process.env.BMO_WEATHER_ENABLED === "true";
}
export function weatherDeviceIds(): string[] {
  const raw = process.env.BMO_WEATHER_DEVICE_IDS ?? "[]";
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Invalid BMO_WEATHER_DEVICE_IDS");
  }
  if (
    !Array.isArray(value) ||
    value.some((x) => !safeId.safeParse(x).success) ||
    new Set(value).size !== value.length
  )
    throw new Error("Invalid BMO_WEATHER_DEVICE_IDS");
  return value as string[];
}
