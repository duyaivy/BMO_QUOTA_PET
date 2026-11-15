import "server-only";
import { safeId } from "@/contracts/usage";

export function weatherEnabled(): boolean {
  return process.env.BMO_WEATHER_ENABLED === "true";
}

export function weatherDeviceIds(): string[] {
  const raw = process.env.BMO_WEATHER_DEVICE_IDS;
  if (!raw) return [];
  let trimmed = String(raw).trim();
  if (trimmed.startsWith("BMO_WEATHER_DEVICE_IDS=")) {
    trimmed = trimmed.slice("BMO_WEATHER_DEVICE_IDS=".length).trim();
  }
  let list: string[] = [];
  try {
    let val: unknown = JSON.parse(trimmed);
    if (typeof val === "string") {
      try {
        val = JSON.parse(val);
      } catch {}
    }
    if (Array.isArray(val)) {
      list = val
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {}

  if (list.length === 0 && trimmed.length > 0 && trimmed !== "[]") {
    const matches = trimmed.match(/[A-Za-z0-9][A-Za-z0-9_.:-]*/g);
    if (matches) {
      list = matches.filter((m) => m !== "BMO_WEATHER_DEVICE_IDS");
    }
  }

  const unique = Array.from(new Set(list));
  if (unique.some((x) => !safeId.safeParse(x).success)) {
    throw new Error("Invalid BMO_WEATHER_DEVICE_IDS");
  }
  return unique;
}
