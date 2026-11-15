import "server-only";
import { z } from "zod";
import {
  weatherLocationChoiceSchema,
  type WeatherLocationChoice,
} from "@/contracts/weather";

const entry = z
  .object({
    id: z.number().int().positive().safe(),
    name: z.string(),
    admin1: z.string().optional(),
    country: z.string().optional(),
    country_code: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string(),
  })
  .passthrough();
const searchResult = z
  .object({ results: z.array(entry).optional() })
  .passthrough();
function normalize(value: z.infer<typeof entry>): WeatherLocationChoice {
  return weatherLocationChoiceSchema.parse({
    provider: "open-meteo",
    id: value.id,
    name: value.name,
    admin1: value.admin1 ?? null,
    country: value.country ?? null,
    countryCode: value.country_code,
    latitude: value.latitude,
    longitude: value.longitude,
    timezone: value.timezone,
  });
}
async function readProvider(
  url: URL,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 5000);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "manual",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok || (response.status >= 300 && response.status < 400))
      throw new Error("Weather provider unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty provider response");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > 32768) {
          await reader.cancel();
          throw new Error("Provider response too large");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
export async function searchWeatherLocations(
  query: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherLocationChoice[]> {
  const q = query.trim();
  if (q.length < 3 || q.length > 100)
    throw new SyntaxError("Invalid location query");
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "vi");
  url.searchParams.set("format", "json");
  try {
    return (
      searchResult
        .parse(await readProvider(url, signal, fetchImpl))
        .results?.map(normalize) ?? []
    );
  } catch (error) {
    if (error instanceof SyntaxError) throw error;
    throw new Error("Weather location provider unavailable", { cause: error });
  }
}
export async function resolveWeatherLocation(
  id: number,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherLocationChoice> {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new SyntaxError("Invalid location ID");
  const url = new URL("https://geocoding-api.open-meteo.com/v1/get");
  url.searchParams.set("id", String(id));
  let value: z.infer<typeof entry>;
  try {
    value = entry.parse(await readProvider(url, signal, fetchImpl));
  } catch (error) {
    throw new Error("Weather location provider unavailable", { cause: error });
  }
  if (value.id !== id) throw new Error("Provider location mismatch");
  return normalize(value);
}
