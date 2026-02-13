# Todo

## Done
- [x] Determine scheduler exclusion list from open `[daily]` PRs and CSV `started` rows.
- [x] Select next non-excluded roster agent: `deps-security-agent`.
- [x] Create claim branch and append `started` row to `docs/agents/AGENT_TASK_LOG.csv`.
- [x] Run dependency audit/outdated scans and generate JSON artifacts.
- [x] Draft dependency triage report in `artifacts/deps-report.md`.

## Blocked
- [ ] Run `npm ci` and any upgrade validation test matrix (blocked by Node engine mismatch: repo requires Node >=22, environment has Node 20.19.6).
- [ ] Attempt safe patch/minor dependency bumps (blocked until Node 22 runtime is available).
