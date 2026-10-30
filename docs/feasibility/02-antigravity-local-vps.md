# Antigravity local, VPS, and hybrid quota feasibility

> Historical Phase 0.5 evidence only. Follow [current architecture](../ARCHITECTURE_DECISIONS.md) and [roadmap](../IMPLEMENTATION_PHASES.md), not the old VPS/bridge recommendations below. Native statusline fields and permission uncertainties remain evidence; live integration is unverified.

**Scope/date:** Google Antigravity personal-subscription quota, checked 2026-10-31. This note extends the Phase 0 research with official structured CLI output and deployment options. No account or live CLI was used.

## Verdict

**CONDITIONAL** for a user-owned Mac-to-VPS snapshot bridge; **UNAVAILABLE** for an always-on VPS quota poller based on a personal subscription. Google documents status-line JSON with `quota` buckets (`remaining_fraction` or `remaining_amount`, `reset_time`, `reset_in_seconds`, optionally `disabled`) and `plan_tier`. This supported observation point runs inside an active CLI TUI session when agent state changes; docs do not describe a standalone export command, background poller, or remote quota API. A script can save a minimal snapshot, but forwarding it to a VPS is a separate data-transfer and terms question.

## What is supported

The official `/statusline` command pipes session JSON to a user-configured shell command on agent-state changes. Its example includes a `gemini-weekly` remaining fraction and reset timestamp; the schema also allows remaining amount, reset seconds, and disabled state. Scripts can display or persist values when present; absent buckets remain unknown. Runs are capped at once per 300 ms and five seconds; 30 consecutive failures disable the script for that session. `/usage` itself remains an interactive panel.

Official hooks cover session, invocation, tool, and stop events, but do not promise quota JSON. Do not equate `agy -p` headless output with quota telemetry: it runs a prompt and exits using cached credentials; docs do not say it emits statusline payload. Do not call local language-server endpoints or inspect CLI traffic.

## Deployment options

- **Owner Mac (conditional, lowest friction):** CLI browser OAuth can use a saved Apple Keychain profile silently. An open `agy` session can write an allowlisted snapshot locally on agent-state changes, not a guaranteed interval. Closing the terminal stops updates; sleep pauses them; reboot requires session relaunch (keyring may enable silent re-authentication). Token refresh/rotation and an unattended statusline daemon are undocumented.
- **Owner Linux VPS, no GUI:** Supported SSH OAuth prints an authorization URL for browser completion and code entry in the remote terminal. Linux Secret Service/dbus is a documented keyring option. Headless mode uses cached auth; API-key and ADC flows cover Gemini API/enterprise automation, not personal quota telemetry. Exiting TUI stops callbacks. Verify keyring persistence after reboot; never copy Mac credentials to VPS.
- **Hybrid Mac-to-VPS:** technically feasible as a local official statusline script writing a minimal export, then a separate authenticated upload to the owner's VPS. Export only quota bucket IDs/values/reset fields, observed timestamp, and perhaps plan tier; exclude email, cwd, transcript path, conversation/session IDs, model/context and task details. Use a strict schema, TLS, server-side auth, and short retention. Google permits custom statusline scripts, but does not explicitly state whether forwarding this output to a remote personal dashboard is allowed under its third-party-access clause. Treat this transfer as **POLICY UNVERIFIED** pending clarification; local display/personal observation through the official customization is within its described use. Personal subscription OAuth must never be sent to the dashboard.

Terms/FAQ prohibit third-party software/tools/services used “to access Antigravity” (examples include coding tools and OpenClaw with OAuth). A local script consuming documented CLI output does not itself authenticate or query Antigravity. Local rendering is **POLICY PERMITTED** by the documented customization; whether forwarding an export to the owner's VPS is third-party access is **POLICY UNVERIFIED**.

## Evidence table

| Finding | Technical / policy verdict | Primary source and verified behavior | Caveat |
|---|---|---|---|
| Structured subscription quota in custom statusline JSON | **TECHNICALLY CONFIRMED** | [Status line customization](https://antigravity.google/docs/cli/statusline): documented `quota` map and example with `remaining_fraction`, ISO `reset_time`, `reset_in_seconds`; also optional `plan_tier`. Callback on agent-state changes. | Local active CLI/TUI callback; fields/buckets may be absent. Payload also contains sensitive account/session/workspace data. |
| `/usage` data and refresh | **TECHNICALLY CONFIRMED** | [Model Quotas](https://antigravity.google/docs/cli/commands/usage): opens interactive TUI and refreshes model configuration/quota from backend. | Not a machine-readable standalone command. |
| Event hooks as quota export | **UNAVAILABLE** | [Hooks](https://antigravity.google/docs/hooks): lifecycle events and hook input/output contract are documented. | No quota-field contract; do not assume hooks supply statusline state. |
| Owner-authenticated Mac/SSH CLI | **TECHNICALLY CONFIRMED** | [Authentication](https://antigravity.google/docs/install?tab=cli): browser login, native keyring and remote SSH authorization URL/code flow; logout clears active credentials/cache and keyring profile. | Refresh/token rotation, long unattended persistence and recovery details are undocumented. |
| Headless mode as a quota collector | **UNAVAILABLE** | [Headless mode](https://antigravity.google/docs/cli/headless): prompt-in/response-out, single prompt then exit, cached credentials. | Not quota output; do not start model work merely to collect quota. |
| Personal export / remote dashboard under terms | **POLICY UNVERIFIED** | [Additional Terms](https://antigravity.google/terms), [FAQ](https://antigravity.google/docs/faq): third-party software/tools/services accessing Antigravity prohibited. | Local documented rendering differs from direct OAuth/API access; remote forwarding is not discussed. |
| Community implementations | **CONDITIONAL evidence only** | Maintained [OpenUsage repository](https://github.com/robinebers/openusage) describes local macOS provider monitoring; [provider guide](https://github.com/robinebers/openusage/blob/main/docs/providers/antigravity.md) reports reading stored credentials and local app data. [60ke statusline source](https://github.com/60ke/antigravity-statusline) says it discovers processes, extracts a local CSRF token, calls `GetUserStatus`, and refreshes every 30s. | These are not Google contracts. Statusline project uses private token/local API methods and is **not a compliant implementation path** for this project. OpenUsage also relies on credential access, not the official JSON feed. |

## Minimal safe PoC prerequisites (lead-owned; no live testing here)

1. Confirm current Google terms interpretation for a personal, user-owned quota dashboard that receives only statusline-exported values; do not proceed on assumed permission.
2. On the owner's Mac with an ordinary account and active CLI session, configure a throwaway script that parses stdin and prints only quota buckets and observation time. Verify payload availability and missing-field behavior manually, without logging raw input or account data.
3. If policy is clarified, add an opt-in atomic file export of the allowlisted schema, then verify staleness behavior after terminal close, sleep, and reboot. Test SSH TTY sign-in and reboot/keyring behavior on an owned Linux VPS separately; never move credential profiles between machines.
4. Keep dashboard status `connected/stale/unknown` based on the last observed timestamp; do not synthesize a reset or claim freshness when CLI is closed.

**Recommendation:** Keep Antigravity disabled by default until policy clarification. If cleared, implement only a user-installed local statusline exporter as a separate companion path, with explicit consent and stale snapshots. Do not place personal Antigravity OAuth in the dashboard/collector or implement any private endpoint/token method. Ordinary official-client authentication on an owner-controlled VPS is a separate native-client question, not the same as giving its credentials to a dashboard. Phase 0.5 makes the quota fields technically observable through official local output, but does not establish a supported server-side personal subscription integration.

## Lead verification update

AGY 1.4.9 was installed. Its help confirmed prompt-oriented JSON output options, not a quota export command. No session, model request or statusline capture was started. [PoC results](POC_RESULTS.md) separate installed-help and synthetic evidence from live quota observations.
