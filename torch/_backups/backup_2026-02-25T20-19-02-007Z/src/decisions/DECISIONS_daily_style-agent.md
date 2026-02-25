---
agent: style-agent
cadence: daily
run-start: 2026-02-15T08:00:00Z
prompt: src/prompts/daily/style-agent.md
---

# Decisions: Style Agent Daily Run

## Decision 1: Use `npm run lint`
**Rationale:** It is the standard linting command defined in `package.json`.

## Decision 2: Use `node scripts/check-innerhtml.mjs` for inline style check
**Rationale:** The script exists and provides the required verification, as `npm run lint:inline-styles` is missing.
