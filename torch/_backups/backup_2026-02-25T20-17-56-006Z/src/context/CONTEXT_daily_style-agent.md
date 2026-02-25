---
agent: style-agent
cadence: daily
run-start: 2026-02-15T08:00:00Z
prompt: src/prompts/daily/style-agent.md
---

# Context: Style Agent Daily Run

## Goal
Keep code style consistent by running the repo’s configured formatters/linters and applying only safe auto-fixes.

## Scope
- Running repo format/lint scripts (`npm run lint`).
- Applying automatic fixes where supported (`--fix`).
- Verifying inline style compliance.

## Constraints
- Auto-fix only.
- No manual logic changes.
- Stop and report if manual changes are needed.
