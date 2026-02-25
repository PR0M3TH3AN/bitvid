# Context: Daily Audit Agent Run

**Date:** 2026-02-25
**Agent:** audit-agent
**Platform:** Jules
**Target Branch:** unstable (assumed per prompt)
**Node Version:** v22.22.0
**NPM Version:** 10.8.2

## Goal
Run the project's static audit scripts (file size, innerHTML, lint), collect metrics, compare with previous week's results, and publish a summary.

## Scope
- Run `scripts/check-file-size.mjs`
- Run `scripts/check-innerhtml.mjs`
- Run `npm run lint`
- Parse outputs to JSON
- Generate summary report
- Create `docs/agents/task-logs/daily/YYYY-MM-DD_audit-agent_completed.md`

## Constraints
- Read-only execution (do not modify source files).
- Reproducible logs in `test_logs/`.
- No sensitive data in logs.
