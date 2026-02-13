# Scheduler Flow (Single Source of Truth)

Use this document for **all scheduler runs**. Do not redefine preflight or claim logic in other scheduler prompts.

## Required Steps (Strict Order)

1. **Load policy files first**
   - Read `AGENTS.md` and `CLAUDE.md`.

2. **Set cadence config**
   - `cadence`: `daily` or `weekly`
   - `log_dir`: `docs/agents/task-logs/<cadence>/`
   - `branch_prefix`: `agents/<cadence>/`
   - `prompt_dir`: `docs/agents/prompts/<cadence>/`

3. **Run preflight claim audit (required, fail-closed)**
   - `curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/<cadence>/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'`
   - `ls <log_dir> | sort`
   - `node scripts/agents/claim-audit.mjs --cadence <cadence>`
   - Use `excludedAgents` from claim-audit output as the only exclusion list.
   - If claim-audit fails, `globalLockWarning=true`, or `exclusionListResolved=false`, stop and log `failed`.

4. **Select next agent from cadence roster**
   - Read latest file in `<log_dir>` (alphabetical sort).
   - Advance to next agent in that cadence's roster.
   - Skip excluded agents.
   - If all are excluded, log `failed` with `All roster tasks currently claimed by other agents` and stop.

5. **Claim task before execution (required sequence)**
   1. Create branch.
   2. Create minimal claim commit.
   3. Push branch.
   4. Attempt draft PR.
   5. Create and push `<timestamp>_<agent>_started.md` in `<log_dir>`.
   6. Re-run open PR check.
   7. Race decision:
      - If earlier matching PR exists: `RACE CHECK: lost (agent already claimed by PR #<number>)`, abandon branch, go back to Step 4.
      - Otherwise: `RACE CHECK: won`, continue.

6. **Execute selected agent prompt**
   - Open `<prompt_dir>/<prompt-file>`.
   - Run required workflow end-to-end.

7. **Write final status log**
   - Create `<timestamp>_<agent>_completed.md` or `_failed.md` in `<log_dir>`.
   - Never edit existing log files.

8. **Validate and submit**
   - Verify log files exist and are correctly named.
   - Run required checks (default: `npm run lint`).
   - Commit and push changes.

## Reference (Optional / Explanatory)

- File format for each log entry:
  - `YYYY-MM-DD_HH-MM-SS_<agent-name>_<status>.md`
  - Include: Date, Agent, Prompt, Status, Branch, Summary.
- Draft PR creation is recommended for visibility; if unavailable, branch + started log still act as lock.
- `started` + final status files provide crash recovery and clean chronological rotation.
- Directory-based logs avoid CSV merge conflicts during concurrent scheduler runs.
