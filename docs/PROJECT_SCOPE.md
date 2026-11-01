# BMO Personal — Confirmed Product Scope

Personal single-owner project. [Architecture Decisions](ARCHITECTURE_DECISIONS.md) is the technical authority; [Implementation Phases](IMPLEMENTATION_PHASES.md) defines execution. This scope supersedes historical cloud provider-polling plans.

## Product and collection

- Monitor available subscription-quota observations from the owner's OpenAI Codex CLI, Anthropic Claude Code CLI, and Google Antigravity CLI. API billing, credits, and context occupancy are separate meters and are not substitutes.
- Use an event-driven Node.js/TypeScript Local Collector on the owner's MacBook: authorized local sources → quota-only extraction → normalization/validation/deduplication → bounded offline queue → authenticated HTTPS upload.
- Codex session JSONL quota events are a candidate requiring installed-schema verification. Claude and AGY use supported native statusline JSON where available. **Codex 0.163.0 is verified locally; Claude and AGY real callbacks remain unverified.**
- Official clients own all provider login/refresh. Neither collector nor cloud extracts, accepts, stores, or forwards provider credentials. No raw conversations, prompts, or session files are uploaded.
- CLI activity can produce observations; a callback may repeat cached data. Closed clients, Mac sleep/shutdown, and offline operation can leave saved quota stale. Fast delivery after capture is the goal, not guaranteed fresh upstream reads.
- Dynamic provider bucket/window IDs and durations; nullable used/remaining percentages, resets, and source times. Never hardcode a universal five-hour/weekly pair or fabricate missing values.
- Treat source availability, collector reachability, quota availability, and source freshness separately. UI/OLED distinguish fresh, stale, unavailable, unsupported, and source-age-unknown states.
- Provider compatibility and applicable permission restrictions remain gates. An unavailable provider must not prevent use of the others.

## Personal web application

One Next.js App Router application hosts frontend and backend on Render. No SaaS, tenants, registration, organizations, email, payments, billing, or commercial functionality.

1. Single-owner password login using ENV Argon2id hash and iron-session HTTP-only cookie with revocable DB session; logout and protected routes.
2. Responsive dashboard: dynamic quota cards/progress bars, reset countdowns, original capture/source times, stale/unknown/error states.
3. Provider settings: enable/disable, local compatibility/verification, authoritative collector/source, opt-in setup guidance. Provider sign-in remains in official CLIs; no token-paste/reconnect forms.
4. Collector status: last upload versus last quota capture, compatibility and safe queue/retry diagnostics.
5. Device settings: fixed PET home page, then zero or more ordered quota pages. A provider may contribute multiple pages if supported. OLED 128×64 preview is a configuration aid, not hardware confirmation.
6. Operational diagnostics without secrets. Dashboard refresh reads stored data; it does not force provider refresh.

## Delivery and hardware

- Turso persists normalized observations/configuration and a transactional MQTT outbox. MQTT.js publishes versioned device config/quota state through EMQX Cloud over TLS, with retained latest state, retries, and device-specific ACLs.
- External authenticated maintenance scheduling (e.g. cron-job.org) handles outbox retries, stale transitions, housekeeping, and recovery. No provider collection cron or assumption of an always-running Render Free process.
- Physical BMO: ESP32-CAM, SSD1306 OLED 128×64 (0.96-inch), rechargeable 3.7V LiPo, appropriate charging/protection/power regulation, 1–2 buttons, and a 3D-printed enclosure.
- Firmware later implements Wi-Fi, MQTT, honest offline/stale quota screens, animated pixel expressions, and button navigation between PET and configured quota pages. Camera functionality is not required.
- Final pin assignments, power design, runtime, firmware, and enclosure assembly require later hardware verification.

## Fixed stack and execution boundary

Cloud: Next.js App Router, TypeScript strict, Tailwind CSS, shadcn/ui, Turso/libSQL SQLite, Drizzle ORM, Zod, Argon2id, iron-session, MQTT.js, Render. Collector: Node.js/TypeScript and optional owner-installed macOS LaunchAgent. Tooling: pnpm and focused Vitest/integration tests when introduced. No additional backend/infrastructure is needed.

Phase 1A–1E is implemented and locally verified with synthetic fixtures. Phase 2 verifies real providers/automation; Phase 3 adds MQTT/device delivery; Phase 4 implements firmware/hardware; Phase 5 deploys/validates; Phase 6 maintains/polishes. Phase 1 does not verify any live provider. Current execution: Phase 2 under owner opt-in; 2B/2C live callback gates remain open. No Phase 3 work begins automatically.
