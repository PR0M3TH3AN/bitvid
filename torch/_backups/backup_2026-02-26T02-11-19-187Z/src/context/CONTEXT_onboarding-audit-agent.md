# Context: Onboarding Audit Agent

- Agent: onboarding-audit-agent
- Cadence: daily
- Run Start: 2026-02-18T21:00:00Z
- Prompt: src/prompts/daily/onboarding-audit-agent.md

## Goal
Ensure fresh developer onboarding works from a clean checkout by validating README onboarding steps.

## Scope
- Validating onboarding from a clean environment.
- Executing `npm install`, `npm run build`, `npm test`, `npm run lint`.
- Documenting failures.

## Constraints
- Follow docs first.
- Minimal churn.
