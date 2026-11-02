import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDbForTests, getDb, writeTransaction } from "@/server/db";
import { saveDevice, retireDevice } from "@/server/devices/repository";
import { drainOutbox } from "@/server/mqtt/drain";
import { MockMqttBroker } from "../fixtures/mqtt-broker";
import { SimulatedDevice } from "../fixtures/device-simulator";
import { MqttClient } from "@/server/mqtt/publisher";
import { ingest } from "@/server/ingestion";
import { enrollFixture } from "@/server/ingestion/enroll";
import { signedRequest, FIXTURE_KEY, observation } from "../fixtures/usage";

describe("End-to-End MQTT Pipeline & Device Simulator", () => {
  let directory: string;
  let broker: MockMqttBroker;
  let brokerPort: number;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "bmo-pipeline-"));
    vi.stubEnv("TURSO_DATABASE_URL", "file:" + join(directory, "test.db"));
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    vi.stubEnv("BMO_APP_ORIGIN", "http://127.0.0.1:3000");
    vi.stubEnv("SESSION_SECRET", "synthetic-test-secret-at-least-32-characters");
    vi.stubEnv(
      "ADMIN_PASSWORD_HASH",
      "$argon2id$v=19$m=65536,t=3,p=4$c3ludGhldGlj$c3ludGhldGlj",
    );
    vi.stubEnv("BMO_ALLOW_FIXTURE_SETUP", "true");
    vi.stubEnv(
      "BMO_INGEST_KEYS_JSON",
      JSON.stringify({ "fixture-key": FIXTURE_KEY }),
    );

    broker = new MockMqttBroker();
    brokerPort = await broker.start();
  });

  afterEach(async () => {
    await broker.stop();
    await closeDbForTests();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("completes full pipeline: config save -> outbox -> drain -> broker -> simulator rendering", async () => {
    const publisher = new MqttClient({
      host: "127.0.0.1",
      port: brokerPort,
      useTls: false,
    });

    const simulator = new SimulatedDevice("bmo-local", brokerPort);

    // 1. Save device configuration (PET home + 1 codex screen)
    await saveDevice({
      deviceId: "bmo-local",
      expectedRevision: 1,
      name: "BMO Desktop",
      screens: [
        { screenId: "pet-home", kind: "pet" },
        {
          screenId: "screen-codex",
          kind: "quota",
          providerId: "codex",
          windowId: "limit_5h",
        },
      ],
    });

    // 2. Drain outbox
    const drainResult = await drainOutbox({ publisher });
    expect(drainResult.published).toBeGreaterThanOrEqual(1);

    // 3. Deliver retained messages to simulator
    for (const msg of broker.publishedMessages) {
      simulator.handlePublishDirect(msg.topic, msg.payload);
    }

    // 4. Verify simulator rendered pages
    const pages = simulator.renderPages();
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual({
      screenId: "pet-home",
      kind: "pet",
      title: "BMO PET",
      usedPercent: null,
      status: "ok",
    });
    // Codex has no observation yet, so rendered as unavailable
    expect(pages[1].status).toBe("unavailable");
    expect(pages[1].usedPercent).toBeNull();
  });

  it("updates simulator with new quota percentages when telemetry is ingested", async () => {
    const publisher = new MqttClient({
      host: "127.0.0.1",
      port: brokerPort,
      useTls: false,
    });
    const simulator = new SimulatedDevice("bmo-local", brokerPort);

    // Setup device with codex screen
    await enrollFixture({
      collectorId: "fixture-collector",
      keyId: "fixture-key",
      name: "Fixture",
      providerId: "codex",
    });

    await saveDevice({
      deviceId: "bmo-local",
      expectedRevision: 1,
      name: "BMO Desktop",
      screens: [
        { screenId: "pet-home", kind: "pet" },
        {
          screenId: "screen-codex",
          kind: "quota",
          providerId: "codex",
          windowId: "limit_5h",
        },
      ],
    });

    // Ingest quota
    const now = Date.now();
    const event = observation({
      providerId: "codex",
      windows: [
        {
          windowId: "limit_5h",
          label: "Codex 5H Rate",
          windowDurationSeconds: 18000,
          usedPercent: 45,
          remainingPercent: 55,
          resetAt: new Date(now + 3600000).toISOString(),
          dataStatus: "ok",
          collectedAt: new Date(now).toISOString(),
          upstreamObservedAt: new Date(now).toISOString(),
          freshnessBasis: "upstream_timestamp",
          sourceFreshness: "fresh",
        },
      ],
    });

    const resp = await ingest(signedRequest(event));
    expect(resp.status).toBe(200);

    // Drain outbox to broker
    await drainOutbox({ publisher });

    // Deliver latest retained messages to simulator
    for (const msg of broker.publishedMessages) {
      simulator.handlePublishDirect(msg.topic, msg.payload);
    }

    const pages = simulator.renderPages(now);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toEqual({
      screenId: "screen-codex",
      kind: "quota",
      title: "Codex 5H Rate",
      usedPercent: 45,
      status: "ok",
    });

    // 5. Test stale rendering when clock advances past validUntil
    const futureClock = now + 900000 + 1000; // past 15-minute freshness deadline
    const stalePages = simulator.renderPages(futureClock);
    expect(stalePages[1].status).toBe("stale");
    expect(stalePages[1].usedPercent).toBe(45);
  });

  it("handles reboot: simulator wipes RAM and recovers retained state from broker", async () => {
    const publisher = new MqttClient({
      host: "127.0.0.1",
      port: brokerPort,
      useTls: false,
    });
    const simulator = new SimulatedDevice("bmo-local", brokerPort);

    await saveDevice({
      deviceId: "bmo-local",
      expectedRevision: 1,
      name: "BMO Desktop",
      screens: [{ screenId: "pet-home", kind: "pet" }],
    });

    await drainOutbox({ publisher });

    // Simulator receives initial messages
    for (const msg of broker.publishedMessages) {
      simulator.handlePublishDirect(msg.topic, msg.payload);
    }
    expect(simulator.renderPages()).toHaveLength(1);

    // Simulator reboots (RAM wiped)
    simulator.activeConfig = null;
    simulator.activeSnapshot = null;
    expect(simulator.renderPages()).toHaveLength(0);

    // Simulator re-subscribes to retained broker state
    for (const [topic, retainedMsg] of broker.retainedMessages.entries()) {
      simulator.handlePublishDirect(topic, retainedMsg.payload);
    }

    // State recovered!
    expect(simulator.renderPages()).toHaveLength(1);
    expect(simulator.renderPages()[0].title).toBe("BMO PET");
  });

  it("clears simulator state when device is retired with tombstones", async () => {
    const publisher = new MqttClient({
      host: "127.0.0.1",
      port: brokerPort,
      useTls: false,
    });
    const simulator = new SimulatedDevice("bmo-local", brokerPort);

    // Initial setup
    await saveDevice({
      deviceId: "bmo-local",
      expectedRevision: 1,
      name: "BMO Desktop",
      screens: [{ screenId: "pet-home", kind: "pet" }],
    });
    await drainOutbox({ publisher });
    for (const msg of broker.publishedMessages) {
      simulator.handlePublishDirect(msg.topic, msg.payload);
    }
    expect(simulator.renderPages()).toHaveLength(1);

    // Retire device
    await retireDevice({
      deviceId: "bmo-local",
      expectedRevision: 2,
    });
    await drainOutbox({ publisher });

    // Deliver tombstones to simulator
    for (const msg of broker.publishedMessages) {
      simulator.handlePublishDirect(msg.topic, msg.payload);
    }

    expect(simulator.isRetired).toBe(true);
    expect(simulator.renderPages()).toHaveLength(0);
  });
});
