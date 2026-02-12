# Context

**Goal:** Execute the `bitvid-const-refactor-agent` task (daily scheduler).
**Scope:** Identify and refactor duplicated numeric constants in `js/` to use canonical named constants.
**Focus:** Refactor `5000` (timeout) to `SHORT_TIMEOUT_MS` and `60000` (timeout) to `LONG_TIMEOUT_MS` in selected files.

**Definition of Done:**
- [ ] Identify candidate duplicates.
- [ ] Refactor `js/ui/engagementController.js` (5000 -> SHORT_TIMEOUT_MS).
- [ ] Refactor `js/ui/applicationBootstrap.js` (5000 -> SHORT_TIMEOUT_MS).
- [ ] Refactor `js/webtorrent.js` (60000 -> LONG_TIMEOUT_MS).
- [ ] Verify changes with `npm run lint` and `npm run test:unit`.
- [ ] Update documentation (`DECISIONS.md`, `TEST_LOG.md`).
- [ ] Update `docs/agents/AGENT_TASK_LOG.csv`.
