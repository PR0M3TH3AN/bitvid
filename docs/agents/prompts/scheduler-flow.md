# Scheduler Flow (Single Source of Truth)

Use this document for **all scheduler runs**.

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

7. **MUST** claim the selected agent in this exact order:
   1) create branch,
   2) create and commit `<timestamp>_<agent>_started.md` in `<log_dir>`,
   3) push branch and commit.

8. **MUST** re-run the same PR preflight command from Step 2 immediately after push. If an earlier claim exists for the same derived agent, print `RACE CHECK: lost (agent already claimed by PR #<number>)`, abandon the run, and return to Step 5. Otherwise print `RACE CHECK: won`.

9. **MUST** execute `<prompt_dir>/<prompt-file>` end-to-end.

10. **MUST** create exactly one final status file (`_completed.md` or `_failed.md`), run `npm run lint`, then commit and push.

## Canonical Example Run Output

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

$ curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, prs: [.[] | {number, created_at, draft, head: {ref: .head.ref}, agent: ((.head.ref | capture("^agents/daily/(?<agent>[^/]+)/")?.agent) // (.title | capture("(?<agent>[A-Za-z0-9-]+-agent)")?.agent // null))}] | sort_by(.created_at, .number)}'
{ "count": 13, "prs": [ ... ] }
RACE CHECK: won

$ npm run lint
> lint passed

Wrote: docs/agents/task-logs/daily/2026-02-14_00-12-00_nip-research-agent_completed.md
```
