import { CodexObserver, type CodexSink } from "./adapters/codex.js";
import { FixtureCollector } from "./index.js";
import type { CollectorConfig } from "./types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export async function probeCodexVersion() {
  try {
    const { stdout } = await promisify(execFile)("codex", ["--version"], {
      timeout: 2000,
      maxBuffer: 1024,
    });
    if (stdout.trim() === "codex-cli 0.163.0") return;
  } catch {}
  throw new Error("SCHEMA_UNSUPPORTED");
}

export function codexObserver(
  config: CollectorConfig,
  collector: FixtureCollector,
) {
  if (
    !config.providers.codex?.enabled ||
    !config.nativeCodex ||
    config.nativeCodex.version !== "0.163.0"
  )
    throw new Error("NATIVE_CODEX_DISABLED");
  const sink: CodexSink = {
    load: (streamId) => collector.nativeCheckpoint("codex", streamId),
    commit: (streamId, cursor, observation) =>
      observation
        ? collector.captureQuota(
            "codex",
            observation.quota,
            undefined,
            undefined,
            {
              sourceVersion: `codex-cli/${config.nativeCodex!.version}`,
              nativeCheckpoint: { streamId, cursor },
              recordAt: observation.recordAt,
            },
          )
        : collector.advanceNative("codex", { streamId, cursor }),
  };
  return new CodexObserver(config.nativeCodex.sessionDirectory, sink);
}
