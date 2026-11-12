import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
import { drainOutbox } from "../src/server/mqtt/drain";

async function main() {
  console.log("Draining outbox to MQTT...");
  const res = await drainOutbox({ nowMs: Date.now() });
  console.log("DRAIN RESULT:", JSON.stringify(res, null, 2));
}

void main();
