# Claude Code local and private VPS feasibility

> Historical Phase 0.5 evidence only. Follow [current architecture](../ARCHITECTURE_DECISIONS.md) and [roadmap](../IMPLEMENTATION_PHASES.md), not old hosting/next-step recommendations below. Native statusline fields and permission uncertainties remain evidence; live integration is unverified.

## Scope and verdict

Research date: 2026-10-31. This evaluates the owner’s own macOS computer versus their own Linux VPS, using Anthropic’s unmodified Claude Code and its native subscription sign-in. It does not evaluate a hosted third-party login or extract credentials.

**TECHNICALLY CONFIRMED local observation interface; UNAVAILABLE documented detached fresh-quota collection.** Claude Code officially supplies a local statusline script with subscription rate-limit percentages and reset times. That is useful while a signed-in CLI session is running and reporting its current session data. It is not a documented remote quota API. Re-running a script against the last supplied JSON does not fetch new server data, and no official quota-refresh operation suitable for an unattended collector was found. A personal private VPS is technically viable for native CLI use, but does not by itself create permission for a separate dashboard to capture credentials or poll private endpoints.

## Statusline observation and freshness

The official [statusline guide](https://code.claude.com/docs/en/statusline) documents JSON session data on stdin to a user-configured shell command. The documented subscription fields are `rate_limits.five_hour.used_percentage`, `rate_limits.five_hour.resets_at`, `rate_limits.seven_day.used_percentage`, and `rate_limits.seven_day.resets_at`. The values are percentage used (0–100) and Unix epoch seconds. `rate_limits` is available for Pro/Max only after the session’s first API response; either window may be missing and is dropped after its reset time.

Updates happen on session start/resume, new assistant message, and several UI/configuration events. `refreshInterval` can re-run the script, but it supplies statusline session data, not a documented request to refresh subscription usage. The docs describe `rate_limits` as derived from the session’s API response; they provide no guarantee that an idle CLI or a periodic script re-queries account usage. Thus a script can safely report the **last observed** values and observation time, but must not label them live. `/usage` is an interactive CLI command and the docs do not specify that it emits a reusable JSON payload or refreshes the statusline rate-limit fields. A detached collector cannot be claimed to refresh quota without invoking a model based on documented behavior; whether some command internally refreshes it is **TECHNICALLY CONDITIONAL**.

The [hooks reference](https://code.claude.com/docs/en/hooks) documents lifecycle-triggered scripts with event-specific input. It does not document a quota-report hook, subscription quota endpoint, or a hook that obtains fresh rate limits while no Claude Code session/API response is occurring. Hooks may forward an already-observed, nonsecret statusline snapshot, but that is local observation/export, not an official quota integration contract. Exporting those values to this project’s web app is likewise not explicitly addressed by Anthropic’s docs or confirmed permitted; keep it opt-in and owner-controlled pending policy confirmation.

## Mac versus own Linux VPS

On macOS, Claude Code stores native CLI credentials in encrypted Keychain (or its documented file fallback in some Keychain failure cases). If the Mac sleeps or is powered off, its CLI cannot produce observations or transmit them; the dashboard’s last saved snapshot simply ages. If Claude Code exits while the Mac remains awake, statusline session events also stop. Resuming a session starts the statusline again, but rate-limit data still requires a response in that session before it is present.

On a Linux VPS, the published CLI can run under the owner’s Linux account and its native browser-based login flow; credentials are stored in `~/.claude/.credentials.json` with mode 0600 and managed through `/login` and `/logout` ([authentication docs](https://code.claude.com/docs/en/iam)). A VPS stays powered independently of the Mac, so a session left running can continue to observe subsequent responses. Closing/stopping the CLI session stops its statusline observations; machine uptime alone does not cause quota refresh. An expired sign-in may not refresh and can require interactive login again. A VPS improves availability, not freshness or the refresh contract.

The [legal and compliance guidance](https://code.claude.com/docs/en/legal-and-compliance) allows customers to run an unmodified Claude Code binary in products/services under Commercial Terms and conditions: retain built-in authentication methods, each end user authenticates with their own credentials, and usage is billed directly to that user. It separately says third-party apps must not offer Claude.ai login, route requests using subscription credentials, or collect/store/intermediate Claude.ai credentials or session tokens. A single-user VPS privately controlled by the subscription owner is not automatically a SaaS offering, but Anthropic’s guidance does not specifically adjudicate this personal private-hosting scenario or authorize a separate app to use CLI auth state. Preserve the native CLI boundary; do not copy its credentials to the dashboard. Written confirmation is prudent before productizing remote operation or snapshot forwarding.

## Evidence matrix

| Finding | Status | Official evidence / limits |
|---|---|---|
| Statusline JSON and exact `five_hour`/`seven_day` percentage and reset fields | **TECHNICALLY CONFIRMED** | [Statusline guide](https://code.claude.com/docs/en/statusline). Pro/Max, first API response required, fields can be absent. |
| Statusline script can export a derived, nonsecret snapshot without reading auth storage | **TECHNICALLY CONFIRMED; POLICY PERMITTED for local display, POLICY UNVERIFIED for cloud forwarding** | Docs say it runs a configured local shell command with session JSON on stdin. Safe if limited to the provided fields and owner-controlled; outbound forwarding permission is not explicitly established. |
| New quota data while no session response occurs; standalone detached collector refresh without model invocation | **TECHNICALLY CONDITIONAL** | No official quota refresh endpoint/command found. Timer reruns the script, not an evidenced server refresh. No live experiment performed. |
| Native login and CLI credential persistence on owner’s macOS/Linux | **TECHNICALLY CONFIRMED** | [Authentication docs](https://code.claude.com/docs/en/iam): Keychain on macOS; mode-0600 file on Linux; `/login` and `/logout`; expired login may require reauthentication. |
| Private Linux VPS use of unmodified CLI with owner’s own login | **TECHNICALLY CONDITIONAL; POLICY UNVERIFIED for the exact private-VPS/export use** | [Legal guidance](https://code.claude.com/docs/en/legal-and-compliance) governs hosted product/service use with conditions. Personal private VPS is not specifically decided; no credential transfer to dashboard. |
| Dashboard reuse of CLI subscription token or private quota request | **POLICY RESTRICTED** | Legal guidance prohibits third-party collection/storage/intermediation of Claude.ai credentials/tokens and routing requests on Free/Pro/Max credentials. No supported quota API identified. |
| Official hook-driven quota reporting without Claude Code response | **TECHNICALLY CONDITIONAL** | Hooks reference describes lifecycle inputs, but no quota hook/refresh contract. |

## Safe synthetic fixture PoC

Prerequisites: local fixture file containing fabricated JSON only; a parser that consumes stdin, tolerates missing objects/windows, computes remaining percentage as `100 - used_percentage`, converts reset seconds to a date, and labels source `claude-code-statusline` with `observedAt`. Do not run Claude Code, log in, edit its settings, inspect credential files, call private endpoints, or transmit a snapshot in this phase. Validate present and absent fields using only synthetic fixtures; absent values remain unknown/null. If later testing local observation, the owner can manually configure the official statusline and compare its displayed values with `/usage`, without collecting credentials. Mac sleep/reboot should be represented as stale/no new observations; a stopped CLI on an always-on VPS has the same lack of updates.

## Blockers

No documented supported remote subscription-usage API, no documented headless fresh-quota command, and no explicit permission for this dashboard to ingest statusline payloads. Do not implement unattended refresh or credential-based polling unless Anthropic supplies an official contract and confirms the intended use. A synthetic parser PoC can establish formatting behavior only, not live freshness or policy approval.

## Lead verification update

Claude Code 2.1.299 was installed and the native auth-status command reported logged-in state. This is not quota evidence. No native statusline payload was captured. Synthetic parser checks were executed by the lead in this phase; see [PoC evidence](POC_RESULTS.md).
