# Fixture collector (Phase 1D)

This package is a local, synthetic-only collector pipeline. The Codex `token_count/rate_limits`, Claude `rate_limits`, and Antigravity `quota` shapes are unverified candidate schemas. It does not inspect provider storage, alter native CLI settings, start a local HTTP server, or make provider requests.

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
