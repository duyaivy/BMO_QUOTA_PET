import type { FixtureCollector } from "./index.js";
import type { CollectorConfig } from "./types.js";
import type { StatuslineSpool } from "./statusline-spool.js";

export async function drainStatuslines(
  config: CollectorConfig,
  collector: FixtureCollector,
  spool: StatuslineSpool,
) {
  let committed = 0;
  const packets = spool.pending();
  for (const packet of packets) {
    if (
      packet.ownershipGeneration !==
      config.providers[packet.providerId]?.generation
    )
      spool.discard(packet.id);
  }
  for (const packet of packets
    .filter(
      (p) =>
        p.ownershipGeneration === config.providers[p.providerId]?.generation &&
        config.providers[p.providerId]?.enabled &&
        config.nativeStatuslines?.[p.providerId]?.subscriptionQuotaConfirmed ===
          true,
    )
    .slice(0, 16)) {
    // A removed/disabled callback remains local until expiry. It cannot upload
    // as another provider or silently change ownership.
    if (
      !config.providers[packet.providerId]?.enabled ||
      config.nativeStatuslines?.[packet.providerId]
        ?.subscriptionQuotaConfirmed !== true
    )
      continue;
    const result = await collector.captureQuota(
      packet.providerId,
      packet.quota,
      packet.collectedAt,
      undefined,
      {
        sourceVersion: packet.sourceVersion,
        recordAt: packet.collectedAt,
        freshnessBasis: "session_snapshot",
      },
    );
    if (["QUEUED", "DUPLICATE", "OLDER_SOURCE_RECORD"].includes(result.code)) {
      spool.acknowledge(packet.id);
      committed++;
    } else if (result.code === "QUEUE_FULL") break;
    else throw new Error("CALLBACK_QUEUE_REJECTED");
  }
  return { committed, ...spool.inspect() };
}

export async function probeStatuslineVersion(
  provider: "claude" | "antigravity",
) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  try {
    const { stdout } = await promisify(execFile)(
      provider === "claude" ? "claude" : "agy",
      ["--version"],
      { timeout: 2000, maxBuffer: 1024 },
    );
    const trimmed = stdout.trim();
    if (
      (provider === "claude" && trimmed === "2.1.299 (Claude Code)") ||
      (provider === "antigravity" &&
        (trimmed === "1.4.9" || trimmed === "1.5.1"))
    )
      return;
  } catch {}
  throw new Error("SCHEMA_UNSUPPORTED");
}
