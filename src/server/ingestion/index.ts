import "server-only";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Row, Transaction } from "@libsql/client";
import {
  eventSchema,
  safeId,
  signingInput,
  type UsageEvent,
  type QuotaWindow,
} from "@/contracts/usage";
import { writeTransaction } from "@/server/db";
import { parseStrictJson } from "./json";

const PATH = "/api/internal/usage/ingest";
const MAX_BYTES = 32768;
const DAY = 86400000;
class IngestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(code);
  }
}
function fail(code: string, status = 400): never {
  throw new IngestError(code, status);
}
const hash = (body: Uint8Array | string) =>
  createHash("sha256").update(body).digest("hex");
let preauthStart = 0,
  preauthCount = 0;
async function rawBody(request: Request) {
  const url = new URL(request.url);
  if (url.pathname !== PATH || url.search || url.hash) fail("INVALID_PAYLOAD");
  if (request.headers.has("origin")) fail("POLICY_BLOCKED", 403);
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get("content-type") ?? "",
    ) ||
    !["", "identity"].includes(request.headers.get("content-encoding") ?? "")
  )
    fail("UNSUPPORTED_MEDIA_TYPE", 415);
  if (Number(request.headers.get("content-length")) > MAX_BYTES)
    fail("PAYLOAD_TOO_LARGE", 413);
  if (!request.body) fail("INVALID_PAYLOAD");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        fail("PAYLOAD_TOO_LARGE", 413);
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
function secretFor(keyId: string) {
  let mapping: unknown;
  try {
    mapping = parseStrictJson(process.env.BMO_INGEST_KEYS_JSON ?? "{}");
  } catch {
    throw new Error("Invalid ingestion configuration");
  }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping))
    throw new Error("Invalid ingestion configuration");
  const entries = Object.entries(mapping);
  if (
    entries.length > 64 ||
    entries.some(
      ([id, value]) =>
        !safeId.safeParse(id).success ||
        typeof value !== "string" ||
        !/^[a-f0-9]{64}$/.test(value),
    )
  )
    throw new Error("Invalid ingestion configuration");
  const found = entries.find(([id]) => id === keyId);
  if (!found) fail("AUTH_FAILED", 401);
  return Buffer.from(found[1] as string, "hex");
}
function sourceTimes(event: UsageEvent, now: number) {
  const candidates = [
    event,
    ...(event.kind === "observation" ? event.windows : []),
  ];
  for (const value of candidates) {
    if (
      Date.parse(value.collectedAt) > now + 300000 ||
      (value.upstreamObservedAt &&
        Date.parse(value.upstreamObservedAt) > now + 300000)
    )
      fail("INVALID_SOURCE_TIME");
  }
}
function canReplace(
  incoming: { collectedAt: string; upstreamObservedAt: string | null },
  previous: QuotaWindow,
) {
  if (previous.upstreamObservedAt)
    return (
      incoming.upstreamObservedAt !== null &&
      Date.parse(incoming.upstreamObservedAt) >=
        Date.parse(previous.upstreamObservedAt)
    );
  return Date.parse(incoming.collectedAt) >= Date.parse(previous.collectedAt);
}
async function association(
  tx: Transaction,
  keyId: string,
  collectorId: string,
  now: number,
) {
  const result = await tx.execute({
    sql: "SELECT k.collector_id,k.active_from,k.valid_until,k.revoked_at,c.active FROM collector_keys k JOIN collectors c ON c.collector_id=k.collector_id WHERE k.key_id=?",
    args: [keyId],
  });
  const key = result.rows[0];
  if (!key || key.collector_id !== collectorId) fail("AUTH_FAILED", 401);
  if (
    key.revoked_at !== null ||
    Number(key.active) !== 1 ||
    Number(key.active_from) > now ||
    (key.valid_until !== null && Number(key.valid_until) <= now)
  )
    fail("COLLECTOR_REVOKED", 403);
}
async function persist(
  event: UsageEvent,
  keyId: string,
  nonce: string,
  bodyHash: string,
  now: number,
) {
  return writeTransaction(async (tx) => {
    await association(tx, keyId, event.collectorId, now);
    await tx.execute({
      sql: "DELETE FROM ingestion_nonces WHERE expires_at < ?",
      args: [now],
    });
    const provider = (
      await tx.execute({
        sql: "SELECT * FROM provider_config WHERE provider_id=?",
        args: [event.providerId],
      })
    ).rows[0];
    if (!provider || !provider.enabled) fail("SOURCE_DISABLED", 403);
    if (
      provider.authoritative_collector_id !== event.collectorId ||
      provider.source_type !== event.sourceType ||
      Number(provider.ownership_generation) !== event.ownershipGeneration
    )
      fail("SOURCE_OWNERSHIP_CONFLICT", 409);
    if (
      (
        await tx.execute({
          sql: "SELECT 1 FROM ingestion_nonces WHERE key_id=? AND nonce=?",
          args: [keyId, nonce],
        })
      ).rows.length
    )
      fail("REPLAY_DETECTED", 409);
    await tx.execute({
      sql: "INSERT INTO ingestion_nonces(key_id,nonce,accepted_at,expires_at) VALUES(?,?,?,?)",
      args: [keyId, nonce, now, now + 900000],
    });
    const receipt = (
      await tx.execute({
        sql: "SELECT * FROM ingestion_receipts WHERE collector_id=? AND event_id=?",
        args: [event.collectorId, event.eventId],
      })
    ).rows[0];
    if (receipt) {
      if (receipt.body_hash !== bodyHash) fail("IDEMPOTENCY_CONFLICT", 409);
      await tx.execute({
        sql: "UPDATE collectors SET last_seen_at=? WHERE collector_id=?",
        args: [now, event.collectorId],
      });
      return {
        eventId: event.eventId,
        outcome: "duplicate",
        receivedAt: new Date(Number(receipt.received_at)).toISOString(),
      };
    }
    if (now - Date.parse(event.collectedAt) > DAY) fail("EVENT_TOO_OLD");
    if (
      event.kind === "observation" &&
      event.snapshotMode === "complete" &&
      !provider.complete_set_verified
    )
      fail("POLICY_BLOCKED", 403);
    let outcome = "accepted";
    let observationId: string | null = null;
    if (event.kind === "observation") {
      if (
        (
          await tx.execute({
            sql: "SELECT 1 FROM quota_observations WHERE collector_id=? AND provider_id=? AND generation=? AND sequence=?",
            args: [
              event.collectorId,
              event.providerId,
              event.ownershipGeneration,
              event.sequence,
            ],
          })
        ).rows.length
      )
        fail("SEQUENCE_CONFLICT", 409);
      observationId = event.collectorId + ":" + event.eventId;
      await tx.execute({
        sql: "INSERT INTO quota_observations(observation_id,collector_id,provider_id,event_id,generation,sequence,collected_at,upstream_observed_at,received_at,payload) VALUES(?,?,?,?,?,?,?,?,?,?)",
        args: [
          observationId,
          event.collectorId,
          event.providerId,
          event.eventId,
          event.ownershipGeneration,
          event.sequence,
          Date.parse(event.collectedAt),
          event.upstreamObservedAt
            ? Date.parse(event.upstreamObservedAt)
            : null,
          now,
          JSON.stringify(event),
        ],
      });
      for (const window of event.windows)
        await tx.execute({
          sql: "INSERT INTO quota_windows(observation_id,window_id,used_percent,remaining_percent,duration_seconds,reset_at,payload) VALUES(?,?,?,?,?,?,?)",
          args: [
            observationId,
            window.windowId,
            window.usedPercent,
            window.remainingPercent,
            window.windowDurationSeconds,
            window.resetAt ? Date.parse(window.resetAt) : null,
            JSON.stringify(window),
          ],
        });
      if (event.sequence <= Number(provider.latest_sequence))
        outcome = "superseded";
      else {
        const rows = (
          await tx.execute({
            sql: "SELECT * FROM current_windows WHERE provider_id=?",
            args: [event.providerId],
          })
        ).rows;
        const previous = new Map<string, Row>(
          rows.map((row) => [String(row.window_id), row]),
        );
        let replaced = 0;
        for (const window of event.windows) {
          const current = previous.get(window.windowId);
          const prior = current
            ? (JSON.parse(String(current.payload)) as QuotaWindow)
            : null;
          if (
            prior &&
            !canReplace(window, prior) &&
            !(
              window.dataStatus !== "ok" &&
              window.upstreamObservedAt === null &&
              Date.parse(window.collectedAt) >= Date.parse(prior.collectedAt)
            )
          )
            continue;
          if (window.dataStatus !== "ok" && prior) {
            await tx.execute({
              sql: "UPDATE current_windows SET data_status=? WHERE provider_id=? AND window_id=?",
              args: [window.dataStatus, event.providerId, window.windowId],
            });
          } else {
            await tx.execute({
              sql: "INSERT INTO current_windows(provider_id,window_id,observation_id,payload,data_status) VALUES(?,?,?,?,?) ON CONFLICT(provider_id,window_id) DO UPDATE SET observation_id=excluded.observation_id,payload=excluded.payload,data_status=excluded.data_status",
              args: [
                event.providerId,
                window.windowId,
                observationId,
                JSON.stringify(window),
                window.dataStatus,
              ],
            });
          }
          replaced++;
        }
        if (event.dataStatus === "ok" && event.snapshotMode === "complete")
          for (const [id, row] of previous) {
            if (
              !event.windows.some((window) => window.windowId === id) &&
              canReplace(event, JSON.parse(String(row.payload)) as QuotaWindow)
            )
              await tx.execute({
                sql: "DELETE FROM current_windows WHERE provider_id=? AND window_id=?",
                args: [event.providerId, id],
              });
          }
        if (event.windows.length && replaced === 0) outcome = "superseded";
        await tx.execute({
          sql: "UPDATE provider_config SET latest_sequence=?,last_collected_at=CASE WHEN ?='accepted' THEN ? ELSE last_collected_at END,data_status=CASE WHEN ?='accepted' THEN ? ELSE data_status END,error_code=CASE WHEN ?='accepted' THEN ? ELSE error_code END,updated_at=? WHERE provider_id=?",
          args: [
            event.sequence,
            outcome,
            Date.parse(event.collectedAt),
            outcome,
            event.dataStatus,
            outcome,
            event.errorCode,
            now,
            event.providerId,
          ],
        });
      }
    }
    if (event.kind === "heartbeat" && event.health) {
      await tx.execute({
        sql: "INSERT INTO collector_health(collector_id,provider_id,generation,sequence,collected_at,payload) VALUES(?,?,?,?,?,?) ON CONFLICT(collector_id,provider_id) DO UPDATE SET generation=excluded.generation,sequence=excluded.sequence,collected_at=excluded.collected_at,payload=excluded.payload WHERE excluded.generation>collector_health.generation OR (excluded.generation=collector_health.generation AND excluded.sequence>collector_health.sequence AND excluded.collected_at>=collector_health.collected_at)",
        args: [
          event.collectorId,
          event.providerId,
          event.ownershipGeneration,
          event.sequence,
          Date.parse(event.collectedAt),
          JSON.stringify({
            health: event.health,
            sourceAvailability: event.sourceAvailability,
            sourceVersion: event.sourceVersion,
            lastSourceEventAt: event.lastSourceEventAt,
          }),
        ],
      });
    }
    await tx.execute({
      sql: "UPDATE collectors SET last_seen_at=?,last_quota_capture_at=CASE WHEN ? IS NOT NULL THEN MAX(COALESCE(last_quota_capture_at,0),?) ELSE last_quota_capture_at END,last_source_event_at=CASE WHEN ? IS NOT NULL THEN MAX(COALESCE(last_source_event_at,0),?) ELSE last_source_event_at END WHERE collector_id=?",
      args: [
        now,
        event.kind === "observation" ? 1 : null,
        Date.parse(event.collectedAt),
        event.kind === "heartbeat" ? event.lastSourceEventAt : null,
        event.kind === "heartbeat" && event.lastSourceEventAt
          ? Date.parse(event.lastSourceEventAt)
          : null,
        event.collectorId,
      ],
    });
    await tx.execute({
      sql: "INSERT INTO ingestion_receipts(collector_id,event_id,body_hash,provider_id,generation,sequence,observation_id,outcome,received_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      args: [
        event.collectorId,
        event.eventId,
        bodyHash,
        event.providerId,
        event.ownershipGeneration,
        event.sequence,
        observationId,
        outcome,
        now,
        now + 7 * DAY,
      ],
    });
    return {
      eventId: event.eventId,
      outcome,
      receivedAt: new Date(now).toISOString(),
    };
  });
}
export async function ingest(request: Request) {
  const requestId = randomUUID();
  try {
    const now = Date.now();
    if (now - preauthStart > 60000) {
      preauthStart = now;
      preauthCount = 0;
    }
    if (++preauthCount > 600) throw new IngestError("RATE_LIMITED", 429, true);
    const raw = await rawBody(request);
    let body: unknown;
    try {
      body = parseStrictJson(
        new TextDecoder("utf-8", { fatal: true }).decode(raw),
      );
    } catch {
      fail("INVALID_PAYLOAD");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      fail("INVALID_PAYLOAD");
    const identity = body as Record<string, unknown>;
    if (
      !safeId.safeParse(identity.collectorId).success ||
      typeof identity.eventId !== "string" ||
      identity.eventId.length > 128
    )
      fail("INVALID_PAYLOAD");
    const keyId = request.headers.get("X-BMO-Key-Id") ?? "";
    const timestamp = request.headers.get("X-BMO-Timestamp") ?? "";
    const nonce = request.headers.get("X-BMO-Nonce") ?? "";
    const signature = request.headers.get("X-BMO-Signature") ?? "";
    if (
      !safeId.safeParse(keyId).success ||
      !/^\d{10}$/.test(timestamp) ||
      !/^[a-f0-9]{32,128}$/.test(nonce) ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      request.headers.get("Idempotency-Key") !== identity.eventId
    )
      fail("AUTH_FAILED", 401);
    const bodyHash = hash(raw);
    const expected = createHmac("sha256", secretFor(keyId))
      .update(
        signingInput({
          keyId,
          collectorId: identity.collectorId as string,
          timestamp,
          nonce,
          eventId: identity.eventId,
          bodyHash,
        }),
      )
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
      fail("AUTH_FAILED", 401);
    if (Math.abs(Number(timestamp) * 1000 - now) > 300000)
      fail("REQUEST_TIME_INVALID", 401);
    await writeTransaction(async (tx) => {
      await association(tx, keyId, identity.collectorId as string, now);
      const start = Math.floor(now / 60000) * 60000;
      const result = await tx.execute({
        sql: "INSERT INTO rate_limits(scope,subject_hash,window_start,attempts,expires_at) VALUES('ingest',?,?,1,?) ON CONFLICT(scope,subject_hash,window_start) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
        args: [hash(identity.collectorId as string), start, start + 120000],
      });
      return Number(result.rows[0].attempts);
    }).then((count) => {
      if (count > 120) throw new IngestError("RATE_LIMITED", 429, true);
    });
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) fail("INVALID_PAYLOAD");
    sourceTimes(parsed.data, now);
    const data = await persist(parsed.data, keyId, nonce, bodyHash, now);
    return Response.json(
      { data, requestId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const known =
      error instanceof IngestError
        ? error
        : new IngestError("TEMPORARY_FAILURE", 503, true);
    return Response.json(
      {
        error: {
          code: known.code,
          message: known.retryable
            ? "Temporarily unable to persist the event"
            : "Request rejected",
          retryable: known.retryable,
        },
        requestId,
      },
      {
        status: known.status,
        headers: {
          "Cache-Control": "no-store",
          ...(known.status === 429 ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
}
