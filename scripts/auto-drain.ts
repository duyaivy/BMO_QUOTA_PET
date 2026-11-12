import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { drainOutbox } from "../src/server/mqtt/drain";

async function loop() {
  console.log(
    "[Auto-Drain] Starting continuous outbox drain worker (every 5s)...",
  );
  while (true) {
    try {
      const res = await drainOutbox({ nowMs: Date.now(), batchSize: 20 });
      if (res.published > 0) {
        console.log(
          `[Auto-Drain] Published ${res.published} message(s) to Flespi!`,
        );
      }
    } catch (err: unknown) {
      console.error(
        "[Auto-Drain] Error:",
        err instanceof Error ? err.message : String(err),
      );
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

void loop();
