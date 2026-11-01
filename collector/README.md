# Local collector (Phases 1D–2)

The original fixture command is a local, synthetic-only collector pipeline; native commands below require separate explicit opt-in. The Codex `token_count/rate_limits`, Claude `rate_limits`, and Antigravity `quota` shapes are unverified candidate schemas. The fixture command does not inspect provider storage, alter native CLI settings, start a local HTTP server, or make provider requests.

Create a local JSON config with an HTTPS ingestion URL, enrolled collector/key IDs and generations, private state directory, and an owner-only BMO 32-byte lowercase-hex secret file (`chmod 600`). Configured sources default disabled; explicitly enable only fixture providers. `allowLocalHttp` is intended only for explicit loopback development. Keep secret material separate from provider stores and out of config JSON.

Run `pnpm --dir collector exec tsx src/cli.ts ./collector.json codex fixture.jsonl`; use `-` for bounded newline-delimited stdin. Fixture replay is explicit and never configures a CLI. Output contains codes only. State uses private SQLite transactions and a process/start-identity owner record, with token-bound release and dead-owner recovery. Delete neither identity nor sequence state to recover from corruption; re-enroll with a new identity.

Fixture shapes:

- Codex: `{ "fixtureSchema":"codex-v1", "type":"event_msg", "payload":{"type":"token_count", "rate_limits":{"five_hour":{"used_percent":12,"window_minutes":300,"resets_at":1900000000}}} }`
- Claude: `{ "fixtureSchema":"claude-v1", "rate_limits":{"five_hour":{"used_percentage":12,"resets_at":1900000000}} }`
- Antigravity: `{ "fixtureSchema":"antigravity-v1", "quota":{"model":{"remaining_fraction":0.88,"reset_time":"2030-03-17T00:00:00Z"}} }`

Events are partial snapshots. Percentages, absolute resets, and upstream timestamps are used only when explicitly present and valid. Amount-only buckets retain null percentages; their raw amounts never leave the adapter. Relative resets are derived only with a validated fixture upstream reference; otherwise they remain null. Successful upload responses must match the event UUID and a recognized durable outcome. Retry attempts use the immutable body/event UUID and fresh request authentication.

## Commands and local configuration

Run from the repository root: `pnpm collector ./collector.json codex ./fixture.jsonl --upload`.
Without --upload, replay only writes the private queue. With --upload, the foreground process retries eligible queued events with persisted backoff until drained, paused or stopped. SIGINT/SIGTERM stops input and waits for in-flight work to settle. File replay uses a local opaque stream identity and durable nonempty-record cursor; partial stdin records are held until complete. A changed ownership generation establishes new cache/checkpoint state. Sources default disabled.

```json
{
  "collectorId": "fixture-collector",
  "keyId": "fixture-key",
  "secretFile": "/absolute/private/path/bmo.key",
  "url": "http://127.0.0.1:3000/api/internal/usage/ingest",
  "stateDirectory": "/absolute/private/path/collector-state",
  "allowLocalHttp": true,
  "providers": {
    "codex": { "enabled": false, "generation": 2 },
    "claude": { "enabled": false, "generation": 2 },
    "antigravity": { "enabled": false, "generation": 2 }
  }
}
```

Use actual generations returned by [local enrollment](../api/README.md); enable only chosen fixture sources. No keys are embedded in this example. Config files are bounded at 16 KiB; records/events at 32 KiB; queued bodies at 1 MiB; event age at 24 hours. Cached per-window times survive rerenders. Only fully superseded never-attempted partials coalesce; attempted bytes never change. Process identity uses the local Unix /bin/ps start timestamp in fixed UTC/C locale; no process commands, paths or secrets are logged. Key rotation preserves identity/sequence/queued events; changing collector identity fails closed.

The deadline covers response-body reading, responses are capped at 8 KiB, redirects are rejected, and certificate validation uses Node's default HTTPS behavior. Retry-After is capped at five minutes. Permanent input failures increment bounded drop counts; auth/policy failures pause only the affected provider. Programmatic callers can explicitly resume a corrected source with resumeSource. No queue reset, persistent service, LaunchAgent, native observation or provider verification is automatic.

## Native Codex (Phase 2A)

Version verified locally: `codex-cli 0.163.0`. The matching [protocol](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/protocol/src/protocol.rs) defines primary/secondary slots in a `limit_id` namespace, used percent, window minutes, and reset Unix seconds. The [rollout writer](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/rollout/src/recorder.rs) assigns a local emission timestamp, which is **not** an upstream quota observation time. Native windows therefore retain unknown upstream freshness. Credits, plan names, token usage, conversations, and session identifiers are excluded.

Use a separate native collector ID, key, state directory, and owner-only BMO secret. With a local database and `BMO_ALLOW_NATIVE_SETUP=true`, run `pnpm collector:enroll <collector-id> <key-id> codex`. This local owner operation establishes ownership; it does not promote provider verification. Fixture and native identities cannot be reused across evidence modes.

Set `"evidenceMode":"native"` in the local collector config, enable Codex with its returned generation, and add `"nativeCodex":{"sessionDirectory":"/absolute/owner-authorized/.codex/sessions","version":"0.163.0"}`. Run `pnpm collector:native ./collector-native.json` in the foreground; `--once` performs one bounded scan/upload pass. SIGINT/SIGTERM closes the local state safely. No provider process is started, and no native settings are edited.

The first scan baselines preexisting files at EOF. Polling rescans handle wake, appended complete lines, new sessions, replacement files, and truncation; incomplete lines wait. Local record times arbitrate old sessions without becoming upstream evidence. Catch-up older than the queue's age limit is ignored. Traversal is bounded and returns `SCAN_LIMIT_REACHED` when clipped; choose a narrower authorized session directory if needed. Up to 512 stream checkpoints are retained per generation; exhaustion fails visibly rather than resetting identity. Silence alone does not prove a CLI exited.

Live acceptance check: after building, `node --import tsx scripts/verify-native-codex.ts /absolute/owner-authorized/.codex/sessions` creates a disposable local app/database and waits up to 90 seconds for a **new** ordinary-session quota record. It does not cause model activity. It verifies signed upload and actual Chrome dashboard rendering, emits only bounded evidence, and removes its temporary data. Set `PLAYWRIGHT_CHANNEL` if needed. A lack of new quota is an explicit failure, not fixture fallback.

Verified on 2026-10-31: new ordinary-session capture → signed local HTTP ingestion → native dashboard with two windows; source freshness remained unknown. Claude and Antigravity are still unverified.

## Claude Code statusline (Phase 2B; live verification pending)

Installed version inspected: `2.1.299`. The [official callback contract](https://code.claude.com/docs/en/statusline) documents optional `rate_limits.five_hour` / `seven_day`, percent used, and Unix-second resets. An absent field remains unavailable. Callbacks and refresh timers can repeat cached values; BMO keeps first-capture times, records `session_snapshot`, and leaves upstream time/freshness unknown. No real Claude callback has been captured in this execution.

Use a separately enrolled native collector and enable Claude with the returned ownership generation. Add `"nativeStatuslines":{"claude":{"version":"2.1.299","subscriptionQuotaConfirmed":true}}` only after confirming these fields refer to your subscription. Rate limits supplied by a spend-limit gateway are not subscription quota. Without that owner confirmation the wrapper refuses capture while preserving the existing command.

Before changing native settings, save the current `statusLine` value privately. Preserve its padding and all unrelated settings. Point **only its command** to the following absolute-path wrapper, retaining any existing command after `--`:

```text
/absolute/node --disable-warning=ExperimentalWarning --import /absolute/BMO_QUOTA_PET/node_modules/tsx/dist/loader.mjs /absolute/BMO_QUOTA_PET/collector/src/statusline-cli.ts /absolute/collector-native.local.json claude -- /bin/sh -c 'YOUR EXISTING STATUSLINE COMMAND'
```

If no statusline command exists, omit `--` and everything after it. Quote paths/command text for your shell; do not paste provider credentials. Use absolute paths so the native workspace working directory is preserved. No BMO command installs or edits native settings. Start `pnpm collector:native /absolute/collector-native.local.json` separately as the foreground uploader.

The wrapper forwards bounded stdin to the explicitly supplied old command and preserves its stdout and exit status. The old command must finish within the wrapper's finite execution budget. Only allowlisted quota goes to a private, bounded `statusline.db` spool; it does not wait for HTTPS or take the uploader's state lock. Cached callbacks remain deduplicated after restart and acknowledgment. Missing/malformed quota never becomes zero. Queue/timeout errors emit fixed codes without raw stdin. Run an ordinary session to obtain the first eligible callback; BMO never starts a model request just to get quota.

Rollback/uninstall: restore the saved `statusLine` value, or remove only the newly added setting if there was none. Stop the foreground uploader with SIGTERM/SIGINT. Revoke/disable the BMO source independently if retiring it; keep its identity/sequence state for recovery. Never remove provider authentication/session files. Real callback → dashboard and normal session exit/resume remain acceptance gates.

## Antigravity statusline (Phase 2C; live verification pending)

Installed CLI version inspected: `1.4.9`. The [official statusline interface](https://antigravity.google/docs/cli/statusline) documents `quota` buckets, but a real installed callback and its subscription-versus-credit meaning have not been established here. Do not enable capture merely because the callback has a quota-shaped field. Confirm the applicable account permissions and that the meter is subscription quota first; purchased credits are excluded.

After that confirmation and native enrollment, use `"nativeStatuslines":{"antigravity":{"version":"1.4.9","subscriptionQuotaConfirmed":true}}` and the same absolute-path wrapper command above with `antigravity` replacing `claude`. Preserve Antigravity's original command and unrelated native settings privately and restore them to uninstall. Consult the installed version's supported native setting location; BMO does not guess or rewrite it. No native settings were changed during this execution.

Fractions in [0,1] can yield percentages. Amount-only buckets retain null percentages; disabled buckets are unavailable, never 100% used. Valid absolute resets are normalized; relative countdowns remain null because the documented callback supplies no trusted provider reference instant. A reset countdown is not a window duration. Dynamic bucket IDs are validated; raw amounts, native IDs, email, paths and unrelated fields are discarded. Snapshot and upstream age remain separate. The callback never calls private endpoints or starts agent/model activity.

The shared spool binds each packet to its capture-time ownership generation. Old-generation packets are counted/discarded; disabled or policy-blocked sources cannot starve another provider. Synthetic tests cover both providers, existing command output/exit status, cached rerenders/restart, missing/malformed/disabled/amount-only data, relative resets, pressure, and the callback deadline. Real callback → dashboard, lifecycle exit/resume, permission and meter semantics remain open gates for 2C.

## Local automation and health (Phase 2D)

Copy [the disabled-by-default native example](collector.native.example.json) to ignored `collector-native.local.json`, use actual enrollment generations and private absolute paths, and enable only authorized sources. Keep fixture/native identities and state directories separate. The daemon checks installed CLI versions with bounded `--version` calls at startup. An incompatible provider is reported unsupported and does not block another provider. A supported statusline interface still requires a real callback and meter confirmation; no callback means no fresh-quota promise.

The foreground daemon rescans Codex each second and sends a bounded health heartbeat per configured enabled source every minute. SIGINT/SIGTERM waits for bounded in-flight work and releases the state lock. Process crashes preserve attempted event bytes, source offsets and sequences. Wake/reconnect resumes scans and eligible retries; it does not replace source times or cause provider activity. Callback silence is reported as no recent callback, not a claim that the CLI closed. Queue pressure, drops, paused sources, callback-spool counts and next retry time reach the protected Collectors page. Unreadable spool counts stay unknown. Offline health reports retain their sample time and can arrive stale.

### Optional per-user macOS LaunchAgent

[The template](launchd/com.bmo-personal.collector.plist.example) is supplied only; **nothing was installed**. First verify the foreground command and native source opt-ins. Copy the template to a private local working file and replace every `/ABSOLUTE/...` placeholder with explicit paths to Node 24, this checkout, provider executable directories, and your private BMO config. Launchd does not expand `~`, shell substitutions, or environment variables in `ProgramArguments`. Keep provider login with official clients; the agent starts only the collector/uploader.

Validate the edited plist with `plutil -lint <your-plist>`. After deliberately copying it to `~/Library/LaunchAgents/com.bmo-personal.collector.plist`, use your numeric user ID with `launchctl bootstrap gui/<uid> <absolute-plist-path>`. It runs after owner login and retries abnormal exits with a 10-second throttle. No root service, auto-login, keychain change or provider session is installed. Output is discarded to avoid unbounded local log files; use foreground diagnostics and protected health reports instead.

Uninstall: `launchctl bootout gui/<uid> <absolute-plist-path>`, then remove only that BMO plist. Restore any native statusline commands separately as described above. Preserve BMO identity/queue state if resuming later. Do not remove or modify provider authentication/session stores. Actual LaunchAgent installation and physical Mac sleep/shutdown were not exercised automatically; tests use controlled process suspension, restarts, HTTP failures and clock jumps.

Final Phase 2 local verification (2026-11-01): 92 Node tests and 14 Chrome tests passed, plus typecheck/lint/format/build and plist syntax. Synthetic lifecycle tests use actual foreground process suspension/restart, HTTP outage/recovery and isolated app databases. The repeated real Codex check also verified collector-health rendering. No physical Mac sleep, native statusline installation or launchd service activation is claimed. Resume live-provider acceptance at 2B; 2C remains open.

## Resume status (2026-11-01)

The bounded 2B/2C resume found no native BMO config or callback spool at the documented repository-local locations; an external configured source may still exist. Both live gates remain blocked until its location, an ordinary-session callback and subscription-meter meaning are established. Do not send credentials or raw callback/session contents. The existing wrapper/parser checks (14) and two focused ingestion/isolation checks passed with synthetic inputs; they do not verify a live provider. Global native settings and services were not changed. Continue from [the incremental checkpoint](../docs/PHASE2_RESUME_CHECKPOINT.md); keep the remaining Codex quota for actual source verification rather than repeating full builds.

## Account-independent implementation audit

BMO is this project's personal quota companion and planned physical desk pet, not another provider or an account service. Its native config contains BMO ingestion/ownership settings; it must never contain provider credentials.

| Source | Independent implementation                 | Real verification           | Actual environment                                                                                                                                    |
| ------ | ------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude | DONE for the documented candidate contract | BLOCKED_EXTERNAL_DEPENDENCY | Executable 2.1.299 is preinstalled, but the owner has no Claude account and has not configured/deployed its integration. Keep it disabled.            |
| AGY    | DONE for the documented candidate contract | BLOCKED_EXTERNAL_DEPENDENCY | CLI 1.4.9 and the documented CLI settings file exist; no custom statusline/BMO wrapper is configured. Authentication and live quota are not inferred. |

New focused tests confirm disabled Claude preserves the existing command without creating a spool, and neither provider substitutes context occupancy, token statistics or API spend for subscription quota. Standalone credit amounts cannot supply a percentage. Prior parser/spool/isolation/retry results remain synthetic/local evidence; no real callback was fabricated or logged.

## Optional live activation after external dependencies are resolved

1. **Claude has no required action now.** Leave `providers.claude.enabled` and its subscription-meter confirmation false. Only if the owner later chooses to use a supported official Claude subscription/client should its live gate reopen. Login remains exclusively in that official client; no credentials go to BMO.
2. **AGY is independently actionable later.** Its [documented callback setting](https://antigravity.google/docs/cli/statusline) is `statusLine` in `~/.gemini/antigravity-cli/settings.json`, separate from IDE/application logs. This audit read only configuration flags/metadata; it did not alter the file, inspect authentication stores or scrape logs. Confirm the callback meter represents baseline subscription quota rather than purchased credits, context tokens or cost, and establish applicable account permission before enabling export.
3. Configure the local BMO app and a **new native collector identity** using the existing disabled native example and a private BMO secret. With the app's local file database and BMO key mapping configured, run `BMO_ALLOW_NATIVE_SETUP=true pnpm collector:enroll <native-collector-id> <bmo-key-id> antigravity` (or `claude` only after its external access exists). Use the returned ownership generation; never reset sequence state or reuse a fixture identity.
4. Copy the native example to ignored `collector-native.local.json`, supply private absolute paths and the matching local ingestion URL/key reference, enable only the chosen provider, and set its `subscriptionQuotaConfirmed` only after that meaning is established. Run `pnpm collector:native /absolute/collector-native.local.json` in the foreground. No service installation is needed.
5. **Native settings change requires owner approval/manual activation.** Use the absolute wrapper command shown above with the chosen provider. Preserve the old command after `--`, stdout behavior and every unrelated setting. For AGY, preserve `padding`, `enabled` and `stack_with_default`; do not replace the entire settings file. This audit does not execute that change.
6. Use an ordinary interactive session; do not generate a prompt/model request solely to obtain quota. Verify its actual callback reaches the local dashboard with native labeling, correct nullable buckets/resets, and unknown upstream freshness. Rerenders/restarts must preserve original quota capture times; test missing buckets, normal exit/resume and another provider's continued delivery. Record sanitized evidence only, with no raw callback/session contents.
7. Restore the original native setting and stop the foreground uploader to roll back. Preserve BMO queue/identity state for recovery. Update the checkpoint and real-verification roadmap checkbox only after the live gate passes; until then the full subphase remains incomplete.
