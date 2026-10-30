# BMO Personal — Architecture Decisions

Owner-approved architecture reset · 2026-10-31 · Design contract; no application is implemented.

This is the single authority for architecture and technical contracts. [Scope](PROJECT_SCOPE.md) defines product requirements; [roadmap](IMPLEMENTATION_PHASES.md) defines implementation order. Latest owner instructions take precedence, followed by applicable agent rules, verified constraints, and compatible historical decisions. Historical research is evidence, not execution instructions.

## 1. System overview

BMO Personal monitors available subscription-quota observations from the owner's Codex, Claude Code, and Antigravity CLIs. A personal dashboard and physical BMO desk pet display the latest known values honestly. Near-real-time delivery begins **after an observation becomes available**; it does not guarantee upstream freshness.

One owner, password-only administration, no registration. Requirements: opt-in local observation, dynamic quota windows, explicit freshness/availability, collector health, ordered OLED pages, MQTT delivery, PET home screen, animations, and buttons.

Non-goals: SaaS, tenants, organizations, payments/billing, API-spend or context-window tracking, provider login through BMO, credential extraction, private endpoints, TUI scraping, cloud provider polling, model requests just to obtain quota, VPS migration, or additional backend services.

Major components: official local clients, Local Collector, one Next.js fullstack application, Turso, MQTT outbox, EMQX Cloud, external maintenance scheduler, and future ESP32 firmware.

## 2. System architecture and trust boundaries

~~~mermaid
flowchart TD
  subgraph Mac["Owner's MacBook"]
    C["Codex session JSONL — candidate"] --> A["Read-only source adapters"]
    H["Claude native statusline JSON"] --> A
    G["Antigravity native statusline JSON"] --> A
    A --> N["Allowlist, normalize, validate, deduplicate"]
    N --> Q["Bounded durable offline queue"]
  end
  Q -->|"Authenticated HTTPS; quota only"| I
  subgraph Cloud["Render — one Next.js application"]
    I["Quota ingestion API"] --> DB["Turso: observations, configuration, receipts"]
    UI["Protected admin dashboard"] <--> DB
    DB --> O["Transactional MQTT outbox"]
    O --> P["Bounded MQTT publisher"]
    M["Authenticated maintenance route"] --> O
  end
  S["External scheduler"] -->|"Independent maintenance secret"| M
  P -->|"TLS, scoped publisher"| B["EMQX Cloud"]
  B -->|"Device ACL; versioned retained state"| E["ESP32-CAM + SSD1306 128×64 OLED"]
~~~

- Official clients alone manage provider login, credential persistence, refresh, and reauthentication. Collector code never opens provider credential stores or calls provider authentication endpoints.
- Source input may contain sensitive fields. Adapters immediately construct quota-only objects. Raw callback bodies, JSONL lines, prompts, conversations, local paths, account identifiers, and native session identifiers never enter queue, logs, cloud, or MQTT.
- Collector connections are outbound only. No permanent local HTTP server, remote Mac control channel, or remotely forced provider refresh.
- Next.js owns frontend, protected configuration, ingestion, persistence, and bounded publication. Render disk/memory is disposable; Turso owns cloud durability. The database does not publish MQTT itself.
- Admin, collector, scheduler, and device authentication use separate identities and keys. A valid collector signature authenticates the enrolled sender, not provider-certified truth.
- EMQX transports projected device state. The future ESP32 subscribes/renders; its credential cannot administer BMO, ingest quota, or read another device.

## 3. Technology decisions

| Area | Approved choice and rationale |
|---|---|
| Cloud | Next.js App Router + strict TypeScript, Node runtime: frontend/backend in one deployment; server-only crypto/native dependencies |
| UI | Tailwind CSS + shadcn/ui: reusable accessible components for the personal dashboard |
| Database | Turso SQLite/libSQL + Drizzle ORM: external durability and reviewable migrations |
| Validation | Zod: strict shared contracts and null-safe normalization |
| Admin | Argon2id + iron-session HTTP-only cookie, with revocable database session handle |
| Delivery | HTTPS/HMAC-SHA256 ingestion; MQTT.js over TLS to EMQX Cloud |
| Collector | Node.js + TypeScript, lightweight adapters, bounded local queue; optional owner LaunchAgent |
| Maintenance | External authenticated scheduler, such as cron-job.org, for retries, stale transitions, housekeeping, and recovery |
| Tooling | pnpm with lockfile; Vitest and focused integration tests when introduced |

Pin compatible supported package/runtime versions in Phase 1A/1B; document verified commands then. Proposed layout: cloud under src/app, src/components, src/server/{auth,db,ingestion,quota,mqtt,maintenance}; shared shapes under src/contracts; collector under collector/src; tests under tests and collector/tests; assets under assets or framework-required public; migrations under drizzle; later firmware under firmware. Shared contracts must not import cloud secrets/native dependencies into browser or collector code.

No Redis, Kafka, RabbitMQ, microservices, second web backend, or always-on cloud worker. [Render Free](https://render.com/docs/free) may sleep/restart and lose local changes; retries must be durable and request work bounded.

## 4. Local Collector architecture

### Adapter boundary and pipeline

Each adapter exposes provider/source identity, supported installed-schema versions, a read-only compatibility probe, start/stop observation, quota extraction, and sanitized diagnostics/checkpoints. An async event stream or callback feeds the shared normalization pipeline. Parsing is separate from transport contracts.

Outputs distinguish source availability, quota availability, capture time, upstream evidence, completeness, and local ordering/checkpoint data. Paths and native session IDs stay local; use only BMO-generated opaque IDs if coordinating streams.

1. Observe explicitly enabled owner-authorized sources. Codex tails complete JSONL records; statusline callbacks read bounded stdin and atomically enqueue allowlisted output without waiting for HTTPS.
2. Extract recognized fields by source/schema version. Ignore unknown raw fields; never copy them into output. Reject malformed/oversized records safely.
3. Normalize values, timestamps, identities, and complete/partial snapshot semantics.
4. Deduplicate through a versioned canonical semantic hash: provider/source/generation, sorted window IDs, values, reset/duration, statuses, completeness, and upstream evidence. Exclude transport/callback execution timestamps. Repeated cached state preserves its original capture/evidence time; genuinely newer upstream evidence can be meaningful with unchanged percentages.
5. Atomically assign a persistent sequence, write an immutable event, and advance checkpoint/dedup state. Never advance a cursor before durable enqueue.
6. A single uploader sends in provider order and removes events only after durable cloud acknowledgment.

File watchers are hints: rescan on startup/wake; track file identity/offset; hold incomplete trailing lines; handle rotation/truncation and multiple sessions. First enable establishes a baseline rather than ingesting all historical transcripts. Bounded catch-up preserves original times. Local capture order across sessions is not upstream observation order; ambiguous recency stays unknown.

### Queue, transport, logs, startup, configuration

Defaults: 1 MiB total queue, 24-hour event age, 32 KiB per event. Private atomic files with single-writer/uploader locking suffice; embedded SQLite is optional if needed for atomic durability. Persist sequences/checkpoints/dedup across restarts. Lost identity/sequence state requires a new collector registration.

Expire old entries; coalesce only superseded **never-attempted** snapshots for the same source. Sequence gaps are valid. Never rewrite attempted event bodies/IDs. Queue pressure/drops are visible as bounded counts. Diagnostic quarantine has the same privacy/space bounds.

Retry transient network/5xx/429 failures with exponential backoff/jitter, honoring bounded Retry-After: start at 1 second, cap at 5 minutes, bounded by queue age. Use finite connection/response deadlines and tolerate cold starts. Re-sign every attempt; permanent input/conflict errors need correction; auth/policy failures pause the affected source.

Logs contain only allowlisted codes, counts, timings, queue size, and nonsecret BMO IDs. No raw exception bodies, native input, paths, request bodies, auth headers, or secrets.

Local configuration: ingestion URL, collector/key IDs, protected BMO secret reference, opt-in adapter paths/settings, queue bounds, timeouts. Use an owner-only BMO secret file/store separate from provider state. Validate configuration; never edit native settings silently. Statusline wrappers must preserve existing user commands/output, finish promptly, and support uninstall.

Optional per-user macOS LaunchAgent uses explicit paths and graceful shutdown/restart after owner login; no root service or auto-login. It starts collector/uploader, not a quota-producing CLI session. Closed CLI means no new observations. Do not infer closure from silence alone. Awake/offline Mac can enqueue; sleep/shutdown halts collection/upload. Resume from checkpoints without refreshing old timestamps or generating model activity.

## 5. Provider integration contracts

| Independent fact | Contract |
|---|---|
| Source availability | available, inactive, unavailable, unsupported, error; accessible source does not prove quota |
| Verification | Server-owned unverified, verified, unsupported, with version/evidence note; collector cannot promote itself |
| Quota availability | dataStatus: ok, unavailable, unsupported, error; missing never means zero |
| Capture timestamp | collectedAt: first local capture of this distinct candidate |
| Upstream timestamp | upstreamObservedAt: evidenced quota reading time or null; callback time/file mtime is not a substitute |
| Source freshness | sourceFreshness: fresh, stale, unknown; independent of delivery |
| Upload timestamp | Server receivedAt is operational metadata, never observation time |
| Windows | Dynamic stable bucket/window IDs, nullable durations/resets, partial sets |
| Errors | Closed codes, including SOURCE_INACTIVE, SOURCE_UNAVAILABLE, SCHEMA_UNSUPPORTED, MALFORMED_QUOTA, AUTH_REQUIRED, POLICY_BLOCKED; no raw provider error |

**All three live integrations remain unverified.** Phase 1D uses synthetic parser fixtures only; Phase 2 validates installed interfaces and permitted operation. A working parser/native login is not a successful quota integration. One provider's incompatibility must not block the others.

- **Codex:** preferred candidate is incremental read-only observation of the owner's session JSONL. Possible token_count events containing rate_limits require installed-schema validation in Phase 2A: nesting, buckets, units, reset semantics, timing, and completeness are not verified. Historical app-server RPC fields are not a validated JSONL schema. No app-server polling or private endpoint fallback is selected.
- **Claude Code:** use [native statusline JSON](https://code.claude.com/docs/en/statusline) where installed support exists. Candidate subscription fields: rate_limits.five_hour/seven_day with used_percentage and epoch-second resets_at. Fields can be absent. Repeated callbacks/timers do not establish a new provider fetch. Preserve existing statusline configuration; do not substitute spend, context, or session costs.
- **Antigravity:** use [native statusline JSON](https://antigravity.google/docs/cli/statusline) where supported. Candidate quota buckets: remaining_fraction, remaining_amount, reset_time, reset_in_seconds, optional disabled. Fraction can yield percent; amount alone gives no denominator. Disabled is unavailable, not 100% used. Accept validated absolute resets; derive from relative resets only if a documented trusted reference instant exists, otherwise null. Time until reset is not window duration. Interactive /usage, prompt JSON, hooks, and private local endpoints are not polling APIs.

Prior [PoC results](feasibility/POC_RESULTS.md) captured zero live quota values: Codex app-server failed before a read; no Claude/AGY callback was captured. Historical provider reports retain candidates/security evidence, not the selected collection mechanism.

Applicable provider terms/support may restrict integration even when parsing is feasible. Earlier research did not establish every remote telemetry-forwarding permission. Owner architecture approval does not resolve external restrictions; supported interfaces and applicable permissions remain implementation gates, without credential workarounds.

## 6. Normalized quota data contract — v1

One event covers one provider and server-approved ownership generation. IDs are bounded nonempty strings (max 128 characters, controlled safe character set); labels max 80. Provider IDs: codex, claude, antigravity. Source types: codex-session-jsonl, claude-statusline, antigravity-statusline. UTC ISO 8601 at HTTP/MQTT boundaries; integer epoch milliseconds in SQLite. Sequences/revisions are positive safe integers.

| Field | Semantics |
|---|---|
| schemaVersion, kind | 1; discriminated observation or heartbeat |
| collectorId, eventId | Enrolled BMO collector; immutable UUID event ID |
| providerId, sourceType, sourceVersion | Allowed provider/source; nullable installed version; no metadata bag |
| ownershipGeneration, sequence | Server-issued source generation; persistent increasing provider sequence |
| collectedAt, upstreamObservedAt | Capture and nullable evidenced upstream time |
| sourceAvailability, dataStatus, errorCode | Enums from §5; nullable closed error code |
| freshnessBasis | upstream_timestamp, session_snapshot, unknown |
| sourceFreshness | Evidence classification; cloud conservatively recomputes |
| snapshotMode, windows | Observation only: complete or partial; max 64 distinct windows |
| lastSourceEventAt | Heartbeat only, nullable; no windows/new-quota-read assertion |

Each window: windowId, label, nullable windowDurationSeconds, usedPercent, remainingPercent, resetAt, and dataStatus. Include per-window collectedAt, upstreamObservedAt, freshnessBasis, sourceFreshness so partial updates never freshen untouched buckets. IDs preserve source bucket/limit and window role; labels/durations do not establish identity. Envelope provider owns every window.

- Finite percentages in [0,100]; duration positive or null. Reject numeric strings/booleans. Complement can be computed from a validated percentage. If both percentages exist, sum must equal 100 within 0.01. Missing remains null; no invented denominator, window duration, reset, or source time.
- ok means a valid observation, not freshness or a known percentage. Amount-only buckets can have null percentages; v1 does not upload arbitrary amounts/plan/account metadata.
- complete is allowed only with verified complete-set semantics; missing windows then retire. Otherwise partial updates named buckets only. Missing callback fields/failures do not erase good prior values.
- Error/unavailable/unsupported observations have no replacement windows. Keep previous good values as historical last-known data with the current availability/error state.
- upstream_timestamp requires a validated time tied to the quota reading, not merely its enclosing UI event. Otherwise upstream time is null, basis session_snapshot/unknown, source freshness unknown. Such callbacks cannot assert fresh.
- Cloud derives effective freshness at every read/publish. Default age threshold is configurable, initially 15 minutes. Known source age above threshold is stale. Unknown upstream age displays “source age unknown”; beyond capture-age threshold it is also stale. Heartbeat/upload never advances quota age.
- At/past reset, prior values are expired/unavailable for current quota until a new observation. Keep history; never automatically set usage to zero.

Synthetic examples/fixtures are labeled outside tests. Shared Zod schemas and canonical hash rules belong to Phase 1C; this document defines their required behavior.

## 7. Secure collector-to-cloud communication

### Request contract

**POST /api/internal/usage/ingest**, Node runtime, UTF-8 JSON, max **32 KiB exact raw bytes**, one event per request. Reject query strings, alternative path encodings, compressed bodies, unknown normalized fields, duplicate JSON keys, and excessive nesting. Bound streamed bytes without relying on Content-Length. No browser cookie authentication or cross-origin ingestion.

Headers: X-BMO-Key-Id, X-BMO-Timestamp (integer Unix seconds), X-BMO-Nonce (at least 128 random bits, lowercase hex), X-BMO-Signature (lowercase HMAC-SHA256 hex), Idempotency-Key (body eventId). Use a distinct random 32-byte BMO secret per collector.

Sign these UTF-8 lines, separated by exactly one LF, **no trailing LF**:

~~~text
BMO-INGEST-V1
POST
/api/internal/usage/ingest
<keyId>
<collectorId>
<timestamp>
<nonce>
<eventId>
<lowercase SHA256 hex of exact raw body bytes>
~~~

This preserves the compatible Phase 0.5 HMAC design. Parse only bounded identity fields for key lookup; constant-time verify raw-byte HMAC, then strict full schema, key/collector association, time, ownership, and event rules. Never log bodies/auth headers.

Request time must be within ±300 seconds of server time. Capture/upstream times may be older for offline delivery, but must be consistent and at most 300 seconds in the future. Reject new events with capture age over 24 hours. An existing exact receipt can still be acknowledged after that age, following current auth/ownership/replay checks.

Turso stores key IDs, collector metadata, and revocation only. Server secret mapping lives in ENV (proposed BMO_INGEST_KEYS_JSON). Rotation uses new IDs and bounded overlap; revocation blocks further requests. Provider, collector, session, cron, and broker secrets are distinct. HTTPS certificate verification is mandatory; explicit localhost HTTP is permitted only for isolated development fixtures.

### Replay, idempotency, ownership, ordering

- Atomically claim UNIQUE(keyId, nonce), including duplicate event requests; retain at least 15 minutes from acceptance, beyond the request-time interval. A reused accepted nonce returns REPLAY_DETECTED.
- UNIQUE(collectorId, eventId) receipt stores exact body hash, original receipt time/outcome. Same ID/body is idempotent; changed body conflicts. Each retry keeps event ID/body but gets new timestamp/nonce/signature. Retain receipts at least seven days, longer than the 24-hour queue.
- Only the configured collector/source/current ownership generation may update a provider. Explicit owner source/account changes advance generation and clear the old current projection. No provider account ID is uploaded. Old queued events cannot reclaim ownership.
- Enforce UNIQUE(collectorId, providerId, ownershipGeneration, sequence) on observations. Lower observation sequence cannot roll state back. Heartbeats update health only and never advance the quota-ordering cursor.
- Sequence proves local order, not upstream recency. Known older upstream samples cannot replace newer windows. Ambiguous cross-session chronology remains historical/unknown rather than automatically fresh.
- One short transaction claims nonce, resolves receipt/ownership/order, stores sanitized observations/windows, updates eligible current projection, and queues enabled device publications. Error events do not erase good quota. MQTT stays disabled before Phase 3.
- Commit before success. Transaction failure creates no partial receipt/quota/outbox state. Exact duplicates do not create duplicate observations/publications.

### Responses and retry semantics

Success: HTTP 200, data containing eventId, outcome (accepted, duplicate, or superseded), receivedAt; plus requestId. Duplicate retains original receipt time. Superseded acknowledges durable storage without replacing current state. Success promises persistence, not OLED delivery.

Failure envelope: error containing code, sanitized message, retryable boolean; plus requestId. True only for transient failures below.

| HTTP / code | Action |
|---|---|
| 400 INVALID_PAYLOAD, EVENT_TOO_OLD, INVALID_SOURCE_TIME | Quarantine/drop within bounds; fix input; no unchanged retry |
| 401 AUTH_FAILED, REQUEST_TIME_INVALID | Pause on key failure; correct clock and re-sign on skew |
| 403 COLLECTOR_REVOKED, SOURCE_DISABLED, POLICY_BLOCKED | Pause affected source until configuration correction |
| 409 REPLAY_DETECTED, IDEMPOTENCY_CONFLICT, SEQUENCE_CONFLICT, SOURCE_OWNERSHIP_CONFLICT | Correct cause; lost-ack retry uses new nonce; never mutate an existing event body |
| 413 PAYLOAD_TOO_LARGE; 415 UNSUPPORTED_MEDIA_TYPE | No unchanged retry |
| 429 RATE_LIMITED + Retry-After | Bounded jittered backoff |
| 500/502/503/504 TEMPORARY_FAILURE, network timeout | Retry immutable event with new transport authentication |

Durable per-collector throttling plus bounded pre-auth limits; do not trust arbitrary forwarded IP headers. Failures expose no native/upstream/SQL text. The strict allowlist never accepts provider credentials, conversations, prompts, or session files.

## 8. Database architecture

Conceptual schema only; no migrations now. Enable foreign keys; short transactions; explicit revisions/timestamps.

| Table | Primary keys, relationships, critical constraints/indexes |
|---|---|
| app_settings | Singleton PK; revision, freshness/retention settings; no secrets |
| provider_config | Provider ID PK; enabled, verification/reason, source type, authoritative collector FK, ownership generation, latest eligible observation FK/sequence |
| collectors | Collector ID PK; display name, active/revoked, created/last-seen |
| collector_keys | Key ID PK, collector FK, activation/rotation/revocation; collector index; secrets ENV-only |
| quota_observations | PK, collector/provider FKs, event ID, generation/sequence, capture/upstream/receipt times, status/evidence/completeness; UNIQUE collector/event and collector/provider/generation/sequence; provider/generation/sequence and provider/upstream-time indexes |
| quota_windows | Composite PK observation/window ID, observation FK; dynamic duration/values/reset; per-window capture/evidence/status; percentage/duration checks; reset index |
| ingestion_receipts | Composite PK collector/event, body hash, provider/generation/sequence, nullable observation FK, outcome, received/expiry; expiry index; survive observation pruning |
| ingestion_nonces | Composite PK key ID/nonce, key FK, accepted/expiry; expiry index |
| devices | Device ID PK, name, enabled/deleting, config/state revisions, publish diagnostics; no plaintext broker secret |
| device_screens | Composite PK device/screen ID, device FK; UNIQUE device/position; PET fixed at 0; quota refs provider + stable window ID |
| mqtt_outbox | PK, device FK, topic, revision, semantic hash, exact payload/tombstone, state, attempts/next attempt/ack; UNIQUE device/topic/revision; due-state index |
| operational_state | Resource PK; lease owner/generation/expiry, maintenance cursor/result; due/expiry index; atomic lease CAS |
| admin_sessions | Hashed random handle PK, expiry/revocation/version; expiry index; no user table |
| rate_limits | Composite PK scope/hashed key/window; counter, blocked/expiry times; expiry index |

Settings use optimistic revision checks. Current projection merges eligible windows across partial observations; latest partial observation is not a complete provider snapshot. A derived projection table may be added if necessary without changing source/history semantics.

Default history: seven days, preserving all currently referenced windows and latest useful good observations through outages. Receipts must outlive queue lifetime; prune expired nonces/throttle state. Never prune pending outbox obligations; bound pending state by safe supersession of obsolete unsent messages. No provider credential/OAuth, tenancy, billing, or registration tables.

## 9. Admin authentication

One owner password: encoded Argon2id hash in ADMIN_PASSWORD_HASH ENV, no plaintext. No registration/provider OAuth. iron-session is [cookie based](https://github.com/vvo/iron-session): seal an opaque random handle, then check its nonexpired/nonrevoked hashed record in Turso on every protected operation.

HTTP-only, Secure on deployed HTTPS, SameSite=Lax, fixed expiration, independent stable SESSION_SECRET. Logout revokes DB session and clears cookie, preventing captured-cookie replay. Fail closed on DB/config errors. Protect dashboard/settings/device APIs/diagnostics server-side; no public/shared owner-data cache.

Bound login input and expensive hash concurrency; durable login throttling by validated client source plus global account limit; generic failures. Origin/CSRF checks cover cookie mutations including login/logout. Collector/scheduler keys never grant admin access.

## 10. Web dashboard

| Page | Responsibility |
|---|---|
| /login | Owner login, generic error/throttle feedback |
| / | Provider cards, dynamic buckets, nullable progress bars, reset countdown, last capture and evidenced source time |
| /settings/providers | Enable preferences, verification/source state, authoritative collector/generation, local setup guidance; no provider credential/reconnect form |
| /collectors | Enrollment metadata, key rotation/revocation, last upload vs last source event, compatibility/queue diagnostics |
| /devices and detail | PET + ordered quota screens, settings, OLED 128×64 preview; initial UI must not imply MQTT exists |
| /status | Protected DB/ingestion/maintenance/outbox status and sanitized errors |

Fresh, stale, unavailable, unsupported, and source-age-unknown states must be visible. Last-known values have age labels. Unknown never renders as zero usage. Passing a reset never resets the bar. Upload time never creates a “Live” badge.

Dashboard refresh reads persisted observations; it cannot wake the Mac or force provider refresh. App-data polling is allowed without an always-on WebSocket. Synthetic fixtures are test/development only and visibly labeled.

## 11. MQTT architecture

Topics: `bmo/v1/devices/<deviceId>/config` and `bmo/v1/devices/<deviceId>/snapshot`. TLS, QoS 1, retained latest state. Per-device subscribe ACL; backend scoped publish credentials stay server-only. Provision device secrets separately later.

Config v1: schemaVersion, deviceId, monotonic revision, updatedAt, ordered screens (PET first, stable provider/window references). Snapshot v1: schemaVersion, deviceId, monotonic revision, configRevision, generatedAt, validUntil, provider/window states with original capture/upstream times, freshness basis, availability, resets, and per-window validity deadline. Publish time is not observation time.

Initial ceiling: **8 KiB per message**, subject to actual ESP32 RAM/library packet-buffer validation in Phase 4B. Project only configured windows; enforce a bounded screen count and encoded byte limit. Reject oversized config explicitly, without silent truncation.

Allocate revisions and exact payload in the state/config transaction. Semantic changes, meaningful upstream evidence, expiry transitions, or deliberate reconciliation create work; retries reuse exact bytes/revision. Short per-device/topic lease; bounded connect/publish/disconnect drain after durable ingestion/config changes and external maintenance. No untracked promises after response.

Broker/network failure leaves durable retries. Coalesce obsolete never-attempted state, preserving ambiguous in-flight recovery. PUBACK means broker acceptance, not device display. Lease expiry cannot cancel an already-sent MQTT packet. After ambiguity/takeover and periodically, republish latest durable retained state; no exactly-once claim.

Device ignores older/duplicate revisions while running and matches configRevision; buffer one bounded pending snapshot or await config. After reboot validate time, schema, size, and config compatibility; persistent revision handling must permit recovery of current retained state. Unknown referenced windows render unavailable.

Per-window validity ends at earliest freshness deadline/reset. Overall validUntil conservatively bounds the set; firmware also checks windows individually. Newly delivered retained data can already be stale. Unsynchronized clock means freshness unknown. Retirement disables device, queues retained zero-byte tombstones, and preserves recovery records until acknowledgment; revoke broker ACL separately.

## 12. ESP32 firmware boundaries

Later firmware owns Wi-Fi provisioning/reconnect, MQTT/TLS subscription, bounded schema parsing, time synchronization, OLED rendering, quota screens, PET animations, button debounce/navigation, and offline/stale states. PET is home; 1–2 buttons navigate PET then zero or more configured quota pages. Web preview is not hardware verification.

Hardware: ESP32-CAM, SSD1306 128×64 (0.96-inch), 3.7V rechargeable LiPo, suitable charging/protection/regulation, buttons, 3D-printed BMO enclosure. Camera capture/upload is not a requirement. Phase 4D validates board pins/boot straps, OLED levels, wiring, Wi-Fi current, battery/regulator limits, and practical runtime. No firmware, wiring implementation, service installation, or deployment now.

## 13. Reliability and security

| Condition | Required behavior |
|---|---|
| Mac sleeps/off; CLI closes | No fresh-quota promise; last values age; source liveness and collector health separate |
| Cached callbacks | Deduplicate without advancing quota timestamp |
| Offline/cold start | Durable bounded queue; same event/new HMAC; no fixed delivery SLA |
| Crash/rotation | Atomic checkpoint/queue, persistent sequence, bounded rescan |
| Duplicate/lost acknowledgment | Idempotent receipt, fresh nonce, no duplicate quota/publications |
| Clock skew | Validate request/source chronology; clock error guidance; never substitute receipt time |
| Late events/source switch | Ownership generation, sequence, per-window source recency; no rollback |
| Reset/age expiry | Read-time and device-time expiry; maintenance sends persisted transitions |
| MQTT failure/restart | Outbox, lease recovery, retained-state reconciliation |
| DB failure | No false success; auth fails closed; transient retry |
| Provider incompatibility/restriction | Explicit unverified/unsupported reason; independent providers continue |
| Privacy/secrets | Strict allowlists, TLS, separate least-privilege keys, rotation/revocation, bounded retention |

External scheduler invokes a separate authenticated POST (proposed /api/internal/maintenance). Durable due/lease state controls bounded outbox retries, stale transitions, pruning, and abandoned-work recovery. It never polls providers, reaches into the Mac, or keeps Render alive as an uptime workaround. Read/device expiry remains correct if cron is late.

Validate server-only config by owning phase: app origin, DB, admin/session keys, collector-key map, freshness thresholds, MQTT TLS/publisher settings, cron secret/budget. Local collector config is separate. Existing .env.example is a historical starter: SYNC_ENABLED, SYNC_INTERVAL_MINUTES, SYNC_TIMEOUT_MS, CREDENTIAL_ENCRYPTION_KEY do not authorize provider polling/credential storage. Phase 1B replaces obsolete placeholders with implemented config; production service secrets wait until Phase 5.

## 14. Architecture decision records

| ADR | Decision and consequence |
|---|---|
| 01 | Event-driven collection replaces direct cloud polling; CLI inactivity can leave quota stale |
| 02 | Authorized local observation replaces credential extraction; official clients own provider authentication |
| 03 | One Next.js fullstack cloud app; local companion is a source agent, not another cloud backend |
| 04 | Turso instead of VPS database; durability independent of Render |
| 05 | EMQX Cloud + MQTT.js + durable outbox; broker receipt differs from device display |
| 06 | External authenticated maintenance cron; no always-running Render Free worker/provider cron |
| 07 | Dynamic quota windows; no universal five-hour/seven-day assumptions |
| 08 | Explicit freshness, capture, and upload semantics; fast delivery never fabricates fresh quota |
| 09 | One authoritative source/generation per provider; HMAC, receipts, ordering protect offline retries |
| 10 | All live integrations gated by Phase 2 evidence; synthetic parser success is not verification |

Retained evidence: [Codex local research](feasibility/01-codex-local-vps.md), [Claude local research](feasibility/03-claude-local-vps.md), [Antigravity local research](feasibility/02-antigravity-local-vps.md), [PoC](feasibility/POC_RESULTS.md), and [pre-existing edited Antigravity report](research/02-antigravity.md). Old RPC/VPS next steps are superseded. The last report's “no structured output” claim was superseded by native statusline research; its credential-access warnings remain relevant.
