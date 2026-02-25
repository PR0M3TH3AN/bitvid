---
run-start: 2026-02-20-05-02-56
cadence: weekly
---

# Prompt Safety Agent Context

## Goal
Audit all daily and weekly agent prompts to ensure they contain explicit safety mechanisms (failure modes, skip allowances, no-op paths).

## Scope
- `src/prompts/daily/*.md`
- `src/prompts/weekly/*.md`

## Constraints
- Do not modify prompts to change core behavior.
- Only add safety sections if missing and safe to do so.
- Report findings.
