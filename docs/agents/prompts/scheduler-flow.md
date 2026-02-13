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

2. **MUST** run the preflight check to build the exclusion set. Use the Nostr lock check (preferred) with GitHub PR check as supplemental:

   **Primary — Nostr lock check:**
   ```bash
   node scripts/agent/nostr-lock.mjs check --cadence <cadence>
   ```
   This queries Nostr relays for active lock events and returns JSON with `locked` and `available` agent lists.

   **Supplemental — GitHub PR check** (catches agents with open PRs that predate the Nostr system):
   ```bash
   curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/<cadence>/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'
   ```

   The exclusion set is the **union** of agents locked via Nostr AND agents with open PRs.

3. **MUST** derive excluded agents from both outputs:
   - From Nostr check: use the `locked` array directly.
   - From GitHub PR check: 1) parse `head.ref` as `agents/<cadence>/<agent-name>/...`; 2) fallback to title regex; 3) if still unknown, stop with a global lock message.

4. **MUST** run this command and read both policy files before selecting an agent:

   ```bash
   cat AGENTS.md CLAUDE.md
   ```

5. **MUST** run this command to identify the latest cadence log file, then choose the next roster agent not in the exclusion set:

   ```bash
   ls -1 <log_dir> | sort | tail -n 1
   ```

6. **MUST** stop and write a `_failed.md` log with `All roster tasks currently claimed by other agents` when every roster agent is excluded.

7. **MUST** claim the selected agent using **one** of these methods (try in order):

   **Method A — Nostr lock (preferred, works everywhere Node.js is available):**
   ```bash
   AGENT_PLATFORM=<jules|claude-code|codex> \
   node scripts/agent/nostr-lock.mjs lock \
     --agent <agent-name> \
     --cadence <cadence>
   ```
   This generates an ephemeral keypair, publishes a NIP-78 lock event to Nostr relays with NIP-40 auto-expiration (2 hours default), and performs a built-in race check. No tokens or secrets needed. Exit code 0 = won, exit code 3 = lost race.

   **Method B — git push (when Nostr relays are unreachable):**
   1) create branch,
   2) create and commit `<timestamp>_<agent>_started.md` in `<log_dir>`,
   3) push branch and commit.

   **Method C — GitHub API fallback (when git push is also blocked):**
   ```bash
   bash scripts/agent/claim-task-api.sh \
     --agent <agent-name> \
     --cadence <cadence> \
     --base unstable
   ```
   Requires `GITHUB_TOKEN` or `GH_TOKEN` in the environment.

   If **all three methods** fail, write a `_failed.md` log with reason `Cannot create remote claim: all locking methods failed` and stop.

8. **MUST** verify the lock was acquired:
   - If Method A was used: the script's built-in race check already ran. If exit code was 0, print `RACE CHECK: won`. If exit code 3, print `RACE CHECK: lost`, abandon, and return to Step 5.
   - If Method B or C was used: re-run the GitHub PR preflight from Step 2. If an earlier claim exists for the same derived agent, print `RACE CHECK: lost (agent already claimed by PR #<number>)`, abandon, and return to Step 5.

9. **MUST** execute `<prompt_dir>/<prompt-file>` end-to-end.

10. **MUST** create exactly one final status file (`_completed.md` or `_failed.md`), run `npm run lint`, then commit and push (or use the API to update the remote branch if push is blocked).

## Canonical Example Run Output

### Method A — Nostr lock (preferred)

```text
# Step 2: Preflight — check Nostr locks + GitHub PRs
$ node scripts/agent/nostr-lock.mjs check --cadence daily
{ "cadence": "daily", "date": "2026-02-14", "locked": ["audit-agent"], "available": [...], ... }

$ curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '...'
{ "count": 2, "prs": [ ... ] }

# Steps 3-5: Read policies, check logs, select agent
$ cat AGENTS.md CLAUDE.md
...

$ ls -1 docs/agents/task-logs/daily/ | sort | tail -n 1
2026-02-13_18-40-00_load-test-agent_completed.md

Selected agent: nip-research-agent

# Step 7: Claim via Nostr lock
$ AGENT_PLATFORM=jules node scripts/agent/nostr-lock.mjs lock --agent nip-research-agent --cadence daily
Locking: agent=nip-research-agent, cadence=daily, date=2026-02-14
Step 1: Checking for existing locks...
Step 2: Generating ephemeral keypair...
Step 3: Building lock event...
Step 4: Publishing to relays...
  Published to 3/3 relays
Step 5: Race check...
RACE CHECK: won
LOCK_STATUS=ok
LOCK_EVENT_ID=ea2724c76d2bd707...
LOCK_AGENT=nip-research-agent
LOCK_CADENCE=daily
LOCK_EXPIRES_ISO=2026-02-14T02:00:00.000Z

# Step 9: Execute agent prompt
(agent runs nip-research-agent prompt...)

# Step 10: Finalize
$ npm run lint
> lint passed

Wrote: docs/agents/task-logs/daily/2026-02-14_00-12-00_nip-research-agent_completed.md
```

### Method B — git push (fallback if relays are unreachable)

```text
$ node scripts/agent/nostr-lock.mjs check --cadence daily
nostr-lock failed: Relay query timed out
# Nostr relays unreachable — fall back to GitHub PR check only

$ curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '...'
{ "count": 12, "prs": [ ... ] }

$ cat AGENTS.md CLAUDE.md
...

Selected agent: nip-research-agent
Created: docs/agents/task-logs/daily/2026-02-14_00-00-00_nip-research-agent_started.md
Pushed branch: agents/daily/nip-research-agent/2026-02-14-run

$ curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '...'
RACE CHECK: won
```

### Method C — GitHub API (fallback if git push is also blocked)

```text
# Both Nostr relays and git push failed
$ bash scripts/agent/claim-task-api.sh --agent nip-research-agent --cadence daily --base unstable
CLAIM_BRANCH=agents/daily/nip-research-agent/2026-02-14-run-1707868800
CLAIM_PR_NUMBER=<number>
CLAIM_PR_URL=<url>

$ curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '...'
RACE CHECK: won
```
