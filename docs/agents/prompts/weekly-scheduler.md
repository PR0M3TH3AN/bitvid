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

## Task Log Format

Task logs use a **directory-based format** where each log entry is a separate file. This prevents git merge conflicts when multiple agents run concurrently.

### Directory

```
docs/agents/task-logs/weekly/
```

### File Naming Convention

```
YYYY-MM-DD_HH-MM-SS_<agent-name>_<status>.md
```

Examples:
- `2026-02-13_14-30-00_changelog-agent_started.md`
- `2026-02-13_15-45-22_changelog-agent_completed.md`

### File Content Template

Each log file contains:

```markdown
# Agent Task Log Entry

- **Date:** YYYY-MM-DD
- **Agent:** <agent-name>
- **Prompt:** <prompt-file>
- **Status:** started | completed | failed
- **Branch:** <branch-name>
- **Summary:** <one-line summary>
```

### Reading the Log

To find the most recent entry:
```bash
ls docs/agents/task-logs/weekly/ | sort | tail -n 1
```

To find all entries for a specific agent:
```bash
ls docs/agents/task-logs/weekly/ | grep "<agent-name>"
```

---

## PRE-FLIGHT GATE — Run These Commands NOW

> **This gate is NOT optional. You MUST run both commands below and paste their raw output before doing anything else. If you skip this, you will duplicate another agent's work and waste the entire run. This has happened repeatedly.**

If you arrived here from the meta prompt and already ran these commands and pasted the output, you may skip ahead to Step 1. Otherwise:

### COMMAND 1 — Check for open weekly agent PRs

Run this command:
```bash
curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, titles: [.[].title]}'
```

**Paste the complete raw output.** If the command returns nothing or errors, write: `OUTPUT: (empty — no results)`

Review the titles in the output. Every agent name that appears in a PR title containing `[weekly]` is **OFF LIMITS** — do not select it.

### COMMAND 2 — Check the task log for incomplete runs

Run this command:
```bash
ls docs/agents/task-logs/weekly/ | sort
```

**Paste the complete raw output.**

Look for any `_started.md` files that do NOT have a corresponding `_completed.md` or `_failed.md` file from the same agent at a later timestamp. Those agents are **OFF LIMITS** (unless the started file is more than 24 hours old — check the date in the filename).

### Build your exclusion list

Combine results from Commands 1 and 2:
- Agents with open/draft PRs → EXCLUDED
- Agents with `started` status less than 24 hours old (no matching `completed`/`failed`) → EXCLUDED

Write your exclusion list explicitly:
```
EXCLUDED AGENTS: agent-a, agent-b
```
or:
```
EXCLUDED AGENTS: (none)
```

**If Command 1 failed** (network error, API rate limit, `curl`/`jq` unavailable): you MUST still check the task log directory (Command 2). Log a warning in your summary that PR-based claim checking was unavailable.

**Do not proceed to Step 1 until you have pasted command outputs and written your exclusion list.**

---

## Step 1 — Determine the Next Task

1. List the task log directory: `ls docs/agents/task-logs/weekly/ | sort`
2. Find the **most recent entry** (last file alphabetically — filenames sort chronologically).
3. Identify the `agent-name` from the filename (the third segment, between the second `_` and the status).
4. Look up that agent in the alphabetical roster below and select the **next agent** in the list.
5. If the most recent agent is the **last** in the roster, wrap around to the **first**.
6. If the directory is empty, start with the **first** agent in the roster.
7. **CHECK YOUR EXCLUSION LIST.** If the selected agent is on the exclusion list, skip to the next agent in the roster. Repeat until you find an agent that is NOT excluded. If you cycle through the entire roster and ALL agents are excluded, log as `failed` with summary `"All roster tasks currently claimed by other agents"` and stop.

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

## Step 2 — Claim the Task (Prevent Duplicate Work)

> **This step is MANDATORY. Do not proceed to execution without completing it.**

You must create a visible claim before doing any work. This claim is a **distributed lock** that prevents agents on other platforms (Claude Code, Codex, Jules) from picking up the same task.

### 2a. Create your working branch and push a claim

1. Create your working branch.
2. Make a minimal initial commit (e.g., create a new `context/CONTEXT_<timestamp>.md` with the task scope).
3. Push the branch immediately to make it visible to other agents.

### 2b. Race condition check

After pushing, re-check for competing claims:
```bash
curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, titles: [.[].title]}'
```
If you see another PR for this agent that was created *before* yours, abandon your branch and go back to Step 1 to select the next agent.

### 2c. Log "started" in the task log immediately

> **Create a `started` log file NOW, before executing the task. This ensures the rotation advances even if you crash during execution.**

Create a new file in `docs/agents/task-logs/weekly/` with this naming pattern:

```
YYYY-MM-DD_HH-MM-SS_<agent-name>_started.md
```

Use the current UTC timestamp. The file content should be:

```markdown
# Agent Task Log Entry

- **Date:** <YYYY-MM-DD>
- **Agent:** <agent-name>
- **Prompt:** <prompt-file>
- **Status:** started
- **Branch:** <branch-name>
- **Summary:** Task claimed — execution beginning
```

Commit and push this log file to your branch. This `started` entry serves as a secondary lock: other scheduler instances will see it and skip this agent.

**The `started` log file is your primary claim mechanism.** Push it immediately so other agents can see it.

---

## Step 3 — Execute the Task

1. Read the selected agent's prompt file from `docs/agents/prompts/weekly/<filename>`.
2. Adopt that prompt as your operating instructions for this session.
3. Follow the agent prompt's workflow end-to-end, including:
   - Updating the persistent state files (in `context/`, `todo/`, `decisions/`, `test_logs/`) per AGENTS.md Section 15.
   - Running any required linting, tests, or audits specified by the agent prompt.
   - Creating artifacts, reports, or PRs as the agent prompt directs.

---

## Step 4 — Update the Task Log (Final Status)

After completing the task (or if the task fails), create a **new** log file with the final status. Do NOT modify the `started` file.

Create a new file in `docs/agents/task-logs/weekly/`:

For completed tasks:
```
YYYY-MM-DD_HH-MM-SS_<agent-name>_completed.md
```

For failed tasks:
```
YYYY-MM-DD_HH-MM-SS_<agent-name>_failed.md
```

Use the current UTC timestamp (which will be later than the `started` file). The file content should be:

```markdown
# Agent Task Log Entry

- **Date:** <YYYY-MM-DD>
- **Agent:** <agent-name>
- **Prompt:** <prompt-file>
- **Status:** completed (or failed)
- **Branch:** <branch-name>
- **Summary:** <one-line summary of what was done or why it failed>
```

### Rules for the Log

- **Never modify existing files** — always create new files. This eliminates merge conflicts.
- **One `started` + one final file per run** — each scheduler invocation creates exactly two files (started, then completed/failed).
- **Use UTC timestamps** — ensures consistent chronological sorting across time zones.
- **Files sort chronologically** — the filename format ensures `ls | sort` produces a timeline.

**Important:** Weekly agents use their own log directory (`docs/agents/task-logs/weekly/`), separate from the daily log (`docs/agents/task-logs/daily/`). This keeps weekly and daily rotations independent and avoids one cadence interfering with the other's position tracking.

---

## Step 5 — Verify and Submit

1. **Verify the log**: List `docs/agents/task-logs/weekly/` and confirm your entries were created correctly (proper filename format, valid content).
2. **Run a final check**: Execute `npm run lint` to confirm no lint regressions were introduced.
3. **Commit your changes** with a descriptive message following this pattern:
   ```
   chore(agents): run <agent-name> weekly task — <brief summary>
   ```
4. **Push** to the appropriate branch.

---

## Error Handling

- If the agent prompt file is **empty or missing**, skip it, log the run as `failed` with summary `"Prompt file empty or missing"`, and proceed to the **next agent** in the roster.
- If a task **fails mid-execution** (test failures, build errors), log the run as `failed` with a summary describing the failure. Still commit the log file and any partial artifacts.
- If the task log directory is **missing**, create it: `mkdir -p docs/agents/task-logs/weekly/`.
- If `curl` or `jq` is **unavailable or errors**, fall back to log-file-only claiming (the `started` file). Log a warning in your summary that PR-based claim checking was degraded.

---

## Quick Reference: What Prevents Duplicate Work

| Layer | Mechanism | Catches |
|-------|-----------|---------|
| **Pre-flight gate** | Scan ALL open `[weekly]` PRs via `curl` | Agents claimed by any platform |
| **Pre-flight gate** | Check task log dir for `started` files | Agents in progress (even without PR) |
| **Step 2a** | Push branch with claim commit | Cross-platform visibility |
| **Step 2b** | Race condition re-check | Simultaneous claims |
| **Step 2c** | Create `started` log file immediately | Crash recovery — rotation advances |

All five layers must be executed. No single layer is sufficient on its own.

**Why directories instead of CSV?** Each agent creates its own uniquely-named file, so concurrent agents never touch the same file. This eliminates the git merge conflicts and race conditions that occurred when multiple agents appended to a shared CSV.
