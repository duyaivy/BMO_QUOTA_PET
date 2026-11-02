import "server-only";
import {
  type DeviceMqttSnapshot,
  type SnapshotWindow,
  deviceMqttSnapshotSchema,
  assertMqttPayloadSize,
} from "@/contracts/mqtt";
import { type DeviceScreen } from "@/contracts/dashboard";
import { type ProviderId } from "@/contracts/dashboard";

export interface PersistedWindowPayload {
  windowId: string;
  label: string;
  windowDurationSeconds: number | null;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
  dataStatus: "ok" | "unavailable" | "unsupported" | "error";
  collectedAt: string;
  upstreamObservedAt: string | null;
  freshnessBasis: "upstream_timestamp" | "session_snapshot" | "unknown";
  sourceFreshness: "fresh" | "stale" | "unknown";
}

export interface ProviderStatusInfo {
  providerId: ProviderId;
  enabled: boolean;
  dataStatus: string;
  verification: string;
}

export interface SnapshotProjectionInput {
  deviceId: string;
  revision: number;
  configRevision: number;
  screens: DeviceScreen[];
  currentWindows: Map<string, PersistedWindowPayload>; // key: `${providerId}:${windowId}`
  providers: Map<string, ProviderStatusInfo>;
  freshnessThresholdSeconds?: number;
  nowMs?: number;
}

export function projectDeviceSnapshot(
  input: SnapshotProjectionInput,
): { snapshot: DeviceMqttSnapshot; jsonPayload: string } {
  const nowMs = input.nowMs ?? Date.now();
  const thresholdSeconds = input.freshnessThresholdSeconds ?? 900;
  const nowIso = new Date(nowMs).toISOString();

  const projectedWindows: SnapshotWindow[] = [];
  const windowDeadlines: number[] = [];

  for (const screen of input.screens) {
    if (screen.kind !== "quota") continue;

    const providerId = screen.providerId;
    const windowId = screen.windowId;
    const key = `${providerId}:${windowId}`;
    const persisted = input.currentWindows.get(key);
    const providerInfo = input.providers.get(providerId);

    const isProviderAvailable =
      providerInfo?.enabled &&
      providerInfo.verification !== "unsupported" &&
      providerInfo.dataStatus !== "unsupported";

    if (!isProviderAvailable || !persisted) {
      // Window is unavailable
      const fallbackCollectedAt = persisted?.collectedAt ?? nowIso;
      const validityMs = nowMs + thresholdSeconds * 1000;
      windowDeadlines.push(validityMs);

      projectedWindows.push({
        providerId,
        windowId,
        label: persisted?.label ?? windowId,
        windowDurationSeconds: persisted?.windowDurationSeconds ?? null,
        usedPercent: null,
        remainingPercent: null,
        resetAt: persisted?.resetAt ?? null,
        dataStatus: "unavailable",
        collectedAt: fallbackCollectedAt,
        upstreamObservedAt: null,
        freshnessBasis: "unknown",
        sourceFreshness: "unknown",
        validUntil: new Date(validityMs).toISOString(),
      });
      continue;
    }

    // Compute per-window validity
    let freshnessDeadlineMs: number;
    if (
      persisted.freshnessBasis === "upstream_timestamp" &&
      persisted.upstreamObservedAt
    ) {
      freshnessDeadlineMs =
        Date.parse(persisted.upstreamObservedAt) + thresholdSeconds * 1000;
    } else {
      freshnessDeadlineMs =
        Date.parse(persisted.collectedAt) + thresholdSeconds * 1000;
    }

    let windowDeadlineMs = freshnessDeadlineMs;
    if (persisted.resetAt) {
      const resetMs = Date.parse(persisted.resetAt);
      if (!Number.isNaN(resetMs)) {
        windowDeadlineMs = Math.min(windowDeadlineMs, resetMs);
      }
    }

    windowDeadlines.push(windowDeadlineMs);

    // Recompute sourceFreshness based on current time
    const isStale = nowMs > freshnessDeadlineMs;
    const sourceFreshness = isStale
      ? "stale"
      : persisted.freshnessBasis === "unknown"
      ? "unknown"
      : persisted.sourceFreshness;

    // Check if reset has passed; if so, dataStatus becomes unavailable and percentages null
    const hasResetPassed =
      persisted.resetAt !== null &&
      !Number.isNaN(Date.parse(persisted.resetAt)) &&
      nowMs >= Date.parse(persisted.resetAt);

    const effectiveStatus = hasResetPassed
      ? "unavailable"
      : persisted.dataStatus;
    const usedPercent = hasResetPassed ? null : persisted.usedPercent;
    const remainingPercent = hasResetPassed
      ? null
      : persisted.remainingPercent;

    projectedWindows.push({
      providerId,
      windowId: persisted.windowId,
      label: persisted.label,
      windowDurationSeconds: persisted.windowDurationSeconds,
      usedPercent,
      remainingPercent,
      resetAt: persisted.resetAt,
      dataStatus: effectiveStatus,
      collectedAt: persisted.collectedAt,
      upstreamObservedAt: persisted.upstreamObservedAt,
      freshnessBasis: persisted.freshnessBasis,
      sourceFreshness,
      validUntil: new Date(windowDeadlineMs).toISOString(),
    });
  }

  const overallDeadlineMs =
    windowDeadlines.length > 0
      ? Math.min(...windowDeadlines)
      : nowMs + thresholdSeconds * 1000;

  const snapshot: DeviceMqttSnapshot = {
    schemaVersion: 1,
    deviceId: input.deviceId,
    revision: input.revision,
    configRevision: input.configRevision,
    generatedAt: nowIso,
    validUntil: new Date(overallDeadlineMs).toISOString(),
    windows: projectedWindows,
  };

  // Validate strict contract schema
  const parsed = deviceMqttSnapshotSchema.parse(snapshot);
  const jsonPayload = JSON.stringify(parsed);
  assertMqttPayloadSize(jsonPayload);

  return { snapshot: parsed, jsonPayload };
}
