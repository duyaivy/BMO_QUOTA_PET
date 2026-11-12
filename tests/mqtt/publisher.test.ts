import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockMqttBroker } from "../fixtures/mqtt-broker";
import { MqttClient } from "@/server/mqtt/publisher";

describe("MQTT Publisher Adapter", () => {
  let broker: MockMqttBroker;
  let brokerPort: number;

  beforeEach(async () => {
    broker = new MockMqttBroker();
    brokerPort = await broker.start();
  });

  afterEach(async () => {
    await broker.stop();
  });

  it("publishes QoS 1 retained message successfully and verifies PUBACK", async () => {
    const client = new MqttClient({
      host: "127.0.0.1",
      port: brokerPort,
      useTls: false,
      clientId: "test-publisher",
    });

    const topic = "bmo/v1/devices/bmo-local/config";
    const payload = JSON.stringify({
      schemaVersion: 1,
      deviceId: "bmo-local",
      revision: 1,
      updatedAt: new Date().toISOString(),
      screens: [{ screenId: "pet-home", kind: "pet" }],
    });

    const result = await client.publish({
      topic,
      payload,
      qos: 1,
      retain: true,
    });

    expect(result.topic).toBe(topic);
    expect(result.qos).toBe(1);
    expect(result.retained).toBe(true);
    expect(result.bytesWritten).toBe(Buffer.byteLength(payload));

    // Verify mock broker state
    expect(broker.publishedMessages).toHaveLength(1);
    const received = broker.publishedMessages[0];
    expect(received.topic).toBe(topic);
    expect(received.payload.toString("utf8")).toBe(payload);
    expect(received.qos).toBe(1);
    expect(received.retain).toBe(true);

    // Verify retained storage
    expect(broker.retainedMessages.has(topic)).toBe(true);
  });

  it("publishes multiple messages in a single session with publishBatch", async () => {
    const client = new MqttClient({
      host: "127.0.0.1",
      port: brokerPort,
      useTls: false,
      clientId: "test-publisher-batch",
    });

    const topic1 = "bmo/v1/devices/bmo-local/config";
    const topic2 = "bmo/v1/devices/bmo-local/snapshot";
    const payload1 = JSON.stringify({ config: 1 });
    const payload2 = JSON.stringify({ snapshot: 1 });

    const results = await client.publishBatch([
      { topic: topic1, payload: payload1, qos: 1, retain: true },
      { topic: topic2, payload: payload2, qos: 1, retain: true },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].topic).toBe(topic1);
    expect(results[1].topic).toBe(topic2);

    expect(broker.publishedMessages).toHaveLength(2);
    expect(broker.retainedMessages.has(topic1)).toBe(true);
    expect(broker.retainedMessages.has(topic2)).toBe(true);
  });

  it("fails cleanly when broker refuses connection", async () => {
    await broker.stop();
    // Restart broker that refuses connection with return code 4 (bad credentials)
    broker = new MockMqttBroker({ connackCode: 4 });
    brokerPort = await broker.start();

    const client = new MqttClient({
      host: "127.0.0.1",
      port: brokerPort,
      useTls: false,
      connectTimeoutMs: 1000,
    });

    await expect(
      client.publish({
        topic: "bmo/v1/devices/bmo-local/config",
        payload: "{}",
      }),
    ).rejects.toThrow(
      "MQTT connection refused by broker: Bad user name or password",
    );
  });

  it("times out when broker does not respond with PUBACK", async () => {
    await broker.stop();
    broker = new MockMqttBroker({ simulatePubackTimeout: true });
    brokerPort = await broker.start();

    const client = new MqttClient({
      host: "127.0.0.1",
      port: brokerPort,
      useTls: false,
      publishTimeoutMs: 200,
    });

    await expect(
      client.publish({
        topic: "bmo/v1/devices/bmo-local/config",
        payload: "{}",
        qos: 1,
      }),
    ).rejects.toThrow("Read deadline exceeded");
  });

  it("rejects oversized payloads before attempting connection", async () => {
    const client = new MqttClient({
      host: "127.0.0.1",
      port: brokerPort,
      useTls: false,
    });

    const hugePayload = Buffer.alloc(10000, "x");
    await expect(
      client.publish({
        topic: "bmo/v1/devices/bmo-local/snapshot",
        payload: hugePayload,
      }),
    ).rejects.toThrow("MQTT payload exceeds 8192 bytes");

    // Broker should have received no connections or messages
    expect(broker.publishedMessages).toHaveLength(0);
  });
});
