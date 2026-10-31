// Synthetic Phase 1 fixtures. These are not verified provider observations.
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  signingInput,
  type UsageEvent,
  type QuotaWindow,
} from "@/contracts/usage";
export const FIXTURE_KEY = "b".repeat(64);
export type Observation = Extract<UsageEvent, { kind: "observation" }>;
export function fixtureWindow(
  windowId = "dynamic.bucket",
  usedPercent: number | null = 35,
  collectedAt = new Date(Date.now() - 1000).toISOString(),
  extra: Partial<QuotaWindow> = {},
): QuotaWindow {
  return {
    windowId,
    label: "Synthetic " + windowId,
    windowDurationSeconds: null,
    usedPercent,
    remainingPercent: usedPercent === null ? null : 100 - usedPercent,
    resetAt: null,
    dataStatus: "ok",
    collectedAt,
    upstreamObservedAt: collectedAt,
    freshnessBasis: "upstream_timestamp",
    sourceFreshness: "fresh",
    ...extra,
  };
}
export function observation(extra: Partial<Observation> = {}): Observation {
  const collectedAt = new Date(Date.now() - 1000).toISOString();
  return {
    schemaVersion: 1,
    kind: "observation",
    collectorId: "fixture-collector",
    eventId: randomUUID(),
    providerId: "codex",
    sourceType: "codex-session-jsonl",
    sourceVersion: "synthetic-v1",
    ownershipGeneration: 2,
    sequence: 1,
    collectedAt,
    upstreamObservedAt: collectedAt,
    sourceAvailability: "available",
    dataStatus: "ok",
    errorCode: null,
    freshnessBasis: "upstream_timestamp",
    sourceFreshness: "fresh",
    snapshotMode: "partial",
    windows: [fixtureWindow("dynamic.bucket", 35, collectedAt)],
    ...extra,
  };
}
export function heartbeat(
  extra: Partial<Extract<UsageEvent, { kind: "heartbeat" }>> = {},
): UsageEvent {
  const { windows: _windows, snapshotMode: _mode, ...common } = observation();
  void _windows;
  void _mode;
  return {
    ...common,
    kind: "heartbeat",
    upstreamObservedAt: null,
    freshnessBasis: "unknown",
    sourceFreshness: "unknown",
    lastSourceEventAt: null,
    ...extra,
  };
}
export function signedRequest(
  event: unknown,
  options: {
    raw?: string;
    nonce?: string;
    timestamp?: number;
    keyId?: string;
    secret?: string;
    path?: string;
    headers?: Record<string, string>;
    stream?: boolean;
  } = {},
) {
  const identity = event as UsageEvent;
  const body = options.raw ?? JSON.stringify(event);
  const keyId = options.keyId ?? "fixture-key",
    timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000)),
    nonce = options.nonce ?? randomBytes(16).toString("hex");
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const signature = createHmac(
    "sha256",
    Buffer.from(options.secret ?? FIXTURE_KEY, "hex"),
  )
    .update(
      signingInput({
        keyId,
        timestamp,
        nonce,
        collectorId: identity.collectorId,
        eventId: identity.eventId,
        bodyHash,
      }),
    )
    .digest("hex");
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 4096)
        controller.enqueue(bytes.slice(i, i + 4096));
      controller.close();
    },
  });
  return new Request(
    "http://127.0.0.1:3000" + (options.path ?? "/api/internal/usage/ingest"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BMO-Key-Id": keyId,
        "X-BMO-Timestamp": timestamp,
        "X-BMO-Nonce": nonce,
        "X-BMO-Signature": signature,
        "Idempotency-Key": identity.eventId,
        ...options.headers,
      },
      body: options.stream ? stream : body,
      ...(options.stream ? { duplex: "half" } : {}),
    } as RequestInit,
  );
}
