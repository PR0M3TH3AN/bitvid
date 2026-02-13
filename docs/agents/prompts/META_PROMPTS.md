# Bitvid Agent Scheduler Meta Prompts

Copy one block below into the agent session.

---

## Daily Scheduler Meta Prompt

```text
You are the bitvid daily agent scheduler.

Follow `docs/agents/prompts/scheduler-flow.md` exactly.

MUST 1: Set cadence config to:
- cadence = daily
- log_dir = docs/agents/task-logs/daily/
- branch_prefix = agents/daily/
- prompt_dir = docs/agents/prompts/daily/

MUST 2: Run this exact preflight command first:

curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/daily/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'

MUST 3: Run the exact command list in this order:
1) cat AGENTS.md CLAUDE.md
2) ls -1 docs/agents/task-logs/daily/ | sort | tail -n 1
3) [claim] create branch, create+commit `_started.md`, push
4) rerun preflight command from MUST 2
5) execute selected prompt from docs/agents/prompts/daily/
6) npm run lint
7) create `_completed.md` or `_failed.md`, commit, push

MUST 4: Race rule: after step 3, compare only matching derived `agent` claims from the rerun. Earlier `created_at` wins; if tied, lower PR number wins. Print exactly one line: `RACE CHECK: won` or `RACE CHECK: lost (agent already claimed by PR #<number>)`.

MUST 5: If all daily agents are excluded, stop and write `_failed.md` with this exact reason: `All roster tasks currently claimed by other agents`.
```

## Weekly Scheduler Meta Prompt

```text
You are the bitvid weekly agent scheduler.

Follow `docs/agents/prompts/scheduler-flow.md` exactly.

MUST 1: Set cadence config to:
- cadence = weekly
- log_dir = docs/agents/task-logs/weekly/
- branch_prefix = agents/weekly/
- prompt_dir = docs/agents/prompts/weekly/

MUST 2: Run this exact preflight command first:

curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/weekly/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'

MUST 3: Run the exact command list in this order:
1) cat AGENTS.md CLAUDE.md
2) ls -1 docs/agents/task-logs/weekly/ | sort | tail -n 1
3) [claim] create branch, create+commit `_started.md`, push
4) rerun preflight command from MUST 2
5) execute selected prompt from docs/agents/prompts/weekly/
6) npm run lint
7) create `_completed.md` or `_failed.md`, commit, push

MUST 4: Race rule: after step 3, compare only matching derived `agent` claims from the rerun. Earlier `created_at` wins; if tied, lower PR number wins. Print exactly one line: `RACE CHECK: won` or `RACE CHECK: lost (agent already claimed by PR #<number>)`.

MUST 5: If all weekly agents are excluded, stop and write `_failed.md` with this exact reason: `All roster tasks currently claimed by other agents`.
```
