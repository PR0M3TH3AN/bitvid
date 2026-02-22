# Context: Scheduler Update Agent

## Goal
Keep `daily-scheduler.md` and `weekly-scheduler.md` rosters in sync with the actual prompt files on disk.

## Scope
- Input: `docs/agents/prompts/daily/*.md`, `docs/agents/prompts/weekly/*.md`
- Output: `docs/agents/prompts/daily-scheduler.md`, `docs/agents/prompts/weekly-scheduler.md`

## Definition of Done
- Rosters match file inventory.
- Verification checks pass.
- Lint passes.
