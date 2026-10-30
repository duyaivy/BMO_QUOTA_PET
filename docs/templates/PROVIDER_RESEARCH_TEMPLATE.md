# Provider — research template

## Scope / date
Provider: ...  | Research timestamp (UTC): ... | Researcher: ...

## Verdict
GO / CONDITIONAL / NO-GO, with a one-sentence rationale.

## Quota data
- Subscription plan vs API billing vs context window:
- Available windows (5h, weekly, provider-specific):
- Exact response fields; how to normalize:
- Reset time semantics and missing values:

## Authentication lifecycle
- Supported first-time login:
- Credential type(s):
- Whether refresh is documented; refresh failure and rotation:
- Credential/session persistence over restart:
- Can the Next.js service itself perform this, or does it require a CLI/sidecar?

## Deployment & permission
- Supported headless operation on Render Free:
- Official vs undocumented APIs:
- Policy/ToS constraints:
- Security / rate limiting:

## Evidence table
| Finding | CONFIRMED / CONDITIONAL / UNKNOWN / BLOCKED | Primary source URL | Observed API/field | Caveat |
|---|---|---|---|---|

## Minimal proof-of-concept plan
Steps that can be tested without real secrets in repository or research artifacts.

## Recommended architecture adapter
Implementation sketch and failure states; no unverified authentication flow.

## Remaining blockers
- ...
