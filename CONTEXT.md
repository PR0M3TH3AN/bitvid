# Context

**Goal:** Execute the `bitvid-ci-health-agent` task.
**Scope:** Fix flaky tests.
**Status:** Fixed `tests/watch-history.test.mjs` using `waitFor`.
**Definition of Done:**
- [x] Inspect CI config and package.json.
- [x] Run unit tests locally to detect flakes.
- [x] Fix identified flakes or document them.
- [x] Generate a CI health report (captured in PR description/DECISIONS.md).
- [x] Update AGENT_TASK_LOG.csv.
