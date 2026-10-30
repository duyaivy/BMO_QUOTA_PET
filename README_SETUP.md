# BMO Personal — Codex multi-agent starter

This kit provides **real Codex custom agent configuration** and reusable prompts. It does not include application implementation or actual provider tokens.

## File map
- `AGENTS.md`: persistent repo-level rules and phase gates.
- `.codex/config.toml`: default cheap subagent model + concurrency 3.
- `.codex/agents/researcher.toml`: one specialized research role, spawn 3 instances for Codex/AGY/Claude.
- `.codex/agents/coder.toml`: scoped fullstack developer.
- `.codex/agents/reviewer.toml`: independent read-only reviewer (instructional restriction, NOT a distinct sandbox).
- `docs/PROJECT_SCOPE.md`: final project scope and chosen stack.
- `prompts/01-research.md`: Phase 0 with 3 parallel researchers and combined Markdown documents.
- `prompts/02-build-phase.md`: coding then review, one phase at a time.
- `prompts/03-review.md`: standalone review.

## Install on macOS
1. In a new or existing Git project, **copy these contents to the project root**, including hidden `.codex/`.
2. If `AGENTS.md` or `.codex/config.toml` already exists, **merge it manually**; don't overwrite existing repo rules or MCP settings blindly.
3. Install/update Codex CLI if needed: `npm install -g @openai/codex`.
4. Run `python3 scripts/validate_codex_setup.py` from the project root to validate TOML and expected files.
5. Open `codex` **from the project root**. Trust the project when prompted, otherwise its project-scoped `.codex/config.toml` may be ignored.
6. In an interactive Codex session, send: `Read prompts/01-research.md and execute Phase 0 exactly, using three researcher subagents. Stop after documentation.`
7. Use `/subagents` to inspect their threads. Review `docs/research/RESEARCH_SUMMARY.md` before Phase 1.
8. When approved, ask: `Read prompts/02-build-phase.md and implement Phase 1 only. Use coder, then reviewer. Stop after the report.`

## Model and budget decision
- All 3 roles use `gpt-6-luna` with **medium** reasoning, a cheaper/faster current Codex model than Sol/Astra.
- The main agent's model is NOT overridden. Choose it yourself in the Codex UI/CLI. For complex architecture judgments you can select a more capable model, but don't need to use it for the subagents.
- `gpt-5.4-mini` retired for Codex ChatGPT sign-in in Aug 2026; if using API-key authentication and have access, you can explicitly swap the role model to `gpt-5.4-mini` after checking your model catalog.
- Limit parallel threads to 3. Do not spawn coding/review subagents while the three researchers are active.

## Security caveats
- A custom agent with 'do not edit files' is constrained by instructions, **not a dedicated read-only permission sandbox**. Set sandbox and approvals in the parent session.
- Never paste actual access/refresh tokens into research prompts, source files, or logs.
- Add `.env`, `.env.local`, `.env.*.local`, `node_modules/`, `.next/` and build artifacts to `.gitignore` in your actual app.
- Technical feasibility of accessing a subscription quota does not automatically authorize reuse of a provider's OAuth credentials.

## Official documentation
- https://developers.openai.com/codex/multi-agent
- https://developers.openai.com/codex/config-reference
- https://developers.openai.com/codex/agents-md
- https://learn.chatgpt.com/docs/models
