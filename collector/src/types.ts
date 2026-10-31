import type { UsageEvent } from "../../src/contracts/usage/index.js";
export type { UsageEvent };
export type ProviderId = "codex" | "claude" | "antigravity";
export type CollectorConfig = {
  collectorId: string;
  keyId: string;
  secretFile: string;
  url: string;
  stateDirectory: string;
  allowLocalHttp?: boolean;
  providers: Partial<
    Record<ProviderId, { enabled: boolean; generation: number }>
  >;
  maxQueueBytes?: number;
  maxAgeMs?: number;
  timeoutMs?: number;
};
export type CaptureResult = { code: string; queued: boolean };
export type Diagnostics = {
  pending: number;
  bytes: number;
  dropped: number;
  pausedSources: string[];
};
