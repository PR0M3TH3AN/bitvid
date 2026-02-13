# Scheduler Flow (Single Source of Truth)

Use this document for **all scheduler runs**.

## Scheduler Override (Top-Line Rule)

During scheduler execution, the scheduler-specific instructions in this document and the cadence prompt (`daily-scheduler.md` or `weekly-scheduler.md`) **supersede generic AGENTS workflow details** when they conflict.

### Global rules that still apply

- Follow core safety and policy constraints (no harmful behavior, no secret exfiltration, no policy violations).
- Do not perform destructive or irreversible actions unless explicitly required by the scheduler task definition.
- Keep repository integrity checks (e.g., required lint/test commands in the scheduler flow) and leave an auditable log trail.
- Respect non-interactive execution constraints and do not pause for manual approvals.

### Generic AGENTS workflow details intentionally ignored for scheduler runs

- The normal "one subsystem per PR" restriction, because scheduler operations are orchestration/meta-work that may touch scheduler logs, prompts, and coordination docs together.
- The standard task-claim sequence described for general agents when it conflicts with the stricter, numbered MUST sequence below.
- Generic start-of-task bookkeeping patterns not referenced by scheduler prompts (for example, creating extra context/todo artifacts) when they would add noise to automated scheduler runs.

## Numbered MUST Procedure

1. **MUST** set cadence variables before any command:
   - `cadence` = `daily` or `weekly`
   - `log_dir` = `docs/agents/task-logs/<cadence>/`
   - `branch_prefix` = `agents/<cadence>/`
   - `prompt_dir` = `docs/agents/prompts/<cadence>/`

2. **MUST** run this command first and save the JSON output as the preflight exclusion set:

   ```bash
   curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/<cadence>/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'
   ```

3. **MUST** derive excluded agents from command output using this order only:
   1) parse `head.ref` as `agents/<cadence>/<agent-name>/...`; 2) fallback to title regex; 3) if still unknown, stop with a global lock message.

4. **MUST** run this command and read both policy files before selecting an agent:

   ```bash
   cat AGENTS.md CLAUDE.md
   ```

5. **MUST** run this command to identify the latest cadence log file, then choose the next roster agent not excluded by Step 2:

   ```bash
   ls -1 <log_dir> | sort | tail -n 1
   ```

6. **MUST** stop and write a `_failed.md` log with `All roster tasks currently claimed by other agents` when every roster agent is excluded.

7. **MUST** claim the selected agent using **one** of these methods (try in order):

   **Method A — git push (preferred):**
   1) create branch,
   2) create and commit `<timestamp>_<agent>_started.md` in `<log_dir>`,
   3) push branch and commit.

   **Method B — GitHub API fallback (when git push is blocked):**
   If `git push` fails or is unavailable (e.g., Jules sandbox), use the API claim script:
   ```bash
   bash scripts/agent/claim-task-api.sh \
     --agent <agent-name> \
     --cadence <cadence> \
     --base unstable
   ```
   This creates the remote branch, `_started.md` log file, and draft PR entirely via the GitHub REST API using `curl`. Requires `GITHUB_TOKEN` or `GH_TOKEN` in the environment.

   If **both** methods fail (no push access AND no API token), write a `_failed.md` log with reason `Cannot create remote claim: git push blocked and no GITHUB_TOKEN available` and stop.

8. **MUST** re-run the same PR preflight command from Step 2 immediately after the claim is visible remotely. If an earlier claim exists for the same derived agent, print `RACE CHECK: lost (agent already claimed by PR #<number>)`, abandon the run, and return to Step 5. Otherwise print `RACE CHECK: won`.

9. **MUST** execute `<prompt_dir>/<prompt-file>` end-to-end.

10. **MUST** create exactly one final status file (`_completed.md` or `_failed.md`), run `npm run lint`, then commit and push (or use the API to update the remote branch if push is blocked).

## Canonical Example Run Output

### Method A (git push)

```text
$ curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/daily/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'
{ "count": 12, "prs": [ ... ] }

$ cat AGENTS.md CLAUDE.md
# bitvid — AI Agent Guide
...

$ ls -1 docs/agents/task-logs/daily/ | sort | tail -n 1
2026-02-13_18-40-00_load-test-agent_completed.md

Selected agent: nip-research-agent
Created: docs/agents/task-logs/daily/2026-02-14_00-00-00_nip-research-agent_started.md
Pushed branch: agents/daily/nip-research-agent/2026-02-14-run

$ curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '...'
{ "count": 13, "prs": [ ... ] }
RACE CHECK: won

$ npm run lint
> lint passed

Wrote: docs/agents/task-logs/daily/2026-02-14_00-12-00_nip-research-agent_completed.md
```

### Method B (API fallback — for Jules or other restricted environments)

```text
$ curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '...'
{ "count": 12, "prs": [ ... ] }

$ cat AGENTS.md CLAUDE.md
...

$ ls -1 docs/agents/task-logs/daily/ | sort | tail -n 1
2026-02-13_18-40-00_load-test-agent_completed.md

Selected agent: nip-research-agent

# git push is blocked — use API fallback:
$ bash scripts/agent/claim-task-api.sh --agent nip-research-agent --cadence daily --base unstable
Claiming task: nip-research-agent (daily)
Branch: agents/daily/nip-research-agent/2026-02-14-run-1707868800
Step 1: Fetching base branch SHA (unstable)...
  Base SHA: abc123...
Step 2: Creating remote branch...
  Created: refs/heads/agents/daily/nip-research-agent/2026-02-14-run-1707868800
Step 3: Creating started.md log file...
  Created: docs/agents/task-logs/daily/2026-02-14_00-00-00_nip-research-agent_started.md
Step 4: Creating draft PR...
  PR <number>: <url>
CLAIM_BRANCH=agents/daily/nip-research-agent/2026-02-14-run-1707868800
CLAIM_PR_NUMBER=<number>
CLAIM_PR_URL=<url>
CLAIM_LOG_FILE=docs/agents/task-logs/daily/2026-02-14_00-00-00_nip-research-agent_started.md

# Re-run preflight to check for race:
$ curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '...'
{ "count": 13, "prs": [ ... ] }
RACE CHECK: won

$ npm run lint
> lint passed

Wrote: docs/agents/task-logs/daily/2026-02-14_00-12-00_nip-research-agent_completed.md
```
