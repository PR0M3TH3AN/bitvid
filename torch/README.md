# TORCH Extract (Portable Folder)

This folder is a repo-ready extraction of TORCH so you can move it into a standalone project.

## Included

- `src/nostr-lock.mjs` — Generic lock/check/list CLI
- `src/docs/TORCH.md` — Protocol summary and usage
- `src/prompts/` — Generic scheduler prompts and flow

## Drop-in notes

1. Copy this `torch/` directory into your destination repository.
2. Ensure dependencies are available:
   - `nostr-tools`
   - `ws`
3. Update rosters via env vars:
   - `NOSTR_LOCK_DAILY_ROSTER`
   - `NOSTR_LOCK_WEEKLY_ROSTER`
4. Optionally set a namespace per repo:
   - `NOSTR_LOCK_NAMESPACE=my-project`

## Example

```bash
NOSTR_LOCK_NAMESPACE=my-project \
AGENT_PLATFORM=codex \
node src/nostr-lock.mjs lock --agent docs-agent --cadence daily
```

## Agent dashboard (static page)

TORCH includes a standalone dashboard page at `dashboard/index.html` that listens for
`kind:30078` lock events tagged with `#torch-agent-lock`.

Open it directly in a browser:

```bash
xdg-open dashboard/index.html
```

Or serve the folder with a static HTTP server:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173/dashboard/`.
