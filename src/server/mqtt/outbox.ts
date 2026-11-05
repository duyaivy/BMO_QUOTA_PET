import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Transaction } from "@libsql/client";
import {
  buildDeviceTopic,
  type DeviceMqttConfig,
  deviceMqttConfigSchema,
  assertMqttPayloadSize,
} from "@/contracts/mqtt";
import { type DeviceScreen, type ProviderId } from "@/contracts/dashboard";
import {
  projectDeviceSnapshot,
  type PersistedWindowPayload,
  type ProviderStatusInfo,
} from "./projection";

export interface EnqueueOptions {
  deviceId: string;
  topic: string;
  revision: number;
  payload: string;
  isTombstone?: boolean;
  nowMs?: number;
}

export async function enqueueOutboxMessage(
  tx: Transaction,
  options: EnqueueOptions,
): Promise<string> {
  const now = options.nowMs ?? Date.now();
  const isTombstone = options.isTombstone ?? false;

  if (!isTombstone) {
    assertMqttPayloadSize(options.payload);
  }

  const semanticHash = createHash("sha256")
    .update(options.payload)
    .digest("hex");

  // Safe supersession: Coalesce never-attempted obsolete pending messages for the same device & topic
  await tx.execute({
    sql: "UPDATE mqtt_outbox SET state='superseded', updated_at=? WHERE device_id=? AND topic=? AND state='pending' AND revision < ?",
    args: [now, options.deviceId, options.topic, options.revision],
  });

  const id = `outbox-${randomUUID()}`;

  await tx.execute({
    sql: `INSERT INTO mqtt_outbox(
      id, device_id, topic, revision, payload, is_tombstone,
      semantic_hash, state, attempts, next_attempt_at, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    args: [
      id,
      options.deviceId,
      options.topic,
      options.revision,
      options.payload,
      isTombstone ? 1 : 0,
      semanticHash,
      now,
      now,
      now,
    ],
  });

  return id;
}

export async function getNextOutboxRevision(
  tx: Transaction,
  deviceId: string,
  topic: string,
): Promise<number> {
  const result = await tx.execute({
    sql: "SELECT MAX(revision) AS max_rev FROM mqtt_outbox WHERE device_id=? AND topic=?",
    args: [deviceId, topic],
  });
  const maxRev = Number(result.rows[0]?.max_rev);
  return Number.isFinite(maxRev) && maxRev > 0 ? maxRev + 1 : 1;
}

export async function enqueueDeviceConfig(
  tx: Transaction,
  deviceId: string,
  revision: number,
  screens: DeviceScreen[],
  nowMs?: number,
): Promise<string> {
  const now = nowMs ?? Date.now();
  const topic = buildDeviceTopic(deviceId, "config");

  const configObj: DeviceMqttConfig = {
    schemaVersion: 1,
    deviceId,
    revision,
    updatedAt: new Date(now).toISOString(),
    screens,
  };

  const parsed = deviceMqttConfigSchema.parse(configObj);
  const payload = JSON.stringify(parsed);

  return enqueueOutboxMessage(tx, {
    deviceId,
    topic,
    revision,
    payload,
    isTombstone: false,
    nowMs: now,
  });
}

export async function enqueueDeviceSnapshot(
  tx: Transaction,
  deviceId: string,
  nowMs?: number,
): Promise<string | null> {
  const now = nowMs ?? Date.now();
  const topic = buildDeviceTopic(deviceId, "snapshot");

  // Read device
  const deviceRows = (
    await tx.execute({
      sql: "SELECT name, enabled, config_revision FROM devices WHERE device_id=?",
      args: [deviceId],
    })
  ).rows;

  const device = deviceRows[0];
  if (!device || !device.enabled) return null;

  const configRevision = Number(device.config_revision);

  // Read screens
  const screenRows = (
    await tx.execute({
      sql: "SELECT screen_id, kind, provider_id, window_id FROM device_screens WHERE device_id=? ORDER BY position",
      args: [deviceId],
    })
  ).rows;

  const screens: DeviceScreen[] = screenRows.map((r) =>
    r.kind === "pet"
      ? { kind: "pet", screenId: "pet-home" }
      : {
          kind: "quota",
          screenId: String(r.screen_id),
          providerId: r.provider_id as ProviderId,
          windowId: String(r.window_id),
        },
  );

  // Read current windows
  const windowRows = (
    await tx.execute(
      "SELECT provider_id, window_id, payload, data_status FROM current_windows",
    )
  ).rows;
  const currentWindows = new Map<string, PersistedWindowPayload>();
  for (const row of windowRows) {
    try {
      const parsed = JSON.parse(String(row.payload));
      currentWindows.set(`${row.provider_id}:${row.window_id}`, {
        windowId: String(row.window_id),
        label: parsed.label ?? String(row.window_id),
        windowDurationSeconds: parsed.windowDurationSeconds ?? null,
        usedPercent: parsed.usedPercent ?? null,
        remainingPercent: parsed.remainingPercent ?? null,
        resetAt: parsed.resetAt ?? null,
        dataStatus:
          (row.data_status as PersistedWindowPayload["dataStatus"]) ??
          "unavailable",
        collectedAt: parsed.collectedAt ?? new Date(now).toISOString(),
        upstreamObservedAt: parsed.upstreamObservedAt ?? null,
        freshnessBasis: parsed.freshnessBasis ?? "unknown",
        sourceFreshness: parsed.sourceFreshness ?? "unknown",
      });
    } catch {
      // ignore malformed window payload
    }
  }

  // Read provider statuses
  const providerRows = (
    await tx.execute(
      "SELECT provider_id, enabled, verification, data_status FROM provider_config",
    )
  ).rows;
  const providers = new Map<string, ProviderStatusInfo>();
  for (const row of providerRows) {
    providers.set(String(row.provider_id), {
      providerId: row.provider_id as ProviderId,
      enabled: Boolean(row.enabled),
      dataStatus: String(row.data_status),
      verification: String(row.verification),
    });
  }

  // Read app settings
  const settingsRows = (
    await tx.execute(
      "SELECT freshness_threshold_seconds FROM app_settings WHERE id=1",
    )
  ).rows;
  const thresholdSeconds = Number(
    settingsRows[0]?.freshness_threshold_seconds ?? 900,
  );

  const revision = await getNextOutboxRevision(tx, deviceId, topic);

  const { jsonPayload } = projectDeviceSnapshot({
    deviceId,
    revision,
    configRevision,
    screens,
    currentWindows,
    providers,
    freshnessThresholdSeconds: thresholdSeconds,
    nowMs: now,
  });

  return enqueueOutboxMessage(tx, {
    deviceId,
    topic,
    revision,
    payload: jsonPayload,
    isTombstone: false,
    nowMs: now,
  });
}

export async function enqueueDeviceTombstones(
  tx: Transaction,
  deviceId: string,
  nowMs?: number,
): Promise<{ configOutboxId: string; snapshotOutboxId: string }> {
  const now = nowMs ?? Date.now();
  const configTopic = buildDeviceTopic(deviceId, "config");
  const snapshotTopic = buildDeviceTopic(deviceId, "snapshot");

  const configRev = await getNextOutboxRevision(tx, deviceId, configTopic);
  const snapshotRev = await getNextOutboxRevision(tx, deviceId, snapshotTopic);

  const configOutboxId = await enqueueOutboxMessage(tx, {
    deviceId,
    topic: configTopic,
    revision: configRev,
    payload: "",
    isTombstone: true,
    nowMs: now,
  });

  const snapshotOutboxId = await enqueueOutboxMessage(tx, {
    deviceId,
    topic: snapshotTopic,
    revision: snapshotRev,
    payload: "",
    isTombstone: true,
    nowMs: now,
  });

  return { configOutboxId, snapshotOutboxId };
}
