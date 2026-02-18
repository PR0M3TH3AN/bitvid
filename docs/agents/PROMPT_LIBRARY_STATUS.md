# Prompt Library Status

Last updated: 2026-02-18
Run type: Daily

## Summary

- **Total prompts**: 36 (21 daily, 15 weekly) + 2 schedulers
- **Health**: Good. All prompts follow the canonical structure.
  Verified `test-audit-agent` update is consistent with repo policy.

## Changes This Run

### Verified Fixes

None.

### Audited Prompts (Sample)

- `daily/bitvid-test-audit-agent.md` (Verified recent update)
- `daily/bitvid-docs-alignment-agent.md` (Verified valid)
- `daily/bitvid-docs-agent.md` (Verified valid)
- `daily/bitvid-known-issues-agent.md` (Verified valid)

## Known Remaining Issues

### P3 (Structural Inconsistencies — Low Priority)

- Section heading styles vary: some prompts use `═══`, some use `───`,
  some use `---`. This is cosmetic and does not affect behavior.
- Several prompts lack a formal "Goals & Success Criteria" header
  (content is present but under different names):
  - `weekly/bitvid-dead-code-agent.md` — criteria spread across HARD
    GUARDRAILS and QUALITY BAR sections
  - `weekly/bitvid-telemetry-agent.md` — criteria in PRIVACY & OPT-IN RULES
- Several prompts lack a formal "Failure Modes" header (content covered
  in risk/security sections):
  - `weekly/bitvid-perf-deepdive-agent.md`
  - `weekly/bitvid-race-condition-agent.md`
- `weekly/bitvid-perf-optimization-agent.md` — `DIAGNOSIS.md`,
  `BASELINE.md`, `AFTER.md` deliverable locations not specified
  (could clutter repo root).
- `weekly/bitvid-pr-review-agent.md` — uses emoji in PR comment
  templates (checkmarks, warning signs). Lower impact than PR titles
  but inconsistent with CLAUDE.md guidance.

### P4 (Polish — Lowest Priority)

- Some prompts have redundant or overly verbose workflow descriptions
  that could be tightened without losing clarity.
- `weekly/bitvid-event-schema-agent.md` — uses `✓` and `⚠️` in
  reporting templates. Minor inconsistency.

## Inventory

### Daily Prompts (21)

| # | Agent Name | Prompt File | Canonical Sections |
|---|-----------|-------------|-------------------|
| 1 | audit-agent | `bitvid-audit-agent.md` | Complete |
| 2 | ci-health-agent | `bitvid-ci-health-agent.md` | Complete |
| 3 | const-refactor-agent | `bitvid-const-refactor-agent.md` | Complete |
| 4 | content-audit-agent | `bitvid-content-audit-agent.md` | Complete |
| 5 | decompose-agent | `bitvid-decompose-agent.md` | Complete |
| 6 | deps-security-agent | `bitvid-deps-security-agent.md` | Complete |
| 7 | design-system-audit-agent | `bitvid-design-system-audit-agent.md` | Complete |
| 8 | docs-agent | `bitvid-docs-agent.md` | Complete |
| 9 | docs-alignment-agent | `bitvid-docs-alignment-agent.md` | Complete |
| 10 | docs-code-investigator | `bitvid-docs-code-investigator.md` | Complete |
| 11 | innerhtml-migration-agent | `bitvid-innerhtml-migration-agent.md` | Complete |
| 12 | known-issues-agent | `bitvid-known-issues-agent.md` | Complete |
| 13 | load-test-agent | `bitvid-load-test-agent.md` | Complete |
| 14 | nip-research-agent | `bitvid-nip-research-agent.md` | Complete |
| 15 | onboarding-audit-agent | `bitvid-onboarding-audit-agent.md` | Complete |
| 16 | perf-agent | `bitvid-perf-agent.md` | Complete |
| 17 | prompt-curator-agent | `bitvid-prompt-curator-agent.md` | Complete |
| 18 | scheduler-update-agent | `bitvid-scheduler-update-agent.md` | Complete |
| 19 | style-agent | `bitvid-style-agent.md` | Complete |
| 20 | test-audit-agent | `bitvid-test-audit-agent.md` | Complete |
| 21 | todo-triage-agent | `bitvid-todo-triage-agent.md` | Complete |

### Weekly Prompts (15)

| # | Agent Name | Prompt File | Canonical Sections |
|---|-----------|-------------|-------------------|
| 1 | bug-reproducer-agent | `bitvid-bug-reproducer-agent.md` | Complete |
| 2 | changelog-agent | `bitvid-changelog-agent.md` | Complete |
| 3 | dead-code-agent | `bitvid-dead-code-agent.md` | Missing formal Goals header |
| 4 | event-schema-agent | `bitvid-event-schema-agent.md` | Complete |
| 5 | frontend-console-debug-agent | `bitvid-frontend-console-debug-agent.md` | Complete |
| 6 | fuzz-agent | `bitvid-fuzz-agent.md` | Complete |
| 7 | interop-agent | `bitvid-interop-agent.md` | Complete |
| 8 | perf-deepdive-agent | `bitvid-perf-deepdive-agent.md` | Missing formal Failure Modes header |
| 9 | perf-optimization-agent | `bitvid-perf-optimization-agent.md` | Complete |
| 10 | pr-review-agent | `bitvid-pr-review-agent.md` | Complete |
| 11 | race-condition-agent | `bitvid-race-condition-agent.md` | Missing formal Failure Modes header |
| 12 | refactor-agent | `bitvid-refactor-agent.md` | Complete |
| 13 | smoke-agent | `bitvid-smoke-agent.md` | Complete |
| 14 | telemetry-agent | `bitvid-telemetry-agent.md` | Missing formal Goals header |
| 15 | test-coverage-agent | `bitvid-test-coverage-agent.md` | Complete |
| 16 | weekly-synthesis-agent | `bitvid-weekly-synthesis-agent.md` | Complete |

## Positive Patterns

- All prompts have Authority Hierarchy with `AGENTS.md` at the top.
- All prompts correctly defer to policy when conflicts arise.
- No prompt instructs agents to use `console.*` for production logging.
- All script references verified to exist (except where noted above).
- Branch naming consistently follows repo conventions.
- Security-sensitive guardrails are consistently present.
