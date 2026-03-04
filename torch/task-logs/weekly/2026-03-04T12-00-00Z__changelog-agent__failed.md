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
Visual regression tests failed, specifically: `[visual] › tests/visual/kitchen-sink.spec.ts:41:5 › design system kitchen sink › renders default theme without regressions`. The received diff ratio was `0.014291668653924713` which exceeds the expected `0.001`.
