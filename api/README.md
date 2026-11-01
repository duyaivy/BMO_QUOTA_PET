# Local quota ingestion contract

Executable shape: `src/contracts/usage/index.ts`. Architecture sections 6–7 specify signing, ownership and ordering. `tests/fixtures/usage.ts` supplies runnable signed synthetic requests. These sources serve the local contract; no generated specification or cloud workspace is needed.

POST /api/internal/usage/ingest accepts one strict version-1 quota-only observation or heartbeat, max 32 KiB exact raw UTF-8 bytes. Rejects query strings, alternative path encodings, compressed bodies, browser Origin, duplicate keys, unknown fields and nesting beyond 12. Dynamic windows carry their own capture/evidence timestamps and nullable values.

Required headers: X-BMO-Key-Id, X-BMO-Timestamp (integer Unix seconds), X-BMO-Nonce (fresh lowercase hex, ≥128 random bits), X-BMO-Signature (lowercase SHA256 HMAC), Idempotency-Key (body UUID eventId). Sign these LF-separated lines without a trailing LF:

```text
BMO-INGEST-V1
POST
/api/internal/usage/ingest
<keyId>
<collectorId>
<timestamp>
<nonce>
<eventId>
<lowercase SHA256 of exact raw body>
```

Request skew ±300 seconds. New event capture age ≤24 hours; cached per-window evidence may be older and stays stale. Exact receipts may be acknowledged later after current auth/ownership/replay checks. Nonces retained ≥15 minutes, receipts ≥7 days. Same event/body with new nonce is duplicate; changed body conflicts. Complete snapshots need server-owned approval; fixtures default to partial. Heartbeats affect health only.

Success 200: `{data:{eventId,outcome,receivedAt},requestId}`. accepted/duplicate/superseded promises persistence only; duplicate keeps original receipt time.
Failure: `{error:{code,message,retryable},requestId}`. 400 input/time/age; 401 auth/request clock; 403 revoked/disabled/policy; 409 replay/idempotency/sequence/ownership; 413 size; 415 media; 429 throttle with Retry-After; 503 temporary failure. Retry network/429/transient failures with immutable body and new authentication. Auth/policy failures need correction.

## Synthetic local setup

Put a distinct random 32-byte lowercase-hex BMO secret under a chosen key ID in ignored BMO_INGEST_KEYS_JSON server configuration. No secrets enter SQLite. Never reuse owner/session/provider secrets.

Temporarily set BMO_ALLOW_FIXTURE_SETUP=true on the local file DB, then run:

```sh
pnpm fixture:enroll fixture-collector fixture-key codex
```

Repeat for other fixture providers. Save returned ownershipGeneration in collector config; disable setup afterward. Re-enrollment advances generation and clears that provider projection, rejecting old queued events. Revoked identities are not reactivated. Provider verification stays unverified; native CLIs are untouched.

Semantic dedup is SHA256 of UTF-8 `semanticInput(event)`, version 1. Object keys/windows are sorted; event IDs, sequences and capture clocks are excluded; meaningful upstream evidence remains. Raw-body SHA256 serves separate transport/idempotency purposes.

## Protected application configuration

GET /api/dashboard and GET /api/devices/config require a nonexpired, nonrevoked owner session and return no-store persisted application data. Collector signatures never grant admin access.

POST /api/settings/providers accepts strict JSON {providerId, enabled, expectedRevision}; the revision belongs to app settings. POST /api/devices/config accepts {name, screens, expectedRevision}; the device has its own revision. Both require matching Origin, the owner cookie and X-CSRF-Token from /api/auth/csrf, and bound raw JSON to 8 KiB. Device screens are at most 16; pet-home/PET is fixed first, remaining screens reference provider/window IDs. Unknown window references remain unavailable in the preview.

Success is {data,requestId}; failures use {error:{code,message},requestId}. Stale revisions return 409 without partial changes. A device editor conflict preserves local edits and requires an explicit second save against the refreshed revision. Configuration success means local persistence, not MQTT delivery or hardware output.

## Native local enrollment (Phase 2)

`pnpm collector:enroll <collector-id> <key-id> <provider-id>` is an explicit owner-side setup operation requiring `BMO_ALLOW_NATIVE_SETUP=true` and a `file:` database. It never reads provider credentials or edits native CLI settings. Use a new collector/key and a separate `evidenceMode: native` local state directory; fixture/native collector identities cannot be mixed. It sets authoritative ownership/generation, clears the previous projection, and leaves verification **unverified**. Sender authentication does not establish provider-certified truth. Production enrollment/deployment is outside Phase 2.

## Collector health heartbeats (Phase 2D)

The existing signed `kind: heartbeat` event accepts an optional strict `health` object. Observation events do not accept it. Existing heartbeat senders remain compatible. Health carries only bounded counts and closed codes:

- `queuePending` (0–1,000,000), `queueBytes` (0–1 MiB), `dropped` (0–1,000,000,000), and unique `pausedSources` (at most the three provider IDs).
- `callbackPending` (0–128), `callbackBytes` (0–256 KiB), and `callbackDropped` (0–1,000,000,000), each nullable when the local spool is unknown/unavailable.
- Nullable ISO `nextRetryAt`, closed `lastUploadCode` and `sourceCode` enums defined by [the shared contract](../src/contracts/usage/index.ts). No free-form native errors, paths, source IDs, or callback bodies.

The same raw-body bound, HMAC, nonce, receipt, ownership, and source-time checks apply. Health persists separately by collector/provider. Only the current ownership generation, increasing sequence, and nondecreasing capture time can replace its report; duplicate/lost-ack retries preserve the original sample. Health never modifies quota observations, percentages, provider verification, or freshness. Dashboard health age uses original capture time, not upload receipt time, and old generations are excluded. Future samples show clock uncertainty. Stale health is not proof that a CLI exited.
