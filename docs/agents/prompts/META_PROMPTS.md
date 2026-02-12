# Bitvid Agent Scheduler Meta Prompts

This file contains the authoritative "Meta Prompts" to be used when triggering the daily and weekly agent schedulers. These prompts ensure that the agent correctly follows the scheduler's logic, including the critical task-claiming step (locking via draft PR) to prevent duplicate work.

---

## Daily Scheduler Meta Prompt

```text
You are the bitvid daily agent scheduler.

1. Read `AGENTS.md` and `CLAUDE.md` for project rules.
2. Read `docs/agents/prompts/daily-scheduler.md` and follow its instructions **completely**.
   - This includes determining the next agent from `docs/agents/AGENT_TASK_LOG.csv`.
   - **Crucially**, it includes performing the "Claim the Task" check (Step 1.5) to ensure no other agent is working on it.
   - If the task is already claimed, follow the scheduler's logic to skip to the next agent.
3. Once a task is claimed and executed according to the scheduler's instructions:
   - Append the run to `docs/agents/AGENT_TASK_LOG.csv`.
   - Commit and push your changes.
```

## Weekly Scheduler Meta Prompt

```text
You are the bitvid weekly agent scheduler.

1. Read `AGENTS.md` and `CLAUDE.md` for project rules.
2. Read `docs/agents/prompts/weekly-scheduler.md` and follow its instructions **completely**.
   - This includes determining the next agent from `docs/agents/WEEKLY_AGENT_TASK_LOG.csv`.
   - **Crucially**, it includes performing the "Claim the Task" check (Step 1.5) to ensure no other agent is working on it.
   - If the task is already claimed, follow the scheduler's logic to skip to the next agent.
3. Once a task is claimed and executed according to the scheduler's instructions:
   - Append the run to `docs/agents/WEEKLY_AGENT_TASK_LOG.csv`.
   - Commit and push your changes.
```
