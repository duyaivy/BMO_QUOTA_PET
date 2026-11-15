import "server-only";
import { randomUUID } from "node:crypto";
import { getDb, writeTransaction } from "@/server/db";
import { drainOutbox } from "@/server/mqtt/drain";
import { weatherDeviceIds, weatherEnabled } from "./config";
import { fetchCurrentWeather, type WeatherObservation } from "./provider";
import { enqueueDeviceWeather, reconcileWeatherDelivery } from "./projection";
import { weatherLocationChoiceSchema } from "@/contracts/weather";

export type WeatherRefreshStatus =
  | "updated"
  | "unchanged"
  | "not_due"
  | "busy"
  | "unconfigured"
  | "disabled"
  | "failed";
export interface WeatherRefreshResult {
  status: WeatherRefreshStatus;
  fetchedAt: string | null;
  enqueuedCount: number;
  dataAt: string | null;
  lastJobAt: string | null;
}
export interface WeatherJobResult extends WeatherRefreshResult {
  requestId: string;
  publishedCount: number;
}
const interval = 900000;
export async function refreshWeather(
  options: {
    nowMs?: number;
    fetchImpl?: typeof fetch;
    deadlineMs?: number;
  } = {},
): Promise<WeatherRefreshResult> {
  const now = options.nowMs ?? Date.now();
  if (!weatherEnabled())
    return {
      status: "disabled",
      fetchedAt: null,
      enqueuedCount: 0,
      dataAt: null,
      lastJobAt: null,
    };
  const token = randomUUID();
  const claim = await writeTransaction(async (tx) => {
    const settings = (
      await tx.execute(
        "SELECT revision,location_json FROM weather_settings WHERE id=1",
      )
    ).rows[0];
    const cache = (
      await tx.execute(
        "SELECT location_revision,next_attempt_at,lease_owner,lease_expires_at,observation_json,data_at,fetched_at,last_job_at FROM weather_cache WHERE id=1",
      )
    ).rows[0];
    if (!settings.location_json)
      return { status: "unconfigured" as const, cache };
    if (cache.lease_owner && Number(cache.lease_expires_at) > now)
      return { status: "busy" as const, cache };
    if (Number(cache.next_attempt_at) > now)
      return { status: "not_due" as const, cache };
    const updated = await tx.execute({
      sql: "UPDATE weather_cache SET lease_owner=?,lease_expires_at=?,next_attempt_at=?,last_job_at=? WHERE id=1 AND location_revision=? AND (lease_owner IS NULL OR lease_expires_at<=?) AND next_attempt_at<=?",
      args: [
        token,
        now + 45000,
        now + interval,
        now,
        Number(settings.revision),
        now,
        now,
      ],
    });
    if (updated.rowsAffected !== 1) return { status: "busy" as const, cache };
    return { status: "claimed" as const, settings, cache };
  });
  if (claim.status !== "claimed")
    return {
      status: claim.status,
      fetchedAt:
        claim.cache.fetched_at === null
          ? null
          : new Date(Number(claim.cache.fetched_at)).toISOString(),
      enqueuedCount: 0,
      dataAt:
        claim.cache.data_at === null
          ? null
          : new Date(Number(claim.cache.data_at)).toISOString(),
      lastJobAt:
        claim.cache.last_job_at === null
          ? null
          : new Date(Number(claim.cache.last_job_at)).toISOString(),
    };
  const location = weatherLocationChoiceSchema.parse(
    JSON.parse(String(claim.settings.location_json)),
  );
  const controller = new AbortController();
  const remaining =
    options.deadlineMs === undefined
      ? 5000
      : Math.min(5000, Math.max(1, options.deadlineMs - Date.now()));
  const timer = setTimeout(() => controller.abort(), remaining);
  let observation: WeatherObservation | null = null;
  let errorCode: string | null = null;
  try {
    observation = await fetchCurrentWeather(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        revision: Number(claim.settings.revision),
      },
      controller.signal,
      options.fetchImpl,
    );
    const observed = Date.parse(observation.dataAt);
    if (
      observed > now + 300000 ||
      observed + 3600000 <= now ||
      (claim.cache.data_at !== null && observed < Number(claim.cache.data_at))
    )
      throw new Error("Invalid source timestamp");
  } catch (error) {
    errorCode =
      error instanceof Error && error.name === "AbortError"
        ? "TIMEOUT"
        : "UPSTREAM_FAILURE";
    observation = null;
  } finally {
    clearTimeout(timer);
  }
  const finished = options.nowMs ?? Date.now();
  let enqueuedCount = 0;
  const result = await writeTransaction(async (tx) => {
    const cache = (
      await tx.execute(
        "SELECT location_revision,lease_owner,data_at,observation_json FROM weather_cache WHERE id=1",
      )
    ).rows[0];
    if (
      String(cache.lease_owner) !== token ||
      Number(cache.location_revision) !== Number(claim.settings.revision)
    )
      return "busy" as const;
    if (!observation) {
      await tx.execute({
        sql: "UPDATE weather_cache SET lease_owner=NULL,lease_expires_at=NULL,last_error_code=?,last_job_at=? WHERE id=1 AND lease_owner=?",
        args: [errorCode, finished, token],
      });
      return "failed" as const;
    }
    const unchanged =
      cache.data_at !== null &&
      Number(cache.data_at) === Date.parse(observation.dataAt) &&
      String(cache.observation_json) === JSON.stringify(observation);
    await tx.execute({
      sql: "UPDATE weather_cache SET observation_json=?,data_at=?,fetched_at=?,last_job_at=?,last_error_code=NULL,lease_owner=NULL,lease_expires_at=NULL WHERE id=1 AND lease_owner=? AND location_revision=?",
      args: [
        JSON.stringify(observation),
        Date.parse(observation.dataAt),
        finished,
        finished,
        token,
        Number(claim.settings.revision),
      ],
    });
    for (const id of weatherDeviceIds())
      if (await enqueueDeviceWeather(tx, id, finished)) enqueuedCount++;
    return unchanged ? ("unchanged" as const) : ("updated" as const);
  });
  return {
    status: result,
    fetchedAt:
      result === "failed" || result === "busy"
        ? null
        : new Date(finished).toISOString(),
    enqueuedCount,
    dataAt: observation?.dataAt ?? null,
    lastJobAt: new Date(finished).toISOString(),
  };
}
export async function runWeatherJob(
  options: { deadlineMs?: number } = {},
): Promise<WeatherJobResult> {
  const requestId = randomUUID();
  const deadlineMs = options.deadlineMs ?? Date.now() + 25000;
  try {
    const refresh = await refreshWeather({ deadlineMs });
    if (
      refresh.status === "disabled" ||
      refresh.status === "unconfigured" ||
      refresh.status === "failed"
    )
      return { ...refresh, requestId, publishedCount: 0 };
    let enqueued = refresh.enqueuedCount;
    if (refresh.status === "updated" || refresh.status === "unchanged")
      enqueued += await reconcileWeatherDelivery(
        Date.now(),
        refresh.status === "unchanged",
      );
    else if (refresh.status === "not_due")
      enqueued += await reconcileWeatherDelivery(Date.now(), false);
    if (!process.env.MQTT_HOST) {
      const pending = (
        await (
          await getDb()
        ).$client.execute(
          "SELECT COUNT(*) AS count FROM mqtt_outbox WHERE topic LIKE '%/weather' AND state IN ('pending','failed','in_flight')",
        )
      ).rows[0];
      return {
        ...refresh,
        status:
          enqueued > 0 || Number(pending.count) > 0 ? "failed" : refresh.status,
        requestId,
        publishedCount: 0,
        enqueuedCount: enqueued,
      };
    }
    const drained = await drainOutbox({
      topicKinds: ["weather"],
      deadlineMs,
      batchSize: 10,
    });
    return {
      ...refresh,
      status: drained.failed > 0 ? "failed" : refresh.status,
      requestId,
      publishedCount: drained.published,
      enqueuedCount: enqueued,
    };
  } catch {
    return {
      status: "failed",
      fetchedAt: null,
      enqueuedCount: 0,
      dataAt: null,
      lastJobAt: new Date().toISOString(),
      requestId,
      publishedCount: 0,
    };
  }
}
