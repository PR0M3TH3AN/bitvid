---
run-start: 2026-02-20-05-02-56
cadence: weekly
---

# Prompt Safety Agent Decisions

## Decision 1: Use heuristic script for audit
**Rationale:** Manually checking 40+ files is error-prone. A script looking for keywords (`FAILURE MODES`, `EXIT CRITERIA`) is more reliable and repeatable.

## Decision 2: Auto-fix `governance-agent.md`
**Rationale:** The prompt was clearly missing a failure mode section. Adding a standard one was low-risk and high-value.
