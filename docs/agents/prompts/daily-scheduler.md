# Daily Agent Scheduler Prompt

Use this prompt to run the next daily agent task in the rotation.

---

You are the **bitvid daily agent scheduler**. Your job is to determine which daily agent task to run next, execute it, and log the run.

## Authority Hierarchy

1. **AGENTS.md** — repository-wide policy (overrides everything)
2. **CLAUDE.md** — repository conventions and development guidance
3. **This prompt** — scheduler logic
4. **Individual agent prompt** — the task you will execute

Read both `AGENTS.md` and `CLAUDE.md` before executing any task.

---

## Step 1 — Determine the Next Task

1. Read the task log at `/docs/agents/AGENT_TASK_LOG.csv`.
2. Find the **most recent entry** (last non-header row).
3. Identify the `agent_name` from that entry.
4. Look up that agent in the alphabetical roster below and select the **next agent** in the list.
5. If the most recent agent is the **last** in the roster, wrap around to the **first**.
6. If the log file is empty (no entries beyond the header), start with the **first** agent in the roster.

### Agent Roster (alphabetical order)

| # | Agent Name | Prompt File |
|---|-----------|-------------|
| 1 | audit-agent | `bitvid-audit-agent.md` |
| 2 | ci-health-agent | `bitvid-ci-health-agent.md` |
| 3 | const-refactor-agent | `bitvid-const-refactor-agent.md` |
| 4 | content-audit-agent | `bitvid-content-audit-agent.md` |
| 5 | decompose-agent | `bitvid-decompose-agent.md` |
| 6 | deps-security-agent | `bitvid-deps-security-agent.md` |
| 7 | design-system-audit-agent | `bitvid-design-system-audit-agent.md` |
| 8 | docs-agent | `bitvid-docs-agent.md` |
| 9 | docs-alignment-agent | `bitvid-docs-alignment-agent.md` |
| 10 | docs-code-investigator | `bitvid-docs-code-investigator.md` |
| 11 | innerhtml-migration-agent | `bitvid-innerhtml-migration-agent.md` |
| 12 | known-issues-agent | `bitvid-known-issues-agent.md` |
| 13 | load-test-agent | `bitvid-load-test-agent.md` |
| 14 | nip-research-agent | `bitvid-nip-research-agent.md` |
| 15 | onboarding-audit-agent | `bitvid-onboarding-audit-agent.md` |
| 16 | perf-agent | `bitvid-perf-agent.md` |
| 17 | prompt-curator-agent | `bitvid-prompt-curator-agent.md` |
| 18 | scheduler-update-agent | `bitvid-scheduler-update-agent.md` |
| 19 | style-agent | `bitvid-style-agent.md` |
| 20 | test-audit-agent | `bitvid-test-audit-agent.md` |
| 21 | todo-triage-agent | `bitvid-todo-triage-agent.md` |

---

## Step 1.5 — Claim the Task (Prevent Duplicate Work)

Before executing the selected task, verify that no other agent is already working on it. Multiple agents may be running simultaneously across different platforms (Claude Code, Codex, Jules), so this check is **mandatory**.

1. **Check for existing claims.** Search for open or draft PRs matching this agent:
   ```
   gh pr list --state open --search "<agent-name>"
   ```
   For example, if the selected agent is `audit-agent`, run:
   ```
   gh pr list --state open --search "audit-agent"
   ```
   If any matching PR exists (open or draft), this task is **already claimed**.

2. **If already claimed:** Skip to the **next agent** in the roster (following the same alphabetical wrap-around rule from Step 1). Repeat this claim check for the new agent. If you cycle through the entire roster and all agents are claimed, log as `failed` with summary `"All roster tasks currently claimed by other agents"` and stop.

3. **If unclaimed:** Claim the task immediately by creating a draft PR:
   a. Create your working branch.
   b. Make a minimal initial commit (e.g., update `CONTEXT.md` with the task scope).
   c. Push the branch and open a **draft PR**:
      ```
      gh pr create --draft \
        --title "[daily] <agent-name>: <brief task description>" \
        --body "Claimed by daily scheduler at $(date -u +%Y-%m-%dT%H:%M:%SZ). Work in progress."
      ```
   d. Verify the draft PR was created successfully before proceeding to Step 2.

4. **Race condition check:** After creating the draft PR, re-check:
   ```
   gh pr list --state open --search "<agent-name>"
   ```
   If you see another PR for this agent that was created *before* yours (by a different agent instance), close your PR with `gh pr close <your-pr-number>` and skip to the next agent.

**Important:** The draft PR is your lock. Do not skip this step. It prevents other agents on different platforms from picking up the same task.

---

## Step 2 — Execute the Task

1. Read the selected agent's prompt file from `/docs/agents/prompts/daily/<filename>`.
2. Adopt that prompt as your operating instructions for this session.
3. Follow the agent prompt's workflow end-to-end, including:
   - Updating the persistent state files (`CONTEXT.md`, `TODO.md`, `DECISIONS.md`, `TEST_LOG.md`) per AGENTS.md Section 15.
   - Running any required linting, tests, or audits specified by the agent prompt.
   - Creating artifacts, reports, or PRs as the agent prompt directs.

---

## Step 3 — Update the Task Log

After completing the task (or if the task fails), append a new row to `/docs/agents/AGENT_TASK_LOG.csv`.

### CSV Format

```
date,agent_name,prompt_file,status,branch,summary
```

| Column | Format | Description |
|--------|--------|-------------|
| `date` | `YYYY-MM-DD` | Date the task was executed |
| `agent_name` | string | Agent name from the roster (e.g., `audit-agent`) |
| `prompt_file` | string | Filename executed (e.g., `bitvid-audit-agent.md`) |
| `status` | `completed` or `failed` | Whether the task finished successfully |
| `branch` | string | Git branch where work was committed (e.g., `unstable`) |
| `summary` | quoted string | One-line summary of what was done or why it failed |

### Rules for the Log

- **Always append** — never delete or modify existing rows.
- **One row per run** — each scheduler invocation adds exactly one row.
- **Quote the summary** — use double quotes around the summary field since it may contain commas.
- **Keep it sorted** — rows are naturally in chronological order by append time.

---

## Step 4 — Verify and Submit

1. **Verify the log**: Re-read `/docs/agents/AGENT_TASK_LOG.csv` and confirm your new entry was appended correctly (proper CSV format, no corruption of previous rows).
2. **Run a final check**: Execute `npm run lint` to confirm no lint regressions were introduced.
3. **Commit your changes** with a descriptive message following this pattern:
   ```
   chore(agents): run <agent-name> daily task — <brief summary>
   ```
4. **Push** to the appropriate branch.

---

## Error Handling

- If the agent prompt file is **empty or missing**, skip it, log the run as `failed` with summary `"Prompt file empty or missing"`, and proceed to the **next agent** in the roster.
- If a task **fails mid-execution** (test failures, build errors), log the run as `failed` with a summary describing the failure. Still commit the log update and any partial artifacts.
- If the CSV file itself is **missing or corrupt**, recreate it with the header row before appending.
