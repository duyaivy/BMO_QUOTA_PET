import { describe, expect, it } from "vitest";
import {
  deviceWeatherSchema,
  parseDeviceWeatherPayload,
  type DeviceWeatherV1,
} from "@/contracts/weather";
import { buildDeviceTopic, parseDeviceTopic } from "@/contracts/mqtt";

const valid = {
  schemaVersion: 1,
  deviceId: "bmo-local",
  revision: 1,
  locationRevision: 1,
  status: "ok",
  condition: "rain",
  temperatureC: 27.5,
  isDay: true,
  dataAt: "2026-11-15T00:00:00.000Z",
  validUntil: "2026-11-15T01:00:00.000Z",
} satisfies DeviceWeatherV1;

describe("weather wire contract", () => {
  it("accepts a bounded current observation and weather topic", () => {
    expect(deviceWeatherSchema.parse(valid)).toEqual(valid);
    expect(parseDeviceTopic(buildDeviceTopic("bmo-local", "weather"))).toEqual({
      deviceId: "bmo-local",
      kind: "weather",
    });
  });
  it("rejects malformed or foreign observations without changing cached value", () => {
    const existing = valid;
    const candidate = { ...valid, revision: 2 };
    expect(
      parseDeviceWeatherPayload(
        JSON.stringify(candidate),
        "bmo-local",
        existing,
      ),
    ).toEqual(candidate);
    for (const change of [
      { deviceId: "other" },
      { schemaVersion: 2 },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
      { locationRevision: 0 },
      { temperatureC: 71 },
      { validUntil: "2026-11-15T02:00:00.000Z" },
      { extra: true },
      { status: "unavailable" },
    ]) {
      expect(
        parseDeviceWeatherPayload(
          JSON.stringify({ ...candidate, ...change }),
          "bmo-local",
          existing,
        ),
      ).toBe(existing);
    }
    expect(
      parseDeviceWeatherPayload(
        JSON.stringify(candidate) + " ".repeat(513),
        "bmo-local",
        existing,
      ),
    ).toBe(existing);
    expect(
      parseDeviceWeatherPayload(
        JSON.stringify({ ...candidate, locationRevision: 1 }),
        "bmo-local",
        { ...existing, locationRevision: 2 },
      ),
    ).toEqual({ ...existing, locationRevision: 2 });
  });
  it("requires unavailable observations to clear weather values", () => {
    expect(
      deviceWeatherSchema.safeParse({
        ...valid,
        status: "unavailable",
        condition: "unknown",
        temperatureC: null,
        isDay: null,
        dataAt: null,
        validUntil: null,
      }).success,
    ).toBe(true);
    expect(
      deviceWeatherSchema.safeParse({
        ...valid,
        status: "unavailable",
        condition: "unknown",
        temperatureC: 27,
        isDay: null,
        dataAt: null,
        validUntil: null,
      }).success,
    ).toBe(false);
  });
});
