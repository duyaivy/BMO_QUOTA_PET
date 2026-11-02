import { describe, expect, it } from "vitest";
import {
  projectDeviceSnapshot,
  type PersistedWindowPayload,
  type ProviderStatusInfo,
} from "@/server/mqtt/projection";
import { type DeviceScreen } from "@/contracts/dashboard";

describe("MQTT Snapshot Projection", () => {
  const baseScreenList: DeviceScreen[] = [
    { screenId: "pet-home", kind: "pet" },
    {
      screenId: "codex-screen",
      kind: "quota",
      providerId: "codex",
      windowId: "limit_5h",
    },
    {
      screenId: "claude-screen",
      kind: "quota",
      providerId: "claude",
      windowId: "limit_7d",
    },
  ];

  it("projects valid current windows with correct per-window validity deadlines", () => {
    const nowMs = 1700000000000;
    const nowIso = new Date(nowMs).toISOString();

    const currentWindows = new Map<string, PersistedWindowPayload>();
    currentWindows.set("codex:limit_5h", {
      windowId: "limit_5h",
      label: "Codex 5H",
      windowDurationSeconds: 18000,
      usedPercent: 30,
      remainingPercent: 70,
      resetAt: new Date(nowMs + 3600000).toISOString(), // 1 hr from now
      dataStatus: "ok",
      collectedAt: nowIso,
      upstreamObservedAt: nowIso,
      freshnessBasis: "upstream_timestamp",
      sourceFreshness: "fresh",
    });

    currentWindows.set("claude:limit_7d", {
      windowId: "limit_7d",
      label: "Claude 7D",
      windowDurationSeconds: 604800,
      usedPercent: 80,
      remainingPercent: 20,
      resetAt: new Date(nowMs + 7200000).toISOString(), // 2 hr from now
      dataStatus: "ok",
      collectedAt: nowIso,
      upstreamObservedAt: null,
      freshnessBasis: "session_snapshot",
      sourceFreshness: "unknown",
    });

    const providers = new Map<string, ProviderStatusInfo>();
    providers.set("codex", {
      providerId: "codex",
      enabled: true,
      dataStatus: "ok",
      verification: "verified",
    });
    providers.set("claude", {
      providerId: "claude",
      enabled: true,
      dataStatus: "ok",
      verification: "unverified",
    });

    const { snapshot, jsonPayload } = projectDeviceSnapshot({
      deviceId: "bmo-local",
      revision: 2,
      configRevision: 1,
      screens: baseScreenList,
      currentWindows,
      providers,
      freshnessThresholdSeconds: 900, // 15 min
      nowMs,
    });

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.deviceId).toBe("bmo-local");
    expect(snapshot.revision).toBe(2);
    expect(snapshot.configRevision).toBe(1);
    expect(snapshot.windows).toHaveLength(2);

    const codexWindow = snapshot.windows[0];
    expect(codexWindow.windowId).toBe("limit_5h");
    expect(codexWindow.usedPercent).toBe(30);
    expect(codexWindow.remainingPercent).toBe(70);
    expect(codexWindow.dataStatus).toBe("ok");
    // validity deadline should be min(resetAt, collectedAt + 900s) = now + 900s
    expect(codexWindow.validUntil).toBe(new Date(nowMs + 900000).toISOString());

    const claudeWindow = snapshot.windows[1];
    expect(claudeWindow.windowId).toBe("limit_7d");
    expect(claudeWindow.usedPercent).toBe(80);
    expect(claudeWindow.remainingPercent).toBe(20);

    // overall validUntil is earliest deadline
    expect(snapshot.validUntil).toBe(new Date(nowMs + 900000).toISOString());
    expect(jsonPayload).toContain('"schemaVersion":1');
  });

  it("marks windows for disabled or missing providers as unavailable with null percentages", () => {
    const nowMs = 1700000000000;
    const currentWindows = new Map<string, PersistedWindowPayload>();
    const providers = new Map<string, ProviderStatusInfo>();

    providers.set("codex", {
      providerId: "codex",
      enabled: false, // DISABLED
      dataStatus: "ok",
      verification: "verified",
    });

    const { snapshot } = projectDeviceSnapshot({
      deviceId: "bmo-local",
      revision: 1,
      configRevision: 1,
      screens: baseScreenList,
      currentWindows,
      providers,
      nowMs,
    });

    expect(snapshot.windows).toHaveLength(2);
    for (const w of snapshot.windows) {
      expect(w.dataStatus).toBe("unavailable");
      expect(w.usedPercent).toBeNull();
      expect(w.remainingPercent).toBeNull();
    }
  });

  it("marks window as unavailable if reset timestamp has passed", () => {
    const nowMs = 1700000000000;
    const currentWindows = new Map<string, PersistedWindowPayload>();
    currentWindows.set("codex:limit_5h", {
      windowId: "limit_5h",
      label: "Codex 5H",
      windowDurationSeconds: 18000,
      usedPercent: 30,
      remainingPercent: 70,
      resetAt: new Date(nowMs - 1000).toISOString(), // RESET IN PAST!
      dataStatus: "ok",
      collectedAt: new Date(nowMs - 60000).toISOString(),
      upstreamObservedAt: new Date(nowMs - 60000).toISOString(),
      freshnessBasis: "upstream_timestamp",
      sourceFreshness: "fresh",
    });

    const providers = new Map<string, ProviderStatusInfo>();
    providers.set("codex", {
      providerId: "codex",
      enabled: true,
      dataStatus: "ok",
      verification: "verified",
    });

    const { snapshot } = projectDeviceSnapshot({
      deviceId: "bmo-local",
      revision: 1,
      configRevision: 1,
      screens: baseScreenList.slice(0, 2), // only codex
      currentWindows,
      providers,
      nowMs,
    });

    expect(snapshot.windows).toHaveLength(1);
    expect(snapshot.windows[0].dataStatus).toBe("unavailable");
    expect(snapshot.windows[0].usedPercent).toBeNull();
    expect(snapshot.windows[0].remainingPercent).toBeNull();
  });
});
