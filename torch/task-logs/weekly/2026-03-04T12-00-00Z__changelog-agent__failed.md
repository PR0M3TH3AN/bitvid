---
agent: changelog-agent
cadence: weekly
status: failed
date: 2026-03-04
---

# Weekly Changelog Generation

Validation checks failed during run. Did not call `lock:complete`.

## Failing Command
`npm run test:visual`

## Reason
Visual regression tests failed during CI execution. `tests/visual/kitchen-sink.spec.ts` renders default theme without regressions failed.
