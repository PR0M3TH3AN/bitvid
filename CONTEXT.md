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

## 2026-02-18: Constants Refactor

**Goal:** Execute the `const-refactor-agent` task.
**Scope:** Replace numeric literals `10000` and `5000` with constants.
**Status:** In Progress.
**Definition of Done:**
- [x] Replace `10000` with `STANDARD_TIMEOUT_MS` in relay/client code.
- [x] Replace `5000` with `SHORT_TIMEOUT_MS` in UI/signer code.
- [x] Verify with lint and tests.
- [ ] Update AGENT_TASK_LOG.csv.
