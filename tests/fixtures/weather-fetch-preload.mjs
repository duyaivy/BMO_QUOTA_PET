// Loaded only by the isolated production HTTP test process, never by the app.
import { appendFileSync } from "node:fs";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  const log = (kind) => {
    if (process.env.BMO_WEATHER_FIXTURE_LOG)
      appendFileSync(process.env.BMO_WEATHER_FIXTURE_LOG, `${kind}\n`);
  };
  const location = (id) => ({
    id,
    name: id === 12 ? "Đà Nẵng" : "Huế",
    admin1: "Miền Trung",
    country: "Việt Nam",
    country_code: "VN",
    latitude: 16.06,
    longitude: 108.22,
    timezone: "Asia/Ho_Chi_Minh",
  });
  if (url.hostname === "geocoding-api.open-meteo.com") {
    log("geocoder");
    return Response.json(
      url.pathname.endsWith("/search")
        ? { results: [location(12), location(13)] }
        : location(Number(url.searchParams.get("id"))),
    );
  }
  if (url.hostname === "api.open-meteo.com") {
    log("weather");
    return Response.json({
      current_units: { temperature_2m: "°C" },
      current: {
        time: new Date(Math.floor(Date.now() / 60_000) * 60_000)
          .toISOString()
          .slice(0, 16),
        temperature_2m: 28,
        weather_code: 61,
        is_day: 1,
      },
    });
  }
  return originalFetch(input, init);
};
