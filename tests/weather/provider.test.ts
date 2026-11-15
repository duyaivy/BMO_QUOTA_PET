import { describe, expect, it } from "vitest";
import { fetchCurrentWeather } from "@/server/weather/provider";
const location = { latitude: 16.06, longitude: 108.22, revision: 2 };
const reply = {
  current_units: { temperature_2m: "°C" },
  current: {
    time: "2026-11-15T00:00",
    temperature_2m: 28.4,
    weather_code: 61,
    is_day: 1,
  },
};
describe("Open-Meteo current weather", () => {
  it("maps source time and WMO condition", async () => {
    const urls: string[] = [];
    const observation = await fetchCurrentWeather(
      location,
      new AbortController().signal,
      async (input) => {
        urls.push(String(input));
        return Response.json(reply);
      },
    );
    expect(observation).toEqual({
      temperatureC: 28.4,
      condition: "rain",
      isDay: true,
      dataAt: "2026-11-15T00:00:00.000Z",
    });
    expect(urls[0]).toContain("timezone=UTC");
  });
  it("rejects malformed units, body and provider errors", async () => {
    const signal = new AbortController().signal;
    await expect(
      fetchCurrentWeather(location, signal, async () =>
        Response.json({ ...reply, current_units: { temperature_2m: "°F" } }),
      ),
    ).rejects.toThrow();
    await expect(
      fetchCurrentWeather(
        location,
        signal,
        async () => new Response("x".repeat(32769)),
      ),
    ).rejects.toThrow();
    await expect(
      fetchCurrentWeather(
        location,
        signal,
        async () => new Response("busy", { status: 429 }),
      ),
    ).rejects.toThrow();
  });
});
