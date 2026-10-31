# Phase 1 checkpoint — historical pause and resumed completion

Recorded: 2026-10-31T02:06:44+07:00.
Project: BMO Personal / package `bmo-personal`, repository `BMO_QUOTA_PET`.
Target: full Phase 1. Status: **PARTIAL, PAUSED** at the owner's explicit request.
Resume only after a new owner instruction in the same conversation.

## Completed work

### Phase 1A — complete and verified

Verified the existing Next.js App Router foundation rather than reimplementing it: strict TypeScript, Tailwind/shadcn primitives, responsive shell, six routes, reusable loading/error/empty/unavailable/stale components, browser/server boundaries and pinned setup. Initial typecheck, lint, format check, production build and five Chrome browser tests passed.

### Phase 1B — complete and verified

- Drizzle/libSQL client, isolated file database, actual checked-in SQL migration and checksummed transactional migration ledger; repeat application, unverified provider seeds, settings persistence with optimistic revisions, admin-session and durable throttle schema. No provider credential tables.
- Argon2id ENV hash verification, sealed HTTP-only/SameSite=Lax iron-session cookie with opaque random handle; SHA-256 handle hash in the database, fixed eight-hour expiry, per-request DB validation and logout revocation blocking captured-cookie replay.
- Protected route group, reusable operation guard, bounded streamed login body, bounded expensive verification, Origin and cookie-bound CSRF checks, fail-closed config/database behavior.
- Durable source-first and account login limits. A single custom Next listener derives the socket peer, overwrites private source metadata and attests it with an ephemeral process secret; arbitrary forwarded headers are ignored. Bounded serialized local write transactions prevent observed SQLite writer contention.
- Login UI, honest logout error display, dotenv-safe password-hash helper, migration script, preservation of explicit process configuration during env loading, disposable browser server/owner/database.
- Dependencies/lockfile updated: libSQL 0.18.0, Drizzle ORM 0.45.4, Argon2 0.45.1, iron-session 9.0.1, Zod 4.6.7, Drizzle Kit 0.31.11, Vitest 5.0.5, tsx 4.23.15 and @next/env 16.4.3. Version-scoped native Argon2/esbuild build approvals recorded.
- Full 1B gate passed: typecheck, zero-warning lint, format check, build, 11 Node tests, seven Chrome tests. Native Argon2 hash/verify and production-build route login succeeded.
- Independent review found missing validated-source throttling; fixed. Focused source-boundary and transaction follow-up reviews found no remaining confirmed defect. 1B roadmap checkboxes updated after its gate.

### Phase 1C — implemented/tested portions; whole subphase remains incomplete

- Strict versioned Zod observation/window/heartbeat schemas, dynamic windows, nullable values, complement/evidence/chronology checks, canonical semantic input/signing lines and per-window freshness/reset derivation.
- Duplicate-key-aware bounded-depth JSON parser, including escaped-key detection.
- Node `POST /api/internal/usage/ingest` handler: streamed 32 KiB raw-byte cap, exact-body SHA-256/HMAC, key association/revocation, request/source times, strict allowlists, path/query/media/origin restrictions.
- Transactional nonce replay claims, immutable-body receipt idempotency, ownership/source generations, sequence conflicts/history/supersession, per-window recency, partial merges and server-approved complete-set semantics.
- Durable commit before acknowledgement; rollback on failure. Heartbeat/upload health stays separate from quota ordering/freshness. Sanitized envelopes/request IDs, bounded pre-auth and durable per-collector throttle, Retry-After.
- Second SQL migration and corresponding Drizzle additions: collectors/keys, ownership metadata, observations/windows, current projection, receipts/nonces and operational state.
- Explicit local synthetic-only enrollment function/script: source/account switch advances generation and clears that provider projection. No key secrets in SQLite; provider verification remains unverified.
- Synthetic signing fixtures and 16 ingestion tests. Combined latest suite: **27 passing Node tests**. Independent read-only 1C audit found no actionable confirmed finding; reviewer did not run tests.
- MQTT publication remains absent/disabled.

## Partial work and exact remaining work

### Finish Phase 1C before starting 1D

1. **Configuration/setup documentation is unfinished.** README and `.env.example` still describe 1B. Add the implemented `BMO_INGEST_KEYS_JSON` key-ID → distinct random 32-byte lowercase-hex BMO secret mapping and explicit `BMO_ALLOW_FIXTURE_SETUP=true` local setup opt-in; describe IDs, ownership generation, partial snapshots, re-enrollment and turning setup off. Commit placeholders only.
2. `scripts/enroll-fixture.ts` exists but has **no package script and no executed CLI evidence**. Verify it against a disposable local database. Direct invocation: `node --conditions=react-server --import tsx scripts/enroll-fixture.ts fixture-collector fixture-key codex`. Re-enrollment advances generation and clears projection; do not apply casually to existing owner state.
3. Local API export/documentation is unfinished. The attempted batch failed Python parsing **before any file writes**. `scripts/export-api-contract.ts`, `api/usage.openapi.json`, `api/README.md`, `api:contract` and `fixture:enroll` scripts **do not exist**. Architecture + Zod + executable fixtures are the current contract sources. Decide whether a generated local OpenAPI artifact is useful; do not invoke nonexistent scripts.
4. Open design consideration, not a reviewer-confirmed defect: the current age check rejects new events if either the envelope **or any window capture** is older than 24 hours. A contemplated change allowing older cached per-window captures was **not applied**. Confirm the architecture interpretation and add a focused regression if changing it.
5. Confirm/document the canonical semantic-digest boundary before future collector use: `semanticInput` returns canonical text; raw-body SHA-256 is computed inside Node ingestion. Collector dedup must use consistent versioned semantics and preserve original capture/evidence times.
6. Run final **1C** typecheck, lint, format check, Node tests, production build and browser tests. The **latest production build predates 1C**. No final 1C build/browser pass is claimed.
7. Exercise a signed fixture through the actual local Next HTTP endpoint using an isolated DB and synthetic configuration. Current ingestion tests invoke the handler with Request objects and libSQL; they do not prove live HTTP routing/path handling or production route packaging. Verify the CLI setup as well.
8. Resolve failures and rerun affected checks; only then mark justified 1C roadmap checkboxes/DoD. All 1C checkboxes remain unchecked.

### Phase 1D and 1E — not started

- 1D still needs the TypeScript collector package, synthetic provider adapters, bounded record parsing, normalization/dedup, durable sequence/checkpoint/immutable bounded queue, HMAC retry transport/backoff/shutdown, source-disabled opt-in config, fixture replay and reliability/privacy tests.
- 1E still needs protected persisted quota/provider/collector views with nullable values and honest per-window freshness/reset timing; initial persisted device settings, PET-first screen order and 128×64 preview; visible fixture labeling; complete synthetic collector → HTTP ingestion → DB → dashboard integration/security evidence.
- No collector package, real provider integration, quota dashboard integration, device schema/preview, MQTT, firmware, services or production deployment was begun. Do not start any of these while paused.

## Validation and known failures

| Check | Evidence |
| --- | --- |
| Initial 1A gate | Typecheck, lint, format check, build and 5 Chrome tests passed. |
| Final 1B gate | Typecheck, lint, format check, build, 11 Node tests and 7 Chrome tests passed. Native Argon2 hash/verify passed. |
| 1C typecheck | Passed after contracts/schema/fixtures/tests were added, before the final unused-import removal. Repeat as final gate. |
| Latest lint | `pnpm lint` passed after unused `getDb` import removal. |
| Latest Node suite | `pnpm test:unit`: **3 files, 27 tests passed** — 4 DB, 7 auth-route, 16 ingestion. |
| Final 1C format/build/browser | Not completed. New source/tests were Prettier-formatted; final whole check/build/browser evidence is pending. |
| 1C review | No actionable confirmed finding. Read-only; no reviewer-executed tests. |

Latest successful Node command: `pnpm lint && pnpm test:unit`, around 2026-10-31 02:00 local time. Ingestion tests cover signatures/skew/revocation, replay/idempotency/concurrency, sequence/generation/source switch, partial/complete windows, retained good values, heartbeat isolation, streamed/forbidden/duplicate-key/nested payloads, invalid values, old receipt acknowledgement, transaction rollback/outage recovery, throttle persistence and semantic/freshness/reset clocks.

Resolved during 1B: native build approvals, stale generated route types, database client typing, Argon2 PHC parameter-order mismatch, initial revocation/body-bound/time-unit issues, navigation lint warnings, dotenv expansion of explicit test hashes, and local concurrent-login SQLite contention. The 1B gate passed afterward. Browser tests use one worker because they mutate one shared disposable database; separate Node tests cover simultaneous auth/ingestion transactions.

Resolved during 1C: type narrowing and an unused-import lint failure. No failing executed Node test remains known. The last attempted finalization command failed with Python SyntaxError and then `pnpm api:contract` not found; its Python batch made no changes. No fix/export from that batch is present.

All evidence is synthetic/local. No production Turso, provider observations or hosted proxy behavior was verified. Phase 5 must verify the actual proxy topology: an attested socket peer behind a reverse proxy can be a shared proxy, not an individual user address. Current local server binds loopback and ignores forwarded headers.

## Subagents and ownership

- Main agent owns all remaining source, shared files, integration, tests and documentation. No app edit is in progress.
- `coder_1b`: configured gpt-6-luna / medium coder; initial 1B scaffold preserved. **Interrupted/stopped**, explicitly instructed to remain stopped. Main took over all ownership and completed integration. Do not resume stale dispatches/messages.
- `review_1b`: configured gpt-6-luna / medium read-only reviewer; 1B and 1C reviews **completed**, final findings collected. No file writes or tests by reviewer. Instructed to remain stopped.
- No researcher/test worker; no parallel coding; agent configs unchanged. No active child file operation remains.

## Files created or modified

Git state below was captured immediately before writing this checkpoint. `M` = modified tracked file. Five `D` paths were **relocated** into `src/app/(protected)`; the source copies remain in the untracked list. This pause discarded nothing.

### Tracked changes

```text
M	.env.example
M	.gitignore
M	AGENTS.md
M	README.md
M	docs/IMPLEMENTATION_PHASES.md
M	next-env.d.ts
M	package.json
M	playwright.config.ts
M	pnpm-lock.yaml
M	pnpm-workspace.yaml
D	src/app/collectors/page.tsx
D	src/app/devices/page.tsx
M	src/app/login/page.tsx
D	src/app/page.tsx
D	src/app/settings/providers/page.tsx
D	src/app/status/page.tsx
M	src/components/shell/app-shell.tsx
M	src/contracts/navigation.ts
M	src/server/README.md
M	tests/browser/shell.spec.ts
```

### Untracked files

`docs/prompt_chung.md` was already untracked before this workflow and was preserved untouched. Other listed files were created during this workflow, including this checkpoint. Nothing is staged.

```text
docs/PHASE_1_CHECKPOINT.md
docs/prompt_chung.md
drizzle.config.ts
drizzle/0001_initial.sql
drizzle/0002_ingestion.sql
scripts/auth-hash.ts
scripts/browser-server.ts
scripts/db-migrate.ts
scripts/enroll-fixture.ts
scripts/serve.ts
src/app/(protected)/collectors/page.tsx
src/app/(protected)/devices/page.tsx
src/app/(protected)/layout.tsx
src/app/(protected)/page.tsx
src/app/(protected)/settings/providers/page.tsx
src/app/(protected)/status/page.tsx
src/app/api/auth/csrf/route.ts
src/app/api/auth/login/route.ts
src/app/api/auth/logout/route.ts
src/app/api/internal/usage/ingest/route.ts
src/components/auth/login-form.tsx
src/contracts/usage/index.ts
src/server/auth/client-source.ts
src/server/auth/index.ts
src/server/config/index.ts
src/server/db/index.ts
src/server/db/schema.ts
src/server/db/settings.ts
src/server/ingestion/enroll.ts
src/server/ingestion/index.ts
src/server/ingestion/json.ts
tests/db/database.test.ts
tests/fixtures/usage.ts
tests/ingestion/ingestion.test.ts
tests/integration/auth-routes.test.ts
tests/server-only.ts
vitest.config.mts
```

## Exact resume sequence

1. Wait for the owner to resume. Then read this checkpoint, AGENTS, architecture sections 5–9 and roadmap 1C; inspect Git status and preserve existing work.
2. Keep the interrupted coder stopped; do not replay its old dispatch. Main owns all files. Reassess bounded delegation only if useful; do not repeat broad reviews without new risk.
3. Complete the eight remaining 1C items above with Node **24.18.0** / pnpm **11.24.0**, isolated synthetic configuration and a disposable DB.
4. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm build`, then `PLAYWRIGHT_CHANNEL=chrome pnpm test:integration` (or installed matching Chromium).
5. Record actual 1C gate results and only then proceed 1D → 1E after resumed owner authorization. Do not auto-commit/push, start Phase 2, observe live providers, change native CLI settings, deploy or install persistent services.

## Resumed

Owner resumed full Phase 1 on 2026-10-31. The preceding inventory is the historical pause state; current acceptance and validation are in IMPLEMENTATION_PHASES.md.

## Completed outcome after resume — 2026-10-31

Phase 1A–1E is now complete; the earlier partial/pause inventory is historical. IMPLEMENTATION_PHASES.md contains current checkboxes and evidence. Configuration/enrollment docs were completed without adding an unnecessary generated spec; old per-window captures are allowed but remain stale. The synthetic collector, guarded persisted dashboard and PET-first configuration/preview are integrated.

Verification: frozen workspace install, typecheck, lint, formatting, 60 Node tests, production build and 12 Chrome tests passed, along with a local development-server smoke. The final device-control adjustment passed the 2 affected browser tests and another build. Independent reviews are resolved. All evidence is synthetic/local; live providers, production Turso, MQTT and hardware remain unverified/outside Phase 1.

Adaptive execution: 1A S0; 1B S3; 1C S1 core/review then S0 checkpoint completion; 1D and 1E S1 with one scoped coder reused for separate ownership and sequential independent review. Main retained shared contracts, root configuration, server integration, tests and checkpoints. No fixed agent count or parallel coders. No source ownership remains delegated.

No commit, push, deployment, native CLI change or persistent service installation was performed. Existing docs/prompt_chung.md remains untouched. All changes are left for owner review. Resume Phase 2 only on a new explicit request with the required provider-specific opt-in.
