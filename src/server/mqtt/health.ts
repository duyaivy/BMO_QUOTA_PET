import "server-only";
import { randomUUID } from "node:crypto";
import { MqttClient, MqttError } from "./publisher";
import { getMqttConfig } from "./config";

export interface MqttHealth {
  state: "unconfigured" | "connected" | "failed";
  checkedAt: number;
  durationMs: number;
  errorCode: string | null;
}

/** Bounded, read-only MQTT handshake. Never returns credentials or raw errors. */
export async function checkMqttHealth(options?: {
  timeoutMs?: number;
}): Promise<MqttHealth> {
  const start = Date.now();
  const result = (
    state: MqttHealth["state"],
    errorCode: string | null = null,
  ): MqttHealth => ({
    state,
    checkedAt: Date.now(),
    durationMs: Date.now() - start,
    errorCode,
  });
  if (!process.env.MQTT_HOST?.trim()) return result("unconfigured");

  let client: MqttClient;
  try {
    client = new MqttClient(
      getMqttConfig({
        // A probe must not evict an active publisher with the configured client ID.
        clientId: `bmo-health-${randomUUID()}`,
        connectTimeoutMs: options?.timeoutMs ?? 3000,
      }),
    );
  } catch {
    return result("failed", "CONFIG_INVALID");
  }
  try {
    await client.checkConnection();
    return result("connected");
  } catch (error) {
    return result(
      "failed",
      error instanceof MqttError ? error.code : "CONNECTION_FAILED",
    );
  }
}
