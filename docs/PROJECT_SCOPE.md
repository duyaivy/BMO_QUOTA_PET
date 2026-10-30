# BMO Personal — confirmed product scope

## Intended user and deployment
Personal project for one administrator only, **not SaaS**. Next.js handles frontend and backend in a single application, deployed on Render. A small SSD1306 OLED (0.96-inch) on an ESP32-CAM displays pages determined by backend settings. ESP32 firmware and 3D enclosure are future separate tasks.

## Main features
1. Password-only admin login using Argon2id hash and secure server-side session.
2. Responsive web dashboard: provider connections, quota progress bars, reset countdown, last updated time, errors, manual refresh.
3. Provider settings: Codex, Google Antigravity, Claude Code. Enable/disable, reconnect, connection state, authentication status. Provider feasibility is NOT yet confirmed; Phase 0 decides actual supported methods.
4. Provider-agnostic normalized quota windows (`label`, `usedPercent`, `remainingPercent`, `resetAt`, `fetchedAt`, `status`, `source`). Missing data remains null/unknown.
5. Scheduled sync: `SYNC_INTERVAL_MINUTES` is set via ENV; external cron-job.org triggers an authenticated Next.js endpoint every minute; due-time/locks stored in SQLite Cloud. No in-process always-on cron loop.
6. Devices/display configuration: fixed PET home page, then 0..N quota pages ordered by settings. Each provider can contribute one or more display pages as supported. 1–2 device buttons navigate later.
7. MQTT: Next.js publishes versioned config and quota snapshots through EMQX Cloud over TLS, with retained state and deduplication. ESP32 subscribes; firmware is out of current scope.
8. Health and diagnostic statuses without leaking secrets.

## Fixed technology choices
- Next.js App Router, TypeScript strict, Node runtime; Tailwind CSS and shadcn/ui
- Turso / libSQL hosted SQLite, Drizzle ORM, Zod
- Argon2id + iron-session; no user database, registration, SaaS tenancy, email or payment
- cron-job.org HTTP trigger + env-driven interval + database lock
- EMQX Cloud and `mqtt` (mqtt.js)
- Render hosting, pnpm, Vitest/integration tests

## Provider research hard constraints
- Separate **subscription quota** from API key usage/billing/context window.
- Do not presume a pasted access token can self-refresh.
- Do not assume provider CLI, refresh credentials, or filesystem session survives Render Free restart.
- Check official access conditions/terms before designing a cloud-hosted account connection.
- If an integration is unsupported, represent it as blocked in UI and docs rather than fake connected.

## Phase roadmap
Phase 0 research (three parallel researcher agents), then phase-by-phase fullstack foundations, authentication/app shell, provider UI+credentials, verified quota providers+dashboard, scheduled sync, MQTT+device UI, test/deploy. Phase breakdown may be refined by research, but FE and BE must progress together.
