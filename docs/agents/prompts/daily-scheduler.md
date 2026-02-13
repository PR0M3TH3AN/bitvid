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

## Task Log Format

Task logs use a **directory-based format** where each log entry is a separate file. This prevents git merge conflicts when multiple agents run concurrently.

### Directory

```
docs/agents/task-logs/daily/
```

### File Naming Convention

```
YYYY-MM-DD_HH-MM-SS_<agent-name>_<status>.md
```

Examples:
- `2026-02-13_14-30-00_docs-agent_started.md`
- `2026-02-13_15-45-22_docs-agent_completed.md`

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
ls docs/agents/task-logs/daily/ | sort | tail -n 1
```

To find all entries for a specific agent:
```bash
ls docs/agents/task-logs/daily/ | grep "<agent-name>"
```

---

## PRE-FLIGHT GATE — Run These Commands NOW

> **This gate is NOT optional. You MUST run both commands below and paste their raw output before doing anything else. If you skip this, you will duplicate another agent's work and waste the entire run. This has happened repeatedly.**

If you arrived here from the meta prompt and already ran these commands and pasted the output, you may skip ahead to Step 1. Otherwise:

### COMMAND 1 — Check for open daily agent PRs

Run this command:
```bash
curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/daily/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'
```

**Paste the complete raw output.** If the command returns nothing or errors, write: `OUTPUT: (empty — no results)`

Normalize each PR to an agent name using this deterministic rule:
1. **Preferred:** parse the branch name from `head.ref` with the convention `agents/daily/<agent-name>/...`.
2. **Fallback:** only if branch parsing fails, parse `<agent-name>` from the PR title.
3. If an agent cannot be derived from PR metadata, treat that PR as a **global lock warning** and do not schedule any daily agent until manually resolved.

Examples of valid daily claim branch names (all parseable):
- `agents/daily/docs-agent/2026-02-13-claim`
- `agents/daily/test-audit-agent/run-2026-02-13`
- `agents/daily/prompt-curator-agent/task-rotation-fix`

**OFF LIMITS rule:** any PR that maps to an agent in the **daily cadence** is excluded, regardless of title tag format.

### COMMAND 2 — Check the task log for incomplete runs

Run this command:
```bash
ls docs/agents/task-logs/daily/ | sort
```

**Paste the complete raw output.**

Look for any `_started.md` files that do NOT have a corresponding `_completed.md` or `_failed.md` file from the same agent at a later timestamp. Those agents are **OFF LIMITS** (unless the started file is more than 24 hours old — check the date in the filename).

### Build your exclusion list

Combine results from Commands 1 and 2:
- Agents with open/draft PRs → EXCLUDED
- PRs whose agent cannot be derived from metadata → GLOBAL LOCK (stop scheduling this cadence)
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

1. List the task log directory: `ls docs/agents/task-logs/daily/ | sort`
2. Find the **most recent entry** (last file alphabetically — filenames sort chronologically).
3. Identify the `agent-name` from the filename (the third segment, between the second `_` and the status).
4. Look up that agent in the alphabetical roster below and select the **next agent** in the list.
5. If the most recent agent is the **last** in the roster, wrap around to the **first**.
6. If the directory is empty, start with the **first** agent in the roster.
7. **CHECK YOUR EXCLUSION LIST.** If the selected agent is on the exclusion list, skip to the next agent in the roster. Repeat until you find an agent that is NOT excluded. If you cycle through the entire roster and ALL agents are excluded, log as `failed` with summary `"All roster tasks currently claimed by other agents"` and stop.

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
curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/daily/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'
```
Decision logic (must be explicit):
1. Compare only open/draft PRs whose derived `agent` matches the agent you just claimed.
2. If another matching PR has an earlier `created_at`, abort this run and pick the next agent.
3. If `created_at` values are equal or ambiguous, use the lower `number` as the tie-breaker (lower number wins).

Before proceeding, print exactly one race verdict line:
- `RACE CHECK: won`
- `RACE CHECK: lost (agent already claimed by PR #<number>)`

If the verdict is lost, abandon your branch and go back to Step 1 to select the next agent.

### 2c. Log "started" in the task log immediately

> **Create a `started` log file NOW, before executing the task. This ensures the rotation advances even if you crash during execution.**

Create a new file in `docs/agents/task-logs/daily/` with this naming pattern:

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

1. Read the selected agent's prompt file from `docs/agents/prompts/daily/<filename>`.
2. Adopt that prompt as your operating instructions for this session.
3. Follow the agent prompt's workflow end-to-end, including:
   - Updating the persistent state files (in `context/`, `todo/`, `decisions/`, `test_logs/`) per AGENTS.md Section 15.
   - Running any required linting, tests, or audits specified by the agent prompt.
   - Creating artifacts, reports, or PRs as the agent prompt directs.

---

## Step 4 — Update the Task Log (Final Status)

After completing the task (or if the task fails), create a **new** log file with the final status. Do NOT modify the `started` file.

Create a new file in `docs/agents/task-logs/daily/`:

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

---

## Step 5 — Verify and Submit

1. **Verify the log**: List `docs/agents/task-logs/daily/` and confirm your entries were created correctly (proper filename format, valid content).
2. **Run a final check**: Execute `npm run lint` to confirm no lint regressions were introduced.
3. **Commit your changes** with a descriptive message following this pattern:
   ```
   chore(agents): run <agent-name> daily task — <brief summary>
   ```
4. **Push** to the appropriate branch.

---

## Error Handling

- If the agent prompt file is **empty or missing**, skip it, log the run as `failed` with summary `"Prompt file empty or missing"`, and proceed to the **next agent** in the roster.
- If a task **fails mid-execution** (test failures, build errors), log the run as `failed` with a summary describing the failure. Still commit the log file and any partial artifacts.
- If the task log directory is **missing**, create it: `mkdir -p docs/agents/task-logs/daily/`.
- If `curl` or `jq` is **unavailable or errors**, fall back to log-file-only claiming (the `started` file). Log a warning in your summary that PR-based claim checking was degraded.

---

## Quick Reference: What Prevents Duplicate Work

| Layer | Mechanism | Catches |
|-------|-----------|---------|
| **Pre-flight gate** | Scan ALL open PR metadata via `curl` + deterministic agent mapping | Agents claimed by any platform |
| **Pre-flight gate** | Check task log dir for `started` files | Agents in progress (even without PR) |
| **Step 2a** | Push branch with claim commit | Cross-platform visibility |
| **Step 2b** | Race condition re-check | Simultaneous claims |
| **Step 2c** | Create `started` log file immediately | Crash recovery — rotation advances |

All five layers must be executed. No single layer is sufficient on its own.

**Why directories instead of CSV?** Each agent creates its own uniquely-named file, so concurrent agents never touch the same file. This eliminates the git merge conflicts and race conditions that occurred when multiple agents appended to a shared CSV.
