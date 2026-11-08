import { loadEnvConfig } from "@next/env";
import { checkMqttHealth } from "../src/server/mqtt/health";

// Use the same env precedence as Next.js without printing configuration values.
async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const health = await checkMqttHealth();
  console.log(
    JSON.stringify(
      {
        ...health,
        checkedAt: new Date(health.checkedAt).toISOString(),
        usernameConfigured: Boolean(process.env.MQTT_USERNAME),
        passwordConfigured: Boolean(process.env.MQTT_PASSWORD),
      },
      null,
      2,
    ),
  );
  if (health.state !== "connected") process.exitCode = 1;
}
void main().catch(() => {
  console.error("MQTT check failed");
  process.exitCode = 1;
});
