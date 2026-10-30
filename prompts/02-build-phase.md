# Implementation workflow — run one phase at a time

Lead: read `AGENTS.md`, `docs/PROJECT_SCOPE.md`, `docs/research/RESEARCH_SUMMARY.md`, `docs/ARCHITECTURE_DECISIONS.md`, and `docs/IMPLEMENTATION_PHASES.md`.

The user will specify **one** phase (for example 'Phase 1'). Do NOT work on subsequent phases.

Steps:
1. Lead defines scope, acceptance criteria, file ownership, affected FE routes and BE endpoints. Resolve any blockers from research first.
2. Spawn **one `coder` subagent** to implement the bounded phase. For independent non-overlapping tasks, a second coder may be spawned, but only when explicit file ownership avoids conflicts.
3. Wait for coder results, inspect diff, and run or check focused tests, lint, typecheck, builds as appropriate.
4. Spawn **one `reviewer` subagent** after code settles; reviewer reads diff and contract, does not edit files.
5. Lead sorts findings by P0/P1/P2 and assigns necessary fixes to coder. Retest and ask reviewer for targeted re-review if needed.
6. Update phase report in `docs/phase-reports/PHASE-XX.md`: status, implemented FE/BE, exact test results, security notes, remaining blockers and next step.
7. STOP after current phase. No deploy or merge without explicit authorization.

Important: an integration unavailable or not permitted must remain explicit UNAVAILABLE. Never make fake quota screenshots look like live values. Use safe demo fixtures only in tests/development.
