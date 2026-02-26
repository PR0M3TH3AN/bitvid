# TORCH: Task Orchestration via Relay-Coordinated Handoff

TORCH is a decentralized task-locking protocol for multi-agent software development. This document serves as the primary manual for both human operators and AI agents working within a TORCH-enabled repository.

---

## Agent Operating Guide

This section defines how agents should work in this repository.

### Purpose

- Keep agent work predictable, auditable, and safe.
- Minimize repeated discovery work across sessions.
- Capture durable learnings so future agents can move faster.

### Session startup checklist (run every session)

1. **Read `TORCH.md`** (this file).
2. Read `CONTRIBUTING.md` for commit and PR expectations.
3. Read `KNOWN_ISSUES.md` for active blockers and workarounds.
4. Read `docs/agent-handoffs/README.md`.
5. Scan recent notes in:
   - `docs/agent-handoffs/learnings/`
   - `docs/agent-handoffs/incidents/`
6. If present, review the current run artifacts in:
   - `src/context/`
   - `src/todo/`
   - `src/decisions/`
   - `src/test_logs/`
   - `src/issues/`

### Core operating principles

- Default to generic guidance and neutral language.
- Make the smallest safe change that satisfies the request.
- Avoid unrelated refactors.
- Preserve backward compatibility unless explicitly asked otherwise.
- Prefer explicit commands and documented behavior over assumptions.
- Record assumptions clearly in your final summary.

### Validation policy

- Run the most relevant checks for changed files (tests, lint, typecheck, build, or targeted scripts).
- Never claim a check passed unless it was actually executed.
- If a check cannot run, record:
   - command attempted,
   - why it could not complete,
   - what fallback validation was performed.

### Execution Workflow

1. **Load baseline context** (see Session startup checklist above).
2. **Clarify the task**
   - Restate the requested outcome.
   - Identify constraints, risks, and assumptions.
3. **Plan minimal changes**
   - Keep scope tight.
   - Avoid touching unrelated files.
4. **Implement**
   - Apply small, reversible edits.
   - Favor readability and maintainability.
5. **Validate**
   - Run relevant checks for impacted files.
   - Capture exact commands and outcomes.
6. **Document and hand off**
   - Summarize what changed and why.
   - Record reusable learnings/incidents when appropriate.

### Working files for session state

Use the following folders as lightweight coordination artifacts:

- `src/context/` — Current objective, scope, constraints.
- `src/todo/` — Task checklist and blockers.
- `src/decisions/` — Important design/implementation choices.
- `src/test_logs/` — Validation commands and results.
- `src/issues/` — Investigations or audits that may become tracked issues.

#### Content templates

**Context note:** Goal, Scope, Constraints, Open questions.
**Todo note:** Pending tasks, Completed tasks, Blocked tasks.
**Decision note:** Decision, Alternatives considered, Rationale, Consequences/follow-ups.
**Test log:** Command, Result (pass/fail/warn), Notes (environmental limits, retries, artifacts).

### Long-term Memory

While `src/context` and `src/todo` are ephemeral (per session), TORCH provides a durable memory system for transferring knowledge across runs and agents.

#### Reading Memory
At the start of a session, the scheduler retrieves relevant memories based on your agent identity and current prompt.
- **Source:** `.scheduler-memory/latest/<cadence>/memories.md`
- **Action:** Read this file to learn from past agents (e.g., "The integration test suite is flaky on the login step", "Use `node:test` instead of Jest").

#### Writing Memory
To save a learning for future agents, create a memory file before finishing your task.
- **File:** `memory-update.md` (in the repository root).
- **Content:** Concise, high-value insights.
- **Mechanism:** The scheduler will automatically ingest this file after your run completes.

**Good Memories:**
- "Fix for `EADDRINUSE` in tests: ensure server.close() is called in `after()`."
- "Project preference: Always use named exports for components."
- "Constraint: Do not upgrade `dependency-x` past v2.0 due to breaking change Y."

**Bad Memories:**
- "I updated file X." (Use git history for this).
- "Running tests..." (Use task logs).
- Large code blocks or entire file dumps.

### Knowledge-sharing protocol

#### What belongs where

- `KNOWN_ISSUES.md`: Active, reproducible issues only. Include status, impact, workaround, and last verification date.
- `docs/agent-handoffs/learnings/`: Proven patterns, repeatable fixes, and successful implementation guidance.
- `docs/agent-handoffs/incidents/`: Failures, root causes, mitigations, and prevention guidance.
- `src/context/`, `src/todo/`, etc.: Ephemeral session state.

#### Naming standard

Use: `YYYY-MM-DD-short-topic.md` (e.g., `2026-02-14-validation-before-summary.md`).
Keep names concise, descriptive, and neutral.

#### Required sections for reusable notes

1. Context
2. Observation
3. Action taken
4. Validation performed
5. Recommendation for next agents

#### Update decision tree

When you discover reusable context:
1. Check if an existing note already covers it.
2. If yes, update that note.
3. If no, add a new note in `learnings/` or `incidents/`.
4. If the issue is still active/reproducible, add or update `KNOWN_ISSUES.md`.

### Quality checklist before completion

- Scope matches request.
- Documentation remains repository-agnostic unless explicitly needed.
- No unsupported claims about testing.
- Assumptions and limitations are called out.
- Changes are easy to revert.

### Anti-patterns to avoid

- Embedding product/company-specific guidance in baseline docs.
- Large refactors when a focused change is sufficient.
- Skipping validation without recording why.
- Creating duplicate notes when an update would suffice.

---

## Scenario-First Tests & Test Integrity (Dark Factory Standard)

In this repo, **validation replaces code review**. That means our test/scenario system is the *only* thing standing between “working software” and “green-but-worthless software.”

Agents will naturally optimize for short-term goals (e.g., “get CI green”) unless we constrain them. If we ever allow “edit tests until they pass,” we destroy the signal, and over time the suite becomes meaningless.

### Core philosophy: scenarios > checklists

We treat tests as **behavioral specifications** expressed as **scenarios**:
- “User stories” / end-to-end behaviors (Given/When/Then or equivalent)
- Assertions focus on **externally observable outcomes** at boundaries (API responses, persisted state, emitted events, CLI output, UI state), not internal call sequences.
- We prefer *minimal coupling* to implementation details so refactors don’t require rewriting “truth.”

(StrongDM reached the same conclusion: repo-local tests are easy to reward-hack; scenarios and satisfaction-based validation reduce “teaching to the test.”) :contentReference[oaicite:1]{index=1}

### Non-negotiable constitution (anti-cheat)

**Hard rules (always on):**
1) **Never weaken, delete, or rewrite a test just to make CI pass.**
2) **Never change expected behavior to match buggy output** (“rubber-stamp the snapshot”, “update golden”, “adjust assertion”) unless it is a **spec correction** (see below).
3) Do not “fix” flaky tests with retries, sleeps, timeouts, or looser assertions. **Remove nondeterminism** instead (control time, randomness, IO, network).
4) Prefer black-box assertions at system boundaries; avoid tests that merely mirror internal logic.

### Definitions

- **Scenario**: a behavioral spec (often end-to-end) describing what must happen for a user/system in a real environment.
- **Invariant**: a property that must always hold across many inputs/states (great for property-based or metamorphic testing).
- **Holdout scenario**: an evaluation scenario kept outside the agent-editable area to reduce overfitting / reward-hacking.

### When tests may change (spec correction protocol)

Changing a test expectation is allowed **only** when the test was enforcing the wrong behavior.

If you believe a test should change:
1) Identify the **scenario/spec** that defines correct behavior.
2) Explain precisely why the old expectation was wrong.
3) Replace it with an **equally strict or stricter** behavior-based check.
4) Record a **Test Integrity Note** (below) and, if applicable, a short spec note (e.g., `docs/spec_changes/<date>-<slug>.md`).

If you cannot point to scenario/spec truth, **do not change the test**. Add a “Needs Spec Clarification” note instead.

### “Test Integrity Note” (required for any PR touching tests)

Every PR that adds/changes tests must include this machine-readable block in the PR description (or in a `TEST_INTEGRITY.md` entry referenced by the PR):

```yaml
test_integrity_note:
  change_type: ["new_tests" | "refactor_tests" | "spec_correction" | "flake_fix"]
  scenarios:
    - id: SCN-<slug>
      given: "<preconditions>"
      when: "<stimulus>"
      then: "<observable outcomes>"
  observable_outcomes:
    - "<what the user/system can observe at the boundary>"
  determinism_controls:
    - "<fake clock / fixed seed / hermetic env / service virtualization>"
  anti_cheat_rationale:
    prevents:
      - "hard-coded return value"
      - "over-mocking internal logic"
      - "snapshot rubber-stamping"
      - "retry/sleep-based flake masking"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

### Test portfolio guidance (scenario-first, still layered)

We want a balanced suite:

* **Scenario/E2E**: user-story validation at boundaries (few, high value, high fidelity)
* **Integration/contract**: service boundaries, serialization, persistence, workflows
* **Unit/invariants**: properties that kill trivial cheats (“return true” shouldn’t survive)

For cheat resistance, strongly prefer:

* invariants/property-based tests for critical logic
* metamorphic relations where “exact expected output” is hard
* periodic mutation testing to “test the tests” (surviving mutants indicate missing assertions)

### External dependency realism (service virtualization / “digital twins”)

Where third-party services are involved, we prefer deterministic “behavioral clones” (mocks/stubs at the API boundary that reproduce edge cases and contracts) over live calls. This keeps scenarios **realistic** without being flaky or rate-limited, and it makes high-volume scenario validation affordable. ([factory.strongdm.ai][2])

---

## Role: Test Integrity & Scenario Spec Agent (Enforcer)

This repo includes (or assumes) a dedicated agent role whose only job is to protect validation integrity.

**This agent’s goal is NOT “make CI green.”**
Its goal is “make the suite reflect reality and reject fake passes.”

**Authority:**

* May add new scenarios, invariants, and tests.
* May refactor tests to be more behavioral and less procedural.
* May improve determinism (fixed seeds, fake clocks, hermetic env).
* May only change expectations via the Spec Correction Protocol above.

**Prohibitions:**

* Must never weaken tests to pass.
* Must never edit holdout scenarios (if configured).
* Must never solve flakiness via retries/sleeps/loosening.

**Deliverables each run:**

* Scenario list (Given/When/Then)
* Proposed test diffs
* Test Integrity Note
* “Cheat vectors blocked” summary (what trivial implementations it prevents)

---

## Dashboard & Protocol Overview

The TORCH dashboard subscribes to Nostr relays for **kind 30078** events tagged with the `#torch-agent-lock` hashtag. These are the same events agents publish via `bin/torch-lock.mjs` when they claim tasks using the TORCH protocol.

**Relays:** `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.primal.net`

**Filter:** `{"kinds":[30078],"#t":["torch-agent-lock"]}`

**Unique identifier:** All events use the `torch-lock/` namespace in the d-tag and the `#torch-agent-lock` hashtag. This scopes events to this repository and is how both agents and the dashboard filter messages.

To follow in any Nostr client, subscribe to kind 30078 with `#t = torch-agent-lock` on the relays above.

## Quick start

```bash
# Check active locks
node bin/torch-lock.mjs check --cadence daily

# Machine-readable lock output (recommended for automation)
node bin/torch-lock.mjs check --cadence daily --json --quiet --json-file /tmp/torch-lock-check.json

# Claim a task
AGENT_PLATFORM=codex node bin/torch-lock.mjs lock --agent docs-agent --cadence daily

# List all active locks
node bin/torch-lock.mjs list

# Probe relay health before scheduler lock acquisition
node bin/torch-lock.mjs health --cadence daily
```

## Defaults

- Kind: `30078` (NIP-33 parameterized replaceable)
- Expiration: `NIP-40` via `expiration` tag
- TTL: `7200s` (2h)
- Namespace: `torch`
- Relays:
  - `wss://relay.damus.io`
  - `wss://nos.lol`
  - `wss://relay.primal.net`

## Environment variables

- `NOSTR_LOCK_NAMESPACE`
- `NOSTR_LOCK_HASHTAG`
- `NOSTR_LOCK_RELAYS`
- `NOSTR_LOCK_TTL`
- `NOSTR_LOCK_QUERY_TIMEOUT_MS`
- `NOSTR_LOCK_PUBLISH_TIMEOUT_MS`
- `NOSTR_LOCK_MIN_SUCCESSFUL_PUBLISHES`
- `NOSTR_LOCK_RELAY_FALLBACKS`
- `NOSTR_LOCK_MIN_ACTIVE_RELAY_POOL`
- `NOSTR_LOCK_DAILY_ROSTER`
- `NOSTR_LOCK_WEEKLY_ROSTER`
- `TORCH_CONFIG_PATH`
- `AGENT_PLATFORM` (supports `codex`, `claude`, or `linux` for simulated/manual execution)
- `TORCH_MEMORY_ENABLED` (`true`/`false`; global memory kill switch, defaults to enabled)
- `TORCH_MEMORY_INGEST_ENABLED` (`true`/`false` or comma-separated canary `agent_id` allow list)
- `TORCH_MEMORY_RETRIEVAL_ENABLED` (`true`/`false` or comma-separated canary `agent_id` allow list)
- `TORCH_MEMORY_PRUNE_ENABLED` (`true`, `false`, or `dry-run`)

## torch-config.json

You can configure TORCH per repository with a root-level `torch-config.json` file.

Common settings:

- `nostrLock.namespace` — namespace prefix used in d-tags and hashtags.
- `nostrLock.relays` — relay list for check/lock/list operations.
- `nostrLock.ttlSeconds` — default lock TTL.
- `nostrLock.queryTimeoutMs` — relay query timeout (ms, valid range: 100..120000).
- `nostrLock.publishTimeoutMs` — per-relay publish timeout (ms, valid range: 100..120000).
- `nostrLock.minSuccessfulRelayPublishes` — minimum successful publishes required before lock acquisition continues (default: `1`).
- `nostrLock.relayFallbacks` — optional fallback relay URLs used when primary query/publish attempts fail quorum.
- `nostrLock.minActiveRelayPool` — minimum number of relays kept active even when lower-ranked relays are quarantined (default: `1`).
- `nostrLock.dailyRoster` / `nostrLock.weeklyRoster` — optional per-project roster overrides.
- `dashboard.defaultCadenceView` — default dashboard view (`daily`, `weekly`, `all`).
- `dashboard.defaultStatusView` — default dashboard status filter (`active`, `all`).
- `dashboard.hashtag` — custom hashtag for lock events (defaults to `<namespace>-agent-lock`).
- `scheduler.firstPromptByCadence.daily` / `.weekly` — first-run scheduler starting agent.
- `scheduler.handoffCommandByCadence.daily` / `.weekly` — shell command run after lock acquisition; command must use `SCHEDULER_AGENT`, `SCHEDULER_CADENCE`, and `SCHEDULER_PROMPT_PATH` provided by `scripts/agent/run-scheduler-cycle.mjs`.
- `scheduler.paused.daily` / `.weekly` — array of agent names to exclude from scheduler rotation.
- `scheduler.strict_lock` — lock backend policy switch (default: `true`); when `false`, scheduler defers backend-unavailable lock failures before converting the run to failed.
- `scheduler.degraded_lock_retry_window` — non-strict deferral window in milliseconds; backend lock failures outside this window immediately consume failure budget and mark run failed.
- `scheduler.max_deferrals` — max number of non-strict lock deferrals allowed in-window before scheduler records a hard failure.

Default first-run daily scheduler prompt is `scheduler-update-agent`.

For weekly repository-fit maintenance, TORCH also includes `src/prompts/weekly/repo-fit-agent.md` to periodically adjust defaults and docs to the host repository.

Operational note: scheduler handoff commands are treated as required execution steps. A non-zero exit code (or missing command) is a hard failure: the scheduler writes a `_failed.md` task log, exits immediately, and does not publish `lock:complete` for that run.

Scheduler failure classes in task logs:

- `backend_unavailable` — legacy compatibility field for lock backend unavailable failures.
- `prompt_validation_error` — legacy compatibility field for prompt/runtime validation failures.

Scheduler failure categories in task logs:

- `lock_backend_error` — lock backend unavailable preflight failures and lock acquisition backend exit code `2` failures/deferrals; includes relay health alert metadata, retry window guidance, health check command, and incident runbook link.
- `prompt_parse_error` — scheduler could not read/parse the selected prompt file; prompt execution is skipped.
- `prompt_schema_error` — selected prompt file or generated run artifacts failed schema/contract checks; prompt run is treated as invalid.
- `execution_error` — runtime execution failures in handoff callbacks, memory commands, or configured validation commands.


## Lock backend production defaults

Recommended baseline for production scheduler runs:

- `nostrLock.relays`: 3+ geographically-diverse primary relays.
- `nostrLock.relayFallbacks`: 2 additional relays not present in primary list.
- `nostrLock.queryTimeoutMs`: `10000`
- `nostrLock.publishTimeoutMs`: `8000`
- `nostrLock.minSuccessfulRelayPublishes`: `2`
- `nostrLock.minActiveRelayPool`: `2`

Validation behavior:

- Relay URLs must be absolute `ws://` or `wss://` URLs.
- Invalid relay URLs or invalid timeout/count ranges are fatal startup errors.
- Lock backend errors include phase (`query:primary`, `query:fallback`, `publish:primary`, `publish:fallback`), relay endpoint, and timeout value used.
- When scheduler preflight fails before lock acquisition, task logs must explicitly state `prompt not executed` to make lock-vs-prompt root cause obvious in UI/CLI summaries.
- Interpret `relay_publish_quorum_failure` (derived from `lock_publish_quorum_failed` telemetry) as quorum not met even after retries/fallbacks. Expected operator actions:
  1. Run `npm run lock:health -- --cadence <daily|weekly>` to confirm relay readiness and identify failing relays/reasons.
  2. Review task log metadata (`lock_failure_reason_distribution`, `backend_category`, `lock_correlation_id`) for dominant failure modes (timeouts, DNS, auth, malformed relay URL).
  3. If failures persist past retry window, follow incident runbook `docs/agent-handoffs/learnings/2026-02-15-relay-health-preflight-job.md` and escalate relay/network remediation.
- Relay health snapshots are emitted periodically and whenever lock publish/query fails; snapshots include success rate, timeout rate, rolling latency, and quarantine state per relay.

## Scheduler Usage

The scheduler is the primary entry point for automated agent execution. It handles lock acquisition, environment setup, agent handoff, and artifact verification.

```bash
# Run full daily scheduler cycle
npm run scheduler:daily

# Run full weekly scheduler cycle
npm run scheduler:weekly
```

## Lock Management Usage

Manage distributed locks manually if needed:

```bash
# Check status of locks
npm run lock:check:daily

# Manually complete a task lock
npm run lock:complete -- --agent <agent> --cadence <cadence>
```

## Scheduler lock reliability reporting

Run the lock reliability summary to aggregate recent scheduler outcomes by platform, cadence, backend error category, and relay endpoint:

```bash
npm run report:lock-reliability
```

Outputs:
- `artifacts/lock-reliability/lock-reliability-summary.md`
- `artifacts/lock-reliability/lock-reliability-summary.json`


## Roster precedence

The lock CLI resolves roster names in this order:

1. `NOSTR_LOCK_DAILY_ROSTER` / `NOSTR_LOCK_WEEKLY_ROSTER` (comma-separated env overrides).
2. `torch-config.json` (`nostrLock.dailyRoster` / `nostrLock.weeklyRoster`).
3. `src/prompts/roster.json` (`daily` / `weekly` canonical scheduler roster).
4. Built-in fallback roster (used only if `src/prompts/roster.json` is unreadable).

`lock --agent` validates names against the resolved cadence roster, and `check`/`list` report lock events whose agent names do not match scheduler roster entries exactly.


## Exit codes

- `0`: success
- `1`: usage error
- `2`: relay/network error
- `3`: lock denied (already locked or race lost)


## Memory rollout plan

1. Deploy memory schema changes with scheduler jobs disabled (`TORCH_MEMORY_ENABLED=false` or subsystem flags set to `false`).
2. Enable ingest for one canary `agent_id` via `TORCH_MEMORY_INGEST_ENABLED=<agent_id>`.
3. Validate retrieval quality and storage growth metrics before expanding scope.
4. Enable broader retrieval (`TORCH_MEMORY_RETRIEVAL_ENABLED=<allow-list>` then `true`).
5. Enable pruning in `dry-run` mode first, then switch to active pruning after revalidation.

## Memory rollback plan

1. Disable memory flags (`TORCH_MEMORY_ENABLED=false` and/or set ingest/retrieval/prune flags to `false`).
2. Stop memory maintenance scheduler processes.
3. Preserve database state for post-incident analysis; do not drop or rewrite memory tables during rollback.
4. Keep prune actions in `dry-run` (or disabled) until lifecycle policy and data integrity are revalidated.

## Prompt Versioning & State Backup

### How prompt changes are governed

Every agent prompt in `src/prompts/daily/` and `src/prompts/weekly/` must be changed through the governance workflow — direct file edits skip the archive and break rollback lineage.

**Proposal → Apply → Rollback cycle:**

```bash
# 1. Propose a change
torch-lock proposal create \
  --agent <agent> \
  --target src/prompts/daily/<agent>.md \
  --content /path/to/new.md \
  --reason "reason"

# 2. Review and apply
torch-lock proposal list --status pending
torch-lock proposal show  --id <id>
torch-lock proposal apply --id <id>   # archives old version, writes new
torch-lock proposal reject --id <id> --reason "..."

# 3. Inspect available versions
torch-lock rollback --target src/prompts/daily/<agent>.md --list

# 4. Roll back (defaults to most recent archive; falls back to git)
torch-lock rollback --target src/prompts/daily/<agent>.md
torch-lock rollback --target src/prompts/daily/<agent>.md --strategy <hash>
```

Archives are stored in `.torch/prompt-history/` with filenames that embed an ISO timestamp and SHA-256 hash (`<base>_<ts>_<hash>.md`) alongside a `.meta.json` sidecar recording who applied the change, why, and when.

### State backup

Runtime state lives outside git. Snapshot it before destructive operations or on a schedule:

```bash
torch-lock backup          # creates .torch/backups/<timestamp>/
torch-lock backup --list   # list all snapshots
```

Files captured per snapshot:
- `.scheduler-memory/memory-store.json` (agent long-term memory)
- `task-logs/daily/.scheduler-run-state.json` (scheduler deferral state)

See [docs/prompt-versioning.md](docs/prompt-versioning.md) for the full reference including restore steps and storage layout.


## Offline & Air-Gapped Installation

TORCH is designed to operate in diverse environments, including high-security, air-gapped, or offline networks where direct access to the npm registry is restricted.

### The Offline Bundle

The "Offline Bundle" is a standard npm package tarball (`.tgz`) generated during the build process. It contains the complete source code and dependency definitions required to run TORCH.

**Why use the bundle?**

1.  **Security & Integrity:** You can verify the checksum of the tarball before installing it. It creates a frozen snapshot of the code that doesn't change.
2.  **No Registry Dependency:** You can install it directly using `npm install ./torch-lock-0.1.0.tgz` without needing to connect to `registry.npmjs.org`.
3.  **Project Integration:** Unlike a binary executable, the tarball installs TORCH as a standard dependency in your `package.json`. This ensures:
    *   Scripts like `npm run lock:check` work natively.
    *   TORCH versioning is managed alongside your other dependencies.
    *   It works across all operating systems that support Node.js.

### Installation Instructions

1.  Download the tarball from the landing page or your internal artifact repository.
2.  Place it in your project root or a `vendor/` directory.
3.  Run the install command:
    ```bash
    npm install ./torch-lock-0.1.0.tgz
    ```
    *(Replace `0.1.0` with the actual version number)*

4.  Initialize TORCH:
    ```bash
    npx torch-lock init
    ```

## Included Resources

- `src/lib.mjs` — Core library logic (can be imported in scripts)
- `TORCH.md` — Protocol summary and usage
- `src/prompts/` — Generic scheduler prompts and flow
- `skills/` — Repository-local skill guides for agent onboarding and repeatable workflows
- `dashboard/` — Static lock dashboard assets

## NPM Scripts (for development)

If you are developing `torch-lock` itself:

- `npm run lock:check:daily`
- `npm run lock:check:weekly`
- `npm run lock:list`
- `npm run lock:lock` (manually acquire a lock)
- `npm run lock:health -- --cadence daily` (relay websocket + publish/read probe; writes history to `task-logs/relay-health/`)
- `npm run lock:complete` (manually complete a task)
- `npm run dashboard:serve`
- `npm test` (run validation, integration, and unit tests)
- `npm run test:unit:lock-backend` (run lock backend unit tests)
- `npm run test:extended-main` (run extended integration tests)
- `npm run test:playwright` (run Playwright tests)
- `npm run test:playwright:coverage` (run Playwright tests with coverage)
- `npm run test:playwright:ui` (run Playwright tests in UI mode)
- `npm run validate:scheduler` (validate scheduler roster, prompts, flow parity, and failure schema)
- `npm run lint` (run linter)
- `npm run scheduler:daily` (run full daily scheduler cycle)
- `npm run scheduler:weekly` (run full weekly scheduler cycle)
- `npm run report:lock-reliability` (aggregate recent scheduler logs into markdown+JSON reliability reports)
- `npm run torch:memory:list` (list memories)
- `npm run torch:memory:inspect` (inspect a memory)
- `npm run torch:remove` (remove TORCH from the project)
