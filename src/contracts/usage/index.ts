import { z } from "zod";

export const providerIds = ["codex", "claude", "antigravity"] as const;
export const sources = {
  codex: "codex-session-jsonl",
  claude: "claude-statusline",
  antigravity: "antigravity-statusline",
} as const;
export const safeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const timestamp = z.iso.datetime();
const status = z.enum(["ok", "unavailable", "unsupported", "error"]);
const basis = z.enum(["upstream_timestamp", "session_snapshot", "unknown"]);
const freshness = z.enum(["fresh", "stale", "unknown"]);
const evidence = {
  collectedAt: timestamp,
  upstreamObservedAt: timestamp.nullable(),
  freshnessBasis: basis,
  sourceFreshness: freshness,
};
function evidenceValid(value: {
  upstreamObservedAt: string | null;
  freshnessBasis: string;
  sourceFreshness: string;
  collectedAt: string;
}) {
  return (
    (value.freshnessBasis === "upstream_timestamp") ===
      (value.upstreamObservedAt !== null) &&
    !(
      value.freshnessBasis !== "upstream_timestamp" &&
      value.sourceFreshness === "fresh"
    ) &&
    (!value.upstreamObservedAt ||
      Date.parse(value.upstreamObservedAt) <=
        Date.parse(value.collectedAt) + 300000)
  );
}
export const windowSchema = z
  .object({
    windowId: safeId,
    label: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[^\x00-\x1f\x7f]+$/),
    windowDurationSeconds: z.number().int().positive().safe().nullable(),
    usedPercent: z.number().min(0).max(100).nullable(),
    remainingPercent: z.number().min(0).max(100).nullable(),
    resetAt: timestamp.nullable(),
    dataStatus: status,
    ...evidence,
  })
  .strict()
  .refine(evidenceValid, "Invalid source evidence")
  .refine(
    (window) =>
      window.usedPercent === null ||
      window.remainingPercent === null ||
      Math.abs(window.usedPercent + window.remainingPercent - 100) <=
        0.01000001,
    "Percentages must complement",
  )
  .refine(
    (window) =>
      window.dataStatus === "ok" ||
      (window.usedPercent === null && window.remainingPercent === null),
    "Unavailable percentages must be null",
  );
const common = {
  schemaVersion: z.literal(1),
  collectorId: safeId,
  eventId: z.uuid(),
  providerId: z.enum(providerIds),
  sourceType: z.enum([
    "codex-session-jsonl",
    "claude-statusline",
    "antigravity-statusline",
  ]),
  sourceVersion: z.string().min(1).max(80).nullable(),
  ownershipGeneration: z.number().int().positive().safe(),
  sequence: z.number().int().positive().safe(),
  sourceAvailability: z.enum([
    "available",
    "inactive",
    "unavailable",
    "unsupported",
    "error",
  ]),
  dataStatus: status,
  errorCode: z
    .enum([
      "SOURCE_INACTIVE",
      "SOURCE_UNAVAILABLE",
      "SCHEMA_UNSUPPORTED",
      "MALFORMED_QUOTA",
      "AUTH_REQUIRED",
      "POLICY_BLOCKED",
    ])
    .nullable(),
  ...evidence,
};
export const eventSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...common,
        kind: z.literal("observation"),
        snapshotMode: z.enum(["complete", "partial"]),
        windows: z.array(windowSchema).max(64),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal("heartbeat"),
        lastSourceEventAt: timestamp.nullable(),
      })
      .strict(),
  ])
  .superRefine((event, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (sources[event.providerId] !== event.sourceType)
      invalid("Provider/source mismatch");
    if (!evidenceValid(event)) invalid("Invalid source evidence");
    if (event.kind === "heartbeat") {
      if (
        event.upstreamObservedAt !== null ||
        event.freshnessBasis !== "unknown" ||
        event.sourceFreshness !== "unknown"
      )
        invalid("Heartbeat cannot assert quota evidence");
      if (
        event.lastSourceEventAt &&
        Date.parse(event.lastSourceEventAt) > Date.parse(event.collectedAt)
      )
        invalid("Invalid heartbeat chronology");
    } else {
      if (
        new Set(event.windows.map((window) => window.windowId)).size !==
        event.windows.length
      )
        invalid("Duplicate window IDs");
      if (event.dataStatus !== "ok" && event.windows.length)
        invalid("Unavailable events cannot replace windows");
      for (const window of event.windows)
        if (Date.parse(window.collectedAt) > Date.parse(event.collectedAt))
          invalid("Window capture is after event capture");
    }
  });
export type UsageEvent = z.infer<typeof eventSchema>;
export type QuotaWindow = z.infer<typeof windowSchema>;
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            canonicalJson((value as Record<string, unknown>)[key]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function semanticInput(event: UsageEvent): string {
  const windowValue = (window: QuotaWindow) => {
    const { collectedAt: _capture, ...rest } = window;
    void _capture;
    return rest;
  };
  const {
    eventId: _id,
    sequence: _seq,
    collectedAt: _capture,
    ...rest
  } = event;
  void _id;
  void _seq;
  void _capture;
  return canonicalJson({
    semanticVersion: 1,
    ...rest,
    ...(event.kind === "observation"
      ? {
          windows: [...event.windows]
            .sort((a, b) =>
              a.windowId < b.windowId ? -1 : a.windowId > b.windowId ? 1 : 0,
            )
            .map(windowValue),
        }
      : {}),
  });
}
export function signingInput(values: {
  keyId: string;
  collectorId: string;
  timestamp: string;
  nonce: string;
  eventId: string;
  bodyHash: string;
}) {
  return [
    "BMO-INGEST-V1",
    "POST",
    "/api/internal/usage/ingest",
    values.keyId,
    values.collectorId,
    values.timestamp,
    values.nonce,
    values.eventId,
    values.bodyHash,
  ].join("\n");
}
export function effectiveWindow(
  window: QuotaWindow,
  now: number,
  thresholdSeconds = 900,
) {
  const captured = Date.parse(window.collectedAt);
  const observed = window.upstreamObservedAt
    ? Date.parse(window.upstreamObservedAt)
    : null;
  const resetExpired =
    window.resetAt !== null && Date.parse(window.resetAt) <= now;
  const stale =
    now - (observed ?? captured) > thresholdSeconds * 1000 ||
    window.sourceFreshness === "stale";
  return {
    ...window,
    effectiveStatus: resetExpired
      ? ("unavailable" as const)
      : window.dataStatus,
    effectiveFreshness: stale
      ? ("stale" as const)
      : observed === null
        ? ("unknown" as const)
        : ("fresh" as const),
    resetExpired,
  };
}
