# TORCH Extract (Portable Folder)

This folder is a repo-ready extraction of TORCH so you can move it into a standalone project.

## Included

- `src/nostr-lock.mjs` — Generic lock/check/list CLI
- `src/docs/TORCH.md` — Protocol summary and usage
- `src/prompts/` — Generic scheduler prompts and flow
- `examples/bitvid/` — Bitvid-specific scheduler overlay examples

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

## Using the bitvid example overlay in a new host project

The files in `examples/bitvid/` are intentionally preserved as a concrete, real-world overlay:

- `daily-scheduler.md`
- `weekly-scheduler.md`
- `scheduler-flow.md`
- `META_PROMPTS.md`

They include the exact bitvid command paths and full roster mappings as examples.

To adapt this for another host project:

1. Copy `examples/bitvid/` into your project prompt area (or duplicate it as a new overlay directory like `examples/<your-project>/`).
2. Replace path references to your host project's structure (for example, change:
   - `docs/agents/prompts/...`
   - `docs/agents/task-logs/...`
   - `node scripts/agent/nostr-lock.mjs ...`
   to your project-specific locations).
3. Replace daily/weekly roster tables with your own agent names and prompt filenames.
4. Update `AGENT_PLATFORM=...` defaults in `META_PROMPTS.md` if your runtime uses a different platform value.
5. Keep `src/prompts/*` generic; store host-specific behavior in overlays so TORCH remains portable.

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
