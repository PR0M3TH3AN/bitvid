# TORCH: Task Orchestration via Relay-Coordinated Handoff

TORCH is a portable Nostr-based task locking toolkit for multi-agent coordination.

## Why Run Torch? (The Cool Stuff)


TORCH isn't just another script—it's an operating system for your AI workforce. Here’s why it’s awesome:

- **Decentralized Coordination:** No central server required. Agents coordinate via Nostr relays like digital telepathy.
- **Platform Agnostic:** Whether you're running Jules, Codex, or Claude, TORCH is the universal language they all speak.
- **Long-Term Memory:** Built-in memory systems allow agents to store context, learn from mistakes, and get smarter over time.
- **Verifiable Handoffs:** Trust, but verify. Agents must pass tests and linters before they can mark a task as complete.
- **Self-Healing:** If an agent stalls or crashes, the scheduler detects the pulse loss and reassigns the work. The factory must grow.
- **Drop-in Divinity:** No complex SaaS integrations. Just drop the `torch` folder into your repo and you're live.

## Installation

Prerequisites:

- Node.js 22 or newer

First 5 minutes:

```bash
npm install https://github.com/PR0M3TH3AN/TORCH/archive/refs/heads/main.tar.gz \
  && npx --no-install torch-lock init

# sanity check (optional, but recommended)
npx --no-install torch-lock check --cadence daily

# start dashboard
npx --no-install torch-lock dashboard --port 4173 --host 127.0.0.1
```

> TORCH is distributed from GitHub tarballs and is not currently published to the npm registry.

## Development

For instructions on how to contribute to TORCH, including building, testing, and linting, please see [CONTRIBUTING.md](CONTRIBUTING.md).

Quick start:

```bash
npm install
npm run build
npm test
```

## Usage

### CLI

The `torch-lock` CLI allows you to check, lock, and list tasks.

```bash
# Check locks for a specific cadence
npx --no-install torch-lock check --cadence daily

# Lock a task for an agent
AGENT_PLATFORM=codex npx --no-install torch-lock lock --agent docs-agent --cadence daily

# List all active locks
npx --no-install torch-lock list

# Mark a task as completed (permanent)
AGENT_PLATFORM=codex npx --no-install torch-lock complete --agent docs-agent --cadence daily

# Convenience script for the above
npm run lock:complete -- --agent docs-agent --cadence daily

# Generic usage for lock completion
npm run lock:complete -- --agent <agent> --cadence <cadence>

# Initialize TORCH in a new repository
npx --no-install torch-lock init

# Update TORCH configuration and scripts
npx --no-install torch-lock update

# Remove TORCH completely from this project
npx --no-install torch-lock remove

# Run the Dashboard
npx --no-install torch-lock dashboard
```

### Scheduler

The scheduler automates the selection and execution of agents in a round-robin rotation.

```bash
# Run full daily scheduler cycle
npm run scheduler:daily

# Run full weekly scheduler cycle
npm run scheduler:weekly
```

### Memory CLI

The `torch-lock` CLI also supports memory operations:

```bash
# List memories (optional filters: --agent, --type, --tags, --pinned)
npx --no-install torch-lock list-memories --limit 5

# Inspect a specific memory
npx --no-install torch-lock inspect-memory --id <memory-id>

# Pin/Unpin a memory
npx --no-install torch-lock pin-memory --id <memory-id>
npx --no-install torch-lock unpin-memory --id <memory-id>

# Check memory stats
npx --no-install torch-lock memory-stats
```

### Prompt Governance & Versioning CLI

Agent prompts are changed through a governance workflow that archives the previous version before overwriting, enabling full rollback.

```bash
# Propose a change to an agent prompt
npx --no-install torch-lock proposal create \
  --agent my-agent \
  --target src/prompts/daily/my-agent.md \
  --content /path/to/new-content.md \
  --reason "Add missing EXIT CRITERIA section"

# List pending proposals
npx --no-install torch-lock proposal list
npx --no-install torch-lock proposal list --status pending

# Inspect or apply a proposal
npx --no-install torch-lock proposal show --id <proposal-id>
npx --no-install torch-lock proposal apply --id <proposal-id>
npx --no-install torch-lock proposal reject --id <proposal-id> --reason "..."

# List available archived versions of a prompt
npx --no-install torch-lock rollback --target src/prompts/daily/my-agent.md --list

# Roll back to the most recent archived version
npx --no-install torch-lock rollback --target src/prompts/daily/my-agent.md

# Roll back to a specific version by hash fragment
npx --no-install torch-lock rollback --target src/prompts/daily/my-agent.md --strategy <hash>
```

### State Backup CLI

Snapshot agent runtime state (long-term memory and scheduler state) to a timestamped directory under `.torch/backups/`.

```bash
# Create a snapshot
npx --no-install torch-lock backup

# List existing snapshots
npx --no-install torch-lock backup --list

# Write snapshot to a custom directory
npx --no-install torch-lock backup --output /path/to/backup-dir
```

See [docs/prompt-versioning.md](docs/prompt-versioning.md) for the full workflow, restore procedure, and storage layout.

### Configuration (`torch-config.json`)

Create a `torch-config.json` file in your project root to configure TORCH for your repository. You can use the included `torch-config.example.json` as a template.

Configuration options:

- `nostrLock.namespace` (d-tag/tag namespace)
- `nostrLock.relays` (array of relay URLs)
- `nostrLock.ttlSeconds` (lock duration in seconds)
- `nostrLock.queryTimeoutMs` (timeout for relay queries)
- `nostrLock.publishTimeoutMs` (per-relay publish timeout in ms)
- `nostrLock.minSuccessfulRelayPublishes` (minimum successful publishes before lock continues, default: `1`)
- `nostrLock.relayFallbacks` (optional fallback relay URLs used when primary relays fail quorum)
- `nostrLock.minActiveRelayPool` (minimum relays kept active even when others are quarantined, default: `1`)
- `nostrLock.dailyRoster` / `nostrLock.weeklyRoster` (explicit rosters)
- `dashboard.defaultCadenceView` (`daily`, `weekly`, or `all`)
- `dashboard.defaultStatusView` (`active` or `all`)
- `dashboard.hashtag` (custom hashtag for lock events)
- `scheduler.firstPromptByCadence.daily` / `.weekly` (first prompt to run)
- `scheduler.handoffCommandByCadence.daily` / `.weekly` (shell command run after lock acquisition; must use `SCHEDULER_AGENT`, `SCHEDULER_CADENCE`, `SCHEDULER_PROMPT_PATH` env vars)
- `scheduler.paused.daily` / `.weekly` (array of agent names to pause locally)
- `scheduler.strict_lock` (lock backend policy; when `false`, defers backend-unavailable failures before failing, default: `true`)
- `scheduler.degraded_lock_retry_window` (ms window for non-strict deferral of backend failures)
- `scheduler.max_deferrals` (max non-strict lock deferrals before recording a hard failure)

### Dashboard

The dashboard provides a live view of lock events.

```bash
npx --no-install torch-lock dashboard --port 4173 --host 127.0.0.1
# Open http://localhost:4173/dashboard/
```

By default, the dashboard binds to `127.0.0.1`. To allow external access, you can set `--host 0.0.0.0`. It is highly recommended to enable authentication if the dashboard is exposed to a network.

#### Authentication

The dashboard supports Basic Authentication. You can enable it by setting the `TORCH_DASHBOARD_AUTH` environment variable or the `dashboard.auth` field in `torch-config.json` with the format `username:password`.

## Removing TORCH

To completely remove TORCH from a project:

```bash
npx torch-lock remove
```

This removes the `torch/` directory, configuration files, runtime artifacts, host package.json scripts, and the npm package. Use `--force` to skip the confirmation prompt.

For manual removal steps and a full list of what gets cleaned up, see [docs/removal.md](docs/removal.md).

## Environment variables

You can override configuration using environment variables:

- `NOSTR_LOCK_NAMESPACE`
- `NOSTR_LOCK_HASHTAG`
- `NOSTR_LOCK_RELAYS` (comma-separated)
- `NOSTR_LOCK_TTL`
- `NOSTR_LOCK_QUERY_TIMEOUT_MS`
- `NOSTR_LOCK_PUBLISH_TIMEOUT_MS`
- `NOSTR_LOCK_MIN_SUCCESSFUL_PUBLISHES`
- `NOSTR_LOCK_RELAY_FALLBACKS` (comma-separated fallback relay URLs)
- `NOSTR_LOCK_MIN_ACTIVE_RELAY_POOL`
- `NOSTR_LOCK_DAILY_ROSTER` (comma-separated list of agents)
- `NOSTR_LOCK_WEEKLY_ROSTER` (comma-separated list of agents)
- `TORCH_CONFIG_PATH` (path to config file)
- `TORCH_DASHBOARD_AUTH` (Basic Auth `user:pass` for the dashboard)
- `AGENT_PLATFORM` (platform identifier, e.g. `codex`)
- `TORCH_MEMORY_ENABLED` (`true`/`false`; global memory kill switch, defaults to enabled)
- `TORCH_MEMORY_INGEST_ENABLED` (`true`/`false` or comma-separated canary `agent_id` allow list)
- `TORCH_MEMORY_RETRIEVAL_ENABLED` (`true`/`false` or comma-separated canary `agent_id` allow list)
- `TORCH_MEMORY_PRUNE_ENABLED` (`true`, `false`, or `dry-run`)

## Roster precedence

The lock CLI resolves roster names in this order:

1. `NOSTR_LOCK_DAILY_ROSTER` / `NOSTR_LOCK_WEEKLY_ROSTER` (comma-separated env overrides).
2. `torch-config.json` (`nostrLock.dailyRoster` / `nostrLock.weeklyRoster`).
3. `src/prompts/roster.json` (canonical scheduler roster included in the package).
4. Built-in fallback roster.

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
- `npm test` (run unit tests)
- `npm run test:unit:lock-backend` (run lock backend unit tests)
- `npm run test:extended-main` (run extended integration tests)
- `npm run validate:scheduler` (validate scheduler roster and prompts)
- `npm run lint` (run linter)
- `npm run scheduler:daily` (run full daily scheduler cycle)
- `npm run scheduler:weekly` (run full weekly scheduler cycle)
- `npm run report:lock-reliability` (aggregate recent scheduler logs into markdown+JSON reliability reports)
- `npm run torch:memory:list` (list memories)
- `npm run torch:memory:inspect` (inspect a memory)
- `npm run torch:remove` (remove TORCH from the project)





## Scheduler lock reliability reporting

Use the reporting hook below to inspect lock backend reliability trends by platform/cadence/error category/relay:

```bash
npm run report:lock-reliability
```

This writes:
- `artifacts/lock-reliability/lock-reliability-summary.md`
- `artifacts/lock-reliability/lock-reliability-summary.json`

Recommended cadence: run this at least weekly (or wire into your CI/cron scheduler) and compare `codex` vs other `platform` values.


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
