# BMO Personal — Project and Codex Setup

BMO Personal is a single-owner subscription-quota dashboard with an event-driven Mac collector and a future ESP32-CAM desk pet. This repository currently contains architecture, planning, historical evidence, and agent setup only. No application, dependency manifest, test suite, or runnable dashboard exists yet.

## Read first

- [Project scope](docs/PROJECT_SCOPE.md): product/hardware boundaries.
- [Architecture decisions](docs/ARCHITECTURE_DECISIONS.md): **single authority for technical contracts**, replacing older cloud-polling/RPC/VPS plans.
- [Implementation phases](docs/IMPLEMENTATION_PHASES.md): one focused conversation per subphase; all implementation is pending.
- [AGENTS.md](AGENTS.md): repository rules. Its original “no Git metadata” statement predates the current Git repository; use actual repository inspection for tooling/status.

Next coding task: **Phase 1A — Next.js Foundation & UI Layout**. Do not start it as part of architecture cleanup.

## Agent setup

Keep [.codex/config.toml](.codex/config.toml) and configured [Researcher](.codex/agents/researcher.toml), [Coder](.codex/agents/coder.toml), and [Reviewer](.codex/agents/reviewer.toml) intact. They remain the repository's existing role/model/concurrency configuration; architecture decisions here override obsolete project-specific provider-auth assumptions in role text.

For an existing project, preserve/merge configuration rather than blindly overwriting it. Open Codex from this root and use the project's normal trust flow. Validate setup with Python 3.11+:

~~~sh
python3 scripts/validate_codex_setup.py
~~~

Future coding workflow: Lead → Coder → tests → Reviewer → fixes → final verification. Use [the build prompt](prompts/02-build-phase.md) and name exactly one subphase, e.g. “Implement Phase 1A only.” Stop after that subphase; no automatic deployment, commit, push, or merge. [Standalone review prompt](prompts/03-review.md) remains available.

The [Phase 0 research prompt](prompts/01-research.md) and [research template](docs/templates/PROVIDER_RESEARCH_TEMPLATE.md) are historical reusable references, not setup prerequisites. Do not rerun research or create per-phase report files by default. Current validation evidence belongs in the conversation and brief updates to existing docs.

## Retained evidence

These are historical findings, **not current architecture or implementation instructions**:

- [Codex local/VPS research](docs/feasibility/01-codex-local-vps.md): documentary RPC constraints; the current JSONL candidate is still unverified.
- [Antigravity local research](docs/feasibility/02-antigravity-local-vps.md) and [Claude local research](docs/feasibility/03-claude-local-vps.md): native statusline field/lifecycle candidates and permission uncertainties.
- [PoC results](docs/feasibility/POC_RESULTS.md): zero successful live quota observations.
- [Earlier Antigravity report](docs/research/02-antigravity.md): preserved with pre-existing edits; “no structured output” was superseded by later statusline research, while credential-access restrictions remain relevant.

Consolidated and removed seven project-generated redundant reports: research/01-codex.md, research/03-claude.md, research/RESEARCH_SUMMARY.md; feasibility/AUTH_SESSION_RESEARCH.md, feasibility/FINAL_RECOMMENDATION.md, feasibility/HOSTING_COMPARISON.md, feasibility/LOCAL_COLLECTOR_ARCHITECTURE.md (all paths relative to docs). Their necessary security, freshness, hosting, and transport decisions are incorporated in the architecture; provider-specific evidence remains above.

## Configuration and security

No real provider credentials are needed for Phase 1. Official clients manage provider authentication; BMO never extracts/transfers it. Never paste native tokens, session files, conversations, or prompts into source/logs/research.

The existing .env.example is a historical starter, not the new architecture's runtime contract. Its SYNC_* provider-polling settings and CREDENTIAL_ENCRYPTION_KEY are obsolete. Phase 1B will align it with implemented app/auth/database settings; do not configure provider credential storage or cloud polling from this file. Actual production credentials are deferred to the appropriate Phase 5 subphase.

Phase 1A will add .gitignore, a manifest/lockfile, and verified development/typecheck/lint/build commands. Phase 1B will add database/auth setup. Until then, no Next.js build/test command is configured.

Custom reviewer “read-only” instructions are a role constraint, not a separate filesystem sandbox. Preserve the session's permission controls. No provider integration is verified or automatically enabled by these documents.
