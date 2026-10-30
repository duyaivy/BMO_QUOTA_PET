# Codex local macOS and personal VPS feasibility

> Historical Phase 0.5 evidence only. [Current architecture](../ARCHITECTURE_DECISIONS.md) and [roadmap](../IMPLEMENTATION_PHASES.md) supersede all RPC/polling/VPS proposals and next steps below. The selected Codex JSONL candidate is unverified; no live quota was captured. Preserve the protocol/security findings without implementing this old design.

## Scope / date
Provider: OpenAI Codex subscription quota, using Codex CLI-managed ChatGPT auth and app-server | Evidence checked: 2026-10-31 | Researcher: Codex researcher

## Verdict
**CONDITIONAL.** A locally run Codex app-server has a documented read-only quota RPC, managed ChatGPT login and automatic token refresh, so a private macOS tool or user-operated Linux VPS is technically plausible without model-generation calls. App-server is officially experimental/development-oriented, and OpenAI says its authentication has never been permitted for commercial or hosted services. The docs do not resolve whether a personally controlled, single-user VPS is such a hosted service. Mac-local use is the lower-ambiguity documented local case; VPS policy needs an explicit interpretation before relying on it.

## Quota data
- **Subscription versus API:** `account/rateLimits/read` reads ChatGPT rate limits through Codex services. API-key-only auth is a different billing path and does not expose these ChatGPT subscription limits. Do not use API rate-limit headers or model context as a substitute.
- **Dynamic windows:** The response contains a backwards-compatible `rateLimits` bucket and, when present, `rateLimitsByLimitId` keyed by dynamic metered IDs. Each bucket has optional `limitName`, `primary`, `secondary`, and `rateLimitReachedType`; either window can be null. Window fields are `usedPercent`, `windowDurationMins`, and `resetsAt` (Unix seconds). There is no contractual fixed 5-hour/weekly pair. Prefer the multi-bucket map when present, preserve unknown IDs and nulls, and calculate remaining percent only for valid usage values.
- **Freshness:** The RPC is documented as fetching rate limits; this does not independently establish upstream cache age or a freshness SLA. The docs also define `account/rateLimits/updated`. A stored dashboard result is cached, not guaranteed live. Persist `fetchedAt`, show age, and mark stale/error if a scheduled read fails. No freshness SLA or polling interval is documented. [App-server quota schema](https://learn.chatgpt.com/docs/app-server)

## Authentication lifecycle
- **First login:** `account/login/start` supports managed `chatgpt` browser login and `chatgptDeviceCode`; the latter is intended for headless/remote cases. Login completion and auth-state notifications are documented. CLI alternative is `codex login` or `codex login --device-auth`.
- **Credential ownership/storage:** In managed `chatgpt` mode, Codex owns OAuth state, persists tokens, and refreshes them automatically. The CLI caches auth in plaintext `~/.codex/auth.json` by default, or its OS credential store; `CODEX_HOME` changes the state root. File storage contains access tokens and must be treated like a password. Never inspect, copy, print, export, upload, or commit an auth file. No credentials were used here.
- **Refresh and session behavior:** Refresh occurs automatically during use before expiry; an active process can continue without another browser login. Expiry, revocation, policy changes, or failed refresh may require user action. On auth failure report reconnect/reauthentication and do not claim fresh quota. CLI and IDE share cached login; logout invalidates their next use.
- **Read without model work:** Protocol permits `initialize` then `account/rateLimits/read`; no `thread/start` or `turn/start` is required. This requests quota without a prompt or model generation, though it contacts Codex services. App-server must be running; it is a persistent authenticated client, not a user chat session.

## Deployment & permission
- **macOS:** A local Node client can spawn `codex app-server` over JSONL stdio or a local Unix socket. Sleep, logout, network loss, reboot, or process exit prevents fresh reads until the machine and app-server are running. Persist the last snapshot as stale. Start-on-login/service supervision can resume polling after reboot; setup is a local implementation choice.
- **Personal Linux VPS:** The same CLI/app-server and stdio design can run headlessly; use device-code login. A service manager can restart after reboot. With managed state retained, reboot alone need not require browser login. Availability, storage security, network and refresh success are operator responsibilities. Do not expose app-server publicly: WebSocket is experimental/unsupported and non-loopback listeners may be unauthenticated by default.
- **On-demand/periodic access:** Invoke the RPC on dashboard refresh or scheduled due-time; no model prompt or always-on polling loop is needed. An existing process can answer periodically, or an on-demand worker can start, read once, and exit. Cache results for OLED/dashboard and label fetched age. No quota-read latency or rate budget is specified.
- **Policy:** The official statement says app-server authentication has never been permitted for “commercial or hosted services,” while allowing continued use for local or open-source apps and recommending Sign in with ChatGPT for hosted use cases. BMO is a personal project, single-admin, not SaaS. A public Render app using app-server auth appears to fall in the stated hosted category and is blocked absent a separate authorized route. A private VPS the user personally controls is neither clearly exempt nor explicitly addressed; it is still a hosted machine in ordinary language. Therefore VPS permission is **POLICY UNVERIFIED**, not assumed permitted from “personal” ownership. Obtain OpenAI clarification before operational use if this distinction matters.

## Evidence table
| Finding | Status | Primary source | Verified behavior | Caveat |
|---|---|---|---|---|
| Quota read and schema | TECHNICALLY CONFIRMED | [App-server](https://learn.chatgpt.com/docs/app-server) | `account/rateLimits/read`, update notification, buckets/windows and units | Dynamic values; no fixed window promise |
| Managed auth and refresh | TECHNICALLY CONFIRMED | [Authentication](https://learn.chatgpt.com/docs/auth) | CLI login, file/keyring/ephemeral options, automatic refresh during use | Reauth can still be required after errors/revocation |
| Headless VPS login | TECHNICALLY CONFIRMED | [Authentication](https://learn.chatgpt.com/docs/auth) | Device-code flow for remote/headless environment | Does not establish permission for every VPS use |
| Private personal VPS policy | POLICY UNVERIFIED | [App-server](https://learn.chatgpt.com/docs/app-server) | Documentation distinguishes local/open-source from commercial/hosted | Personal user-operated VPS not explicitly classified |
| Public hosted app-server auth | POLICY RESTRICTED | [App-server](https://learn.chatgpt.com/docs/app-server) | Auth never permitted for commercial or hosted services | SIWC plan inference is not proof of quota-RPC support |
| App-server maturity | TECHNICALLY CONDITIONAL | [App-server](https://learn.chatgpt.com/docs/app-server), [CLI commands](https://learn.chatgpt.com/docs/developer-commands) | Described as experimental, for local development/debugging | No production-support commitment |

## Minimal proof-of-concept plan
No-secret work first: construct JSONL fixtures for one and multiple buckets, nullable primary/secondary windows, absent dynamic map, and update notification; assert Unix-seconds conversion and stale timestamp handling. The lead may perform an opt-in live check on their own already-authenticated machine without exposing secrets: start `codex app-server --listen stdio://`, send only protocol `initialize`, `initialized`, and `account/rateLimits/read`, then stop it; do not start a thread or turn. Do not run `codex login`, inspect auth state, use another user's auth, or log RPC streams containing credentials. Repeat after sleep/reboot only if validating that host lifecycle locally. VPS permission remains a policy question, not something a technical probe can answer.

## Recommended adapter
Keep Codex reading in a separate local agent/sidecar adapter rather than embedding auth into the hosted Next.js service. On each manual or due scheduled request, read all returned buckets, normalize every non-null window with source, fetchedAt, and last-known status, and publish the snapshot to the existing backend. Fail closed to `reauth_required`, `temporarily_unavailable`, or stale last value. Keep app-server on stdio/local Unix socket; never expose its control channel publicly. For a VPS deployment, treat it as a distinct user-operated installation, not a loophole around hosted-service policy.

## Remaining blockers
- Written/official clarification whether a privately controlled, single-user VPS counts as a “hosted service” for app-server authentication.
- App-server is experimental; stability/support expectations for unattended use are not promised.
- No quota polling limit, freshness SLA, or fixed bucket/window guarantees are documented; choose conservative configurable polling and display the fetched age.
- The project’s proposed Render-hosted app-server authentication remains restricted. Sign in with ChatGPT does not yet establish permission or technical compatibility for this quota RPC.

## Lead verification update

The installed CLI was 0.163.0 and reported an existing native ChatGPT login. The controlled stdio attempt failed before initialization with a sanitized operation-not-permitted startup classification; no quota response, refresh, reboot or VPS behavior was verified. See [PoC evidence](POC_RESULTS.md). Local interface use is POLICY PERMITTED in the documented local-app context; outbound dashboard export permission remains POLICY UNVERIFIED.
