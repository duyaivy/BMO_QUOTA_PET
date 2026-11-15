import { describe, expect, it } from "vitest";
import {
  searchWeatherLocations,
  resolveWeatherLocation,
} from "@/server/weather/locations";

describe("Open-Meteo location boundary", () => {
  it("normalizes distinct provider places and rejects redirects", async () => {
    const requests: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      requests.push(String(input));
      const places = [
        {
          id: 1,
          name: "Springfield",
          admin1: "Illinois",
          country: "United States",
          country_code: "US",
          latitude: 39.78,
          longitude: -89.64,
          timezone: "America/Chicago",
        },
        {
          id: 2,
          name: "Springfield",
          admin1: "Missouri",
          country: "United States",
          country_code: "US",
          latitude: 37.21,
          longitude: -93.29,
          timezone: "America/Chicago",
        },
      ];
      return new Response(
        JSON.stringify(
          String(input).includes("/get?") ? places[0] : { results: places },
        ),
        { headers: { "content-type": "application/json" } },
      );
    };
    const results = await searchWeatherLocations(
      "Springfield",
      new AbortController().signal,
      fetchImpl as typeof fetch,
    );
    expect(results.map((x) => x.admin1)).toEqual(["Illinois", "Missouri"]);
    expect(requests[0]).toContain("count=5");
    expect(requests[0]).toContain("language=vi");
    await expect(
      resolveWeatherLocation(
        1,
        new AbortController().signal,
        fetchImpl as typeof fetch,
      ),
    ).resolves.toMatchObject({ id: 1 });
  });
  it("bounds query and upstream response", async () => {
    const signal = new AbortController().signal;
    await expect(searchWeatherLocations("ab", signal)).rejects.toThrow();
    await expect(
      searchWeatherLocations("x".repeat(101), signal),
    ).rejects.toThrow();
    await expect(
      searchWeatherLocations(
        "valid",
        signal,
        async () => new Response("x".repeat(32769)),
      ),
    ).rejects.toThrow();
    await expect(
      searchWeatherLocations("valid", signal, async () =>
        Response.redirect("https://evil.test"),
      ),
    ).rejects.toThrow();
  });
});
