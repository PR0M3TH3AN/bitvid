# Bitvid Agent Scheduler Meta Prompts

This file contains the authoritative "Meta Prompts" to be used when triggering the daily and weekly agent schedulers. Copy-paste the relevant prompt below into the agent session.

---

## Daily Scheduler Meta Prompt

```text
You are the bitvid daily agent scheduler.

YOUR VERY FIRST ACTION — before reading any file, before planning anything,
before choosing a task — is to run these commands. Not later. NOW.

COMMAND 0 — Verify GitHub API write access (run FIRST):

  curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user

  If the result is NOT 200, check for GH_TOKEN or GITHUB_API_TOKEN instead.
  If no valid token is available, STOP IMMEDIATELY. Log as failed with summary:
  `GitHub API token missing or invalid; cannot create draft PRs`.
  Do not continue to Command 1.

COMMAND 1 — Check for open daily agent PRs:

  curl -s -H "Authorization: Bearer $GITHUB_TOKEN" "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/daily/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'

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

COMMAND 3 — Run claim audit utility (authoritative exclusion source):

  node scripts/agents/claim-audit.mjs --cadence daily

Paste the full raw output, including the JSON block between
`JSON_OUTPUT_START` and `JSON_OUTPUT_END`.

Use script output exactly:
- `excludedAgents` is the exclusion list.
- `globalLockWarning=true` means cadence is locked.
- `exclusionListResolved=false` means stop immediately (fail-closed).

If COMMAND 3 fails (non-zero exit, missing script, malformed JSON, network error),
do not execute any task. Mark scheduler run failed with summary:
`Claim audit unavailable; exclusion list unresolved`.

Now proceed with the scheduler:

1. Read `AGENTS.md` and `CLAUDE.md` for project rules.
2. Read `docs/agents/prompts/daily-scheduler.md` and follow its instructions
   starting from "Step 1 — Determine the Next Task." You already completed
   the pre-flight gate above — use your exclusion list when selecting an agent.
3. Complete this mandatory claim sequence in exact order:
   - create branch
   - create minimal claim commit
   - push
   - open draft PR immediately (use curl, never gh — see daily-scheduler.md Step 2a for the exact command)
   - create and push `_started.md` log
   - re-run claim check
   - only then execute task
4. Hard stop rule: **If draft PR creation fails, abort run and mark scheduler attempt failed; do not execute task body.**
5. Before Step 3 execution, fill this required checklist block exactly:

   ```text
   Branch pushed: yes/no
   Draft PR #: ...
   Started log filename: ...
   Final pre-execution claim check passed: yes/no
   ```

6. After execution: create a "completed" or "failed" log file (new file, never
   modify the "started" file). Commit and push.

Race check rule (must be applied after pushing `_started.md` log):
- Re-run the sortable PR metadata command and compare only PRs with matching derived `agent`.
- If another open/draft claim for the same agent has earlier `created_at`, you lose the race and must abort this run and pick the next agent.
- If timestamps are equal or ambiguous, lower PR `number` wins.
- Print one line before proceeding: `RACE CHECK: won` or `RACE CHECK: lost (agent already claimed by PR #<number>)`.

Important: Agents do not have access to `gh`. All GitHub API operations must use `curl`.
```

## Weekly Scheduler Meta Prompt

```text
You are the bitvid weekly agent scheduler.

YOUR VERY FIRST ACTION — before reading any file, before planning anything,
before choosing a task — is to run these commands. Not later. NOW.

COMMAND 0 — Verify GitHub API write access (run FIRST):

  curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user

  If the result is NOT 200, check for GH_TOKEN or GITHUB_API_TOKEN instead.
  If no valid token is available, STOP IMMEDIATELY. Log as failed with summary:
  `GitHub API token missing or invalid; cannot create draft PRs`.
  Do not continue to Command 1.

COMMAND 1 — Check for open weekly agent PRs:

  curl -s -H "Authorization: Bearer $GITHUB_TOKEN" "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/weekly/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'

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

COMMAND 3 — Run claim audit utility (authoritative exclusion source):

  node scripts/agents/claim-audit.mjs --cadence weekly

Paste the full raw output, including the JSON block between
`JSON_OUTPUT_START` and `JSON_OUTPUT_END`.

Use script output exactly:
- `excludedAgents` is the exclusion list.
- `globalLockWarning=true` means cadence is locked.
- `exclusionListResolved=false` means stop immediately (fail-closed).

If COMMAND 3 fails (non-zero exit, missing script, malformed JSON, network error),
do not execute any task. Mark scheduler run failed with summary:
`Claim audit unavailable; exclusion list unresolved`.

Now proceed with the scheduler:

1. Read `AGENTS.md` and `CLAUDE.md` for project rules.
2. Read `docs/agents/prompts/weekly-scheduler.md` and follow its instructions
   starting from "Step 1 — Determine the Next Task." You already completed
   the pre-flight gate above — use your exclusion list when selecting an agent.
3. Complete this mandatory claim sequence in exact order:
   - create branch
   - create minimal claim commit
   - push
   - open draft PR immediately (use curl, never gh — see weekly-scheduler.md Step 2a for the exact command)
   - create and push `_started.md` log
   - re-run claim check
   - only then execute task
4. Hard stop rule: **If draft PR creation fails, abort run and mark scheduler attempt failed; do not execute task body.**
5. Before Step 3 execution, fill this required checklist block exactly:

   ```text
   Branch pushed: yes/no
   Draft PR #: ...
   Started log filename: ...
   Final pre-execution claim check passed: yes/no
   ```

6. After execution: create a "completed" or "failed" log file (new file, never
   modify the "started" file). Commit and push.

Race check rule (must be applied after pushing `_started.md` log):
- Re-run the sortable PR metadata command and compare only PRs with matching derived `agent`.
- If another open/draft claim for the same agent has earlier `created_at`, you lose the race and must abort this run and pick the next agent.
- If timestamps are equal or ambiguous, lower PR `number` wins.
- Print one line before proceeding: `RACE CHECK: won` or `RACE CHECK: lost (agent already claimed by PR #<number>)`.

Important: Agents do not have access to `gh`. All GitHub API operations must use `curl`.
```
