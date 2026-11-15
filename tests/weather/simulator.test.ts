import { describe, expect, it } from "vitest";
import { SimulatedDevice } from "../fixtures/device-simulator";

const topic = "bmo/v1/devices/bmo-local/weather";
const weather = (revision = 1, locationRevision = 2) => ({
  schemaVersion: 1,
  deviceId: "bmo-local",
  revision,
  locationRevision,
  status: "ok",
  condition: "rain",
  temperatureC: 28.5,
  isDay: true,
  dataAt: "2026-11-15T10:00:00.000Z",
  validUntil: "2026-11-15T11:00:00.000Z",
});

describe("weather retained receiver simulator", () => {
  it("retains newest weather and rejects malformed, oversized, duplicate and old messages", () => {
    const device = new SimulatedDevice("bmo-local", 0);
    device.handlePublishDirect(topic, Buffer.from(JSON.stringify(weather(2))));
    expect(device.activeWeather?.temperatureC).toBe(28.5);
    device.handlePublishDirect(
      topic,
      Buffer.from(JSON.stringify({ ...weather(1), temperatureC: 5 })),
    );
    device.handlePublishDirect(
      topic,
      Buffer.from(JSON.stringify({ ...weather(2), temperatureC: 6 })),
    );
    device.handlePublishDirect(
      topic,
      Buffer.from(JSON.stringify({ ...weather(3), deviceId: "other" })),
    );
    device.handlePublishDirect(topic, Buffer.from("{"));
    device.handlePublishDirect(
      topic,
      Buffer.from(JSON.stringify(weather(3)) + " ".repeat(513)),
    );
    expect(device.activeWeather?.revision).toBe(2);
    expect(device.activeWeather?.temperatureC).toBe(28.5);
  });

  it("weather tombstone clears only weather while config tombstone retires the device", () => {
    const device = new SimulatedDevice("bmo-local", 0);
    device.handlePublishDirect(
      "bmo/v1/devices/bmo-local/config",
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          deviceId: "bmo-local",
          revision: 1,
          updatedAt: "2026-11-15T10:00:00.000Z",
          screens: [{ screenId: "pet-home", kind: "pet" }],
        }),
      ),
    );
    device.handlePublishDirect(topic, Buffer.from(JSON.stringify(weather())));
    device.handlePublishDirect(topic, Buffer.alloc(0));
    expect(device.activeWeather).toBeNull();
    expect(device.isRetired).toBe(false);
    expect(device.activeConfig?.deviceId).toBe("bmo-local");
    device.handlePublishDirect(
      "bmo/v1/devices/bmo-local/config",
      Buffer.alloc(0),
    );
    expect(device.isRetired).toBe(true);
    expect(device.activeConfig).toBeNull();
  });

  it("unavailable at a new location prevents delayed old observation from resurfacing", () => {
    const device = new SimulatedDevice("bmo-local", 0);
    device.handlePublishDirect(topic, Buffer.from(JSON.stringify(weather(2))));
    device.handlePublishDirect(
      topic,
      Buffer.from(
        JSON.stringify({
          ...weather(3, 3),
          status: "unavailable",
          condition: "unknown",
          temperatureC: null,
          isDay: null,
          dataAt: null,
          validUntil: null,
        }),
      ),
    );
    device.handlePublishDirect(topic, Buffer.from(JSON.stringify(weather(2))));
    expect(device.activeWeather?.locationRevision).toBe(3);
    expect(device.activeWeather?.status).toBe("unavailable");
  });
});
