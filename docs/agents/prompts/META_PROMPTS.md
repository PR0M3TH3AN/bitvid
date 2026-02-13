# Bitvid Agent Scheduler Meta Prompts

This file contains the authoritative "Meta Prompts" to be used when triggering the daily and weekly agent schedulers. Copy-paste the relevant prompt below into the agent session.

---

## Daily Scheduler Meta Prompt

```text
You are the bitvid daily agent scheduler.

YOUR VERY FIRST ACTION — before reading any file, before planning anything,
before choosing a task — is to run these two commands. Not later. NOW.

COMMAND 1 — Check for open daily agent PRs:

  curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, title, draft, created_at, head: {ref: .head.ref}, labels: [.labels[].name]}]}'

  Normalize each PR to an agent name using this deterministic rule:
  1) Preferred: parse `head.ref` as `agents/daily/<agent-name>/...`
  2) Fallback: parse agent name from title only if branch parsing fails
  3) If agent cannot be derived from metadata, treat as GLOBAL LOCK warning and do not schedule daily tasks until manually resolved

  OFF LIMITS rule: any PR that maps to a daily-cadence agent is excluded, regardless of title tag format.

  Valid daily claim branch examples:
  - agents/daily/docs-agent/2026-02-13-claim
  - agents/daily/test-audit-agent/run-2026-02-13

COMMAND 2 — Check for in-progress task logs:

  ls docs/agents/task-logs/daily/ | sort

Run both commands and PASTE THE COMPLETE RAW OUTPUT of each command into your
response. Do not summarize. Do not paraphrase. Paste the actual terminal output.
If a command returns nothing, write: "OUTPUT: (empty — no results)"

STOP HERE. Do not proceed until both outputs are pasted.

---

Now analyze the output:
- Any PR that maps to a daily-cadence agent is EXCLUDED (branch parsing first, title fallback second).
- If any PR agent cannot be derived from metadata, treat as GLOBAL LOCK warning and do not schedule this cadence.
- Any agent with a "_started.md" log file that has no matching "_completed.md"
  or "_failed.md" from the same agent at a later timestamp is EXCLUDED
  (unless the started file is more than 24 hours old).
- Write your exclusion list. Format: "EXCLUDED AGENTS: agent-a, agent-b"
  or "EXCLUDED AGENTS: (none)"

---

Now proceed with the scheduler:

1. Read `AGENTS.md` and `CLAUDE.md` for project rules.
2. Read `docs/agents/prompts/daily-scheduler.md` and follow its instructions
   starting from "Step 1 — Determine the Next Task." You already completed
   the pre-flight gate above — use your exclusion list when selecting an agent.
3. Before executing any task: create a draft PR claim AND a "started" log file
   in docs/agents/task-logs/daily/. Both MUST exist before task execution begins.
4. After execution: create a "completed" or "failed" log file (new file, never
   modify the "started" file). Commit and push.
```

## Weekly Scheduler Meta Prompt

```text
You are the bitvid weekly agent scheduler.

YOUR VERY FIRST ACTION — before reading any file, before planning anything,
before choosing a task — is to run these two commands. Not later. NOW.

COMMAND 1 — Check for open weekly agent PRs:

  curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, title, draft, created_at, head: {ref: .head.ref}, labels: [.labels[].name]}]}'

  Normalize each PR to an agent name using this deterministic rule:
  1) Preferred: parse `head.ref` as `agents/weekly/<agent-name>/...`
  2) Fallback: parse agent name from title only if branch parsing fails
  3) If agent cannot be derived from metadata, treat as GLOBAL LOCK warning and do not schedule weekly tasks until manually resolved

  OFF LIMITS rule: any PR that maps to a weekly-cadence agent is excluded, regardless of title tag format.

  Valid weekly claim branch examples:
  - agents/weekly/ci-health-agent/2026-02-weekly-run
  - agents/weekly/weekly-synthesis-agent/sprint-07

COMMAND 2 — Check for in-progress task logs:

  ls docs/agents/task-logs/weekly/ | sort

Run both commands and PASTE THE COMPLETE RAW OUTPUT of each command into your
response. Do not summarize. Do not paraphrase. Paste the actual terminal output.
If a command returns nothing, write: "OUTPUT: (empty — no results)"

STOP HERE. Do not proceed until both outputs are pasted.

---

Now analyze the output:
- Any PR that maps to a weekly-cadence agent is EXCLUDED (branch parsing first, title fallback second).
- If any PR agent cannot be derived from metadata, treat as GLOBAL LOCK warning and do not schedule this cadence.
- Any agent with a "_started.md" log file that has no matching "_completed.md"
  or "_failed.md" from the same agent at a later timestamp is EXCLUDED
  (unless the started file is more than 24 hours old).
- Write your exclusion list. Format: "EXCLUDED AGENTS: agent-a, agent-b"
  or "EXCLUDED AGENTS: (none)"

---

Now proceed with the scheduler:

1. Read `AGENTS.md` and `CLAUDE.md` for project rules.
2. Read `docs/agents/prompts/weekly-scheduler.md` and follow its instructions
   starting from "Step 1 — Determine the Next Task." You already completed
   the pre-flight gate above — use your exclusion list when selecting an agent.
3. Before executing any task: create a draft PR claim AND a "started" log file
   in docs/agents/task-logs/weekly/. Both MUST exist before task execution begins.
4. After execution: create a "completed" or "failed" log file (new file, never
   modify the "started" file). Commit and push.
```
