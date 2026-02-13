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

MUST 2: Run BOTH preflight commands to build the exclusion set:

a) Nostr lock check (primary):
node scripts/agent/nostr-lock.mjs check --cadence daily

b) GitHub PR check (supplemental):
curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/daily/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'

Exclusion set = union of Nostr locked agents + agents with open PRs.

MUST 3: Run the exact command list in this order:
1) cat AGENTS.md CLAUDE.md
2) ls -1 docs/agents/task-logs/daily/ | sort | tail -n 1
3) [claim] Use the Nostr lock (preferred, no tokens needed):
   AGENT_PLATFORM=jules node scripts/agent/nostr-lock.mjs lock --agent <agent-name> --cadence daily
   Exit 0 = lock acquired. Exit 3 = race lost, go back to step 2.
   IF Nostr relays are unreachable, try git push fallback.
   IF git push also fails, try:
   bash scripts/agent/claim-task-api.sh --agent <agent-name> --cadence daily --base unstable
   IF all methods fail, write `_failed.md` and stop.
4) execute selected prompt from docs/agents/prompts/daily/
5) npm run lint
6) create `_completed.md` or `_failed.md`, commit, push (or API update)

MUST 4: Race rule: the Nostr lock script handles race detection automatically (exit code 3 = lost). For git push/API fallbacks: rerun GitHub PR preflight after claiming. Earlier `created_at` wins; if tied, lower PR number wins. Print exactly one line: `RACE CHECK: won` or `RACE CHECK: lost`.

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

MUST 2: Run BOTH preflight commands to build the exclusion set:

a) Nostr lock check (primary):
node scripts/agent/nostr-lock.mjs check --cadence weekly

b) GitHub PR check (supplemental):
curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/weekly/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'

Exclusion set = union of Nostr locked agents + agents with open PRs.

MUST 3: Run the exact command list in this order:
1) cat AGENTS.md CLAUDE.md
2) ls -1 docs/agents/task-logs/weekly/ | sort | tail -n 1
3) [claim] Use the Nostr lock (preferred, no tokens needed):
   AGENT_PLATFORM=jules node scripts/agent/nostr-lock.mjs lock --agent <agent-name> --cadence weekly
   Exit 0 = lock acquired. Exit 3 = race lost, go back to step 2.
   IF Nostr relays are unreachable, try git push fallback.
   IF git push also fails, try:
   bash scripts/agent/claim-task-api.sh --agent <agent-name> --cadence weekly --base unstable
   IF all methods fail, write `_failed.md` and stop.
4) execute selected prompt from docs/agents/prompts/weekly/
5) npm run lint
6) create `_completed.md` or `_failed.md`, commit, push (or API update)

MUST 4: Race rule: the Nostr lock script handles race detection automatically (exit code 3 = lost). For git push/API fallbacks: rerun GitHub PR preflight after claiming. Earlier `created_at` wins; if tied, lower PR number wins. Print exactly one line: `RACE CHECK: won` or `RACE CHECK: lost`.

MUST 5: If all weekly agents are excluded, stop and write `_failed.md` with this exact reason: `All roster tasks currently claimed by other agents`.
```
