import "server-only";
import {
  weatherLocationChoiceSchema,
  saveWeatherLocationSchema,
  type WeatherLocationChoice,
  type WeatherSettingsView,
} from "@/contracts/weather";
import { getDb, writeTransaction } from "@/server/db";
import { RevisionConflict } from "@/server/devices/repository";
import { resolveWeatherLocation } from "./locations";
import { weatherDeviceIds, weatherEnabled } from "./config";
import { enqueueDeviceWeather } from "./projection";

type SettingsRow = {
  revision: number;
  location_json: string | null;
  observation_json: string | null;
  data_at: number | null;
  fetched_at: number | null;
  last_job_at: number | null;
  last_error_code: string | null;
};
function view(row: SettingsRow, now = Date.now()): WeatherSettingsView {
  const location = row.location_json
    ? weatherLocationChoiceSchema.parse(JSON.parse(row.location_json))
    : null;
  const observation = row.observation_json
    ? (JSON.parse(row.observation_json) as {
        temperatureC: number;
        condition: WeatherSettingsView["condition"];
      })
    : null;
  const dataAt =
    row.data_at === null ? null : new Date(Number(row.data_at)).toISOString();
  const fetchedAt =
    row.fetched_at === null
      ? null
      : new Date(Number(row.fetched_at)).toISOString();
  const lastJobAt =
    row.last_job_at === null
      ? null
      : new Date(Number(row.last_job_at)).toISOString();
  const status = !location
    ? "unconfigured"
    : row.last_error_code
      ? "error"
      : !observation
        ? "pending"
        : Number(row.data_at) + 3600000 > now
          ? "fresh"
          : "stale";
  return {
    revision: Number(row.revision),
    location,
    status,
    dataAt,
    fetchedAt,
    lastJobAt,
    temperatureC: observation?.temperatureC ?? null,
    condition: observation?.condition ?? null,
  };
}
async function readRow(): Promise<SettingsRow> {
  const db = await getDb();
  const result = await db.$client.execute(
    "SELECT s.revision,s.location_json,c.observation_json,c.data_at,c.fetched_at,c.last_job_at,c.last_error_code FROM weather_settings s JOIN weather_cache c ON c.id=1 WHERE s.id=1",
  );
  return result.rows[0] as unknown as SettingsRow;
}
export async function readWeatherSettings(): Promise<WeatherSettingsView> {
  return view(await readRow());
}
export async function saveWeatherLocation(
  input: unknown,
  resolver: (
    id: number,
    signal: AbortSignal,
  ) => Promise<WeatherLocationChoice> = resolveWeatherLocation,
): Promise<{ settings: WeatherSettingsView; changed: boolean }> {
  const value = saveWeatherLocationSchema.parse(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let location: WeatherLocationChoice;
  try {
    location = weatherLocationChoiceSchema.parse(
      await resolver(value.locationId, controller.signal),
    );
  } finally {
    clearTimeout(timer);
  }
  if (location.id !== value.locationId)
    throw new Error("Provider location mismatch");
  const now = Date.now();
  const changed = await writeTransaction(async (tx) => {
    const old = (
      await tx.execute(
        "SELECT revision,location_json FROM weather_settings WHERE id=1",
      )
    ).rows[0];
    if (Number(old.revision) !== value.expectedRevision)
      throw new RevisionConflict();
    const prior = old.location_json
      ? weatherLocationChoiceSchema.parse(JSON.parse(String(old.location_json)))
      : null;
    if (prior?.id === location.id) return false;
    const updated = await tx.execute({
      sql: "UPDATE weather_settings SET revision=revision+1,location_json=?,updated_at=? WHERE id=1 AND revision=?",
      args: [JSON.stringify(location), now, value.expectedRevision],
    });
    if (updated.rowsAffected !== 1) throw new RevisionConflict();
    await tx.execute({
      sql: "UPDATE weather_cache SET location_revision=?,observation_json=NULL,data_at=NULL,fetched_at=NULL,last_job_at=NULL,next_attempt_at=0,lease_owner=NULL,lease_expires_at=NULL,last_error_code=NULL WHERE id=1",
      args: [value.expectedRevision + 1],
    });
    if (weatherEnabled())
      for (const id of weatherDeviceIds())
        await enqueueDeviceWeather(tx, id, now);
    return true;
  });
  return { settings: await readWeatherSettings(), changed };
}
