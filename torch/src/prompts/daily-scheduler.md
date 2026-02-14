# Daily Agent Scheduler Prompt (Generic)

Use `src/prompts/scheduler-flow.md` as the authoritative scheduler procedure.

## Daily Cadence Configuration

- `cadence`: `daily`
- `log_dir`: `task-logs/daily/`
- `branch_prefix`: `agents/daily/`
- `prompt_dir`: `src/prompts/daily/`

## Example Daily Roster

| # | Agent Name | Prompt File |
|---|------------|-------------|
| 1 | documentation-agent | `documentation-agent.md` |
| 2 | quality-agent | `quality-agent.md` |
| 3 | security-agent | `security-agent.md` |
| 4 | performance-agent | `performance-agent.md` |
| 5 | refactor-agent | `refactor-agent.md` |

Replace this roster with your project-specific task agents.
