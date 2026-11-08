# Status and broker verification — 2026-11-08

The configured broker accepted MQTT CONNECT/CONNACK with certificate verification
enabled. Final live check: 2026-11-08T14:39:03.548Z, duration 679 ms. The loaded
configuration had a username and an empty password. No credentials were changed
or printed. No messages were published; publish ACLs, outbox delivery and physical
device reception remain unverified by this check.

`/status` now performs a bounded handshake after owner authentication and shows
connection state, check time, duration and safe errors. Refresh repeats the check.
Missing host and invalid ports are distinguished from network/protocol failures.
Browser fixtures explicitly disable real broker probes.

Validation passed:

- Production build, strict typecheck, lint and formatting of changed files.
- 31 focused MQTT, outbox, pipeline and maintenance tests.
- Standalone browser test for `/status`, including the unconfigured broker state.
- Independent code review; the reported socket-reset race was corrected and reviewed.

The full test suites were also executed and are not entirely green:

- Vitest: 161 passed, 3 failed. These unchanged collector tests use fixed
  2026-10-31 timestamps that expire relative to the current date:
  - `preserves unchanged bucket times and persistent sequence across restart`
    (`collector/tests/collector.test.ts`): second queued event absent.
  - `uses immutable event body with fresh HMAC nonce and accepts matching durable ack`
    (`collector/tests/collector.test.ts`): EVENT_EXPIRED instead of ACKNOWLEDGED.
  - `retains disjoint partial snapshots and coalesces only fully superseded pending data`
    (`collector/tests/reliability.test.ts`): one pending event instead of two.
- Playwright: 20 passed, 1 failed:
  `status reflects persisted provider quota without treating upload or verification as freshness`
  (`tests/browser/status.spec.ts`): expected stale Codex label absent in the full
  suite. The new broker assertions passed. This test passed twice in isolation,
  including against the final build; the full-suite interaction remains unresolved.

The additional nonnumeric-port regression was then added; all 31 focused tests
passed on the final code. The full suites were not repeated after that addition.

## Owner confirmation of provider integrations

On 2026-11-08 the owner confirmed the Antigravity and Codex integrations. A guarded
database transaction checked both enabled sources against their active,
non-synthetic authoritative collectors and current ownership generations. It
found two successful current quota windows for Codex and four for Antigravity,
then recorded `verification=verified` with an owner-confirmation note for both.
Claude stayed disabled and unverified. Readback confirmed 2/3 verified providers.
No complete-set or freshness claims were changed, and collector uploads still
cannot promote their own verification.

Service badge color now uses explicit health state instead of matching the
Vietnamese label `Khả dụng`. MQTT connection success is green. Integration health
requires at least one enabled provider and verification of every enabled provider;
disabled providers remain in the displayed total without blocking enabled sources.
