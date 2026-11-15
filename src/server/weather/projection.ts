import "server-only";
import { createHash } from "node:crypto";
import type { Transaction } from "@libsql/client";
import { buildDeviceTopic } from "@/contracts/mqtt";
import {
  deviceWeatherSchema,
  MAX_WEATHER_PAYLOAD_BYTES,
  type DeviceWeatherV1,
} from "@/contracts/weather";
import { enqueueOutboxMessage } from "@/server/mqtt/outbox";
import { weatherDeviceIds } from "./config";

export async function enqueueDeviceWeather(
  tx: Transaction,
  deviceId: string,
  nowMs: number,
  forceRepublish = false,
): Promise<string | null> {
  if (!weatherDeviceIds().includes(deviceId)) return null;
  const device = (
    await tx.execute({
      sql: "SELECT enabled FROM devices WHERE device_id=?",
      args: [deviceId],
    })
  ).rows[0];
  if (!device || !device.enabled) return null;
  const cache = (
    await tx.execute(
      "SELECT location_revision,observation_json,data_at FROM weather_cache WHERE id=1",
    )
  ).rows[0];
  const setting = (
    await tx.execute("SELECT location_json FROM weather_settings WHERE id=1")
  ).rows[0];
  const source = cache.observation_json
    ? (JSON.parse(String(cache.observation_json)) as {
        temperatureC: number;
        condition: DeviceWeatherV1["condition"];
        isDay: boolean;
        dataAt: string;
      })
    : null;
  const dataAt = cache.data_at === null ? null : Number(cache.data_at);
  const ok = Boolean(
    setting.location_json &&
    source &&
    dataAt !== null &&
    dataAt <= nowMs + 300000 &&
    dataAt + 3600000 > nowMs,
  );
  const value: Omit<DeviceWeatherV1, "revision"> = {
    schemaVersion: 1,
    deviceId,
    locationRevision: Number(cache.location_revision),
    status: ok ? "ok" : "unavailable",
    condition: ok ? source!.condition : "unknown",
    temperatureC: ok ? source!.temperatureC : null,
    isDay: ok ? source!.isDay : null,
    dataAt: ok ? source!.dataAt : null,
    validUntil: ok ? new Date(dataAt! + 3600000).toISOString() : null,
  };
  const semanticHash = createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
  const old = (
    await tx.execute({
      sql: "SELECT revision,semantic_hash FROM weather_topic_state WHERE device_id=?",
      args: [deviceId],
    })
  ).rows[0];
  const same = old && String(old.semantic_hash) === semanticHash;
  if (same && !forceRepublish) return null;
  const revision = same
    ? Number(old.revision)
    : old
      ? Number(old.revision) + 1
      : 1;
  if (!Number.isSafeInteger(revision))
    throw new Error("Weather revision exhausted");
  const payload = JSON.stringify(
    deviceWeatherSchema.parse({ ...value, revision }),
  );
  if (Buffer.byteLength(payload, "utf8") > MAX_WEATHER_PAYLOAD_BYTES)
    throw new Error("Weather payload exceeds 512 bytes");
  const topic = buildDeviceTopic(deviceId, "weather");
  if (same) {
    const row = (
      await tx.execute({
        sql: "SELECT id,state FROM mqtt_outbox WHERE device_id=? AND topic=? AND revision=?",
        args: [deviceId, topic, revision],
      })
    ).rows[0];
    if (row) {
      if (row.state !== "published") return null;
      await tx.execute({
        sql: "UPDATE mqtt_outbox SET state='pending',next_attempt_at=?,updated_at=? WHERE id=? AND state='published'",
        args: [nowMs, nowMs, String(row.id)],
      });
      return String(row.id);
    }
    return enqueueOutboxMessage(tx, {
      deviceId,
      topic,
      revision,
      payload,
      nowMs,
    });
  }
  await tx.execute({
    sql: "INSERT INTO weather_topic_state(device_id,revision,semantic_hash,updated_at) VALUES(?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET revision=excluded.revision,semantic_hash=excluded.semantic_hash,updated_at=excluded.updated_at",
    args: [deviceId, revision, semanticHash, nowMs],
  });
  await tx.execute({
    sql: "UPDATE mqtt_outbox SET state='superseded',updated_at=? WHERE device_id=? AND topic=? AND state IN ('pending','failed','in_flight') AND revision < ?",
    args: [nowMs, deviceId, topic, revision],
  });
  return enqueueOutboxMessage(tx, {
    deviceId,
    topic,
    revision,
    payload,
    nowMs,
  });
}
export async function enqueueWeatherTombstone(
  tx: Transaction,
  deviceId: string,
  nowMs: number,
): Promise<string | null> {
  const old = (
    await tx.execute({
      sql: "SELECT revision FROM weather_topic_state WHERE device_id=?",
      args: [deviceId],
    })
  ).rows[0];
  if (!old && !weatherDeviceIds().includes(deviceId)) return null;
  const revision = old ? Number(old.revision) + 1 : 1;
  await tx.execute({
    sql: "INSERT INTO weather_topic_state(device_id,revision,semantic_hash,updated_at) VALUES(?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET revision=excluded.revision,semantic_hash=excluded.semantic_hash,updated_at=excluded.updated_at",
    args: [deviceId, revision, "tombstone", nowMs],
  });
  const topic = buildDeviceTopic(deviceId, "weather");
  await tx.execute({
    sql: "UPDATE mqtt_outbox SET state='superseded',updated_at=? WHERE device_id=? AND topic=? AND state IN ('pending','failed','in_flight') AND revision < ?",
    args: [nowMs, deviceId, topic, revision],
  });
  return enqueueOutboxMessage(tx, {
    deviceId,
    topic,
    revision,
    payload: "",
    isTombstone: true,
    nowMs,
  });
}
export async function reconcileWeatherDelivery(
  nowMs: number,
  forceRepublish = false,
): Promise<number> {
  const { writeTransaction } = await import("@/server/db");
  const ids = weatherDeviceIds();
  let count = 0;
  await writeTransaction(async (tx) => {
    for (const id of ids)
      if (await enqueueDeviceWeather(tx, id, nowMs, forceRepublish)) count++;
    const old = (await tx.execute("SELECT device_id FROM weather_topic_state"))
      .rows;
    for (const row of old) {
      const id = String(row.device_id);
      if (ids.includes(id)) continue;
      const latest = (
        await tx.execute({
          sql: "SELECT semantic_hash FROM weather_topic_state WHERE device_id=?",
          args: [id],
        })
      ).rows[0];
      if (
        String(latest.semantic_hash) !== "tombstone" &&
        (await enqueueWeatherTombstone(tx, id, nowMs))
      )
        count++;
    }
  });
  return count;
}
