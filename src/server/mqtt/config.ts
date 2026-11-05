import "server-only";
import { z } from "zod";

export const mqttConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(8883),
  username: z.string().optional(),
  password: z.string().optional(),
  clientId: z.string().min(1).max(128).default("bmo-backend-publisher"),
  useTls: z.boolean().default(true),
  connectTimeoutMs: z.number().int().positive().default(5000),
  publishTimeoutMs: z.number().int().positive().default(5000),
});

export type MqttConfig = z.infer<typeof mqttConfigSchema>;

export function getMqttConfig(overrides?: Partial<MqttConfig>): MqttConfig {
  const host = overrides?.host ?? process.env.MQTT_HOST ?? "localhost";
  const rawPort =
    overrides?.port ??
    (process.env.MQTT_PORT ? Number(process.env.MQTT_PORT) : undefined);
  const port = rawPort !== undefined && !Number.isNaN(rawPort) ? rawPort : 8883;
  const username =
    overrides?.username ?? process.env.MQTT_USERNAME ?? undefined;
  const password =
    overrides?.password ?? process.env.MQTT_PASSWORD ?? undefined;
  const clientId =
    overrides?.clientId ??
    process.env.MQTT_CLIENT_ID ??
    `bmo-pub-${Math.random().toString(36).slice(2, 10)}`;

  // Default to TLS unless explicitly disabled or port 1883 or localhost without explicit TLS
  const rawUseTls = process.env.MQTT_USE_TLS;
  const useTls =
    overrides?.useTls ??
    (rawUseTls !== undefined
      ? rawUseTls === "true" || rawUseTls === "1"
      : port === 8883);

  const connectTimeoutMs = overrides?.connectTimeoutMs ?? 5000;
  const publishTimeoutMs = overrides?.publishTimeoutMs ?? 5000;

  return mqttConfigSchema.parse({
    host,
    port,
    username: username || undefined,
    password: password || undefined,
    clientId,
    useTls,
    connectTimeoutMs,
    publishTimeoutMs,
  });
}
