import type { UsageEvent } from "../../src/contracts/usage/index.js";
export type { UsageEvent };
export type ProviderId = "codex" | "claude" | "antigravity";
export type CollectorConfig = {
  evidenceMode?: "fixture" | "native";
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
  nativeStatuslines?: {
    claude?: { version: "2.1.299"; subscriptionQuotaConfirmed?: boolean };
    antigravity?: {
      version: "1.4.9" | "1.5.1";
      subscriptionQuotaConfirmed?: boolean;
    };
  };
  nativeCodex?: { sessionDirectory: string; version: "0.163.0" };
};
export type CaptureResult = { code: string; queued: boolean };
export type Diagnostics = {
  pending: number;
  bytes: number;
  dropped: number;
  pausedSources: string[];
};
