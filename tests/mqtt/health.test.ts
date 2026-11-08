import { afterEach, describe, expect, it, vi } from "vitest";
import * as net from "node:net";
import { MockMqttBroker } from "../fixtures/mqtt-broker";
import { checkMqttHealth } from "@/server/mqtt/health";

afterEach(() => vi.unstubAllEnvs());

describe("broker health", () => {
  it("does not report the default localhost as a configured broker", async () => {
    vi.stubEnv("MQTT_HOST", "");
    expect((await checkMqttHealth()).state).toBe("unconfigured");
  });

  it.each([
    [0, "connected", null],
    [4, "failed", "CONNACK_REFUSED"],
  ] as const)(
    "reports MQTT acknowledgement code %i without publishing",
    async (code, state, errorCode) => {
      const broker = new MockMqttBroker({ connackCode: code });
      const port = await broker.start();
      vi.stubEnv("MQTT_HOST", "127.0.0.1");
      vi.stubEnv("MQTT_PORT", String(port));
      vi.stubEnv("MQTT_USE_TLS", "false");
      vi.stubEnv("MQTT_PASSWORD", "private-password");
      try {
        const health = await checkMqttHealth();
        expect(health.state).toBe(state);
        expect(health.errorCode).toBe(errorCode);
        expect(Number.isFinite(health.checkedAt)).toBe(true);
        expect(JSON.stringify(health)).not.toContain("private-password");
        expect(broker.publishedMessages).toHaveLength(0);
      } finally {
        await broker.stop();
      }
    },
  );

  it.each(["70000", "not-a-port"])(
    "returns a safe configuration error for port %s instead of throwing",
    async (port) => {
      vi.stubEnv("MQTT_HOST", "127.0.0.1");
      vi.stubEnv("MQTT_PORT", port);
      expect(await checkMqttHealth()).toMatchObject({
        state: "failed",
        errorCode: "CONFIG_INVALID",
      });
    },
  );

  it("bounds the wait when a TCP listener never acknowledges MQTT", async () => {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as net.AddressInfo;
    vi.stubEnv("MQTT_HOST", "127.0.0.1");
    vi.stubEnv("MQTT_PORT", String(address.port));
    vi.stubEnv("MQTT_USE_TLS", "false");
    try {
      expect(await checkMqttHealth({ timeoutMs: 100 })).toMatchObject({
        state: "failed",
        errorCode: "TIMEOUT",
      });
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
