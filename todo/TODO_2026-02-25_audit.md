# TODO: Daily Audit Agent Run

- [ ] Run preflight checks (node/npm version)
- [ ] Create artifacts directory `artifacts/audit/2026-02-25/`
- [ ] Run `scripts/check-file-size.mjs` and save log
- [ ] Run `scripts/check-innerhtml.mjs` and save log
- [ ] Run `npm run lint` and save log
- [ ] Parse file size log to JSON
- [ ] Parse innerHTML log to JSON
- [ ] Parse lint log to JSON
- [ ] Generate summary report (compare with 2026-02-24)
- [ ] Create task log file in `docs/agents/task-logs/daily/`
- [ ] Run `npm run lint` (final check)
- [ ] Commit and submit
