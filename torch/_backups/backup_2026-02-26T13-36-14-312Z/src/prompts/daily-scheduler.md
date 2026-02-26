# Daily Agent Scheduler Prompt

Use `src/prompts/scheduler-flow.md` as the authoritative scheduler procedure.

> **Shared contract (required):** Ensure each selected prompt run enforces [`Scheduler Flow → Shared Agent Run Contract`](scheduler-flow.md#shared-agent-run-contract-required-for-all-spawned-agents).

Canonical roster source: `src/prompts/roster.json` (`daily` key).

## Daily Cadence Configuration

- `cadence`: `daily`
- `log_dir`: `task-logs/daily/`
- `branch_prefix`: `agents/daily/`
- `prompt_dir`: `src/prompts/daily/`

## Daily Roster

| # | Agent Name | Prompt File |
|---|------------|-------------|
| 1 | audit-agent | `audit-agent.md` |
| 2 | ci-health-agent | `ci-health-agent.md` |
| 3 | const-refactor-agent | `const-refactor-agent.md` |
| 4 | content-audit-agent | `content-audit-agent.md` |
| 5 | decompose-agent | `decompose-agent.md` |
| 6 | deps-security-agent | `deps-security-agent.md` |
| 7 | design-system-audit-agent | `design-system-audit-agent.md` |
| 8 | docs-agent | `docs-agent.md` |
| 9 | docs-alignment-agent | `docs-alignment-agent.md` |
| 10 | docs-code-investigator | `docs-code-investigator.md` |
| 11 | governance-agent | `governance-agent.md` |
| 12 | innerhtml-migration-agent | `innerhtml-migration-agent.md` |
| 13 | known-issues-agent | `known-issues-agent.md` |
| 14 | load-test-agent | `load-test-agent.md` |
| 15 | log-fixer-agent | `log-fixer-agent.md` |
| 16 | onboarding-audit-agent | `onboarding-audit-agent.md` |
| 17 | perf-agent | `perf-agent.md` |
| 18 | protocol-research-agent | `protocol-research-agent.md` |
| 19 | scheduler-update-agent | `scheduler-update-agent.md` |
| 20 | style-agent | `style-agent.md` |
| 21 | test-audit-agent | `test-audit-agent.md` |
| 22 | todo-triage-agent | `todo-triage-agent.md` |
| 23 | torch-garbage-collection-agent | `torch-garbage-collection-agent.md` |
