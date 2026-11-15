import { z } from "zod";
import { safeId } from "../usage";

export const MAX_WEATHER_PAYLOAD_BYTES = 512;
export const weatherConditionSchema = z.enum([
  "clear",
  "partly_cloudy",
  "cloudy",
  "rain",
  "storm",
  "fog",
  "snow",
  "unknown",
]);
const utcTimestamp = z.string().datetime({ offset: false });
const positiveRevision = z.number().int().positive().safe();
export const deviceWeatherSchema = z
  .object({
    schemaVersion: z.literal(1),
    deviceId: safeId,
    revision: positiveRevision,
    locationRevision: positiveRevision,
    status: z.enum(["ok", "unavailable"]),
    condition: weatherConditionSchema,
    temperatureC: z.number().finite().min(-100).max(70).nullable(),
    isDay: z.boolean().nullable(),
    dataAt: utcTimestamp.nullable(),
    validUntil: utcTimestamp.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "unavailable") {
      if (
        value.condition !== "unknown" ||
        value.temperatureC !== null ||
        value.isDay !== null ||
        value.dataAt !== null ||
        value.validUntil !== null
      )
        ctx.addIssue({
          code: "custom",
          message: "Unavailable weather must clear all values",
        });
      return;
    }
    if (
      value.temperatureC === null ||
      value.isDay === null ||
      value.dataAt === null ||
      value.validUntil === null
    )
      ctx.addIssue({
        code: "custom",
        message: "Current weather requires values",
      });
    else if (
      Date.parse(value.validUntil) !==
      Date.parse(value.dataAt) + 60 * 60_000
    )
      ctx.addIssue({
        code: "custom",
        message: "Weather validity must derive from source time",
      });
  });
export type DeviceWeatherV1 = z.infer<typeof deviceWeatherSchema>;

export const weatherLocationChoiceSchema = z
  .object({
    provider: z.literal("open-meteo"),
    id: z.number().int().positive().safe(),
    name: z.string().min(1).max(120),
    admin1: z.string().max(120).nullable(),
    country: z.string().max(120).nullable(),
    countryCode: z.string().length(2),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    timezone: z.string().min(1).max(100),
  })
  .strict();
export type WeatherLocationChoice = z.infer<typeof weatherLocationChoiceSchema>;
export const saveWeatherLocationSchema = z
  .object({
    expectedRevision: positiveRevision,
    locationId: z.number().int().positive().safe(),
  })
  .strict();
export type SaveWeatherLocationInput = z.infer<
  typeof saveWeatherLocationSchema
>;
export const weatherSettingsViewSchema = z
  .object({
    revision: positiveRevision,
    location: weatherLocationChoiceSchema.nullable(),
    status: z.enum(["unconfigured", "pending", "fresh", "stale", "error"]),
    dataAt: utcTimestamp.nullable(),
    fetchedAt: utcTimestamp.nullable(),
    lastJobAt: utcTimestamp.nullable(),
    temperatureC: z.number().finite().min(-100).max(70).nullable(),
    condition: weatherConditionSchema.nullable(),
  })
  .strict();
export type WeatherSettingsView = z.infer<typeof weatherSettingsViewSchema>;

export function parseDeviceWeatherPayload(
  payload: string | Uint8Array,
  expectedDeviceId: string,
  previous: DeviceWeatherV1 | null,
): DeviceWeatherV1 | null {
  const bytes =
    typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  if (bytes.byteLength > MAX_WEATHER_PAYLOAD_BYTES) return previous;
  try {
    const data = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = deviceWeatherSchema.parse(JSON.parse(data));
    if (
      parsed.deviceId !== expectedDeviceId ||
      (previous &&
        (parsed.revision <= previous.revision ||
          parsed.locationRevision < previous.locationRevision))
    )
      return previous;
    return parsed;
  } catch {
    return previous;
  }
}
