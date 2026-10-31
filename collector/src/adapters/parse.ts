import type { ProviderId } from "../types.js";
export type ParsedQuota = {
  status: "ok" | "unavailable" | "unsupported" | "error";
  errorCode: string | null;
  windows: Array<{
    status?: "ok" | "unavailable";
    windowId: string;
    label: string;
    duration: number | null;
    used: number | null;
    reset: string | null;
  }>;
  observedAt: string | null;
};
const empty = (
  status: ParsedQuota["status"],
  errorCode: string,
): ParsedQuota => ({ status, errorCode, windows: [], observedAt: null });
const obj = (x: unknown): Record<string, unknown> | null =>
  x !== null && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : null;
const iso = (n: unknown) => {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const ms = n * 1000;
  return Number.isSafeInteger(ms) && Number.isFinite(new Date(ms).getTime())
    ? new Date(ms).toISOString()
    : null;
};
const observed = (v: unknown) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v))
    ? new Date(v).toISOString()
    : null;
const numeric = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
const duration = (v: unknown) =>
  typeof v === "number" &&
  Number.isSafeInteger(v) &&
  v > 0 &&
  Number.isSafeInteger(v * 60)
    ? v * 60
    : null;
export function parseFixture(provider: ProviderId, raw: string): ParsedQuota {
  if (Buffer.byteLength(raw, "utf8") > 32768)
    return empty("error", "MALFORMED_QUOTA");
  let root: Record<string, unknown> | null;
  try {
    root = obj(JSON.parse(raw));
  } catch {
    return empty("error", "MALFORMED_QUOTA");
  }
  if (!root) return empty("error", "MALFORMED_QUOTA");
  const versions = {
    codex: "codex-v1",
    claude: "claude-v1",
    antigravity: "antigravity-v1",
  };
  if (root.fixtureSchema !== versions[provider])
    return empty("unsupported", "SCHEMA_UNSUPPORTED");
  const windows: ParsedQuota["windows"] = [];
  let bad = false;
  if (provider === "codex") {
    const payload = obj(root.payload),
      limits =
        obj(obj(payload?.rate_limits)?.rate_limits) ??
        obj(payload?.rate_limits);
    if (root.type !== "event_msg" || payload?.type !== "token_count")
      return empty("error", "MALFORMED_QUOTA");
    if (payload.rate_limits === undefined)
      return empty("unavailable", "SOURCE_UNAVAILABLE");
    if (!limits) return empty("error", "MALFORMED_QUOTA");
    for (const [id, val] of Object.entries(limits)) {
      const w = obj(val);
      if (!w) {
        bad = true;
        continue;
      }
      const used = numeric(w.used_percent);
      if (used === null) {
        bad = true;
        continue;
      }
      windows.push({
        windowId: id,
        label: id,
        duration: duration(w.window_minutes),
        used,
        reset: iso(w.resets_at),
      });
    }
  } else if (provider === "claude") {
    if (root.rate_limits === undefined)
      return empty("unavailable", "SOURCE_UNAVAILABLE");
    const limits = obj(root.rate_limits);
    if (!limits) return empty("error", "MALFORMED_QUOTA");
    for (const [id, val] of Object.entries(limits)) {
      const w = obj(val);
      const used = numeric(w?.used_percentage);
      if (used === null) {
        bad = true;
        continue;
      }
      windows.push({
        windowId: id,
        label: id,
        duration: null,
        used,
        reset: iso(w?.resets_at),
      });
    }
  } else {
    if (root.quota === undefined)
      return empty("unavailable", "SOURCE_UNAVAILABLE");
    const quota = obj(root.quota);
    if (!quota) return empty("error", "MALFORMED_QUOTA");
    for (const [id, val] of Object.entries(quota)) {
      const w = obj(val);
      if (!w) {
        bad = true;
        continue;
      }
      if (w.disabled === true) {
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
      if (
        typeof w.remaining_fraction === "number" &&
        Number.isFinite(w.remaining_fraction) &&
        w.remaining_fraction >= 0 &&
        w.remaining_fraction <= 1
      )
        used = 100 * (1 - w.remaining_fraction);
      if (used === null) {
        if (
          typeof w.remaining_amount !== "number" ||
          !Number.isFinite(w.remaining_amount) ||
          w.remaining_amount < 0
        ) {
          bad = true;
          continue;
        }
      }
      const reset = observed(w.reset_time);
      if (
        !reset &&
        typeof w.reset_in_seconds === "number" &&
        Number.isFinite(w.reset_in_seconds) &&
        w.reset_in_seconds >= 0
      ) {
        /* Relative reset has no trusted reference instant. */
      }
      windows.push({ windowId: id, label: id, duration: null, used, reset });
    }
  }
  if (!windows.length)
    return bad
      ? empty("error", "MALFORMED_QUOTA")
      : empty("unavailable", "SOURCE_UNAVAILABLE");
  return {
    status: "ok",
    errorCode: null,
    windows,
    observedAt: observed(root.quota_observed_at),
  };
}
