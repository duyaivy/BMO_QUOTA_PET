# Review-only workflow

Lead: use one `reviewer` subagent to audit the specified feature, phase or branch diff. The reviewer is read-only and must not change files.

Inputs: scope, base ref (if applicable), changed files, relevant `docs/` contracts, recent test output.

Output findings ordered by severity with exact file:line, evidence, user impact, reproduction or failing test, recommended smallest fix. Include test gaps and non-findings. Distinguish verified problems from hypotheses.

Lead should then summarize findings and determine whether to spawn a `coder` for confirmed P0/P1 issues, but do not fix code unless the user requested fixes.
