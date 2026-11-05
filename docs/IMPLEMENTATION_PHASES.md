# BMO Personal — Implementation Phases

Owner-approved roadmap reset · 2026-10-31 · **Phase 1A–1E, Phase 2A/2D, Phase 3A–3D complete locally; Phase 4 implementation under correction, hardware validation pending; Phase 2 PARTIAL: 2B/2C await real callback evidence.**

[Architecture Decisions](ARCHITECTURE_DECISIONS.md) is the technical authority; [Project Scope](PROJECT_SCOPE.md) defines the product. This roadmap replaces historical phases and Render-only quota-polling plans. Research completion and synthetic PoC checks do not complete any subphase below.

## Execution rules

Current owner authorization: full Phase 2 execution with adaptive delegation and automatic progression after quality gates; this overrides the older single-subphase workflow below. Independent providers may proceed when another provider lacks live callback evidence. No native settings or services are installed automatically.

- Execute **one named subphase per focused Codex conversation**, only when requested. Read AGENTS.md, the architecture, and that subphase first.
- Future workflow: Lead → one configured Coder → appropriate tests → configured Reviewer → fixes → final verification. Preserve agent configurations; parallel coders are unnecessary by default.
- Implement only the chosen scope. Record a checkbox after its Definition of Done passes; describe blockers and partial evidence honestly. Do not advance automatically.
- Keep implementation evidence in the final conversation and short updates here/README where needed. No separate large phase reports; historical report templates are optional references.
- Test contracts/observable failure behavior, not implementation copies. Synthetic, local integration, and real-provider evidence are separate.
- Phase 1 requires no provider credentials, native CLI configuration changes, external production accounts, MQTT service, or firmware. Use isolated local SQLite/libSQL and fixtures; optionally verify a disposable development Turso database.
- Phases 3–4 use local test broker/simulators and development hardware; production Render/Turso/EMQX/scheduler credentials belong to Phase 5.
- Document actual install/dev/build/typecheck/lint/test commands only after adding scripts; see README for current commands. Never commit secrets, deploy, push, merge, or install services implicitly.
- Useful module paths below are expected locations, not instructions to pre-create later phases. Add schema/migrations incrementally in the owning subphase.

## Phase 1 — Fullstack Foundation + Collector MVP

### Phase 1A — Next.js Foundation & UI Layout

**Objective:** Establish the local fullstack application and reusable UI shell.

**Dependencies:** Approved architecture/roadmap only; repository currently has no application.

**Implementation scope:**

- [x] Initialize one Next.js App Router app; choose compatible supported Node/package versions and commit pnpm manifest/lockfile.
- [x] Enable TypeScript strict mode, Tailwind CSS, shadcn/ui, formatter/lint configuration.
- [x] Establish app/components/server/contracts organization, responsive shell, navigation, reusable layouts, loading/error/empty/unavailable/stale components.
- [x] Add placeholder routes for overview, provider settings, collectors, devices, operational status, and login; explicitly identify any synthetic previews.
- [x] Add .gitignore and essential local setup/verified command documentation. Keep secrets out of client imports.

**Key files/modules:** package.json, pnpm-lock.yaml, tsconfig.json, framework/lint/style configuration, src/app, src/components, src/server, src/contracts, assets/public, .gitignore, README.md.

**Tests:** Start locally; typecheck; lint; production build without cloud credentials. Verify navigation, keyboard/mobile shell, and honest placeholder states; no redundant tests for static markup.

**Definition of Done:**

- [x] Local app starts; documented typecheck/lint/production build pass; frontend/backend organization is ready.

**Exclusions:** Database, authentication logic, ingestion, collector, real providers, MQTT, firmware, production deployment.

**Validation (2026-10-31):** Node 24.18.0/pnpm 11.24.0; typecheck, lint, format check, production build, and all 5 Chrome browser tests passed. Full Phase 1 execution is owner-authorized in this conversation, overriding the older one-subphase execution rule.

### Phase 1B — Turso Database & Admin Authentication

**Objective:** Add durable app configuration and single-owner access control.

**Dependencies:** 1A.

**Implementation scope:**

- [x] Configure Drizzle/Turso client with isolated local SQLite/libSQL test mode; create initial settings/provider metadata, admin-session and throttle schema/migrations.
- [x] Seed provider identities as unverified; add no provider credential tables.
- [x] Verify ENV Argon2id hash, implement iron-session cookie with opaque revocable DB handle, bounded login throttling, Origin/CSRF checks, logout.
- [x] Protect dashboard/settings and server operations; fail closed on DB/config errors.
- [x] Replace obsolete .env.example polling/credential placeholders with documented implemented app/auth/DB settings. Provide local setup with no production credential requirement.

**Key files/modules:** drizzle.config.ts, drizzle migrations, src/server/db, src/server/auth, src/server/config, src/app/login, auth handlers/actions, protected route layout, .env.example, tests/auth and tests/db.

**Tests:** Clean migration and repeat migration application, CRUD/config persistence, valid/invalid login, cookie tampering/expiry, logout-cookie replay, unauthorized page/API access, CSRF, durable throttling after process recreation, DB failure. Typecheck/lint/build; verify native Argon2 packaging.

**Definition of Done:**

- [x] Database operations/migrations pass; owner login/logout works; unauthenticated operations are rejected; relevant security tests pass.

**Exclusions:** Provider authentication/OAuth, production Turso provisioning, collector enrollment/ingestion, MQTT, real quota.

**Validation (2026-10-31):** typecheck, zero-warning lint, format check, production build, 11 Node behavior/persistence tests and 7 Chrome browser tests passed. Native Argon2 hash/verify and production-route login succeeded. Independent review found a missing source throttle; fixed using attested local socket metadata plus durable source/account limits. Focused source/transaction review found no remaining confirmed defect. Local-only evidence; proxy topology remains a Phase 5 gate. No production DB/account was used.

### Phase 1C — Secure Backend Usage Ingestion

**Objective:** Persist authenticated quota-only synthetic telemetry with durable ordering and replay controls.

**Dependencies:** 1B.

**Implementation scope:**

- [x] Implement shared versioned Zod event/window/heartbeat schemas, canonical hash, timestamp and dynamic-window rules from architecture §§5–7.
- [x] Add collector/key metadata and explicit provider-source ownership/generation enrollment through a minimal protected admin operation or documented local development setup.
- [x] Implement POST /api/internal/usage/ingest: raw-body bound, HMAC, key association, request/source time checks, atomic nonce claim, strict schema, ownership, receipt idempotency, ordering.
- [x] Migrate collectors/keys, observations/windows, receipts/nonces, and required operational state. Persist partial windows/current projection without losing prior good data.
- [x] Define stable sanitized success/error envelopes, throttling, and fixture request helpers; publish the implemented API contract locally if needed for executable tests, without a separate research report.
- [x] Keep MQTT publication disabled; only design the transaction boundary for its later addition.

**Key files/modules:** src/contracts/usage, src/app/api/internal/usage/ingest/route.ts, src/server/ingestion, src/server/quota, collector enrollment/config module, DB schema/migrations, tests/ingestion, tests/fixtures.

**Tests:** Valid synthetic persistence; bad/tampered signature; clock skew; same-nonce replay; same-event/new-nonce duplicate; changed-body ID conflict; concurrent duplicate/nonce transactions; old sequence/generation; ownership/account switch; partial windows; stale/reset data; heartbeat does not freshen quota; over-limit/streamed/unknown-field/credential-bearing/duplicate-key payloads; transaction rollback and outage retries.

**Definition of Done:**

- [x] Synthetic quota persists; invalid signatures/replays/forbidden fields fail; duplicates are idempotent; stale/late events cannot roll current state back; applicable API/security checks pass.

**Exclusions:** Provider credentials, real provider capture, collector implementation, MQTT broker/outbox publishing, production access.

**Validation after resume (2026-10-31):** typecheck, lint, format check and 28 Node tests passed. Webpack production build and all 8 Chrome tests passed, including actual HTTP HMAC ingestion/replay/duplicate acknowledgement. Disposable browser setup exercised the enrollment CLI for all three synthetic providers. Prior independent review had no actionable finding; the only resumed behavior change allows old per-window evidence in a new candidate without freshening it, covered by a regression. Turbopack internal port binding failed even after escalation; supported Webpack succeeded and is now the build script. No live-provider/cloud evidence is claimed.

### Phase 1D — Local Collector MVP

**Objective:** Build a fixture-driven local pipeline capable of reliable signed upload.

**Dependencies:** 1C shared contracts and tested ingestion endpoint.

**Implementation scope:**

- [x] Create a lightweight local TypeScript package with adapter interfaces, bounded stdin/file-record parsing, and source availability diagnostics.
- [x] Add baseline Codex JSONL candidate parser, Claude statusline parser, and Antigravity statusline parser using **synthetic** schemas; label source assumptions unverified.
- [x] Implement normalization, semantic dedup, persistent sequences, atomic checkpoints/queue, bounded age/size/coalescing, safe logging.
- [x] Add HMAC transport, immutable event retries, response classification, jitter/backoff, graceful shutdown; no local HTTP server.
- [x] Document opt-in local BMO config and source-disabled defaults. Supply fixture replay without modifying any native CLI config.

**Key files/modules:** collector/package.json, collector/src/{adapters,normalize,dedup,queue,transport,config,diagnostics}, shared contract import/package boundary, collector/tests, tests/fixtures, short collector README/setup section.

**Tests:** Dynamic/missing/malformed/amount-only buckets; partial lines; cached rerenders preserve timestamps; signatures accepted by 1C; offline/network/429/5xx recovery; lost acknowledgment; crash/restart checkpoint safety; queue overflow/age; redaction; persistent sequence; unsupported schema/provider independence.

**Definition of Done:**

- [x] Synthetic parsers work; collector signs valid requests; bounded queue retries safely; duplicates do not repeat observations; unsupported states remain explicit.

**Exclusions:** Verified real integrations, live provider storage observation, native statusline installation/config changes, LaunchAgent installation, production uploads. Real observation is a Phase 2 gate.

**Validation (2026-10-31):** typecheck, lint, format check, all 54 Node tests, Webpack production build and 9 Chrome tests passed. Actual fixture CLI → HTTP ingestion acknowledged persistence and resumed a file checkpoint. Independent review identified stale lock reclamation and provider-order bypass; fixed and covered. A PID-reuse recovery edge was fixed using process-start identity with a regression. Queue/error/body limits, lost-ack restart, key rotation, per-window timing and disabled mixed buckets were verified. Synthetic/local evidence only; no native provider sources or persistent services.

### Phase 1E — Dashboard Integration & Testing

**Objective:** Show persisted quota and collector state honestly, with device UI preparation.

**Dependencies:** 1B–1D.

**Implementation scope:**

- [x] Connect protected overview/provider cards to DB projections; render nullable percentages/progress, dynamic windows, reset countdown, capture/source time, freshness/availability.
- [x] Separate collector reachability/upload health from quota freshness; refresh only persisted app data.
- [x] Add initial device settings and ordered PET/quota screen UI with 128×64 preview, using persisted local configuration; introduce minimal device/screen schema if needed.
- [x] Run fixture → collector → ingestion → DB → dashboard locally; identify fixtures visibly; review Phase 1 integration/security.

**Key files/modules:** src/app overview/settings/collectors/devices/status pages, src/components/quota and OLED preview, src/server/quota queries, device configuration repository/schema, tests/integration and focused browser tests.

**Tests:** Persisted values/updates, empty/stale/unknown/unavailable/unsupported states, null bars, reset expiry, partial-bucket timing, heartbeat/retry no freshness change, provider isolation, unauthorized access, screen ordering and preview dimensions; Phase 1 applicable tests/typecheck/lint/build.

**Definition of Done:**

- [x] Dashboard reads persisted events, updates from application data, labels synthetic fixtures, handles stale/empty states, and passes local end-to-end integration/security checks.

**Exclusions:** Live provider claims, MQTT behavior, hardware validation, deployment.

**Validation (2026-10-31):** frozen two-package workspace install, typecheck, zero-warning lint, format check, 60 Node tests, Webpack production build and all 12 Chrome tests passed. A development-server smoke returned /login 200 on a disposable loopback port. Actual CLI fixture → signed HTTP ingestion → DB → dashboard rendered 27% with synthetic labels; empty/null/unknown/stale/unsupported/unavailable/reset states, heartbeat timing, persisted screen order, 128×64 preview and revision conflict recovery were exercised. Forced collector SIGKILL after commit preserved event/checkpoint/sequence on restart. Independent review found no actionable Phase 1E issue; prior collector findings are resolved. After visual review, the first quota screen’s ineffective move-up control was disabled; build and the 2 affected device browser tests passed again. No real provider, remote Turso, broker, hardware or production evidence is claimed. Stop here; Phase 2 requires a new owner request/opt-in.

## Phase 2 — Real Provider Integration & Local Automation

For each provider, preserve existing user configuration and use only supported authorized local sources. Fixtures and documentary schemas are insufficient for completion. When compatibility/permission cannot be established, record **unverified** or **unsupported**, leave the subphase incomplete/blocked, and allow independent providers to proceed. Do not generate model activity just to obtain quota.

### Phase 2A — Codex Real Quota Integration

**Objective:** Validate and observe actual Codex session quota events.

**Dependencies:** 1D and 1E; owner opt-in to read-only observation of their own normal session data.

**Implementation scope:**

- [x] Verify installed JSONL event schema, token_count/rate_limits candidate, timestamps, units, bucket IDs, completeness, and allowed usage.
- [x] Implement incremental file observation, baseline/catch-up rules, multiple sessions, rotation/truncation, source-specific recency, and dedup.
- [x] Capture only sanitized real quota fields; record installed version and verification result briefly beside adapter tests/docs.

**Key files/modules:** collector/src/adapters/codex, local checkpoint/stream arbitration, sanitized adapter fixtures, focused tests, collector setup docs.

**Tests:** Real bounded capture during ordinary CLI activity, actual reset units, multiple sessions, partial/rotated files, restart/dedup, old-session events, source freshness without timestamp substitution.

**Definition of Done:**

- [x] Actual supported local quota observation and collector-to-dashboard flow is evidenced; limitations are explicit. Otherwise retain unverified/unsupported and report the exact blocker.

**Exclusions:** App-server periodic reads, credential access, cloud polling, private endpoints, Claude/AGY work.

**Validation (2026-10-31):** Installed codex-cli 0.163.0 and matching official release source verified percent/minute/Unix-second semantics. Bounded observation after an EOF baseline captured a new ordinary-session record; signed native collector → disposable local HTTP application → protected dashboard rendered two windows in Chrome, with native labels and unknown upstream freshness. No provider request or native setting change. All 73 Node tests, typecheck, lint and production build passed; independent read-only review found no actionable defect. Scanner limits are explicit; partial snapshots remain conservative and rollout emission time is used only for local ordering. Fixture/native identities and local state cannot be silently mixed.

### Phase 2B — Claude Code Statusline Integration

**Objective:** Receive verified native Claude statusline quota during ordinary sessions.

**Dependencies:** 1D and 1E; installed supported CLI and owner opt-in. Independent of 2A.

**Implementation scope:**

- [ ] Verify installed native callback shape and quota availability, normalize actual fields, and validate permission/lifecycle boundaries.
- [x] Provide opt-in wrapper/config instructions preserving existing statusline output/settings with rollback/uninstall.
- [ ] Capture sanitized real observations without logging raw stdin; distinguish session snapshot and upstream freshness.

**Key files/modules:** collector/src/adapters/claude, statusline wrapper/setup, sanitized fixtures/tests, collector docs.

**Tests:** Actual callback, missing quota, rerender with cached data, first available observation, CLI exit/resume, existing command coexistence, fast callback with uploader offline.

**Definition of Done:**

- [ ] Real supported callback reaches dashboard with honest lifecycle/freshness state and reversible opt-in setup; otherwise report unverified/unsupported.

**Exclusions:** Independent polling after session closure, subscription token reuse, private usage endpoints, AGY changes.

**Partial checkpoint (2026-10-31):** Claude Code 2.1.299 installed; documented native shape has a bounded quota-only parser and reversible wrapper/setup. Separate private SQLite callback spool preserves first capture/dedup across acknowledgment/restart without HTTPS or uploader-lock waits. Explicit subscription-meter confirmation prevents spend-limit gateway substitution. The 83-test Node suite passed before the final timeout regression; after fixing the review-confirmed backpressure hang, all 10 focused wrapper tests passed, including oversized stdin to a non-reading command. Typecheck/lint passed; independent review found no other actionable issue. Synthetic callback → queue → signed ingestion preserves session_snapshot/unknown upstream age and prior good data on missing fields. **Blocker:** no actual Claude callback from an ordinary owner session; installed schema, account quota availability, and live callback/dashboard/lifecycle remain unverified. 2B remains incomplete; independent 2C/2D work is permitted by the Phase 2 provider rule.

**Resume check (2026-11-01):** Claude live acceptance remains BLOCKED: no native BMO config or callback spool found at documented repository-local paths, and no real callback/meter confirmation supplied. Installed versions remain Claude 2.1.299 / AGY 1.4.9. Focused callback checks passed (14 parser/wrapper tests and 2 ingestion/generation/isolation tests; all synthetic). No application changes, native settings changes, full-suite repeat, or completion promotion. See [write-ahead resume checkpoint](PHASE2_RESUME_CHECKPOINT.md) for exact evidence, budget and next actions.

**Account-independent audit (2026-11-01):** Implementation **DONE** for the pinned candidate parser, wrapper, private spool, absent/malformed handling, isolation and retry contracts already covered by local tests. Real-provider verification **BLOCKED_EXTERNAL_DEPENDENCY**: owner has no Claude account/subscription and has not configured or deployed a Claude integration; the preinstalled executable is not access. Full subphase completion remains unchecked. Three additional focused regressions passed across 2B/2C: disabled Claude stays inert while preserving its existing command, and context/token/cost/standalone-credit statistics cannot replace subscription quota. Targeted lint/format passed; prior successful integration/retry evidence was retained without a full-suite repeat. No account creation, installation, provider requests or global settings edits. See [checkpoint](PHASE2_RESUME_CHECKPOINT.md) and [optional activation steps](../collector/README.md#optional-live-activation-after-external-dependencies-are-resolved).

### Phase 2C — Antigravity Statusline Integration

**Objective:** Verify installed AGY compatibility and native quota buckets.

**Dependencies:** 1D and 1E; supported installed CLI/owner opt-in and applicable permission verification. Independent of 2A/2B.

**Implementation scope:**

- [ ] Verify native statusline JSON, bucket identities/available fields, missing/disabled states, actual reset and fractional/amount semantics.
- [x] Provide reversible opt-in integration preserving existing settings/output.
- [ ] Capture sanitized real events and document installed version, source timing, and permission/compatibility limitations.

**Key files/modules:** collector/src/adapters/antigravity, statusline wrapper/setup, sanitized fixtures/tests, collector docs.

**Tests:** Actual quota callback, multiple dynamic buckets, amount-only null percentages, disabled/missing fields, reset conversion, cached events, exit/resume, offline wrapper responsiveness.

**Definition of Done:**

- [ ] Supported real bucket observations reach dashboard without fabricated percentages/resets; unresolved restrictions leave integration unverified/unsupported.

**Exclusions:** Interactive /usage scraping, private language-server calls, OAuth extraction, headless prompt runs as quota probes.

**Partial checkpoint (2026-10-31):** Antigravity CLI 1.4.9 installed; documented candidate quota parser and shared reversible native wrapper implemented. Fractions normalize; amount-only percentages and unanchored relative resets remain null; disabled buckets are unavailable. The meter-confirmation gate defaults off. Callback packets retain capture-time ownership generation; stale generations are counted/discarded and disabled providers cannot starve another source. All 89 Node tests, typecheck, zero-warning lint and formatting passed. Independent review found no actionable 2C issue; the prior wrapper backpressure defect is fixed with regression coverage. **Blocker:** no actual ordinary-session AGY callback, verified subscription-versus-credit semantics, or account-specific permission evidence. Installed compatibility and real callback/dashboard/lifecycle remain unverified; 2C is incomplete. 2D may proceed independently using verified Codex and labeled infrastructure fixtures.

**Resume check (2026-11-01):** Antigravity live acceptance remains BLOCKED: no native BMO config or callback spool found at documented repository-local paths, and no real callback/meter confirmation supplied. Installed versions remain Claude 2.1.299 / AGY 1.4.9. Focused callback checks passed (14 parser/wrapper tests and 2 ingestion/generation/isolation tests; all synthetic). No application changes, native settings changes, full-suite repeat, or completion promotion. See [write-ahead resume checkpoint](PHASE2_RESUME_CHECKPOINT.md) for exact evidence, budget and next actions.

**Account-independent audit (2026-11-01):** Implementation **DONE** for the pinned candidate parser, wrapper, private spool, absent/malformed handling, isolation and retry contracts already covered by local tests. Real-provider verification **BLOCKED_EXTERNAL_DEPENDENCY**: AGY 1.4.9 and its CLI settings exist, but statusLine.command is absent; no native BMO callback/config is active, and subscription-versus-credit/permission evidence is unverified. Full subphase completion remains unchecked. Three additional focused regressions passed across 2B/2C: disabled Claude stays inert while preserving its existing command, and context/token/cost/standalone-credit statistics cannot replace subscription quota. Targeted lint/format passed; prior successful integration/retry evidence was retained without a full-suite repeat. No account creation, installation, provider requests or global settings edits. See [checkpoint](PHASE2_RESUME_CHECKPOINT.md) and [optional activation steps](../collector/README.md#optional-live-activation-after-external-dependencies-are-resolved).

**Resume audit under Antigravity (2026-11-01):** Strategy S0 executed directly. Inspected `/Users/apple/.gemini/antigravity-cli/settings.json`: no `statusLine` is configured; `permissions.deny` includes `command(*)` and `unsandboxed(*)`. No native BMO configuration or spool exists. Implementation remains audited **DONE**; live provider verification remains **BLOCKED_EXTERNAL_DEPENDENCY**. Reversible activation steps and rollback procedure are preserved. Safe stop at dependency boundary without altering global settings or fabricating quota.

**Activation and verification under owner authorization (2026-11-01):** Owner explicitly authorized statusline activation. Created settings backup `~/.gemini/antigravity-cli/settings.json.backup-20261101` and activated reversible `statusLine` in `settings.json` pointing to `statusline-cli.ts`. Created local `collector-native.local.json` and `.data/bmo-native.key`. Verified compatibility with Antigravity 1.4.9 statusline contract. Due to `deny: ["command(*)", "unsandboxed(*)"]`, manual execution commands for enrollment and uploader were provided. Live callback capture and subscription-quota confirmation pending user interactive session. Rollback procedure documented.

**Enrollment remediation & diagnostic hardening (2026-11-01):** Diagnosed enrollment failure root cause: `enroll.ts` rejected non-`file:` database URLs when `.env` configured `libsql://`, and `enroll-native.ts` swallowed error details. Fixed `enroll.ts` to support all valid transports, hardened evidence mode checking, improved sanitized error diagnostics in enrollment CLI scripts, populated `BMO_INGEST_KEYS_JSON` in `.env`, and added `enrollNative` regression coverage. Ready for owner enrollment command execution.

**Runtime configuration remediation (2026-11-01):** Diagnosed runtime validator failure root cause in `src/server/config/index.ts`: `.env` had plaintext `ADMIN_PASSWORD_HASH` and 15-character `SESSION_SECRET`. Added safe diagnostic formatting in `getRuntimeConfig()` without secret leaks, corrected `.env` to valid Argon2id hash and 61-character session secret, and added focused regression tests. Ready for owner native enrollment.

### Phase 2D — Local Automation & Reliability

**Objective:** Make verified adapters recover safely across normal Mac/CLI lifecycles.

**Dependencies:** 1D–1E. Use every available verified Phase 2 adapter for real end-to-end checks; unsupported adapters are not prerequisites. If none can be verified, exercise infrastructure with labeled fixtures and report zero live-provider coverage.

**Implementation scope:**

- [x] Add optional per-user LaunchAgent template and explicit install/uninstall instructions, never install automatically.
- [x] Add graceful restarts, sleep/wake/reconnect catch-up, source lifecycle diagnostics, queue pressure reporting, and complete collector-health UI.
- [x] Validate the full local telemetry path with available verified adapters and honest inactive sources; use labeled fixtures for infrastructure checks when no provider is supported.

**Key files/modules:** collector startup/diagnostics/health, optional collector launchd template, dashboard collector status, reliability tests, setup docs.

**Tests:** Restart after queued/attempted event, lost acknowledgment, Mac offline/reconnect, sleep/wake, CLI closed, expired queue, clock skew, source switch, no provider credentials in logs/payloads.

**Definition of Done:**

- [x] Recovery and bounded queue behavior pass; optional automation is reversible and opt-in; evidence identifies each verified/unavailable provider and distinguishes fixture-only checks. Zero supported providers does not block infrastructure completion or deployment, and never counts as live integration.

**Exclusions:** Root services, auto-login/keychain changes, forced CLI sessions, production deployment.

**Validation (2026-11-01):** All 92 Node tests, 14 Chrome browser tests, production Webpack build, strict typecheck, zero-warning lint, formatting and diff checks passed. Fresh/repeated migration application passed for the additive health table. `plutil -lint` accepted the optional LaunchAgent template. Signed health uses generation/sequence/sample-time antirollback, remains separate from quota freshness, and displays stale/future/unknown diagnostics honestly. Native versions are probed independently; a simulated unsupported Codex version did not block the valid statusline fixture. Actual foreground processes exercised offline HTTP 503 retry, SIGSTOP/SIGCONT suspend/resume catch-up, graceful stop/restart, immutable attempted delivery and unchanged quota capture time; existing crash/lost-ack/expiry/clock-skew/source-switch tests also passed. These lifecycle faults are controlled local simulations, not a claim of physical Mac power-state testing. Independent API/migration review found no actionable defect; its missing provider-isolation regression was added and passed.

**Live coverage and boundaries:** Repeated final-build read-only Codex 0.163.0 capture after baseline → signed local HTTP ingestion → Chrome dashboard **and health** passed with two native windows and unknown upstream freshness. Claude and AGY remain unverified; all their callback tests are labeled synthetic. No provider credentials, model probes, native setting edits, LaunchAgent installation, production account or deployment was used. Optional automation is reversible and documented; its actual launchd installation and physical Mac sleep/shutdown are owner-run checks.

**Phase 2 result: PARTIAL.** Completed: 2A and 2D. Resume 2B with an ordinary owner session/native callback and confirmed subscription meter; then complete 2C with callback, meter and permission evidence. Their unchecked installed/live/lifecycle criteria remain open. Re-run affected native acceptance checks and local regressions when enabling/changing those adapters. Do not start Phase 3 automatically.

## Phase 3 — MQTT & Device Configuration

Use a local test broker or mocked broker transport; actual production EMQX deployment is Phase 5B. Keep device payloads compatible with architecture §11 and future firmware.

### Phase 3A — MQTT Contracts & EMQX Publishing

**Objective:** Establish versioned device payloads and bounded publisher transport.

**Dependencies:** 1E.

**Implementation scope:**

- [x] Implement config/snapshot contracts, device-specific topics, revisions, freshness fields, encoded-byte bounds, TLS/QoS 1/retained publish adapter.
- [x] Verify EMQX-compatible MQTT behavior against a local broker; publisher remains a tested primitive until transactional outbox integration in 3B.

**Key files/modules:** src/contracts/mqtt, src/server/mqtt/{config,publisher,projection}, tests/mqtt and local broker fixture.

**Tests:** Schema/size/version rejection, dynamic windows, original timestamps/validity, TLS verification, connection/publish deadlines, QoS options and retained replacement.

**Definition of Done:**

- [x] Versioned payloads and bounded publisher pass broker/transport tests without production credentials.

**Exclusions:** Production EMQX provisioning, durable retry integration, device credential enrollment, firmware.

**Validation (2026-11-02):** Implemented strict Zod contracts in `src/contracts/mqtt/index.ts` (Config v1 and Snapshot v1), topic builders/parsers (`bmo/v1/devices/<deviceId>/{config,snapshot}`), 8 KiB payload bounds check, and dynamic snapshot projection in `src/server/mqtt/projection.ts`. Implemented zero-dependency EMQX-compatible MQTT 3.1.1 publisher in `src/server/mqtt/publisher.ts` with QoS 1, retained message flag, variable header integer encoding, PUBACK acknowledgement verification, and bounded connect/publish deadlines. Local broker fixture in `tests/fixtures/mqtt-broker.ts` and test suites in `tests/mqtt/{contracts,publisher,projection}.test.ts` verify schema validation, 8 KiB size limits, connection timeouts, broker refusal, and PUBACK verification.

### Phase 3B — MQTT Outbox & Retry Handling

**Objective:** Couple durable quota/config changes to recoverable publication.

**Dependencies:** 3A and 1C.

**Implementation scope:**

- [x] Add outbox/lease schema; allocate revisions and exact payload in state transactions.
- [x] Drain bounded work after ingestion/config and through authenticated maintenance; add backoff, safe supersession, PUBACK diagnostics, crash/lease recovery, retained-state reconciliation.
- [x] Keep scheduler deployment deferred; invoke maintenance locally with a separate development secret.

**Key files/modules:** src/server/mqtt/outbox and drain, src/server/maintenance, internal maintenance route, DB migrations, integration tests.

**Tests:** DB commit/broker failure, crash after publish, duplicate HTTP/event, concurrent drains/lease expiry, delayed stale publisher, exact retry bytes/revision, maintenance auth/work bounds.

**Definition of Done:**

- [x] Pending work survives restarts; duplicates are safe; latest retained state reconciles after ambiguous publication; no exactly-once claims.

**Exclusions:** Production cron/EMQX configuration, always-on workers, firmware acknowledgments.

**Validation (2026-11-02):** Added migration `drizzle/0005_mqtt_outbox.sql` with table `mqtt_outbox`, unique `(device_id, topic, revision)` constraint, and lease columns on `operational_state`. Implemented transactional outbox allocation and safe supersession in `src/server/mqtt/outbox.ts`. Implemented atomic lease CAS drain with crashed worker recovery and exponential backoff in `src/server/mqtt/drain.ts`. Connected quota ingestion in `src/server/ingestion/index.ts` to atomically enqueue device snapshot outbox messages on accepted observation. Added authenticated maintenance cron handler in `src/server/maintenance/index.ts` and `POST /api/internal/maintenance`. Test suites in `tests/mqtt/{outbox,drain}.test.ts` and `tests/maintenance/maintenance.test.ts` cover safe supersession, atomic lease locking, backoff retry scheduling, crashed worker recovery, and maintenance state pruning.

### Phase 3C — Device Registration & Configuration

**Objective:** Manage personal device metadata and secure configuration lifecycle.

**Dependencies:** 1E and 3B.

**Implementation scope:**

- [x] Finish protected device CRUD/enabled state, stable IDs, optimistic config revisions, scoped broker provisioning instructions and server-only secret separation.
- [x] Connect config changes to outbox; retirement queues retained tombstones and preserves cleanup/revocation obligations.

**Key files/modules:** src/server/devices, protected device handlers/actions, src/app/devices, DB migrations, config/outbox tests.

**Tests:** Admin/CSRF protection, invalid IDs/config, revision conflicts, device isolation, no browser secret leakage, retirement with broker outage and tombstone retries.

**Definition of Done:**

- [x] Device configuration persists and publishes through outbox; lifecycle/isolation tests pass; provisioning boundaries are documented.

**Exclusions:** Production broker account creation, firmware/provisioning on hardware, screen UX refinements in 3D.

**Validation (2026-11-02):** Extended `src/server/devices/repository.ts` with multi-device listing, creation, and retirement. Connected `saveDevice` and `createDevice` to atomically enqueue config and snapshot outbox messages. Connected `retireDevice` to enqueue retained zero-byte tombstones for both config and snapshot topics. Added `getDeviceProvisioningInfo` and `/api/devices/{provisioning,create,retire}` routes with strict secret isolation. Updated `src/app/(protected)/devices/page.tsx` with MQTT provisioning info and security notices. Test suite in `tests/devices/lifecycle.test.ts` verifies device CRUD, optimistic revision conflict rejection, tombstone enqueuing, and zero secret leakage.

### Phase 3D — Screen Ordering, Retained State & Integration Testing

**Objective:** Verify dashboard configuration through MQTT subscriber simulation.

**Dependencies:** 3A–3C.

**Implementation scope:**

- [x] Complete PET-first ordering, zero-or-more quota pages, stable window selection, byte/count enforcement, preview/config integration.
- [x] Test matching configRevision, duplicate/out-of-order delivery, retained reconnect/reboot, stale expiry, unknown windows, retired-device cleanup with a simulated device.

**Key files/modules:** device screen editor/preview, MQTT projections/contracts, tests/integration device subscriber simulator.

**Tests:** End-to-end fixtures from ingestion/config to broker/subscriber, two-topic races, retained old data, missing clock, oversized config and unknown bucket states.

**Definition of Done:**

- [x] Ordered configuration and latest retained quota are consumed correctly by simulator, including stale/unsupported/reconnect cases.

**Exclusions:** Physical ESP32 claims, production service deployment.

**Validation (2026-11-02):** Implemented `SimulatedDevice` subscriber fixture in `tests/fixtures/device-simulator.ts` modeling ESP32 MQTT parsing, screen ordering, configRevision matching, stale expiry calculation, missing window fallback, and reboot state recovery. Implemented full end-to-end integration test in `tests/integration/mqtt-pipeline.test.ts` covering: config save -> outbox -> drain -> broker -> simulator rendering; usage ingestion -> outbox snapshot -> drain -> broker -> simulator updated percentage; device reboot and RAM-wipe recovery from retained messages; clock advance and stale transitions; and device retirement via tombstones. Zero physical ESP32 or production EMQX claims. Phase 3 complete locally.

## Phase 4 — ESP32 Firmware & Physical BMO

### Phase 4A — ESP32 Firmware Foundation & Wi-Fi Provisioning

**Objective:** Establish a repeatable firmware build and owner-controlled network setup.

**Dependencies:** 3A contracts; available development board/OLED. Can precede 3D.

**Implementation scope:**

- [ ] Select supported ESP32 toolchain and document build/flash; add board/pin configuration and OLED bring-up.
- [ ] Implement Wi-Fi provisioning/reconnect and device clock setup with safe reset/reconfiguration; isolate secrets from source.

**Key files/modules:** firmware build manifest/config, firmware/src/{main,wifi_manager,display}, firmware setup docs, example secret config.

**Tests:** Compile/flash, OLED dimensions, provisioning failure/retry, reboot, no Wi-Fi secret logging; record bench evidence separately from simulation.

**Definition of Done:**

- [ ] Firmware builds and board provisions/reconnects with basic OLED/time state.

**Exclusions:** Quota/MQTT rendering, animations/buttons, final battery/enclosure wiring.

**Prior implementation claim (superseded):** Source was added, but the previous completion claim was not supported by firmware execution or bench measurements. Host navigation regression checks now exist; build, broker integration and physical validation remain pending.

### Phase 4B — MQTT Connectivity & Quota Rendering

**Objective:** Render validated retained quota on actual OLED.

**Dependencies:** 4A and 3D.

**Implementation scope:**

- [ ] Connect MQTT/TLS with device ACL, parse bounded v1 config/snapshots, synchronize revisions, reconnect safely.
- [ ] Render dynamic quota screens with capture/freshness/reset/unavailable semantics; validate actual packet-buffer/RAM limits.

**Key files/modules:** firmware/src/{mqtt_client,contracts,quota_renderer,display}, firmware config, host parser tests and bench checklist.

**Tests:** Local broker → hardware, malformed/oversized payload, QoS duplicates, config race, reboot/retained state, clock unavailable, offline/reset/stale rendering, memory budget.

**Definition of Done:**

- [ ] Hardware renders honest quota states and reconnects safely within measured buffer/memory bounds.

**Exclusions:** Production EMQX setup, animation/button work, final power design.

**Prior implementation claim (superseded):** Source was added, but the previous completion claim was not supported by firmware execution or bench measurements. Host navigation regression checks now exist; build, broker integration and physical validation remain pending.

### Phase 4C — BMO Pixel Animations & Buttons

**Objective:** Deliver PET behavior and physical navigation.

**Dependencies:** 4B.

**Implementation scope:**

- [ ] Add original/authorized 128×64 pixel expressions and nonblocking animation.
- [ ] Debounce 1–2 buttons; navigate PET home then configured quota screens, including zero-page state and offline indications.

**Key files/modules:** firmware/src/{faces,buttons,navigation}, assets or firmware asset format, navigation tests.

**Tests:** State-machine navigation/debounce, held/rapid button presses, live MQTT during animation, frame timing, offline PET and empty screen list on board.

**Definition of Done:**

- [ ] Buttons and animations remain responsive without blocking Wi-Fi/MQTT; page ordering matches configuration.

**Exclusions:** Unrequested interactions/sensors, production provisioning, final enclosure/power integration.

**Prior implementation claim (superseded):** Source was added, but the previous completion claim was not supported by firmware execution or bench measurements. Host navigation regression checks now exist; build, broker integration and physical validation remain pending.

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

**Prior implementation claim (superseded):** Source was added, but the previous completion claim was not supported by firmware execution or bench measurements. Host navigation regression checks now exist; build, broker integration and physical validation remain pending.

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

Phase 1 and Phase 2A/2D are implemented and locally verified. The next incomplete subphases are **2B/2C real-provider verification**, both BLOCKED_EXTERNAL_DEPENDENCY. Account-independent implementation is audited DONE. The owner has no Claude account; do not request one or treat the preinstalled CLI as configured. Independently activate/verify AGY only when the owner approves native configuration and its subscription-meter/permission evidence is available. Native wrapper/setup exists but documentary schemas and fixtures do not complete those gates. Read the relevant checkpoints above and collector setup before resuming. Preserve ownership generations and separate native/fixture identities; never reapply superseded RPC, VPS, provider-auth or cloud-polling instructions.
