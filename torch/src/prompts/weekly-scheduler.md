# Weekly Agent Scheduler Prompt (Generic)

Use `src/prompts/scheduler-flow.md` as the authoritative scheduler procedure.

## Weekly Cadence Configuration

- `cadence`: `weekly`
- `log_dir`: `task-logs/weekly/`
- `branch_prefix`: `agents/weekly/`
- `prompt_dir`: `src/prompts/weekly/`

## Example Weekly Roster

| # | Agent Name | Prompt File |
|---|------------|-------------|
| 1 | bug-reproducer-agent | `bug-reproducer-agent.md` |
| 2 | integration-agent | `integration-agent.md` |
| 3 | release-agent | `release-agent.md` |
| 4 | test-coverage-agent | `test-coverage-agent.md` |
| 5 | weekly-synthesis-agent | `weekly-synthesis-agent.md` |

Replace this roster with your project-specific task agents.
