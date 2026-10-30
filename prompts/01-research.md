# Phase 0 prompt — 3 research subagents (no coding)

You are the Lead Architect for BMO Personal. Read `AGENTS.md` and `docs/PROJECT_SCOPE.md` before acting.

Launch **exactly three parallel instances of the configured `researcher` subagent** (not 7 roles, not an extra coding agent). Explicitly assign the following independent tasks and unique files:

**Researcher A — Codex** → `docs/research/01-codex.md`.
Investigate ChatGPT subscription Codex 5h/weekly rate limits, Codex CLI/App Server read interfaces, auth and auto-refresh, credential persistence over Render restarts, HTTP-only availability, official/unsupported endpoints and policy constraints. Decide whether this fits a single Next.js Render service. Cite current sources.

**Researcher B — Google Antigravity** → `docs/research/02-antigravity.md`.
Investigate AGY authentication and token refresh, CLI or machine-readable quota endpoints, model-specific windows, hosted Render feasibility, credential storage and provider restrictions. Do not assume commands observed in a community project are official. Cite current sources.

**Researcher C — Claude Code** → `docs/research/03-claude.md`.
Investigate Claude subscription quota vs API billing, official CLI usage surfaces, machine-readable outputs, OAuth refresh, legality/permission for a third-party personal dashboard, hosted feasibility and safer permitted alternatives. Cite current sources.

All agents use `docs/templates/PROVIDER_RESEARCH_TEMPLATE.md` structure, flag assumptions, must not request real tokens, and **must not edit application source**. If a research source is unavailable, report UNKNOWN.

After all three complete, the **lead only** must:
1. Compare evidence and resolve contradictions; distinguish proven vs conditional statements.
2. Write `docs/research/RESEARCH_SUMMARY.md` comparing each provider's quota fields, auth refresh, headless hosting compatibility, terms, risk and GO/CONDITIONAL/NO-GO conclusion.
3. Write `docs/ARCHITECTURE_DECISIONS.md` stating what remains in one Next.js Render service and any narrowly-scoped necessary exceptions. Preserve confirmed stack unless a true blocker is demonstrated.
4. Write `docs/IMPLEMENTATION_PHASES.md` with phase-by-phase **both FE and BE** deliverables, DB schemas, APIs, MQTT contracts, test gates, and ENV variables.
5. End with a short report of completed files, provider verdicts, uncertainties and recommended first coding phase.

**STOP after Phase 0.** No application implementation, no actual provider login, no deployment, no automatic Phase 1.
