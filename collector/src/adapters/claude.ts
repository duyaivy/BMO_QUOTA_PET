import { z } from "zod";
import type { ParsedQuota } from "./parse.js";

const maximumBytes = 32 * 1024;
const windows = ["five_hour", "seven_day"] as const;

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function resetAt(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  const milliseconds = value * 1000;
  return Number.isSafeInteger(milliseconds) &&
    Number.isFinite(new Date(milliseconds).getTime())
    ? new Date(milliseconds).toISOString()
    : null;
}

const unavailable = (): ParsedQuota => ({
  status: "unavailable",
  errorCode: "SOURCE_UNAVAILABLE",
  windows: [],
  observedAt: null,
});

const malformed = (): ParsedQuota => ({
  status: "error",
  errorCode: "MALFORMED_QUOTA",
  windows: [],
  observedAt: null,
});

/** Parse only the documented Claude statusline rate-limit fields. */
export function parseClaude(raw: string): ParsedQuota {
  if (Buffer.byteLength(raw, "utf8") > maximumBytes) return malformed();
  let root: Record<string, unknown> | null;
  try {
    root = record(JSON.parse(raw));
  } catch {
    return malformed();
  }
  if (!root) return malformed();
  if (root.rate_limits === undefined || root.rate_limits === null)
    return unavailable();
  const limits = record(root.rate_limits);
  if (!limits) return malformed();

  const output: ParsedQuota["windows"] = [];
  for (const id of windows) {
    const value = limits[id];
    if (value === undefined || value === null) continue;
    const bucket = record(value);
    const percentage = bucket?.used_percentage;
    if (
      !bucket ||
      typeof percentage !== "number" ||
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 100
    )
      return malformed();
    output.push({
      windowId: id,
      label: id === "five_hour" ? "Five hour" : "Seven day",
      duration: id === "five_hour" ? 5 * 60 * 60 : 7 * 24 * 60 * 60,
      used: percentage,
      reset: resetAt(bucket.resets_at),
    });
  }
  if (output.length === 0) return unavailable();
  return { status: "ok", errorCode: null, windows: output, observedAt: null };
}

const quotaSchema = z
  .object({
    status: z.enum(["ok", "unavailable", "unsupported", "error"]),
    errorCode: z.enum(["SOURCE_UNAVAILABLE", "MALFORMED_QUOTA"]).nullable(),
    observedAt: z.null(),
    windows: z
      .array(
        z
          .object({
            windowId: z.enum(windows),
            label: z.enum(["Five hour", "Seven day"]),
            duration: z.number().int().positive().nullable(),
            used: z.number().finite().min(0).max(100).nullable(),
            reset: z.string().datetime().nullable(),
            status: z.enum(["ok", "unavailable"]).optional(),
          })
          .strict(),
      )
      .max(2),
  })
  .strict();

export function sanitizeClaudeQuota(value: ParsedQuota): ParsedQuota {
  const input = {
    status: value.status,
    errorCode: value.errorCode,
    observedAt: null,
    windows: value.windows
      .map((window) => ({
        windowId: window.windowId,
        label: window.windowId === "five_hour" ? "Five hour" : "Seven day",
        duration: window.windowId === "five_hour" ? 18000 : 604800,
        used: window.used,
        reset: window.reset,
        ...(window.status ? { status: window.status } : {}),
      }))
      .sort((a, b) => a.windowId.localeCompare(b.windowId)),
  };
  const parsed = quotaSchema.parse(input);
  if (parsed.status !== "ok" && parsed.windows.length !== 0)
    throw new Error("MALFORMED_QUOTA");
  return parsed as ParsedQuota;
}
