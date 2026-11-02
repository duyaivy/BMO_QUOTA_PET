import "server-only";
import {
  deviceChangeSchema,
  deviceCreateSchema,
  deviceRetireSchema,
  type DeviceConfig,
  type DeviceProvisioning,
  type DeviceScreen,
  providerChangeSchema,
} from "@/contracts/dashboard";
import { buildDeviceTopic } from "@/contracts/mqtt";
import { getDb, writeTransaction } from "@/server/db";
import {
  enqueueDeviceConfig,
  enqueueDeviceSnapshot,
  enqueueDeviceTombstones,
} from "@/server/mqtt/outbox";

export class RevisionConflict extends Error {}
export class DeviceNotFound extends Error {}

export interface DeviceSummary {
  deviceId: string;
  name: string;
  enabled: boolean;
  configRevision: number;
  screenCount: number;
  updatedAt: number;
}

export async function listDevices(): Promise<DeviceSummary[]> {
  const db = await getDb();
  const rows = (
    await db.$client.execute(
      `SELECT d.device_id, d.name, d.enabled, d.config_revision, d.updated_at,
              COUNT(s.screen_id) as screen_count
       FROM devices d
       LEFT JOIN device_screens s ON s.device_id = d.device_id
       GROUP BY d.device_id
       ORDER BY d.device_id ASC`,
    )
  ).rows;

  return rows.map((r) => ({
    deviceId: String(r.device_id),
    name: String(r.name),
    enabled: Boolean(r.enabled),
    configRevision: Number(r.config_revision),
    screenCount: Number(r.screen_count),
    updatedAt: Number(r.updated_at),
  }));
}

export async function readDevice(deviceId: string = "bmo-local"): Promise<DeviceConfig> {
  const db = await getDb();
  const rows = (
    await db.$client.execute({
      sql: `SELECT d.name, d.config_revision, s.screen_id, s.kind, s.provider_id, s.window_id
            FROM devices d
            LEFT JOIN device_screens s ON s.device_id = d.device_id
            WHERE d.device_id = ?
            ORDER BY s.position ASC`,
      args: [deviceId],
    })
  ).rows;

  const record = rows[0];
  if (!record || record.name === null) {
    throw new DeviceNotFound(`Device ${deviceId} unavailable`);
  }

  const screens: DeviceScreen[] = [];
  for (const row of rows) {
    if (!row.screen_id) continue;
    if (row.kind === "pet") {
      screens.push({ kind: "pet", screenId: "pet-home" });
    } else {
      screens.push({
        kind: "quota",
        screenId: String(row.screen_id),
        providerId: row.provider_id as "codex" | "claude" | "antigravity",
        windowId: String(row.window_id),
      });
    }
  }

  return {
    deviceId,
    name: String(record.name),
    revision: Number(record.config_revision),
    screens,
  };
}

export async function createDevice(input: unknown): Promise<DeviceConfig> {
  const value = deviceCreateSchema.parse(input);
  const now = Date.now();

  await writeTransaction(async (tx) => {
    await tx.execute({
      sql: "INSERT INTO devices(device_id, name, enabled, config_revision, updated_at) VALUES(?, ?, 1, 1, ?)",
      args: [value.deviceId, value.name, now],
    });

    // Default with PET screen at position 0
    await tx.execute({
      sql: "INSERT INTO device_screens(device_id, screen_id, position, kind) VALUES(?, 'pet-home', 0, 'pet')",
      args: [value.deviceId],
    });

    const initialScreens: DeviceScreen[] = [{ kind: "pet", screenId: "pet-home" }];
    await enqueueDeviceConfig(tx, value.deviceId, 1, initialScreens, now);
    await enqueueDeviceSnapshot(tx, value.deviceId, now);
  });

  return {
    deviceId: value.deviceId,
    name: value.name,
    revision: 1,
    screens: [{ kind: "pet", screenId: "pet-home" }],
  };
}

// Internal persistence; request entrypoints must authorize before calling.
export async function saveDevice(input: unknown): Promise<DeviceConfig> {
  const value = deviceChangeSchema.parse(input);
  const deviceId = value.deviceId;
  const now = Date.now();
  const nextRevision = value.expectedRevision + 1;

  await writeTransaction(async (tx) => {
    const changed = await tx.execute({
      sql: "UPDATE devices SET name=?, config_revision=?, updated_at=? WHERE device_id=? AND config_revision=? RETURNING config_revision",
      args: [value.name, nextRevision, now, deviceId, value.expectedRevision],
    });
    if (!changed.rows.length) throw new RevisionConflict();

    await tx.execute({
      sql: "DELETE FROM device_screens WHERE device_id=?",
      args: [deviceId],
    });

    for (const [position, screen] of value.screens.entries()) {
      await tx.execute({
        sql: "INSERT INTO device_screens(device_id, screen_id, position, kind, provider_id, window_id) VALUES(?, ?, ?, ?, ?, ?)",
        args: [
          deviceId,
          screen.screenId,
          position,
          screen.kind,
          screen.kind === "quota" ? screen.providerId : null,
          screen.kind === "quota" ? screen.windowId : null,
        ],
      });
    }

    // Atomically enqueue config and snapshot outbox messages!
    await enqueueDeviceConfig(tx, deviceId, nextRevision, value.screens, now);
    await enqueueDeviceSnapshot(tx, deviceId, now);
  });

  // Return the committed revision/content, rather than a racing later edit.
  return {
    deviceId,
    name: value.name,
    revision: nextRevision,
    screens: value.screens,
  };
}

export async function retireDevice(input: unknown): Promise<{ deviceId: string; enabled: false }> {
  const value = deviceRetireSchema.parse(input);
  const now = Date.now();

  await writeTransaction(async (tx) => {
    const changed = await tx.execute({
      sql: "UPDATE devices SET enabled=0, config_revision=config_revision+1, updated_at=? WHERE device_id=? AND config_revision=? RETURNING config_revision",
      args: [now, value.deviceId, value.expectedRevision],
    });
    if (!changed.rows.length) throw new RevisionConflict();

    // Enqueue retained tombstones to clear broker state
    await enqueueDeviceTombstones(tx, value.deviceId, now);
  });

  return { deviceId: value.deviceId, enabled: false };
}

export function getDeviceProvisioningInfo(deviceId: string): DeviceProvisioning {
  const host = process.env.MQTT_HOST || "configured-at-deploy";
  const port = process.env.MQTT_PORT ? Number(process.env.MQTT_PORT) : 8883;

  return {
    deviceId,
    configTopic: buildDeviceTopic(deviceId, "config"),
    snapshotTopic: buildDeviceTopic(deviceId, "snapshot"),
    subscribeAcl: `bmo/v1/devices/${deviceId}/#`,
    brokerHost: host,
    brokerPort: port,
    instructions:
      "Configure the physical ESP32 device with Wi-Fi credentials and its own device-scoped MQTT subscriber credentials. Backend server-only publisher keys and administrator passwords must never be stored on or delivered to personal devices.",
  };
}

export async function saveProvider(input: unknown) {
  const value = providerChangeSchema.parse(input);
  return writeTransaction(async (tx) => {
    const changed = await tx.execute({
      sql: "UPDATE app_settings SET revision=revision+1,updated_at=? WHERE id=1 AND revision=? RETURNING revision",
      args: [Date.now(), value.expectedRevision],
    });
    if (!changed.rows.length) throw new RevisionConflict();
    await tx.execute({
      sql: "UPDATE provider_config SET enabled=?,updated_at=? WHERE provider_id=?",
      args: [Number(value.enabled), Date.now(), value.providerId],
    });
    return { revision: Number(changed.rows[0].revision) };
  });
}
