# Context: bitvid-perf-agent (Daily Run)

## Goal
Daily, measurable improvement of app responsiveness by finding and fixing background CPU/network work that degrades UX.

## Scope
- Focus on P0 (Login/auth blocking), P1 (Initial UI responsiveness), P2 (Heavy user features).
- Docs audit: Ensure `/content` upload docs match reality.
- Safe, incremental changes only.

## Assumptions
- Branch is `unstable`.
- We are in a simulated agent environment.

## Definition of Done
- Performance issues identified and logged.
- At least one safe fix implemented (if applicable).
- Docs audited.
- `daily-perf-report` generated.
- All changes verified and linted.
