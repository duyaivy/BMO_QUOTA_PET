# Implementation workflow — one selected subphase

Lead: read AGENTS.md, docs/PROJECT_SCOPE.md, docs/ARCHITECTURE_DECISIONS.md, and the selected section of docs/IMPLEMENTATION_PHASES.md. The architecture is the technical authority; historical research is evidence only. Read a retained provider report only when needed.

The owner must select **one subphase**, for example “Phase 1A — Next.js Foundation & UI Layout.” Use the roadmap's smallest named subphase; do not execute a whole numbered phase or subsequent subphases automatically.

1. Lead identifies the subphase's objective, dependencies, exact scope, files/modules, tests, Definition of Done, and exclusions. Inspect existing Git changes and preserve unrelated work.
2. Delegate bounded implementation to **one configured Coder** with explicit file ownership and current architecture. No provider OAuth/token storage, cloud provider polling, or implementation from superseded reports.
3. Inspect the diff and run appropriate tests/typecheck/lint/build. Synthetic fixtures must be labeled and must not be presented as live provider evidence.
4. Use **one configured Reviewer** after code settles. Reviewer inspects changes/contracts/tests without edits.
5. Assign confirmed fixes to Coder, retest, and request focused re-review only when necessary.
6. Lead performs final verification, marks this roadmap subphase complete only when its gate passes, and reports changes, exact validation, blockers, and next step in the conversation. Update essential setup docs as needed; do not generate a separate large phase report.
7. **STOP after this subphase.** Do not deploy, commit, push, merge, or start another subphase without explicit authorization.

Missing compatibility/permission or real quota evidence stays unverified/unsupported. A fixture parser, native login, callback repetition, or fast upload never proves fresh upstream quota. Phase 1 has no real provider integration or production deployment; Phase 2 contains those provider verification gates.

Architecture-only sessions must not invoke Coder or start Phase 1A.
