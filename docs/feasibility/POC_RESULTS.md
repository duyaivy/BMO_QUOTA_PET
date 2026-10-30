# Phase 0.5 — Controlled proof-of-concept results

> Historical execution evidence, not a current implementation plan. [Current architecture](../ARCHITECTURE_DECISIONS.md) selects event-driven JSONL/statusline observation; old app-server retest instructions below are superseded. Preserve the failed-startup and synthetic-only results; none verifies a live provider.

Executed by the lead on 2026-10-30 UTC, 2026-10-31 Asia/Ho_Chi_Minh. Test host: macOS/Darwin arm64, restricted workspace sandbox, shell network restrictions. No VPS, Render, Turso or MQTT connection was tested. No login, new grant, provider settings change, raw credential access or model invocation was performed.

## Installed-interface checks

| Commands actually executed | Sanitized result | Quota / freshness / reauthentication |
|---|---|---|
| `uname -sm`; `command -v codex`; `command -v claude`; `command -v agy` | Darwin arm64; all three commands installed | Installation only; no authentication or quota evidence |
| `codex --version`; `codex app-server --help`; `codex login --help` | `codex-cli 0.163.0`; app-server stdio/socket transports available and described as experimental | No quota values; no login attempted |
| `claude --version`; `claude auth --help`; `claude auth status --help` | Claude Code `2.1.299`; JSON auth-status option documented by installed CLI | No quota values |
| `agy --version`; `agy --help` | `1.4.9`; print JSON/stream-JSON flags describe model prompt output, not a quota-export subcommand | No quota values; no TUI/prompt started |
| `codex login status`, captured by Python subprocess with raw stdout/stderr suppressed | Exit 0; allowlisted classification `chatgpt` | Existing native login detected, not a fresh quota reading; no reauth requested |
| `claude auth status --json`, captured by Python, allowlisted fields only | Exit 0; `loggedIn:true`, `authMethod:"oauth_token"`, `apiProvider:"firstParty"` | Auth classification only; no token value, account identity or quota returned to report; no reauth requested |

The official clients handled any native status lookup internally. The lead did not open their credential stores. Unfiltered native status output was never printed or persisted. Installed help is runtime capability evidence, not proof that a specific quota operation succeeds.

## Codex read-only RPC attempt — NOT SUCCESSFUL

Supported interface: [official app-server](https://learn.chatgpt.com/docs/app-server). A bounded Python subprocess started this exact command:

```sh
codex app-server --listen stdio://
```

The first attempt used the repository working directory and sent:

```json
{"id":1,"method":"initialize","params":{"clientInfo":{"name":"bmo_phase05_readonly","title":"BMO Phase 0.5 read-only check","version":"0.0.1"}}}
```

It did not receive a successful initialization within the ten-second wait. No quota request was sent because the handshake gate never passed. Native stderr was suppressed.

A second bounded diagnostic used `/private/tmp` as working directory and the same command, with explicit non-experimental capabilities:

```json
{"id":1,"method":"initialize","params":{"clientInfo":{"name":"bmo_phase05_readonly","version":"0.0.1"},"capabilities":{"experimentalApi":false}}}
```

The subprocess exited 1 before initialization completed. Sanitized stderr classification: **operation not permitted**. No JSON-RPC error or rate-limit response was received. Raw stdout/stderr were not logged; the helper retained only known startup-error flags. The precise native failing operation is unverified; this is a sandbox/startup limitation, not evidence that the account lacks quota or needs reauthentication. Children were closed/terminated within bounded cleanup; no daemon was installed.

Only after a successful handshake would the helper send the documented `initialized` notification and `account/rateLimits/read`. **Neither was sent in these attempts.** No `thread/start`, `turn/start` or auth method was sent. Fields actually observed: none of `usedPercent`, `windowDurationMins`, `resetsAt`. Fresh quota: **NO**. Refresh/logout/restart lifecycle: **NOT TESTED**.

Exact outstanding prerequisite: an execution environment in which this unmodified app-server can initialize under the owner's existing normal login, without sandbox bypass or secret extraction. Re-run the same bounded handshake/read there. No new login is justified by this result; if the client later requests one, stop and let the owner use the official flow.

## Synthetic parser checks — PASS, not live integration

Executed `python3 - <<'PY'` with in-memory fabricated Codex, Claude and AGY quota objects, no network/file access and no third-party library. It made **13 assertions**:

- Codex used 25% becomes remaining 75%; null secondary stays absent.
- Claude used 23.5% becomes remaining 76.5%.
- Epoch `2000000000` converts to `2033-05-18T03:33:20Z`.
- AGY fraction 0.75 becomes remaining 75%, used 25%; amount-only has no inferred percentage.
- Each of null, negative, above-100, NaN, boolean and string is rejected as a percentage (six assertions).
- Output field names are allowlisted (one assertion; not a comprehensive security test).

Sanitized output: `PASS: 13 synthetic assertions; zero live quota observations, no network, no files written`. These checks prove only the tested conversion behavior, not a production parser, ingestion security, provider permission, freshness, authentication refresh or integration coverage.

## Deliberately unexecuted checks

Claude/AGY live statusline capture would require an existing emitting session/export configuration. No such configuration was inspected or changed, no prompt was run to populate quota, and no local callback was installed. Their observed quota fields in this phase are **NONE**; schemas are documentary evidence only. VPS/native keyring/reboot, Mac sleep/wake, expiration/rotation and remote uploads remain **NOT RUN**. An independent quota loop for these providers is not established by the docs.

Optional future tests must keep the same no-credentials/no-model boundary, capture only allowlisted quota, record its real observation time, and distinguish repeated session state from a new provider reading. A fresh Codex RPC and an ordinary CLI callback are different levels of evidence.

## Documentation checks

`python3 scripts/validate_codex_setup.py`: PASS for the existing role/config TOML and setup constraints. `git diff --check`: PASS for tracked changes. A separate Python document check: PASS for exactly eight feasibility reports, titles, all local Markdown links, trailing whitespace and three JSON examples. These are documentation checks, not ingestion, refresh or live provider tests. Existing Phase 0 files and unrelated working-tree changes were left intact.
