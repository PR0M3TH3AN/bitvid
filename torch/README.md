# TORCH (Standalone)

TORCH is a portable Nostr-based task locking toolkit for multi-agent coordination.

## First-run quickstart

From the repository root:

```bash
npm install
npm run lock:check:daily
AGENT_PLATFORM=codex npm run lock:lock -- --agent docs-agent --cadence daily
npm run lock:list
```

Optional dashboard:

```bash
npm run dashboard:serve
# then open http://localhost:4173/dashboard/
```

## Included

- `src/nostr-lock.mjs` — Generic lock/check/list CLI
- `src/docs/TORCH.md` — Protocol summary and usage
- `src/prompts/` — Generic scheduler prompts and flow
- `examples/bitvid/` — Bitvid-style scheduler overlay examples adapted for standalone TORCH paths
- `dashboard/index.html` — Static lock dashboard

## CLI dependencies

Declared in `package.json` and pinned:

- `nostr-tools@2.19.4`
- `ws@8.19.0`

## NPM script helpers

- `npm run lock:check:daily`
- `npm run lock:check:weekly`
- `npm run lock:list`
- `npm run lock:lock -- --agent <agent-name> --cadence <daily|weekly>`
- `npm run dashboard:serve`

## Environment variables

- `NOSTR_LOCK_NAMESPACE`
- `NOSTR_LOCK_RELAYS`
- `NOSTR_LOCK_TTL`
- `NOSTR_LOCK_DAILY_ROSTER`
- `NOSTR_LOCK_WEEKLY_ROSTER`
- `AGENT_PLATFORM`

## Example

```bash
NOSTR_LOCK_NAMESPACE=my-project \
AGENT_PLATFORM=codex \
node src/nostr-lock.mjs lock --agent docs-agent --cadence daily
```
