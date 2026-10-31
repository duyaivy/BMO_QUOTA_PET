import "server-only";
import {
  deviceChangeSchema,
  type DeviceConfig,
  type DeviceScreen,
  providerChangeSchema,
} from "@/contracts/dashboard";
import { getDb, writeTransaction } from "@/server/db";
export class RevisionConflict extends Error {}
export async function readDevice(): Promise<DeviceConfig> {
  const db = await getDb();
  const rows = (
    await db.$client.execute(
      "SELECT d.name,d.config_revision,s.screen_id,s.kind,s.provider_id,s.window_id FROM devices d JOIN device_screens s ON s.device_id=d.device_id WHERE d.device_id='bmo-local' ORDER BY s.position",
    )
  ).rows;
  const record = rows[0];
  if (!record) throw new Error("Device configuration unavailable");
  const screens: DeviceScreen[] = rows.map((row) =>
    row.kind === "pet"
      ? { kind: "pet", screenId: "pet-home" }
      : {
          kind: "quota",
          screenId: String(row.screen_id),
          providerId: row.provider_id as "codex" | "claude" | "antigravity",
          windowId: String(row.window_id),
        },
  );
  return {
    deviceId: "bmo-local",
    name: String(record.name),
    revision: Number(record.config_revision),
    screens,
  };
}
// Internal persistence; request entrypoints must authorize before calling.
export async function saveDevice(input: unknown): Promise<DeviceConfig> {
  const value = deviceChangeSchema.parse(input);
  await writeTransaction(async (tx) => {
    const changed = await tx.execute({
      sql: "UPDATE devices SET name=?,config_revision=config_revision+1,updated_at=? WHERE device_id='bmo-local' AND config_revision=? RETURNING config_revision",
      args: [value.name, Date.now(), value.expectedRevision],
    });
    if (!changed.rows.length) throw new RevisionConflict();
    await tx.execute("DELETE FROM device_screens WHERE device_id='bmo-local'");
    for (const [position, screen] of value.screens.entries())
      await tx.execute({
        sql: "INSERT INTO device_screens(device_id,screen_id,position,kind,provider_id,window_id) VALUES('bmo-local',?,?,?,?,?)",
        args: [
          screen.screenId,
          position,
          screen.kind,
          screen.kind === "quota" ? screen.providerId : null,
          screen.kind === "quota" ? screen.windowId : null,
        ],
      });
  });
  // Return the committed revision/content, rather than a racing later edit.
  return {
    deviceId: "bmo-local",
    name: value.name,
    revision: value.expectedRevision + 1,
    screens: value.screens,
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
