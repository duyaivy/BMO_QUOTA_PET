import "server-only";
import { z } from "zod";
import { weatherConditionSchema } from "@/contracts/weather";
export interface WeatherLocation {
  latitude: number;
  longitude: number;
  revision: number;
}
export interface WeatherObservation {
  temperatureC: number;
  condition: z.infer<typeof weatherConditionSchema>;
  isDay: boolean;
  dataAt: string;
}
const responseSchema = z
  .object({
    current_units: z.object({ temperature_2m: z.literal("°C") }).passthrough(),
    current: z
      .object({
        time: z.string(),
        temperature_2m: z.number().finite().min(-100).max(70),
        weather_code: z.number().int(),
        is_day: z.union([z.literal(0), z.literal(1)]),
      })
      .passthrough(),
  })
  .passthrough();
function condition(code: number): WeatherObservation["condition"] {
  if (code === 0) return "clear";
  if ([1, 2].includes(code)) return "partly_cloudy";
  if (code === 3) return "cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "unknown";
}
export async function fetchCurrentWeather(
  location: WeatherLocation,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherObservation> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("current", "temperature_2m,weather_code,is_day");
  url.searchParams.set("timezone", "UTC");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 5000);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "manual",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok || (response.status >= 300 && response.status < 400))
      throw new Error("Weather provider unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty weather response");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.length;
        if (bytes > 32768) {
          await reader.cancel();
          throw new Error("Weather response too large");
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }
    const value = responseSchema.parse(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      ),
    );
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value.current.time))
      throw new Error("Invalid weather timestamp");
    const dataAt = new Date(`${value.current.time}Z`);
    if (Number.isNaN(dataAt.valueOf()))
      throw new Error("Invalid weather timestamp");
    return {
      temperatureC: value.current.temperature_2m,
      condition: condition(value.current.weather_code),
      isDay: value.current.is_day === 1,
      dataAt: dataAt.toISOString(),
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
