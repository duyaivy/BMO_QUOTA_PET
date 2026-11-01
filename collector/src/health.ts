import type { CollectorHealth } from "../../src/contracts/usage/index.js";
import type { FixtureCollector } from "./index.js";
import type { StatuslineSpool } from "./statusline-spool.js";

export function uploadCode(code: string): CollectorHealth["lastUploadCode"] {
  if (
    ["ACKNOWLEDGED", "NETWORK_RETRY", "REQUEST_TIME_INVALID", "EMPTY"].includes(
      code,
    )
  )
    return code as CollectorHealth["lastUploadCode"];
  return "RETRYING";
}
export async function sampleHealth(
  collector: FixtureCollector,
  spool: StatuslineSpool | undefined,
  lastUploadCode: CollectorHealth["lastUploadCode"],
  sourceCode: CollectorHealth["sourceCode"],
): Promise<CollectorHealth> {
  const queue = await collector.inspect();
  let callbacks: {
    pending: number | null;
    bytes: number | null;
    dropped: number | null;
  } = { pending: null, bytes: null, dropped: null };
  try {
    if (spool) callbacks = spool.inspect();
  } catch {}
  return {
    queuePending: queue.pending,
    queueBytes: queue.bytes,
    dropped: queue.dropped,
    pausedSources: queue.pausedSources as CollectorHealth["pausedSources"],
    callbackPending: callbacks.pending,
    callbackBytes: callbacks.bytes,
    callbackDropped: callbacks.dropped,
    nextRetryAt: await collector.nextRetryAt(),
    lastUploadCode: queue.pausedSources.length ? "PAUSED" : lastUploadCode,
    sourceCode,
  };
}
