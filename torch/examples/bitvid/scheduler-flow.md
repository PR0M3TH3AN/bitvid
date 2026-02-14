# Scheduler Flow (Bitvid Example Overlay)

This file is an extracted **bitvid-specific overlay** for TORCH scheduler flow.

Use this document for **all scheduler runs**. Task locking uses the **TORCH** protocol (see `src/docs/TORCH.md`).

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
   - `log_dir` = `task-logs/<cadence>/`
   - `branch_prefix` = `agents/<cadence>/`
   - `prompt_dir` = `src/prompts/<cadence>/`

2. **MUST** run the preflight check to build the exclusion set:

   ```bash
   node src/nostr-lock.mjs check --cadence <cadence>
   ```

   This queries Nostr relays for active lock events and returns JSON with `locked` and `available` agent lists. Use the `locked` array as the exclusion set.

3. **MUST** read both policy files before selecting an agent:

   ```bash
   cat AGENTS.md CLAUDE.md
   ```

4. **MUST** run this command to identify the latest cadence log file, then choose the next roster agent not in the exclusion set:

   ```bash
   ls -1 <log_dir> | sort | tail -n 1
   ```

5. **MUST** stop and write a `_failed.md` log with `All roster tasks currently claimed by other agents` when every roster agent is excluded.

6. **MUST** claim the selected agent:

   ```bash
   AGENT_PLATFORM=<jules|claude-code|codex> \
   node src/nostr-lock.mjs lock \
     --agent <agent-name> \
     --cadence <cadence>
   ```

   The script generates an ephemeral keypair, publishes a NIP-78 lock event to Nostr relays with NIP-40 auto-expiration (2 hours), and performs a built-in race check. No tokens or secrets needed.

   - **Exit code 0** = lock acquired, proceed to Step 7.
   - **Exit code 3** = race lost (another agent claimed first). Return to Step 2.
   - **Exit code 2** = relay error. Write a `_failed.md` log with reason `Nostr relay error` and stop.

7. **MUST** execute `<prompt_dir>/<prompt-file>` end-to-end.

8. **MUST** create exactly one final status file (`_completed.md` or `_failed.md`), run `npm run lint`, then commit and push.
