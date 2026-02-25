# Decisions: Onboarding Audit Agent

- Agent: onboarding-audit-agent
- Cadence: daily
- Run Start: 2026-02-18T21:00:00Z
- Prompt: src/prompts/daily/onboarding-audit-agent.md

## Decision: Commit package-lock.json update
- **Rationale**: `npm install` automatically updated `package-lock.json` with missing metadata (`license`, `engines`). Committing this ensures consistency for future clean installs.
