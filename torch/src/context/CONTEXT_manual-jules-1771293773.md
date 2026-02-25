# Context for Scheduler Update Agent

**Agent**: scheduler-update-agent
**Cadence**: daily
**Session**: manual-jules-1771293773

## Goal
Sync scheduler roster with actual files.

## Scope
- src/prompts/daily/
- src/prompts/weekly/
- roster.json
- scheduler markdown files
- Active Prompt: src/prompts/daily/scheduler-update-agent.md

## Constraints
- Do not create/delete prompt files.
- Follow roster.json as source of truth.
