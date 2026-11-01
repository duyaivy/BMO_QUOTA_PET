import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";

/** Isolated synthetic app/owner/collector DB. Avoids reusing cloud sequence
 * state when a browser test starts a new private collector identity store. */
export async function startFixtureApp(
  port: number,
): Promise<() => Promise<void>> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/browser-server.ts"],
    {
      env: { ...process.env, BMO_BROWSER_PORT: String(port) },
      stdio: "ignore",
    },
  );
  let spawnFailed = false;
  child.once("error", () => {
    spawnFailed = true;
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null || spawnFailed)
      return;
    const closed = once(child, "close");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    try {
      await closed;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (spawnFailed || child.exitCode !== null)
        throw new Error("FIXTURE_APP_FAILED");
      try {
        if (
          (
            await fetch(`http://127.0.0.1:${port}/api/auth/csrf`, {
              signal: AbortSignal.timeout(500),
            })
          ).ok
        )
          return stop;
      } catch {}
      await sleep(100);
    }
    throw new Error("FIXTURE_APP_TIMEOUT");
  } catch (error) {
    await stop();
    throw error;
  }
}
