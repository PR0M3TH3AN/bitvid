# CONTEXT - bitvid-audit-agent

## Goal
Run the daily/weekly static audit scripts (file size, innerHTML, lint) to detect regressions and generate a report.

## Scope
- Repo: `PR0M3TH3AN/bitvid` (unstable branch).
- Focus: Static analysis reports.

## Constraints
- Read-only job (do not modify source files).
- Reproducible reports.
- Confidentiality (redact secrets).

## Definition of Done
- Audit scripts run successfully.
- Artifacts (`raw-*.log`, `*-report.json`) generated.
- `summary.md` created.
- `AGENT_TASK_LOG.csv` updated.
