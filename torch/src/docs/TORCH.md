# TORCH: Task Orchestration via Relay-Coordinated Handoff

TORCH is a decentralized task-locking protocol for multi-agent software development.

## Quick start

```bash
# Check active locks
node src/nostr-lock.mjs check --cadence daily

# Claim a task
AGENT_PLATFORM=codex node src/nostr-lock.mjs lock --agent docs-agent --cadence daily

# List all active locks
node src/nostr-lock.mjs list
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
- `NOSTR_LOCK_RELAYS`
- `NOSTR_LOCK_TTL`
- `NOSTR_LOCK_DAILY_ROSTER`
- `NOSTR_LOCK_WEEKLY_ROSTER`
- `AGENT_PLATFORM`

## Exit codes

- `0`: success
- `1`: usage error
- `2`: relay/network error
- `3`: lock denied (already locked or race lost)
