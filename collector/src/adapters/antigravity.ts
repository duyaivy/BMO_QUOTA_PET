import { z } from "zod";
import type { ParsedQuota } from "./parse.js";
const object = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const absolute = z.iso.datetime({ offset: true });
const empty = (malformed = false): ParsedQuota => ({
  status: malformed ? "error" : "unavailable",
  errorCode: malformed ? "MALFORMED_QUOTA" : "SOURCE_UNAVAILABLE",
  windows: [],
  observedAt: null,
});
function reset(value: unknown) {
  if (!absolute.safeParse(value).success || typeof value !== "string")
    return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
/** Candidate documented AGY shape; live meter semantics remain unverified. */
export function parseAntigravity(raw: string): ParsedQuota {
  if (Buffer.byteLength(raw) > 32768) return empty(true);
  let root: Record<string, unknown> | null;
  try {
    root = object(JSON.parse(raw));
  } catch {
    return empty(true);
  }
  if (!root) return empty(true);
  if (root.quota === undefined || root.quota === null) return empty();
  const quota = object(root.quota);
  if (!quota || Object.keys(quota).length > 64) return empty(true);
  const windows: ParsedQuota["windows"] = [];
  for (const [id, value] of Object.entries(quota)) {
    const bucket = object(value);
    if (
      !idSchema.safeParse(id).success ||
      !bucket ||
      (bucket.disabled !== undefined && typeof bucket.disabled !== "boolean")
    )
      return empty(true);
    if (bucket.disabled === true) {
      windows.push({
        windowId: id,
        label: id,
        duration: null,
        used: null,
        reset: null,
        status: "unavailable",
      });
      continue;
    }
    let used: number | null = null;
    if (bucket.remaining_fraction !== undefined) {
      const fraction = bucket.remaining_fraction;
      if (
        typeof fraction !== "number" ||
        !Number.isFinite(fraction) ||
        fraction < 0 ||
        fraction > 1
      )
        return empty(true);
      used = 100 * (1 - fraction);
    } else if (
      typeof bucket.remaining_amount !== "number" ||
      !Number.isFinite(bucket.remaining_amount) ||
      bucket.remaining_amount < 0
    )
      return empty(true);
    // A callback's wall time and a relative countdown are not a trusted
    // provider reference instant or a quota-window duration.
    windows.push({
      windowId: id,
      label: id,
      duration: null,
      used,
      reset: reset(bucket.reset_time),
    });
  }
  return windows.length
    ? { status: "ok", errorCode: null, windows, observedAt: null }
    : empty();
}
const sanitizedSchema = z
  .object({
    status: z.enum(["ok", "unavailable", "unsupported", "error"]),
    errorCode: z.enum(["SOURCE_UNAVAILABLE", "MALFORMED_QUOTA"]).nullable(),
    observedAt: z.null(),
    windows: z
      .array(
        z
          .object({
            windowId: idSchema,
            label: idSchema,
            duration: z.null(),
            used: z.number().finite().min(0).max(100).nullable(),
            reset: z.iso.datetime().nullable(),
            status: z.enum(["ok", "unavailable"]).optional(),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();
export function sanitizeAntigravityQuota(value: ParsedQuota): ParsedQuota {
  const safe = sanitizedSchema.parse({
    status: value.status,
    errorCode: value.errorCode,
    observedAt: null,
    windows: value.windows
      .map((w) => ({
        windowId: w.windowId,
        label: w.windowId,
        duration: null,
        used: w.status === "unavailable" ? null : w.used,
        reset: w.status === "unavailable" ? null : w.reset,
        ...(w.status ? { status: w.status } : {}),
      }))
      .sort((a, b) => a.windowId.localeCompare(b.windowId)),
  });
  if (
    (safe.status !== "ok" && safe.windows.length) ||
    new Set(safe.windows.map((w) => w.windowId)).size !== safe.windows.length
  )
    throw new Error("MALFORMED_QUOTA");
  return safe;
}
