import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "./config.js";
import { FixtureCollector } from "./index.js";
import { StatuslineSpool } from "./statusline-spool.js";
import {
  drainStatuslines,
  probeStatuslineVersion,
} from "./native-statusline.js";
import { codexObserver, probeCodexVersion } from "./native-codex.js";
import { sampleHealth, uploadCode } from "./health.js";
import type {
  CollectorHealth,
  UsageEvent,
} from "../../src/contracts/usage/index.js";
import type { ProviderId } from "./types.js";

async function main() {
  const [path, mode] = process.argv.slice(2);
  if (!path || (mode && mode !== "--once"))
    throw new Error("INVALID_ARGUMENTS");
  const config = await loadConfig(path);
  if (config.evidenceMode !== "native") throw new Error("NATIVE_MODE_REQUIRED");
  if (
    !config.nativeCodex &&
    !config.nativeStatuslines?.claude &&
    !config.nativeStatuslines?.antigravity
  )
    throw new Error("NO_NATIVE_SOURCES");
  const runtime = structuredClone(config);
  const collector = await FixtureCollector.open(config);
  let spool: StatuslineSpool | undefined;
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const sources: Partial<
    Record<
      ProviderId,
      {
        code: CollectorHealth["sourceCode"];
        availability: UsageEvent["sourceAvailability"];
        version: string | null;
      }
    >
  > = {};
  let lastUpload: CollectorHealth["lastUploadCode"] = "UNKNOWN";
  try {
    let observer: ReturnType<typeof codexObserver> | undefined;
    if (config.nativeCodex && config.providers.codex?.enabled) {
      sources.codex = {
        code: "OK",
        availability: "available",
        version: "codex-cli/0.163.0",
      };
      try {
        await probeCodexVersion();
        observer = codexObserver(config, collector);
      } catch {
        sources.codex.code = "SCHEMA_UNSUPPORTED";
        sources.codex.availability = "unsupported";
        sources.codex.version = null;
      }
    }
    if (config.nativeStatuslines) {
      try {
        spool = StatuslineSpool.open(config.stateDirectory);
      } catch {}
      for (const provider of ["claude", "antigravity"] as const) {
        const native = config.nativeStatuslines[provider];
        if (!native || !config.providers[provider]?.enabled) continue;
        const state = (sources[provider] = {
          code: "NO_CALLBACK",
          availability: "unavailable",
          version: `${provider === "claude" ? "claude-code" : "antigravity"}/${native.version}`,
        } as NonNullable<(typeof sources)[typeof provider]>);
        if (!spool) {
          state.code = "STATE_BUSY";
          state.availability = "error";
          continue;
        }
        if (!native.subscriptionQuotaConfirmed) {
          state.code = "POLICY_BLOCKED";
          runtime.providers[provider]!.enabled = false;
          continue;
        }
        try {
          await probeStatuslineVersion(provider);
        } catch {
          state.code = "SCHEMA_UNSUPPORTED";
          state.availability = "unsupported";
          state.version = null;
          runtime.providers[provider]!.enabled = false;
        }
      }
    }
    let lastHealthAt = 0;
    do {
      if (abort.signal.aborted) break;
      if (observer) {
        const result = await observer.scan();
        const source = sources.codex!;
        source.code =
          result.code === "OK"
            ? "OK"
            : result.code === "SCAN_LIMIT_REACHED"
              ? "SCAN_LIMIT_REACHED"
              : result.code === "QUEUE_FULL"
                ? "QUEUE_FULL"
                : "SOURCE_UNAVAILABLE";
        source.availability = [
          "OK",
          "SCAN_LIMIT_REACHED",
          "QUEUE_FULL",
        ].includes(source.code)
          ? "available"
          : "unavailable";
        if (result.records || source.code !== "OK")
          process.stdout.write(
            JSON.stringify({ providerId: "codex", ...result }) + "\n",
          );
      }
      if (spool) {
        try {
          await drainStatuslines(runtime, collector, spool);
          for (const provider of ["claude", "antigravity"] as const) {
            const state = sources[provider];
            if (state && runtime.providers[provider]?.enabled) {
              const at = spool.lastCallbackAt(
                provider,
                config.providers[provider]!.generation,
              );
              const recent =
                at !== null &&
                Date.now() - at >= 0 &&
                Date.now() - at <= 120000;
              state.code = recent ? "OK" : "NO_CALLBACK";
              state.availability = recent ? "available" : "unavailable";
            }
          }
        } catch {
          for (const p of ["claude", "antigravity"] as const)
            if (sources[p]) {
              sources[p]!.code = "STATE_BUSY";
              sources[p]!.availability = "error";
            }
        }
      }
      const now = Date.now();
      if (!lastHealthAt || now - lastHealthAt >= 60000 || now < lastHealthAt) {
        for (const [id, state] of Object.entries(sources)) {
          const provider = id as ProviderId;
          const health = await sampleHealth(
            collector,
            spool,
            lastUpload,
            state.code,
          );
          await collector.healthHeartbeat(
            provider,
            health,
            state.availability,
            state.version,
            now,
          );
        }
        lastHealthAt = now;
      }
      for (let i = 0; i < 8 && !abort.signal.aborted; i++) {
        const result = await collector.uploadOnce();
        if (result.code === "EMPTY") break;
        lastUpload = uploadCode(result.code);
        process.stdout.write(result.code + "\n");
      }
      if (mode === "--once") break;
      await sleep(1000, undefined, { signal: abort.signal }).catch(() => {});
    } while (!abort.signal.aborted);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    try {
      spool?.close();
    } finally {
      await collector.close();
    }
  }
}
void main().catch((error: unknown) => {
  process.stderr.write(
    (error instanceof Error && /^[A-Z_]{1,48}$/.test(error.message)
      ? error.message
      : "COLLECTOR_ERROR") + "\n",
  );
  process.exitCode = 1;
});
