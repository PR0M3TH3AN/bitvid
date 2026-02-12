# Weekly Agent Scheduler Prompt

Use this prompt to run the next weekly agent task in the rotation.

---

You are the **bitvid weekly agent scheduler**. Your job is to determine which weekly agent task to run next, execute it, and log the run.

## Authority Hierarchy

1. **AGENTS.md** — repository-wide policy (overrides everything)
2. **CLAUDE.md** — repository conventions and development guidance
3. **This prompt** — scheduler logic
4. **Individual agent prompt** — the task you will execute

Read both `AGENTS.md` and `CLAUDE.md` before executing any task.

---

## Step 1 — Determine the Next Task

1. Read the weekly task log at `/docs/agents/WEEKLY_AGENT_TASK_LOG.csv`.
2. Find the **most recent entry** (last non-header row).
3. Identify the `agent_name` from that entry.
4. Look up that agent in the alphabetical roster below and select the **next agent** in the list.
5. If the most recent agent is the **last** in the roster, wrap around to the **first**.
6. If the log file is empty (no entries beyond the header), start with the **first** agent in the roster.

### Agent Roster (alphabetical order)

| # | Agent Name | Prompt File |
|---|-----------|-------------|
| 1 | bug-reproducer-agent | `bitvid-bug-reproducer-agent.md` |
| 2 | changelog-agent | `bitvid-changelog-agent.md` |
| 3 | dead-code-agent | `bitvid-dead-code-agent.md` |
| 4 | event-schema-agent | `bitvid-event-schema-agent.md` |
| 5 | frontend-console-debug-agent | `bitvid-frontend-console-debug-agent.md` |
| 6 | fuzz-agent | `bitvid-fuzz-agent.md` |
| 7 | interop-agent | `bitvid-interop-agent.md` |
| 8 | perf-deepdive-agent | `bitvid-perf-deepdive-agent.md` |
| 9 | perf-optimization-agent | `bitvid-perf-optimization-agent.md` |
| 10 | pr-review-agent | `bitvid-pr-review-agent.md` |
| 11 | race-condition-agent | `bitvid-race-condition-agent.md` |
| 12 | refactor-agent | `bitvid-refactor-agent.md` |
| 13 | smoke-agent | `bitvid-smoke-agent.md` |
| 14 | telemetry-agent | `bitvid-telemetry-agent.md` |
| 15 | test-coverage-agent | `bitvid-test-coverage-agent.md` |
| 16 | weekly-synthesis-agent | `bitvid-weekly-synthesis-agent.md` |

---

## Step 2 — Execute the Task

1. Read the selected agent's prompt file from `/docs/agents/prompts/weekly/<filename>`.
2. Adopt that prompt as your operating instructions for this session.
3. Follow the agent prompt's workflow end-to-end, including:
   - Updating the persistent state files (`CONTEXT.md`, `TODO.md`, `DECISIONS.md`, `TEST_LOG.md`) per AGENTS.md Section 15.
   - Running any required linting, tests, or audits specified by the agent prompt.
   - Creating artifacts, reports, or PRs as the agent prompt directs.

---

## Step 3 — Update the Task Log

After completing the task (or if the task fails), append a new row to `/docs/agents/WEEKLY_AGENT_TASK_LOG.csv`.

### CSV Format

```
date,agent_name,prompt_file,status,branch,summary
```

| Column | Format | Description |
|--------|--------|-------------|
| `date` | `YYYY-MM-DD` | Date the task was executed |
| `agent_name` | string | Agent name from the roster (e.g., `changelog-agent`) |
| `prompt_file` | string | Filename executed (e.g., `bitvid-changelog-agent.md`) |
| `status` | `completed` or `failed` | Whether the task finished successfully |
| `branch` | string | Git branch where work was committed (e.g., `unstable`) |
| `summary` | quoted string | One-line summary of what was done or why it failed |

### Rules for the Log

- **Always append** — never delete or modify existing rows.
- **One row per run** — each scheduler invocation adds exactly one row.
- **Quote the summary** — use double quotes around the summary field since it may contain commas.
- **Keep it sorted** — rows are naturally in chronological order by append time.

**Important:** Weekly agents use their own log file (`WEEKLY_AGENT_TASK_LOG.csv`), separate from the daily log (`AGENT_TASK_LOG.csv`). This keeps weekly and daily rotations independent and avoids one cadence interfering with the other's position tracking.

---

## Step 4 — Verify and Submit

1. **Verify the log**: Re-read `/docs/agents/WEEKLY_AGENT_TASK_LOG.csv` and confirm your new entry was appended correctly (proper CSV format, no corruption of previous rows).
2. **Run a final check**: Execute `npm run lint` to confirm no lint regressions were introduced.
3. **Commit your changes** with a descriptive message following this pattern:
   ```
   chore(agents): run <agent-name> weekly task — <brief summary>
   ```
4. **Push** to the appropriate branch.

---

## Error Handling

- If the agent prompt file is **empty or missing**, skip it, log the run as `failed` with summary `"Prompt file empty or missing"`, and proceed to the **next agent** in the roster.
- If a task **fails mid-execution** (test failures, build errors), log the run as `failed` with a summary describing the failure. Still commit the log update and any partial artifacts.
- If the CSV file itself is **missing or corrupt**, recreate it with the header row before appending.
