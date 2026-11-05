import { describe, expect, it } from "vitest";
import {
  MAX_MQTT_PAYLOAD_BYTES,
  buildDeviceTopic,
  parseDeviceTopic,
  deviceMqttConfigSchema,
  deviceMqttSnapshotSchema,
  assertMqttPayloadSize,
} from "@/contracts/mqtt";

describe("MQTT Contracts", () => {
  it("builds and parses device topics correctly", () => {
    const configTopic = buildDeviceTopic("bmo-desk-01", "config");
    expect(configTopic).toBe("bmo/v1/devices/bmo-desk-01/config");

    const snapshotTopic = buildDeviceTopic("bmo-desk-01", "snapshot");
    expect(snapshotTopic).toBe("bmo/v1/devices/bmo-desk-01/snapshot");

    expect(parseDeviceTopic(configTopic)).toEqual({
      deviceId: "bmo-desk-01",
      kind: "config",
    });

    expect(parseDeviceTopic(snapshotTopic)).toEqual({
      deviceId: "bmo-desk-01",
      kind: "snapshot",
    });

    expect(parseDeviceTopic("invalid/topic")).toBeNull();
    expect(parseDeviceTopic("bmo/v1/devices/bmo/other")).toBeNull();

    expect(() => buildDeviceTopic("../bad/id", "config")).toThrow();
  });

  it("validates device config v1 with PET screen first", () => {
    const validConfig = {
      schemaVersion: 1,
      deviceId: "bmo-local",
      revision: 1,
      updatedAt: new Date().toISOString(),
      screens: [
        { screenId: "pet-home", kind: "pet" },
        {
          screenId: "codex-5h",
          kind: "quota",
          providerId: "codex",
          windowId: "limit_5h",
        },
      ],
    };

    expect(() => deviceMqttConfigSchema.parse(validConfig)).not.toThrow();

    // Rejects if PET screen is not first
    const invalidOrder = {
      ...validConfig,
      screens: [
        {
          screenId: "codex-5h",
          kind: "quota",
          providerId: "codex",
          windowId: "limit_5h",
        },
        { screenId: "pet-home", kind: "pet" },
      ],
    };
    expect(() => deviceMqttConfigSchema.parse(invalidOrder)).toThrow(
      "First screen must be PET",
    );

    // Rejects duplicate screen IDs
    const duplicateIds = {
      ...validConfig,
      screens: [
        { screenId: "pet-home", kind: "pet" },
        {
          screenId: "quota-1",
          kind: "quota",
          providerId: "codex",
          windowId: "limit_5h",
        },
        {
          screenId: "quota-1",
          kind: "quota",
          providerId: "claude",
          windowId: "limit_7d",
        },
      ],
    };
    expect(() => deviceMqttConfigSchema.parse(duplicateIds)).toThrow(
      "Screen IDs must be unique",
    );
  });

  it("validates device snapshot v1 and percentage complementing", () => {
    const validSnapshot = {
      schemaVersion: 1,
      deviceId: "bmo-local",
      revision: 4,
      configRevision: 1,
      generatedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 600000).toISOString(),
      windows: [
        {
          providerId: "codex",
          windowId: "limit_5h",
          label: "Codex 5-Hour",
          windowDurationSeconds: 18000,
          usedPercent: 42,
          remainingPercent: 58,
          resetAt: new Date(Date.now() + 3600000).toISOString(),
          dataStatus: "ok",
          collectedAt: new Date().toISOString(),
          upstreamObservedAt: new Date().toISOString(),
          freshnessBasis: "upstream_timestamp",
          sourceFreshness: "fresh",
          validUntil: new Date(Date.now() + 600000).toISOString(),
        },
      ],
    };

    expect(() => deviceMqttSnapshotSchema.parse(validSnapshot)).not.toThrow();

    // Rejects non-complementing percentages
    const nonComplementing = {
      ...validSnapshot,
      windows: [
        {
          ...validSnapshot.windows[0],
          usedPercent: 40,
          remainingPercent: 50, // sum is 90, not 100
        },
      ],
    };
    expect(() => deviceMqttSnapshotSchema.parse(nonComplementing)).toThrow(
      "Percentages must complement",
    );

    // Rejects percentages when dataStatus is unavailable
    const unavailableWithPercent = {
      ...validSnapshot,
      windows: [
        {
          ...validSnapshot.windows[0],
          dataStatus: "unavailable",
          usedPercent: 40,
          remainingPercent: 60,
        },
      ],
    };
    expect(() =>
      deviceMqttSnapshotSchema.parse(unavailableWithPercent),
    ).toThrow("Unavailable percentages must be null");
  });

  it("enforces 8 KiB maximum payload limit", () => {
    const smallPayload = JSON.stringify({ hello: "world" });
    expect(() => assertMqttPayloadSize(smallPayload)).not.toThrow();

    const oversizedBuffer = Buffer.alloc(MAX_MQTT_PAYLOAD_BYTES + 1, "a");
    expect(() => assertMqttPayloadSize(oversizedBuffer)).toThrow(
      "MQTT payload exceeds 8192 bytes",
    );
  });
});
