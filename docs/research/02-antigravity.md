# Google Antigravity — provider feasibility

## Scope / date
Provider: Google Antigravity (individual Google AI subscription quota) | Research timestamp (UTC): 2026-10-30 | Researcher: configured researcher agent

## Verdict
**NO-GO** for an Antigravity personal-subscription quota adapter in the single Next.js service on Render Free: Google documents quota inspection only as an interactive CLI/TUI, not a supported machine-readable quota API, while account OAuth/keyring credentials are local-machine oriented and Render Free loses local files on restart/spin-down. Treat this provider as unsupported/blocked in the UI. Gemini API or Gemini Enterprise integrations are separate products/usage meters and do not satisfy the Antigravity subscription quota feature.

## Quota data
- **Subscription plan vs API billing vs context window:** Antigravity personal plan limits are agent subscription quotas. Pro has a high quota refreshed every five hours until the weekly cap; Ultra has highest quota refreshed every five hours plus a weekly limit; other plans have a weekly quota. Google says limits vary by plan, capacity, and work done. These are distinct from Gemini API key billing and from a model context window.
- **Available windows:** Official plan docs specify 5-hour refresh for Pro/Ultra (with weekly limit) and weekly refresh for other plans. They do not publish numeric model-specific allotments in the fetched page.
- **Exact response fields; normalization:** No official response schema/JSON fields, endpoint, or export mechanism was found. `/usage` (alias `/quota`) opens an interactive TUI and refreshes model configuration/quota status; UI shows model-specific usage limits and remaining requests/tokens. `/credits` presents AI Premium credit balance and consumption history. No documented reset timestamp, percentage, per-model exact fields, or machine-readable CLI output. Do not scrape TUI or infer `resetAt`.
- **Reset semantics and missing values:** Plan language says quota is “refreshed every five hours” or weekly but does not define rolling-vs-fixed window, exact anchor/reset instant, or individual model reset semantics. Store no invented reset time; normalize quota windows as `unknown` / null.

## Authentication lifecycle
- **Supported first-time login:** Personal accounts sign in through browser OAuth in Antigravity app/CLI or IDE. Official auth docs describe unified local sign-in. CLI supports remote SSH manual URL + authorization-code loop, but this is interactive and not a hosted service OAuth callback contract.
- **Credential types:** Personal Google Account OAuth with local secure credential profiles/keyring; CLI also documents Gemini API key (`GEMINI_API_KEY`) with provider set to `gemini`, and ADC for headless enterprise automation. API key and ADC authorize Gemini API/Gemini Enterprise model use, not access to personal subscription quota telemetry.
- **Refresh documented:** The official fetched docs mention secure credentials/token profiles, silent sign-in from OS keyring, and logout clearing active credentials/cache and saved keyring profiles. They do not document an app-owned OAuth refresh-token exchange, refresh endpoint, token rotation/failure contract, or a supported mechanism for a third-party web service to manage personal-subscription auth. **UNKNOWN** for programmatic refresh lifecycle; do not assume a copied access token refreshes.
- **Persistence over restart:** On a developer machine, auth can use native OS credential stores. Render Free has ephemeral filesystem, no persistent disk, may restart at any time, and spins down after 15 minutes idle (losing local changes). So a CLI profile/keyring/local session cannot be assumed to persist on Render Free. Database-encrypted credential storage would preserve bytes but does not make the personal auth flow/API officially supported.
- **Next.js vs CLI/sidecar:** The Google SDK offers API-key and Vertex AI/ADC programmatic auth, but those are API/enterprise access paths. The documented subscription quota view requires the CLI TUI. No official quota SDK/API for a Next.js service was located. Running `agy` headlessly to parse undocumented internal calls or TUI is not an approved adapter design.

## Deployment & permission
- **Headless on Render Free:** technically a Node process can run on a web service, but supported personal login relies on a browser/interactive sign-in or machine-local keyring; headless docs focus on enterprise ADC and Gemini API key. Free filesystem resets/spin-down make stored profiles non-durable. Verdict for supported personal quota monitor: **BLOCKED**.
- **Official vs undocumented:** Official docs are explicit about `/usage` interactive TUI and quota views. No official HTTP quota endpoint or machine-readable output option surfaced. Any endpoint found by sniffing CLI traffic or community reverse engineering would remain undocumented and is excluded from this report.
- **Terms/policy:** Plan docs state individual accounts are subject to terms derived from Google Terms of Service; teams use Google Cloud terms via Gemini Enterprise. The reviewed pages do not expressly authorize a third-party hosted service to reuse a personal subscription session or scrape quota telemetry. **UNKNOWN** as to that precise use; absent affirmative official support, do not connect it.
- **Security/rate limits:** A personal OAuth credential would be a sensitive account credential. Avoid exporting keyring material or storing a raw profile in app DB. Google notes limits may change and are capacity/work-dependent. Do not poll quota on a short interval; no documented endpoint or polling allowance exists.

## Evidence table
Primary documentation pages fetched 2026-10-30 UTC. “Observed API/field” describes documented behavior; no live account was used.

| Finding | CONFIRMED / CONDITIONAL / UNKNOWN / BLOCKED | Primary source URL | Observed API/field | Caveat |
|---|---|---|---|---|
| Subscription quotas have plan-dependent 5-hour and weekly refresh windows | CONFIRMED | https://antigravity.google/docs/plans | Pro: five-hour refresh until weekly limit; Ultra: five-hour refresh and weekly limit; other plans: weekly | No exact counts, timestamps, or reset anchor. |
| Quota monitor is an interactive CLI panel | CONFIRMED | https://antigravity.google/docs/cli/commands/usage | `/usage`, alias `/quota`; UI shows model limits and remaining requests/tokens; refreshes from backend | No JSON schema/export/endpoint documented. |
| Subscription credits balance is shown in TUI | CONFIRMED | https://antigravity.google/docs/cli/commands/credits and https://antigravity.google/docs/cli/credits | `/credits`; current balance and consumption history; statusline example “AI Credits: 42” | Credits are separate overage balance, not the same as baseline quota. |
| Individual auth uses browser OAuth and local secure credential profiles | CONFIRMED | https://antigravity.google/docs/install?tab=cli | local sign-in, OS keyring, silent token profile lookup; SSH URL/code interactive flow | No hosted web-app callback or third-party token contract described. |
| CLI can use Gemini API key or enterprise ADC headlessly | CONFIRMED | https://antigravity.google/docs/install?tab=cli | `GEMINI_API_KEY`, `AGY_ADC_AUTH=true`, ADC setup | These are Gemini API/Enterprise model auth routes, not personal plan quota access. |
| Official refresh endpoint/refresh-token contract for personal account | UNKNOWN | https://antigravity.google/docs/install?tab=cli | No refresh endpoint or rotation/failure fields documented in reviewed auth guide | Not proof none exists internally; must not implement based on inference. |
| Official machine-readable personal quota endpoint/CLI output | UNKNOWN | https://antigravity.google/docs/cli/commands/usage | CLI docs expose only interactive TUI display, not stable machine output | No reverse-engineered endpoints considered. |
| Render Free can durably retain CLI auth profile/keyring on local disk | BLOCKED | https://render.com/docs/free | ephemeral filesystem; edits lost on restart, redeploy, spin-down; service may restart; 15-minute idle spin-down | Render docs establish persistence limitation, regardless of credential encryption elsewhere. |
| Google explicitly permits hosted personal-session quota scraping | UNKNOWN | https://antigravity.google/docs/plans | Individual terms derived from Google Terms; Enterprise under Google Cloud terms | Exact hosted integration permission not stated in reviewed primary sources. |

## Minimal proof-of-concept plan
1. With an ordinary local test account (never in repository), sign into official Antigravity CLI using its documented browser flow.
2. Open `/usage` and `/credits`; record only visible labels/values manually in a local scratch note, with account identifiers and credentials omitted. Confirm what is quota vs credits and whether the panel exposes an exact reset timestamp.
3. Review official CLI documentation/version for a documented JSON/export mode or quota API. Do not inspect tokens, intercept traffic, or call undocumented endpoints.
4. For Render, deploy only a no-secret diagnostic that records whether local files survive a free-instance restart/spin-down; Render docs already say they do not. No provider sign-in is needed for this check.
5. Proceed with implementation only if Google publishes a supported machine-readable personal-subscription quota contract and a supported server-side OAuth lifecycle; otherwise keep Antigravity disabled/blocked.

## Recommended architecture adapter
Register Antigravity as `unsupported`/`blocked` with a user-facing explanation that official docs provide an interactive CLI quota panel but no supported server API or hosted personal-account credential flow. Return no fabricated windows: `status: "unsupported"`, `source: "official-cli-only"`, and quota/reset fields null. If product scope later accepts API billing instead, implement it as a separately named Gemini API/Vertex usage integration with its own contract and billing semantics, not as Antigravity subscription quota.

## Remaining blockers
- Google must publish a stable, supported machine-readable quota interface with exact model/window values and reset semantics.
- Google must document an allowed server-side personal account OAuth flow, refresh lifecycle, token revocation/rotation, and hosted use conditions—or provide a supported delegated read-only quota API.
- A durable credential store and encryption/key-management design are needed; Render Free local storage cannot hold CLI profiles durably.
- Human verification may be needed to check exact visible values in the current CLI account, but that observation alone would not remove the official-contract blockers.
