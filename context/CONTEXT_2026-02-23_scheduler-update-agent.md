# Context: Scheduler Update Agent

## Goal
Synchronize the `daily-scheduler.md` and `weekly-scheduler.md` rosters with the actual prompt files in `docs/agents/prompts/daily/` and `docs/agents/prompts/weekly/`.

## Scope
- Inspect `docs/agents/prompts/daily/` and `docs/agents/prompts/weekly/`.
- Update `docs/agents/prompts/daily-scheduler.md` and `docs/agents/prompts/weekly-scheduler.md` if discrepancies exist.
- Verify changes with lint and file counts.

## Assumptions
- Prompt files are the source of truth.
- Scheduler files should only have their roster tables modified.
