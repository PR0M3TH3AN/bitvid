# Context: Perf Agent 2026-02-22

## Goal
Execute daily performance audit scan to identify potential bottlenecks in background tasks, concurrency, and heavy computations.

## Scope
- Scan `js/` directory for known performance anti-patterns.
- Generate report artifacts.

## Assumptions
- Grep patterns cover major performance risks.
- Scheduler environment has access to `js/` directory.

## Definition of Done
- `perf/hits-2026-02-22.json` generated.
- `daily-perf-report-2026-02-22.md` created.
