# TORCH: Task Orchestration via Relay-Coordinated Handoff

TORCH is a decentralized task-locking protocol for multi-agent development. It uses the Nostr protocol to coordinate AI coding agents (Claude Code, Google Jules, OpenAI Codex, etc.) working in parallel on the same repository, preventing them from colliding on the same task.

## The Problem

When multiple AI agents operate on a shared codebase, they need a way to signal "I'm working on this" so other agents don't duplicate the effort. The traditional approach uses draft pull requests as locks, but this breaks down in practice:

- **Sandboxed environments** (e.g., Google Jules) block `git push` and don't provide GitHub CLI tools.
- **Token management** adds operational overhead — GitHub PATs must be created, rotated, and injected into each agent environment.
- **Platform coupling** ties the coordination mechanism to GitHub specifically, making it non-portable.
- **Complex reasoning chains** force agents to parse jq pipelines, handle multi-method fallbacks, and perform manual race detection, consuming tokens and increasing error rates.

## The Solution

TORCH replaces all of that with a single protocol:

1. An agent **publishes a Nostr event** to claim a task.
2. Other agents **query the relay** to see what's claimed.
3. Locks **auto-expire** via NIP-40 — no cleanup required.
4. Each lock uses an **ephemeral keypair** — no secrets to manage.

The entire locking mechanism is handled by a single script (`scripts/agent/nostr-lock.mjs`) that any agent can call with two commands. The agent's reasoning chain reduces to: "run check, run lock, read exit code."

## How It Works

### Protocol Overview

```
Agent A                    Nostr Relays                   Agent B
  |                            |                            |
  |-- check (query locks) ---->|                            |
  |<--- JSON: locked=[] -------|                            |
  |                            |                            |
  |-- lock (publish event) --->|                            |
  |<--- OK (published) --------|                            |
  |                            |                            |
  |-- race check (re-query) -->|                            |
  |<--- only my event ---------|                            |
  |                            |                            |
  | RACE CHECK: won            |                            |
  | (begin work)               |                            |
  |                            |                            |
  |                            |<-- check (query locks) ----|
  |                            |--- JSON: locked=[A] ------>|
  |                            |                            |
  |                            |    (Agent B picks          |
  |                            |     a different task)      |
  |                            |                            |
  | (2 hours pass)             |                            |
  |                            |--- lock auto-expires ----->|
  |                            |                            |
```

### Event Schema (NIP-78 / Kind 30078)

Each lock is a NIP-33 parameterized replaceable event:

```json
{
  "kind": 30078,
  "pubkey": "<ephemeral-pubkey>",
  "created_at": 1739484362,
  "tags": [
    ["d", "bitvid-lock/daily/nip-research-agent/2026-02-13"],
    ["t", "bitvid-agent-lock"],
    ["t", "bitvid-lock-daily"],
    ["t", "bitvid-lock-daily-2026-02-13"],
    ["expiration", "1739491562"]
  ],
  "content": "{\"agent\":\"nip-research-agent\",\"cadence\":\"daily\",\"status\":\"started\",\"date\":\"2026-02-13\",\"platform\":\"jules\",\"lockedAt\":\"2026-02-13T20:06:02.000Z\",\"expiresAt\":\"2026-02-13T22:06:02.000Z\"}"
}
```

**Tag breakdown:**

| Tag | Purpose |
|-----|---------|
| `d` | NIP-33 identifier: `<namespace>/<cadence>/<agent>/<date>`. Makes the event replaceable per agent per day. |
| `t` (bitvid-agent-lock) | Broad category filter for all TORCH lock events. |
| `t` (bitvid-lock-daily) | Cadence-specific filter. |
| `t` (bitvid-lock-daily-2026-02-13) | Date-specific filter for precise relay-side queries. |
| `expiration` | NIP-40 auto-expiration timestamp. Relays may garbage-collect after this time. |

### Ephemeral Keys

Each `lock` invocation generates a fresh secp256k1 keypair:

```
generateSecretKey() → 32 random bytes → sign event → discard key
```

The private key exists only in process memory for the duration of the script. It is never written to disk, never stored, never reused. The public key is included in the event for Nostr protocol compliance but has no ongoing identity or authority.

This means:
- **No secret management.** No tokens, no `.env` files, no rotation schedules.
- **No key reuse.** Every lock is cryptographically independent.
- **No cleanup authority.** The lock can't be manually deleted (the key is gone), but it doesn't need to be — NIP-40 expiration handles it.

### Race Detection

When two agents try to claim the same task simultaneously:

1. Both agents run `check` — neither sees a lock.
2. Both agents run `lock` — both publish events to relays.
3. Both agents re-query after a 1.5-second propagation delay.
4. Both agents see two lock events for the same task.
5. The event with the **earlier `created_at`** wins.
6. The loser exits with code 3. The winner proceeds.

The losing agent's event remains on relays but is harmless — it auto-expires, and it doesn't prevent the winner from working. Other agents checking later see both events but this just means the task appears (correctly) as locked.

### Auto-Expiration

Locks expire via NIP-40 after a configurable TTL (default: 2 hours). This provides:

- **Self-healing.** If an agent crashes mid-task, its lock doesn't persist forever.
- **No stale state.** No equivalent of orphaned draft PRs blocking future runs.
- **Zero maintenance.** No cron jobs to clean up expired locks, no manual intervention.

The client-side `check` command also filters by expiration, so even if a relay hasn't garbage-collected an expired event, it won't appear in the exclusion set.

## Usage

### Commands

**Check what's locked:**
```bash
node scripts/agent/nostr-lock.mjs check --cadence daily
```
Returns JSON to stdout:
```json
{
  "cadence": "daily",
  "date": "2026-02-13",
  "locked": ["audit-agent", "ci-health-agent"],
  "available": ["const-refactor-agent", "content-audit-agent", ...],
  "lockCount": 2,
  "locks": [...]
}
```

**Claim a task:**
```bash
AGENT_PLATFORM=jules \
node scripts/agent/nostr-lock.mjs lock \
  --agent nip-research-agent \
  --cadence daily
```
Returns key=value pairs to stdout:
```
LOCK_STATUS=ok
LOCK_EVENT_ID=ea2724c76d2bd707...
LOCK_PUBKEY=7ee606dd0619e339...
LOCK_AGENT=nip-research-agent
LOCK_CADENCE=daily
LOCK_DATE=2026-02-13
LOCK_EXPIRES=1739491562
LOCK_EXPIRES_ISO=2026-02-13T22:06:02.000Z
```

Exit codes:
- `0` — Lock acquired.
- `3` — Race lost or task already locked.
- `2` — Relay error.
- `1` — Usage error.

**List all active locks (human-readable):**
```bash
node scripts/agent/nostr-lock.mjs list
```

**Test without publishing:**
```bash
node scripts/agent/nostr-lock.mjs lock --agent test --cadence daily --dry-run
```

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `NOSTR_LOCK_RELAYS` | `wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net` | Comma-separated relay URLs |
| `NOSTR_LOCK_TTL` | `7200` (2 hours) | Lock expiration in seconds |
| `AGENT_PLATFORM` | `unknown` | Platform identifier included in lock metadata |

## Integration with the Scheduler

The bitvid scheduler uses TORCH as its sole coordination mechanism. The full flow is documented in `docs/agents/prompts/scheduler-flow.md`, but the TORCH-specific part is just two steps:

```bash
# 1. Build exclusion set
node scripts/agent/nostr-lock.mjs check --cadence daily
# → Use the "locked" array to skip already-claimed agents

# 2. Claim the selected agent
AGENT_PLATFORM=jules \
node scripts/agent/nostr-lock.mjs lock --agent <agent-name> --cadence daily
# → Exit 0: proceed with work
# → Exit 3: pick a different agent
```

The scheduler meta prompts (`docs/agents/prompts/META_PROMPTS.md`) embed these commands directly, so agents execute them without needing to understand the underlying protocol.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Agent Platforms                       │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Claude Code  │  │ Google Jules│  │ OpenAI Codex│     │
│  │             │  │             │  │             │      │
│  │ nostr-lock  │  │ nostr-lock  │  │ nostr-lock  │     │
│  │   .mjs      │  │   .mjs      │  │   .mjs      │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │              │
└─────────┼────────────────┼────────────────┼──────────────┘
          │                │                │
          │     WebSocket (NIP-01)          │
          │                │                │
┌─────────▼────────────────▼────────────────▼──────────────┐
│                    Nostr Relay Network                     │
│                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │relay.damus.io│ │  nos.lol     │ │relay.primal  │     │
│  │              │ │              │ │  .net         │     │
│  │  Kind 30078  │ │  Kind 30078  │ │  Kind 30078  │     │
│  │  lock events │ │  lock events │ │  lock events  │     │
│  │  (NIP-40     │ │  (NIP-40     │ │  (NIP-40      │     │
│  │   auto-exp)  │ │   auto-exp)  │ │   auto-exp)   │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│                                                          │
│  Events replicate across relays. Queries go to all.      │
│  Publishing succeeds if at least 1 relay accepts.        │
└──────────────────────────────────────────────────────────┘
```

### Dependencies

TORCH uses only packages already in the bitvid project:

- **nostr-tools** (v2.19.4) — Key generation, event signing, relay pool
- **ws** (v8.19.0) — WebSocket for Node.js relay connections

No additional dependencies are needed.

## Why Nostr?

The bitvid project is built on Nostr. Using Nostr for agent coordination means:

1. **No new infrastructure.** Public relays already exist and are free to use.
2. **No platform coupling.** Works with any agent platform that has Node.js and WebSocket access, regardless of their relationship with GitHub.
3. **No credentials.** Ephemeral keys eliminate the entire category of secret management.
4. **Protocol-native race resolution.** NIP-33 replaceable events and relay-side ordering provide deterministic conflict resolution without custom logic.
5. **Self-healing by default.** NIP-40 expiration means locks clean themselves up.
6. **Dogfooding.** A Nostr project using Nostr for its own development tooling.

## Toward a Generalizable Drop-In

TORCH is designed to be extracted from bitvid and used in any repository. The components that would need to be generalized:

| Component | Current State | To Generalize |
|-----------|--------------|---------------|
| `nostr-lock.mjs` | Hardcoded bitvid agent rosters | Accept roster via config file or CLI flag |
| Tag namespace | `bitvid-agent-lock` | Configurable project prefix |
| `d` tag pattern | `bitvid-lock/<cadence>/<agent>/<date>` | `<project>-lock/<cadence>/<agent>/<date>` |
| Relay defaults | 3 hardcoded relays | Config file with sensible defaults |
| Scheduler flow | bitvid-specific docs | Template scheduler docs with project placeholders |
| Agent rosters | Inline arrays in the script | External `torch.config.json` or similar |

A future `torch` npm package could look like:

```bash
# Install
npm install --save-dev @bitvid/torch

# Initialize in a new repo
npx torch init --project myproject --relays wss://relay.damus.io

# Creates:
#   torch.config.json     — project name, relays, TTL, roster
#   scripts/torch-lock.mjs — pre-configured lock script
#   docs/torch-scheduler.md — template scheduler flow

# Use in agent prompts
npx torch check --cadence daily
npx torch lock --agent my-agent --cadence daily
```

The protocol itself (NIP-78 events with NIP-40 expiration) is already generic. The bitvid-specific parts are just the roster definitions and tag namespaces.

## Related Files

| File | Purpose |
|------|---------|
| `scripts/agent/nostr-lock.mjs` | TORCH lock script (check, lock, list) |
| `docs/agents/prompts/scheduler-flow.md` | Scheduler procedure using TORCH |
| `docs/agents/prompts/META_PROMPTS.md` | Agent meta prompts with TORCH commands |
| `AGENTS.md` | Task Claiming Protocol referencing TORCH |
| `scripts/agents/claim-audit.mjs` | Legacy claim audit (predates TORCH) |

## NIPs Referenced

| NIP | Usage in TORCH |
|-----|---------------|
| [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) | Basic event structure and relay communication |
| [NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md) | Parameterized replaceable events (d-tag uniqueness) |
| [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) | Expiration tag for auto-expiring locks |
| [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) | Application-specific data (Kind 30078) |
