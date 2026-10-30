# BMO Personal — Implementation Phases

Owner-approved roadmap reset · 2026-10-31 · **All implementation is pending.**

[Architecture Decisions](ARCHITECTURE_DECISIONS.md) is the technical authority; [Project Scope](PROJECT_SCOPE.md) defines the product. This roadmap replaces historical phases and Render-only quota-polling plans. Research completion and synthetic PoC checks do not complete any subphase below.

## Execution rules

- Execute **one named subphase per focused Codex conversation**, only when requested. Read AGENTS.md, the architecture, and that subphase first.
- Future workflow: Lead → one configured Coder → appropriate tests → configured Reviewer → fixes → final verification. Preserve agent configurations; parallel coders are unnecessary by default.
- Implement only the chosen scope. Record a checkbox after its Definition of Done passes; describe blockers and partial evidence honestly. Do not advance automatically.
- Keep implementation evidence in the final conversation and short updates here/README where needed. No separate large phase reports; historical report templates are optional references.
- Test contracts/observable failure behavior, not implementation copies. Synthetic, local integration, and real-provider evidence are separate.
- Phase 1 requires no provider credentials, native CLI configuration changes, external production accounts, MQTT service, or firmware. Use isolated local SQLite/libSQL and fixtures; optionally verify a disposable development Turso database.
- Phases 3–4 use local test broker/simulators and development hardware; production Render/Turso/EMQX/scheduler credentials belong to Phase 5.
- Document actual install/dev/build/typecheck/lint/test commands only after adding scripts; no commands exist yet. Never commit secrets, deploy, push, merge, or install services implicitly.
- Useful module paths below are expected locations, not instructions to pre-create later phases. Add schema/migrations incrementally in the owning subphase.

## Phase 1 — Fullstack Foundation + Collector MVP

### Phase 1A — Next.js Foundation & UI Layout

**Objective:** Establish the local fullstack application and reusable UI shell.

**Dependencies:** Approved architecture/roadmap only; repository currently has no application.

**Implementation scope:**

- [ ] Initialize one Next.js App Router app; choose compatible supported Node/package versions and commit pnpm manifest/lockfile.
- [ ] Enable TypeScript strict mode, Tailwind CSS, shadcn/ui, formatter/lint configuration.
- [ ] Establish app/components/server/contracts organization, responsive shell, navigation, reusable layouts, loading/error/empty/unavailable/stale components.
- [ ] Add placeholder routes for overview, provider settings, collectors, devices, operational status, and login; explicitly identify any synthetic previews.
- [ ] Add .gitignore and essential local setup/verified command documentation. Keep secrets out of client imports.

**Key files/modules:** package.json, pnpm-lock.yaml, tsconfig.json, framework/lint/style configuration, src/app, src/components, src/server, src/contracts, assets/public, .gitignore, README.md.

**Tests:** Start locally; typecheck; lint; production build without cloud credentials. Verify navigation, keyboard/mobile shell, and honest placeholder states; no redundant tests for static markup.

**Definition of Done:**

- [ ] Local app starts; documented typecheck/lint/production build pass; frontend/backend organization is ready.

**Exclusions:** Database, authentication logic, ingestion, collector, real providers, MQTT, firmware, production deployment.

### Phase 1B — Turso Database & Admin Authentication

**Objective:** Add durable app configuration and single-owner access control.

**Dependencies:** 1A.

**Implementation scope:**

- [ ] Configure Drizzle/Turso client with isolated local SQLite/libSQL test mode; create initial settings/provider metadata, admin-session and throttle schema/migrations.
- [ ] Seed provider identities as unverified; add no provider credential tables.
- [ ] Verify ENV Argon2id hash, implement iron-session cookie with opaque revocable DB handle, bounded login throttling, Origin/CSRF checks, logout.
- [ ] Protect dashboard/settings and server operations; fail closed on DB/config errors.
- [ ] Replace obsolete .env.example polling/credential placeholders with documented implemented app/auth/DB settings. Provide local setup with no production credential requirement.

**Key files/modules:** drizzle.config.ts, drizzle migrations, src/server/db, src/server/auth, src/server/config, src/app/login, auth handlers/actions, protected route layout, .env.example, tests/auth and tests/db.

**Tests:** Clean migration and repeat migration application, CRUD/config persistence, valid/invalid login, cookie tampering/expiry, logout-cookie replay, unauthorized page/API access, CSRF, durable throttling after process recreation, DB failure. Typecheck/lint/build; verify native Argon2 packaging.

**Definition of Done:**

- [ ] Database operations/migrations pass; owner login/logout works; unauthenticated operations are rejected; relevant security tests pass.

**Exclusions:** Provider authentication/OAuth, production Turso provisioning, collector enrollment/ingestion, MQTT, real quota.

### Phase 1C — Secure Backend Usage Ingestion

**Objective:** Persist authenticated quota-only synthetic telemetry with durable ordering and replay controls.

**Dependencies:** 1B.

**Implementation scope:**

- [ ] Implement shared versioned Zod event/window/heartbeat schemas, canonical hash, timestamp and dynamic-window rules from architecture §§5–7.
- [ ] Add collector/key metadata and explicit provider-source ownership/generation enrollment through a minimal protected admin operation or documented local development setup.
- [ ] Implement POST /api/internal/usage/ingest: raw-body bound, HMAC, key association, request/source time checks, atomic nonce claim, strict schema, ownership, receipt idempotency, ordering.
- [ ] Migrate collectors/keys, observations/windows, receipts/nonces, and required operational state. Persist partial windows/current projection without losing prior good data.
- [ ] Define stable sanitized success/error envelopes, throttling, and fixture request helpers; publish the implemented API contract locally if needed for executable tests, without a separate research report.
- [ ] Keep MQTT publication disabled; only design the transaction boundary for its later addition.

**Key files/modules:** src/contracts/usage, src/app/api/internal/usage/ingest/route.ts, src/server/ingestion, src/server/quota, collector enrollment/config module, DB schema/migrations, tests/ingestion, tests/fixtures.

**Tests:** Valid synthetic persistence; bad/tampered signature; clock skew; same-nonce replay; same-event/new-nonce duplicate; changed-body ID conflict; concurrent duplicate/nonce transactions; old sequence/generation; ownership/account switch; partial windows; stale/reset data; heartbeat does not freshen quota; over-limit/streamed/unknown-field/credential-bearing/duplicate-key payloads; transaction rollback and outage retries.

**Definition of Done:**

- [ ] Synthetic quota persists; invalid signatures/replays/forbidden fields fail; duplicates are idempotent; stale/late events cannot roll current state back; applicable API/security checks pass.

**Exclusions:** Provider credentials, real provider capture, collector implementation, MQTT broker/outbox publishing, production access.

### Phase 1D — Local Collector MVP

**Objective:** Build a fixture-driven local pipeline capable of reliable signed upload.

**Dependencies:** 1C shared contracts and tested ingestion endpoint.

**Implementation scope:**

- [ ] Create a lightweight local TypeScript package with adapter interfaces, bounded stdin/file-record parsing, and source availability diagnostics.
- [ ] Add baseline Codex JSONL candidate parser, Claude statusline parser, and Antigravity statusline parser using **synthetic** schemas; label source assumptions unverified.
- [ ] Implement normalization, semantic dedup, persistent sequences, atomic checkpoints/queue, bounded age/size/coalescing, safe logging.
- [ ] Add HMAC transport, immutable event retries, response classification, jitter/backoff, graceful shutdown; no local HTTP server.
- [ ] Document opt-in local BMO config and source-disabled defaults. Supply fixture replay without modifying any native CLI config.

**Key files/modules:** collector/package.json, collector/src/{adapters,normalize,dedup,queue,transport,config,diagnostics}, shared contract import/package boundary, collector/tests, tests/fixtures, short collector README/setup section.

**Tests:** Dynamic/missing/malformed/amount-only buckets; partial lines; cached rerenders preserve timestamps; signatures accepted by 1C; offline/network/429/5xx recovery; lost acknowledgment; crash/restart checkpoint safety; queue overflow/age; redaction; persistent sequence; unsupported schema/provider independence.

**Definition of Done:**

- [ ] Synthetic parsers work; collector signs valid requests; bounded queue retries safely; duplicates do not repeat observations; unsupported states remain explicit.

**Exclusions:** Verified real integrations, live provider storage observation, native statusline installation/config changes, LaunchAgent installation, production uploads. Real observation is a Phase 2 gate.

### Phase 1E — Dashboard Integration & Testing

**Objective:** Show persisted quota and collector state honestly, with device UI preparation.

**Dependencies:** 1B–1D.

**Implementation scope:**

- [ ] Connect protected overview/provider cards to DB projections; render nullable percentages/progress, dynamic windows, reset countdown, capture/source time, freshness/availability.
- [ ] Separate collector reachability/upload health from quota freshness; refresh only persisted app data.
- [ ] Add initial device settings and ordered PET/quota screen UI with 128×64 preview, using persisted local configuration; introduce minimal device/screen schema if needed.
- [ ] Run fixture → collector → ingestion → DB → dashboard locally; identify fixtures visibly; review Phase 1 integration/security.

**Key files/modules:** src/app overview/settings/collectors/devices/status pages, src/components/quota and OLED preview, src/server/quota queries, device configuration repository/schema, tests/integration and focused browser tests.

**Tests:** Persisted values/updates, empty/stale/unknown/unavailable/unsupported states, null bars, reset expiry, partial-bucket timing, heartbeat/retry no freshness change, provider isolation, unauthorized access, screen ordering and preview dimensions; Phase 1 applicable tests/typecheck/lint/build.

**Definition of Done:**

- [ ] Dashboard reads persisted events, updates from application data, labels synthetic fixtures, handles stale/empty states, and passes local end-to-end integration/security checks.

**Exclusions:** Live provider claims, MQTT behavior, hardware validation, deployment.

## Phase 2 — Real Provider Integration & Local Automation

For each provider, preserve existing user configuration and use only supported authorized local sources. Fixtures and documentary schemas are insufficient for completion. When compatibility/permission cannot be established, record **unverified** or **unsupported**, leave the subphase incomplete/blocked, and allow independent providers to proceed. Do not generate model activity just to obtain quota.

### Phase 2A — Codex Real Quota Integration

**Objective:** Validate and observe actual Codex session quota events.

**Dependencies:** 1D and 1E; owner opt-in to read-only observation of their own normal session data.

**Implementation scope:**

- [ ] Verify installed JSONL event schema, token_count/rate_limits candidate, timestamps, units, bucket IDs, completeness, and allowed usage.
- [ ] Implement incremental file observation, baseline/catch-up rules, multiple sessions, rotation/truncation, source-specific recency, and dedup.
- [ ] Capture only sanitized real quota fields; record installed version and verification result briefly beside adapter tests/docs.

**Key files/modules:** collector/src/adapters/codex, local checkpoint/stream arbitration, sanitized adapter fixtures, focused tests, collector setup docs.

**Tests:** Real bounded capture during ordinary CLI activity, actual reset units, multiple sessions, partial/rotated files, restart/dedup, old-session events, source freshness without timestamp substitution.

**Definition of Done:**

- [ ] Actual supported local quota observation and collector-to-dashboard flow is evidenced; limitations are explicit. Otherwise retain unverified/unsupported and report the exact blocker.

**Exclusions:** App-server periodic reads, credential access, cloud polling, private endpoints, Claude/AGY work.

### Phase 2B — Claude Code Statusline Integration

**Objective:** Receive verified native Claude statusline quota during ordinary sessions.

**Dependencies:** 1D and 1E; installed supported CLI and owner opt-in. Independent of 2A.

**Implementation scope:**

- [ ] Verify installed native callback shape and quota availability, normalize actual fields, and validate permission/lifecycle boundaries.
- [ ] Provide opt-in wrapper/config instructions preserving existing statusline output/settings with rollback/uninstall.
- [ ] Capture sanitized real observations without logging raw stdin; distinguish session snapshot and upstream freshness.

**Key files/modules:** collector/src/adapters/claude, statusline wrapper/setup, sanitized fixtures/tests, collector docs.

**Tests:** Actual callback, missing quota, rerender with cached data, first available observation, CLI exit/resume, existing command coexistence, fast callback with uploader offline.

**Definition of Done:**

- [ ] Real supported callback reaches dashboard with honest lifecycle/freshness state and reversible opt-in setup; otherwise report unverified/unsupported.

**Exclusions:** Independent polling after session closure, subscription token reuse, private usage endpoints, AGY changes.

### Phase 2C — Antigravity Statusline Integration

**Objective:** Verify installed AGY compatibility and native quota buckets.

**Dependencies:** 1D and 1E; supported installed CLI/owner opt-in and applicable permission verification. Independent of 2A/2B.

**Implementation scope:**

- [ ] Verify native statusline JSON, bucket identities/available fields, missing/disabled states, actual reset and fractional/amount semantics.
- [ ] Provide reversible opt-in integration preserving existing settings/output.
- [ ] Capture sanitized real events and document installed version, source timing, and permission/compatibility limitations.

**Key files/modules:** collector/src/adapters/antigravity, statusline wrapper/setup, sanitized fixtures/tests, collector docs.

**Tests:** Actual quota callback, multiple dynamic buckets, amount-only null percentages, disabled/missing fields, reset conversion, cached events, exit/resume, offline wrapper responsiveness.

**Definition of Done:**

- [ ] Supported real bucket observations reach dashboard without fabricated percentages/resets; unresolved restrictions leave integration unverified/unsupported.

**Exclusions:** Interactive /usage scraping, private language-server calls, OAuth extraction, headless prompt runs as quota probes.

### Phase 2D — Local Automation & Reliability

**Objective:** Make verified adapters recover safely across normal Mac/CLI lifecycles.

**Dependencies:** 1D–1E. Use every available verified Phase 2 adapter for real end-to-end checks; unsupported adapters are not prerequisites. If none can be verified, exercise infrastructure with labeled fixtures and report zero live-provider coverage.

**Implementation scope:**

- [ ] Add optional per-user LaunchAgent template and explicit install/uninstall instructions, never install automatically.
- [ ] Add graceful restarts, sleep/wake/reconnect catch-up, source lifecycle diagnostics, queue pressure reporting, and complete collector-health UI.
- [ ] Validate the full local telemetry path with available verified adapters and honest inactive sources; use labeled fixtures for infrastructure checks when no provider is supported.

**Key files/modules:** collector startup/diagnostics/health, optional collector launchd template, dashboard collector status, reliability tests, setup docs.

**Tests:** Restart after queued/attempted event, lost acknowledgment, Mac offline/reconnect, sleep/wake, CLI closed, expired queue, clock skew, source switch, no provider credentials in logs/payloads.

**Definition of Done:**

- [ ] Recovery and bounded queue behavior pass; optional automation is reversible and opt-in; evidence identifies each verified/unavailable provider and distinguishes fixture-only checks. Zero supported providers does not block infrastructure completion or deployment, and never counts as live integration.

**Exclusions:** Root services, auto-login/keychain changes, forced CLI sessions, production deployment.

## Phase 3 — MQTT & Device Configuration

Use a local test broker or mocked broker transport; actual production EMQX deployment is Phase 5B. Keep device payloads compatible with architecture §11 and future firmware.

### Phase 3A — MQTT Contracts & EMQX Publishing

**Objective:** Establish versioned device payloads and bounded publisher transport.

**Dependencies:** 1E.

**Implementation scope:**

- [ ] Implement config/snapshot contracts, device-specific topics, revisions, freshness fields, encoded-byte bounds, TLS/QoS 1/retained publish adapter.
- [ ] Verify EMQX-compatible MQTT behavior against a local broker; publisher remains a tested primitive until transactional outbox integration in 3B.

**Key files/modules:** src/contracts/mqtt, src/server/mqtt/{config,publisher,projection}, tests/mqtt and local broker fixture.

**Tests:** Schema/size/version rejection, dynamic windows, original timestamps/validity, TLS verification, connection/publish deadlines, QoS options and retained replacement.

**Definition of Done:**

- [ ] Versioned payloads and bounded publisher pass broker/transport tests without production credentials.

**Exclusions:** Production EMQX provisioning, durable retry integration, device credential enrollment, firmware.

### Phase 3B — MQTT Outbox & Retry Handling

**Objective:** Couple durable quota/config changes to recoverable publication.

**Dependencies:** 3A and 1C.

**Implementation scope:**

- [ ] Add outbox/lease schema; allocate revisions and exact payload in state transactions.
- [ ] Drain bounded work after ingestion/config and through authenticated maintenance; add backoff, safe supersession, PUBACK diagnostics, crash/lease recovery, retained-state reconciliation.
- [ ] Keep scheduler deployment deferred; invoke maintenance locally with a separate development secret.

**Key files/modules:** src/server/mqtt/outbox and drain, src/server/maintenance, internal maintenance route, DB migrations, integration tests.

**Tests:** DB commit/broker failure, crash after publish, duplicate HTTP/event, concurrent drains/lease expiry, delayed stale publisher, exact retry bytes/revision, maintenance auth/work bounds.

**Definition of Done:**

- [ ] Pending work survives restarts; duplicates are safe; latest retained state reconciles after ambiguous publication; no exactly-once claims.

**Exclusions:** Production cron/EMQX configuration, always-on workers, firmware acknowledgments.

### Phase 3C — Device Registration & Configuration

**Objective:** Manage personal device metadata and secure configuration lifecycle.

**Dependencies:** 1E and 3B.

**Implementation scope:**

- [ ] Finish protected device CRUD/enabled state, stable IDs, optimistic config revisions, scoped broker provisioning instructions and server-only secret separation.
- [ ] Connect config changes to outbox; retirement queues retained tombstones and preserves cleanup/revocation obligations.

**Key files/modules:** src/server/devices, protected device handlers/actions, src/app/devices, DB migrations, config/outbox tests.

**Tests:** Admin/CSRF protection, invalid IDs/config, revision conflicts, device isolation, no browser secret leakage, retirement with broker outage and tombstone retries.

**Definition of Done:**

- [ ] Device configuration persists and publishes through outbox; lifecycle/isolation tests pass; provisioning boundaries are documented.

**Exclusions:** Production broker account creation, firmware/provisioning on hardware, screen UX refinements in 3D.

### Phase 3D — Screen Ordering, Retained State & Integration Testing

**Objective:** Verify dashboard configuration through MQTT subscriber simulation.

**Dependencies:** 3A–3C.

**Implementation scope:**

- [ ] Complete PET-first ordering, zero-or-more quota pages, stable window selection, byte/count enforcement, preview/config integration.
- [ ] Test matching configRevision, duplicate/out-of-order delivery, retained reconnect/reboot, stale expiry, unknown windows, retired-device cleanup with a simulated device.

**Key files/modules:** device screen editor/preview, MQTT projections/contracts, tests/integration device subscriber simulator.

**Tests:** End-to-end fixtures from ingestion/config to broker/subscriber, two-topic races, retained old data, missing clock, oversized config and unknown bucket states.

**Definition of Done:**

- [ ] Ordered configuration and latest retained quota are consumed correctly by simulator, including stale/unsupported/reconnect cases.

**Exclusions:** Physical ESP32 claims, production service deployment.

## Phase 4 — ESP32 Firmware & Physical BMO

### Phase 4A — ESP32 Firmware Foundation & Wi-Fi Provisioning

**Objective:** Establish a repeatable firmware build and owner-controlled network setup.

**Dependencies:** 3A contracts; available development board/OLED. Can precede 3D.

**Implementation scope:**

- [ ] Select supported ESP32 toolchain and document build/flash; add board/pin configuration and OLED bring-up.
- [ ] Implement Wi-Fi provisioning/reconnect and device clock setup with safe reset/reconfiguration; isolate secrets from source.

**Key files/modules:** firmware build manifest/config, firmware/src/{main,wifi,time,display}, firmware setup docs, example secret config.

**Tests:** Compile/flash, OLED dimensions, provisioning failure/retry, reboot, no Wi-Fi secret logging; record bench evidence separately from simulation.

**Definition of Done:**

- [ ] Firmware builds and board provisions/reconnects with basic OLED/time state.

**Exclusions:** Quota/MQTT rendering, animations/buttons, final battery/enclosure wiring.

### Phase 4B — MQTT Connectivity & Quota Rendering

**Objective:** Render validated retained quota on actual OLED.

**Dependencies:** 4A and 3D.

**Implementation scope:**

- [ ] Connect MQTT/TLS with device ACL, parse bounded v1 config/snapshots, synchronize revisions, reconnect safely.
- [ ] Render dynamic quota screens with capture/freshness/reset/unavailable semantics; validate actual packet-buffer/RAM limits.

**Key files/modules:** firmware/src/{mqtt,contracts,quota,display}, firmware config, host parser tests and bench checklist.

**Tests:** Local broker → hardware, malformed/oversized payload, QoS duplicates, config race, reboot/retained state, clock unavailable, offline/reset/stale rendering, memory budget.

**Definition of Done:**

- [ ] Hardware renders honest quota states and reconnects safely within measured buffer/memory bounds.

**Exclusions:** Production EMQX setup, animation/button work, final power design.

### Phase 4C — BMO Pixel Animations & Buttons

**Objective:** Deliver PET behavior and physical navigation.

**Dependencies:** 4B.

**Implementation scope:**

- [ ] Add original/authorized 128×64 pixel expressions and nonblocking animation.
- [ ] Debounce 1–2 buttons; navigate PET home then configured quota screens, including zero-page state and offline indications.

**Key files/modules:** firmware/src/{pet,input,navigation}, assets or firmware asset format, navigation tests.

**Tests:** State-machine navigation/debounce, held/rapid button presses, live MQTT during animation, frame timing, offline PET and empty screen list on board.

**Definition of Done:**

- [ ] Buttons and animations remain responsive without blocking Wi-Fi/MQTT; page ordering matches configuration.

**Exclusions:** Unrequested interactions/sensors, production provisioning, final enclosure/power integration.

### Phase 4D — Hardware Integration & Power Management

**Objective:** Assemble and validate the physical BMO safely against actual parts.

**Dependencies:** 4C; exact ESP32-CAM board, OLED, LiPo, charger/protection/regulator, buttons, enclosure dimensions.

**Implementation scope:**

- [ ] Verify board pin/boot constraints, I/O voltage, charging/protection/regulation/current design; document confirmed wiring.
- [ ] Fit enclosure/buttons/display and implement only measured power-management needs; measure Wi-Fi peaks, runtime, heat, charging, reboot behavior.

**Key files/modules:** essential hardware wiring/BOM/enclosure files, firmware power module/config as needed.

**Tests:** Bench power/charging checks, Wi-Fi load and brownout recovery, navigation/rendering in enclosure, measured runtime; unresolved electrical facts block final assembly sign-off.

**Definition of Done:**

- [ ] Physical BMO works with validated parts/power wiring and documented measured limitations.

**Exclusions:** Guessed battery runtime, direct unregulated battery assumptions, commercial hardware features, cloud deployment.

## Phase 5 — Deployment & End-to-End Validation

Production secrets are requested/configured only for the relevant selected deployment subphase; never placed in Git or logs. Provisioning/deployment requires the owner's explicit phase authorization.

### Phase 5A — Render + Turso Configuration

**Objective:** Deploy the secured application with durable cloud state.

**Dependencies:** 1E, 2D for available collector capability, and 3D. Unsupported providers remain explicit.

**Implementation scope:**

- [ ] Configure Render Node build/start/runtime, server-only environment, HTTPS app origin, production Turso and migrations.
- [ ] Document deployment/rollback, secret rotation, backup/restore, native dependency compatibility, cold-start limitations.

**Key files/modules:** deployment config if needed, runtime config validation, concise deployment README/runbook, smoke tests.

**Tests:** Production build/start, auth/session protection, migrations/DB persistence across restart, health without secret leakage, cold-start ingestion retry; use authorized environment only.

**Definition of Done:**

- [ ] Authorized cloud app is reachable, protected, durable, and has verified configuration/recovery instructions.

**Exclusions:** Provider login on Render, EMQX/scheduler provisioning in 5B, permanent background workers.

### Phase 5B — EMQX & External Cron Deployment

**Objective:** Activate production device delivery and cloud maintenance.

**Dependencies:** 5A and 3D.

**Implementation scope:**

- [ ] Configure EMQX TLS/publisher/device ACLs, scoped secrets, retention; configure external authenticated maintenance scheduler.
- [ ] Set bounded work/time budgets, retry/due state, and operational diagnostics; cron performs no provider collection.

**Key files/modules:** production MQTT/maintenance config, concise setup/rotation/revocation instructions, deployment smoke checks.

**Tests:** Broker TLS/ACL isolation, retained latest state/tombstones, scheduler auth, concurrent/cold-start trigger, broker outage/recovery, stale transitions and housekeeping.

**Definition of Done:**

- [ ] Production broker and authenticated maintenance work across restarts without assuming a continuously running process.

**Exclusions:** Provider polling, keepalive cron, local service installation, physical device provisioning.

### Phase 5C — Local Collector Setup & Device Provisioning

**Objective:** Enroll the owner's real Mac and BMO against deployed services.

**Dependencies:** 5A–5B, 2D, and 4D.

**Implementation scope:**

- [ ] Enroll collector key/source generation, configure supported opt-in adapters and optional explicitly chosen LaunchAgent.
- [ ] Provision device Wi-Fi/broker credential and assigned topics, apply screen ordering, verify no provider credentials leave native clients.
- [ ] Document uninstall/revocation and setup steps beside existing essential setup docs.

**Key files/modules:** collector/device setup configuration and instructions; targeted fixes only if required by provisioning evidence.

**Tests:** Actual verified provider → collector → deployed app → Turso → EMQX → BMO, source ownership, device reconnect, inactive/unsupported providers, secret redaction/revocation.

**Definition of Done:**

- [ ] Owner devices receive real permitted observations, or precise provider blockers are recorded without fabricating coverage; provisioning is reversible and secrets remain private.

**Exclusions:** New provider mechanisms, authentication bypass, unrelated features, silently installing background services.

### Phase 5D — End-to-End Reliability & Security Verification

**Objective:** Establish release evidence for the full personal system.

**Dependencies:** 5C.

**Implementation scope:**

- [ ] Exercise failure/recovery and trust boundaries across collector, API, database, scheduler, broker, and hardware.
- [ ] Fix confirmed release issues within bounded scope; record verified versus untested cases in roadmap/final report.

**Key files/modules:** focused integration/security tests, relevant fixes, concise operational troubleshooting.

**Tests:** Sleep/shutdown, closed CLI, long offline queue/expiry, request skew/replay/tampering, key rotation/revocation, duplicate/lost acknowledgment, source/account switch, Render cold start/restart, DB/broker outages, device reboot/unknown clock/reset expiry; applicable test/typecheck/lint/build suite.

**Definition of Done:**

- [ ] Applicable release checks pass; independent review issues are resolved or explicitly blocked; limitations/provider coverage are accurately stated.

**Exclusions:** Claims of uninterrupted freshness/availability, unsupported providers marked successful, unrelated refactors.

## Phase 6 — Polish & Maintenance

These are separate focused sessions, not prerequisites to pretend unverified provider coverage is complete. Prioritize actual observations/defects rather than speculative features.

### Phase 6A — UI/UX Improvements

**Objective:** Refine owner workflows and readable status presentation.

**Dependencies:** 1E; deployed feedback from Phase 5 preferred.

**Implementation scope:**

- [ ] Improve responsive/accessibility details, navigation, configuration clarity, freshness/unknown/error explanations, and preview fidelity within existing product scope.

**Key files/modules:** affected src/app and src/components, focused UI tests.

**Tests:** Keyboard/mobile/accessibility checks and relevant status/preview regressions; applicable lint/typecheck/build.

**Definition of Done:**

- [ ] Selected UX issues are fixed with verified behavior and screenshots where useful.

**Exclusions:** Registration/billing, new unrelated features, provider collection changes.

### Phase 6B — OLED Animations & Performance

**Objective:** Improve measured display quality and responsiveness.

**Dependencies:** 4D; deployed hardware feedback preferred.

**Implementation scope:**

- [ ] Tune selected animations/font/layout/frame timing and memory/power use using hardware measurements.

**Key files/modules:** firmware display/pet assets and timing modules, relevant tests/measurements.

**Tests:** Actual frame responsiveness, MQTT/button continuity, memory usage, visual legibility, power impact.

**Definition of Done:**

- [ ] Identified display/performance issue improves without breaking navigation or delivery.

**Exclusions:** New sensors/features, unmeasured runtime promises, cloud rewrites.

### Phase 6C — Diagnostics & Reliability Improvements

**Objective:** Resolve evidence-backed operational gaps.

**Dependencies:** 5D; specific diagnosed issue.

**Implementation scope:**

- [ ] Improve bounded diagnostics, retry/recovery visibility, retention, or compatibility handling for the selected issue; keep logs privacy-safe.

**Key files/modules:** affected collector/server/firmware diagnostics and reliability modules only.

**Tests:** Reproduce failure, verify recovery, protect freshness/ownership/idempotency semantics; run affected suites.

**Definition of Done:**

- [ ] Selected failure has a verified fix or explicit unsupported state with actionable diagnostics.

**Exclusions:** Unnecessary infrastructure, raw provider logging, speculative monitoring systems.

### Phase 6D — Documentation & Maintenance

**Objective:** Keep the small authoritative documentation and dependencies accurate.

**Dependencies:** Current implemented state; after 5D for the initial maintenance pass.

**Implementation scope:**

- [ ] Reconcile architecture/roadmap/setup with verified behavior, remove obsolete generated notes safely, review dependency/runtime support and supported source versions.
- [ ] For any actual dependency update, keep it scoped and validated; preserve agent configurations unless separately requested.

**Key files/modules:** this roadmap, architecture, scope only if requirements change, README/setup, affected manifest/lockfile when justified.

**Tests:** Markdown links/diff checks; for dependency changes, applicable tests/typecheck/lint/build and compatibility checks.

**Definition of Done:**

- [ ] Documentation matches implementation; maintenance changes are validated; unresolved risks remain visible.

**Exclusions:** Repeating research reports, automatic upgrades/deployment, starting another subphase.

## Handoff

Architecture/planning cleanup does not implement any checkbox. The exact next coding session is **Phase 1A — Next.js Foundation & UI Layout**. Read only relevant retained evidence when the selected subphase needs it; never reapply superseded RPC, VPS, provider-auth, or cloud-polling instructions.
