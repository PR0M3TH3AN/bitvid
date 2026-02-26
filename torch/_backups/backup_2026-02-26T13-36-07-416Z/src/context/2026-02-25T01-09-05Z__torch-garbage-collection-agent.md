---
agent: torch-garbage-collection-agent
cadence: daily
run-start: 2026-02-25T01:09:35Z
---

# Context
Prompt: src/prompts/daily/torch-garbage-collection-agent.md

## Goal
Clean up stale log files and ephemeral memory updates from the repository root to maintain hygiene.

## Scope
- Files in the repository root matching `*.log`, `*.log.*`, `*.out.log`.
- Files in `memory-updates/` matching `*.md`.
- Only files older than 14 days.

## Constraints
- Must not delete files outside the repository root.
- Must not delete files that do not match the specified patterns.
- Must not delete files younger than 14 days.
- Must verify candidates before deletion.
