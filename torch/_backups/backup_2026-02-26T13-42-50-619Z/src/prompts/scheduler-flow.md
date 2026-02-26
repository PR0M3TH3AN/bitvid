# Scheduler Flow (Single Source of Truth)

Use this document for all scheduler runs.


## Canonical artifact paths

All daily/weekly prompt files must reference run artifacts using these canonical directories:

- `src/context/CONTEXT_<timestamp>.md`
- `src/todo/TODO_<timestamp>.md`
- `src/decisions/DECISIONS_<timestamp>.md`
- `src/test_logs/TEST_LOG_<timestamp>.md`

Prompt authors: do not use legacy unprefixed paths (`context/`, `todo/`, `decisions/`, `test_logs/`).


## Shared Agent Run Contract (Required for All Spawned Agents)

Every agent prompt invoked by the schedulers (daily/weekly) MUST enforce this contract:

1. **Read baseline policy files before implementation**:
   - `TORCH.md`
   - `KNOWN_ISSUES.md`
   - Canonical path note: active issues are tracked in root `KNOWN_ISSUES.md` (not `docs/KNOWN_ISSUES.md`)
   - `docs/agent-handoffs/README.md`
   - Recent notes in `docs/agent-handoffs/learnings/` and `docs/agent-handoffs/incidents/`
2. **Update run artifacts** in `src/context/`, `src/todo/`, `src/decisions/`, and `src/test_logs/` during the run, or explicitly document why each artifact update is not needed for that run.
   - When creating filenames with `<timestamp>`, use the scheduler-provided `SCHEDULER_RUN_TIMESTAMP` value when available.
   - Required filename-safe format: `YYYY-MM-DDTHH-MM-SSZ` (for example `2026-02-15T01-03-31Z`); never use `:` in filenames.
3. **Capture reusable failures and unresolved issues**:
   - Record reusable failures in `docs/agent-handoffs/incidents/`
   - Record active unresolved reproducible items in `KNOWN_ISSUES.md`
4. **Execute memory retrieval before implementation begins**:
   - Run configured memory retrieval workflow before prompt execution (for example via `scheduler.memoryPolicyByCadence.<cadence>.retrieveCommand`)
   - Retrieval command MUST call real memory services (`src/services/memory/index.js#getRelevantMemories` with `ingestEvents` seeding) and MUST emit deterministic marker `MEMORY_RETRIEVED`.
   - Retrieval command MUST write cadence-scoped evidence artifacts:
     - `.scheduler-memory/retrieve-<cadence>.ok`
     - `.scheduler-memory/retrieve-<cadence>.json` containing operation inputs/outputs (`agentId`, `query`, seeded event count, ingested count, retrieved count).
   - **Agent Action**: Review `.scheduler-memory/latest/<cadence>/memories.md` for relevant context.

5. **Store memory after implementation and before completion publish**:
   - **Agent Action**: Write any new insights, learnings, or patterns to the file specified by `$SCHEDULER_MEMORY_FILE`. The scheduler sets this env var to `memory-updates/<timestamp>__<agent>.md` automatically — do not compute a path yourself.
   - **What to write** — use this template (keep each bullet to 1-2 lines; omit sections with nothing to say):
     ```markdown
     # Memory Update — <agent-name> — <YYYY-MM-DD>

     ## Key findings
     - <concrete fact discovered this run, e.g. "ESLint v9 requires flat config">

     ## Patterns / reusable knowledge
     - <technique or pattern that will help this agent on its next run>

     ## Warnings / gotchas
     - <env quirk, test failure, or constraint to watch for>
     ```
   - Write only facts that will help the **same agent** on its **next run**. Skip meta-commentary about the task structure.
   - Run configured memory storage workflow after prompt execution (for example via `scheduler.memoryPolicyByCadence.<cadence>.storeCommand`)
   - Storage command MUST call real memory services (`src/services/memory/index.js#ingestEvents`, which uses ingestor/summarizer pipeline) and MUST emit deterministic marker `MEMORY_STORED`.
   - Storage command MUST ingest content from the file at `$SCHEDULER_MEMORY_FILE` (or fallback to `memory-update.md` if present).
   - Storage command MUST write cadence-scoped evidence artifacts:
     - `.scheduler-memory/store-<cadence>.ok`
     - `.scheduler-memory/store-<cadence>.json` containing operation inputs/outputs (`agentId`, input event count, stored count, generated summaries).
6. **Scheduler-owned completion/logging is mandatory**:
   - Spawned agents MUST NOT run `lock:complete`.
   - Spawned agents MUST NOT write final `task-logs/<cadence>/<timestamp>__<agent-name>__completed.md` or `__failed.md` files.
   - Scheduler performs completion publish and writes final success/failure task logs after its own validation gates.

## Numbered MUST Procedure

0. Normalize execution context before any command:
   - If `src/prompts/scheduler-flow.md` exists in the current working directory:
     - `script_prefix = npm run`
     - `path_prefix = ` (empty)
   - Else if `torch/src/prompts/scheduler-flow.md` exists:
     - `script_prefix = npm run --prefix torch`
     - `path_prefix = torch/`
   - Else stop with: `Unable to locate TORCH scheduler files (checked src/prompts and torch/src/prompts).`
   - Ensure dependencies are installed:
     - If `<path_prefix>node_modules` does not exist, run `npm install` (applying `<path_prefix>` if needed, e.g. `npm install --prefix torch`).
   - Apply `script_prefix` to all `lock:*` invocations and apply `path_prefix` to scheduler paths.

1. Set cadence variables before any command:
   - `cadence` = `daily` or `weekly`
   - `log_dir` = `<path_prefix>task-logs/<cadence>/`
   - `prompt_dir` = `<path_prefix>src/prompts/<cadence>/`

   Note: branch naming (for example `agents/<cadence>/`) is orchestration-level behavior and is not used by `run-scheduler-cycle.mjs`.

2. Run preflight to build the exclusion set:

   ```bash
   if daily: `<script_prefix> lock:check:daily -- --json --quiet`; if weekly: `<script_prefix> lock:check:weekly -- --json --quiet`
   ```

   Canonical exclusion rule:
   - Use `excluded` from the `<script_prefix> lock:check:<cadence>` JSON output.
   - If `excluded` is unavailable, fallback to the union of `locked`, `paused`, and `completed` from that same JSON payload.

   Goose Desktop note: `<script_prefix> lock:check:<cadence>` can emit large hermit wrapper logs. Use `--json --quiet` (as documented above). If the command still fails due to Goose hermit issues, apply the PATH workaround in `KNOWN_ISSUES.md` before rerunning.

3. Read policy file(s) once before the run loop. This step is conditional: if `TORCH.md` is missing, continue without failing.

   ```bash
   test -f <path_prefix>TORCH.md && cat <path_prefix>TORCH.md || echo "No TORCH.md found; continuing"
   ```

4. Bootstrap log directories before listing files:

   ```bash
   mkdir -p <log_dir>
   ```

5. When lock health preflight is enabled (`scheduler.lockHealthPreflight: true` or env `SCHEDULER_LOCK_HEALTH_PREFLIGHT=1`), verify relay/query health before selecting an agent or calling `lock:lock`:

   ```bash
   <script_prefix> lock:health -- --cadence <cadence>
   ```

   - Escape hatch: set `SCHEDULER_SKIP_LOCK_HEALTH_PREFLIGHT=1` to skip this check for local/offline workflows.
   - If preflight exits non-zero because every relay is unhealthy, write `_deferred.md` with reason `All relays unhealthy preflight`, include `incident_signal_id`, set `failure_category: lock_backend_error`, state `prompt not executed`, and stop before lock acquisition.
   - For other non-zero preflight failures, write `_failed.md` with reason `Lock backend unavailable preflight`, set `failure_category: lock_backend_error`, state `prompt not executed`, and include:
     - `relay_list`
     - `preflight_failure_category`
     - `preflight_stderr_excerpt`
     - `preflight_stdout_excerpt`
   - Always include any preflight alert payload (`preflight_alerts`) in the scheduler metadata for operational triage.

6. Find latest cadence log file, derive the previous agent, then choose the next roster agent not in exclusion set:

   ```bash
   ls -1 <log_dir> | sort | tail -n 1
   ```

   Selection algorithm (MUST be followed exactly):

   - Roster source: `src/prompts/roster.json` and the key matching `<cadence>`.
   - Resolve that source path as `<path_prefix>src/prompts/roster.json`.
   - Let `roster` be that ordered array and `excluded` be the set from step 2's canonical exclusion rule.
   - Let `latest_file` be the lexicographically last filename in `<log_dir>`.
   - Determine `previous_agent` from `latest_file` using this precedence:
     1. Parse YAML frontmatter from `<log_dir>/<latest_file>` and use key `agent` when present and non-empty.
     2. Otherwise parse filename convention `<timestamp>__<agent-name>__<status>.md` and take `<agent-name>`.
   - If no valid `latest_file` exists, or parsing fails, or `previous_agent` is not in `roster`, treat as first run fallback.
   - First run fallback:
     - Read `scheduler.firstPromptByCadence.<cadence>` from repository-root `torch-config.json` if present.
     - If that agent exists in `roster`, set `start_index = index(configured_agent)`.
     - Otherwise set `start_index = 0`.
   - Otherwise: `start_index = (index(previous_agent in roster) + 1) mod len(roster)`.
   - Round-robin scan:
     - Iterate offsets `0..len(roster)-1`.
     - Candidate index: `(start_index + offset) mod len(roster)` (wrap-around required).
     - Choose the first candidate whose agent is **not** in `excluded`.
   - If no candidate is eligible, execute step 7.

   Worked examples:

   - **Daily example**
     - `roster.daily = [audit-agent, ci-health-agent, const-refactor-agent, ...]`
     - `latest_file = 2026-02-13T00-10-00Z__ci-health-agent__completed.md`
     - `excluded = {const-refactor-agent, docs-agent}`
     - `previous_agent = ci-health-agent`, so `start_index` points to `const-refactor-agent`.
     - `const-refactor-agent` is excluded; skip to `content-audit-agent`.
     - **Selection result: `content-audit-agent`.**

   - **Weekly example**
     - `roster.weekly = [bug-reproducer-agent, changelog-agent, ..., weekly-synthesis-agent]`
     - `latest_file = 2026-02-09T00-00-00Z__weekly-synthesis-agent__completed.md`
     - `excluded = {}`
     - `previous_agent = weekly-synthesis-agent` (last roster entry), so `start_index = 0` by wrap-around.
     - First candidate is `bug-reproducer-agent` and is eligible.
     - **Selection result: `bug-reproducer-agent`.**

7. If every roster agent is excluded, write a `_failed.md` log with:
   `All roster tasks currently claimed by other agents` and stop.

8. Claim selected agent:

   ```bash
   AGENT_PLATFORM=<platform> \
   <script_prefix> lock:lock -- --agent <agent-name> --cadence <cadence>
   ```

   - Exit `0`: lock acquired, continue.
   - Exit `3`: race lost/already locked, return to step 2.
   - Exit `2`: lock backend error.
     - If `scheduler.strict_lock` is `false`, defer the run while both budget constraints are still satisfied:
       - `degraded_lock_retry_window` (ms) since first backend failure has not elapsed.
       - `max_deferrals` has not been exceeded.
       - Record deferral metadata in scheduler run state (`attempt_count`, `first_failure_timestamp`, `backend_category`, and preserved idempotency key).
     - Otherwise write `_failed.md` with reason `Lock backend error`, and include failure metadata fields:
     - `backend_category` (classified backend failure category)
     - `lock_command` (raw lock command for retry)
     - `lock_stderr_excerpt` (redacted stderr snippet)
     - `lock_stdout_excerpt` (redacted stdout snippet)
     - Include `failure_class: backend_unavailable` and `failure_category: lock_backend_error` for both deferred and failed backend-unavailable lock outcomes.
    - Include recommended auto-remediation text in `detail`: retry window, `<script_prefix> lock:health -- --cadence <cadence>`, and incident runbook link.
   - Keep generic reason text for compatibility, but append actionable retry guidance in `detail` using the command from `lock_command`.

9. Execute `<prompt_dir>/<prompt-file>` end-to-end via configured handoff command.

   - Scheduler automation runs `scheduler.handoffCommandByCadence.<cadence>` with environment variables for cadence/agent/prompt path.
   - If no handoff command is configured for the cadence, write `_failed.md` and stop.
   - Prompt file read/parse failures should emit `failure_category: prompt_parse_error`.
   - Prompt schema/contract failures should emit `failure_category: prompt_schema_error`.
   - Command/handoff/validation runtime failures should emit `failure_category: execution_error`.

10. Confirm memory contract completion:

   - Memory retrieval evidence must exist for this run (output marker and/or artifact file).
   - Memory storage evidence must exist for this run (output marker and/or artifact file).
   - Enforced daily/weekly commands in `torch-config.json` run `node --input-type=module` snippets that call `src/services/memory/index.js` APIs directly:
     - Retrieval path: `ingestEvents(...)` seed + `getRelevantMemories(...)` retrieval.
     - Storage path: `ingestEvents(...)` (ingestor + summarizer path).
   - Input contract for retrieval evidence JSON:
     - Required keys: `cadence`, `operation: "retrieve"`, `servicePath`, `inputs`, `outputs`, `status: "ok"`.
     - `inputs` must include `agentId`, `query`, and seeded `events` count.
     - `outputs` must include `ingestedCount` and `retrievedCount`.
   - Input contract for storage evidence JSON:
     - Required keys: `cadence`, `operation: "store"`, `servicePath`, `inputs`, `outputs`, `status: "ok"`.
     - `inputs` must include `agentId` and input `events` count.
     - `outputs` must include `storedCount` and generated `summaries`.
   - Failure semantics for required mode:
     - If retrieval/store command exits non-zero, scheduler writes `_failed.md` and stops.
     - If command succeeds but markers/artifacts are missing, scheduler treats this as missing memory evidence.
   - Prompt authors MUST keep any command changes aligned with configured markers/artifacts so scheduler evidence checks remain satisfiable.
   - If `scheduler.memoryPolicyByCadence.<cadence>.mode = required`, missing evidence is a hard failure.
   - If mode is `optional`, log warning context and continue.

11. Verify required run artifacts for the current run window.

    - Scheduler runs `node scripts/agent/verify-run-artifacts.mjs --since <run-start-iso> --check-failure-notes`.
    - If artifact verification exits non-zero: write `_failed.md` and stop.

12. Run repository checks (for example: `<script_prefix> lint`).

    - If any validation command exits non-zero: **fail the run immediately**, write `_failed.md` with the failing command and reason, and stop.
    - step 12 MUST NOT be executed (`lock:complete` is forbidden until validation passes).
    - In current numbering: when step 12 fails, step 13 MUST NOT run.

13. Publish completion before writing final success log:

    ```bash
    AGENT_PLATFORM=<platform> \
    <script_prefix> lock:complete -- --agent <agent-name> --cadence <cadence>
    ```

    (Equivalent invocation is allowed: `torch-lock complete --agent <agent-name> --cadence <cadence>`.)

    - Exit `0`: completion published successfully; continue to step 14.
    - Exit non-zero: **fail the run**, write `_failed.md` with a clear reason that completion publish failed and retry guidance (for example: `Retry <script_prefix> lock:complete -- --agent <agent-name> --cadence <cadence> after verifying relay connectivity`), then stop.

14. Create final task log only after step 13 succeeds (scheduler-owned):

    - `_completed.md` MUST be created only after completion publish succeeds.
    - `_failed.md` is required when step 11, step 12, or step 13 fails, and should include the failure reason and next retry action.
    - Include `platform` in frontmatter using `AGENT_PLATFORM` (or the scheduler `--platform` value) for both `_completed.md` and `_failed.md`.

15. Commit/push behavior is delegated outside this scheduler script.

    - `scripts/agent/run-scheduler-cycle.mjs` does **not** run `git commit` or `git push`.
    - If commit/push is required for your workflow, perform it in the configured handoff agent command or a separate orchestration step.

16. Print a final summary message to stdout (standard output).

    - The message MUST include:
      - **Status**: [Success/Failure/Deferred]
      - **Agent**: [Agent Name]
      - **Prompt**: [Prompt Path]
      - **Reason**: [Reason string]
      - **Learnings**: [Content of the memory update file or "No learnings recorded"]

    - If the run failed, include the failure reason.
    - If the run succeeded, try to include the content of the memory update file (e.g., `memory-updates/<timestamp>__<agent>.md`) as the "Learnings".

Worked post-task example (MUST order):

1. `AGENT_PLATFORM=codex <script_prefix> lock:lock -- --agent content-audit-agent --cadence daily`
2. Execute `<path_prefix>src/prompts/daily/content-audit-agent.md`
3. `node scripts/agent/verify-run-artifacts.mjs --since <run-start-iso> --check-failure-notes`
4. `AGENT_PLATFORM=codex <script_prefix> lock:complete -- --agent content-audit-agent --cadence daily` (complete, permanent)
5. Write `<path_prefix>task-logs/daily/2026-02-14T10-00-00Z__content-audit-agent__completed.md`
6. Print final summary (Status: Success, Learnings: <content>)

Worked validation-failure example (MUST behavior):

1. `AGENT_PLATFORM=codex <script_prefix> lock:lock -- --agent content-audit-agent --cadence daily`
2. Execute `<path_prefix>src/prompts/daily/content-audit-agent.md`
3. `node scripts/agent/verify-run-artifacts.mjs --since <run-start-iso> --check-failure-notes` passes
4. `<script_prefix> lint` exits non-zero (or `<script_prefix> test` exits non-zero)
5. Write `<path_prefix>task-logs/daily/2026-02-14T10-00-00Z__content-audit-agent__failed.md` with the failing command and reason
6. Stop the run **without** calling `<script_prefix> lock:complete -- --agent content-audit-agent --cadence daily`
7. Print final summary (Status: Failed, Reason: <reason>)
