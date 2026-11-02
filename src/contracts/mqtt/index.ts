import { z } from "zod";
import { providerIds, safeId } from "../usage";

export const MQTT_SCHEMA_VERSION = 1;
export const MAX_MQTT_PAYLOAD_BYTES = 8192; // 8 KiB ceiling as per architecture §11

export const mqttTopicSchema = z
  .string()
  .regex(/^bmo\/v1\/devices\/[A-Za-z0-9_.-]+\/(config|snapshot)$/);

export type MqttTopicKind = "config" | "snapshot";

export function buildDeviceTopic(
  deviceId: string,
  kind: MqttTopicKind,
): string {
  if (!safeId.safeParse(deviceId).success) {
    throw new Error(`Invalid device ID for MQTT topic: ${deviceId}`);
  }
  return `bmo/v1/devices/${deviceId}/${kind}`;
}

export function parseDeviceTopic(
  topic: string,
): { deviceId: string; kind: MqttTopicKind } | null {
  const match = topic.match(/^bmo\/v1\/devices\/([A-Za-z0-9_.-]+)\/(config|snapshot)$/);
  if (!match) return null;
  return {
    deviceId: match[1],
    kind: match[2] as MqttTopicKind,
  };
}

const isoTimestamp = z.string().datetime();
const statusEnum = z.enum(["ok", "unavailable", "unsupported", "error"]);
const basisEnum = z.enum(["upstream_timestamp", "session_snapshot", "unknown"]);
const freshnessEnum = z.enum(["fresh", "stale", "unknown"]);

// Config v1: Ordered screens (PET first, then zero or more quota screens)
const petScreenConfig = z
  .object({
    screenId: z.literal("pet-home"),
    kind: z.literal("pet"),
  })
  .strict();

const quotaScreenConfig = z
  .object({
    screenId: safeId,
    kind: z.literal("quota"),
    providerId: z.enum(providerIds),
    windowId: safeId,
  })
  .strict();

export const deviceMqttScreenSchema = z.discriminatedUnion("kind", [
  petScreenConfig,
  quotaScreenConfig,
]);
export type DeviceMqttScreen = z.infer<typeof deviceMqttScreenSchema>;

export const deviceMqttConfigSchema = z
  .object({
    schemaVersion: z.literal(MQTT_SCHEMA_VERSION),
    deviceId: safeId,
    revision: z.number().int().positive().safe(),
    updatedAt: isoTimestamp,
    screens: z.array(deviceMqttScreenSchema).min(1).max(16),
  })
  .strict()
  .refine(
    (val) =>
      val.screens[0]?.kind === "pet" &&
      val.screens.slice(1).every((s) => s.kind === "quota"),
    "First screen must be PET, followed by quota screens",
  )
  .refine(
    (val) =>
      new Set(val.screens.map((s) => s.screenId)).size === val.screens.length,
    "Screen IDs must be unique",
  );
export type DeviceMqttConfig = z.infer<typeof deviceMqttConfigSchema>;

// Snapshot v1: Projected windows with original timestamps and per-window validity
export const snapshotWindowSchema = z
  .object({
    providerId: z.enum(providerIds),
    windowId: safeId,
    label: z.string().min(1).max(80),
    windowDurationSeconds: z.number().int().positive().safe().nullable(),
    usedPercent: z.number().min(0).max(100).nullable(),
    remainingPercent: z.number().min(0).max(100).nullable(),
    resetAt: isoTimestamp.nullable(),
    dataStatus: statusEnum,
    collectedAt: isoTimestamp,
    upstreamObservedAt: isoTimestamp.nullable(),
    freshnessBasis: basisEnum,
    sourceFreshness: freshnessEnum,
    validUntil: isoTimestamp,
  })
  .strict()
  .refine(
    (w) =>
      w.usedPercent === null ||
      w.remainingPercent === null ||
      Math.abs(w.usedPercent + w.remainingPercent - 100) <= 0.01000001,
    "Percentages must complement",
  )
  .refine(
    (w) =>
      w.dataStatus === "ok" ||
      (w.usedPercent === null && w.remainingPercent === null),
    "Unavailable percentages must be null",
  );
export type SnapshotWindow = z.infer<typeof snapshotWindowSchema>;

export const deviceMqttSnapshotSchema = z
  .object({
    schemaVersion: z.literal(MQTT_SCHEMA_VERSION),
    deviceId: safeId,
    revision: z.number().int().positive().safe(),
    configRevision: z.number().int().positive().safe(),
    generatedAt: isoTimestamp,
    validUntil: isoTimestamp,
    windows: z.array(snapshotWindowSchema).max(16),
  })
  .strict();
export type DeviceMqttSnapshot = z.infer<typeof deviceMqttSnapshotSchema>;

export function assertMqttPayloadSize(payload: string | Uint8Array): void {
  const byteLength =
    typeof payload === "string"
      ? Buffer.byteLength(payload, "utf8")
      : payload.byteLength;
  if (byteLength > MAX_MQTT_PAYLOAD_BYTES) {
    throw new Error(
      `MQTT payload exceeds ${MAX_MQTT_PAYLOAD_BYTES} bytes (actual: ${byteLength} bytes)`,
    );
  }
}
