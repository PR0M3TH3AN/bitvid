# Test Audit Report: 2026-02-17

## Summary
- **Status**: ⚠️ Failed / Timed Out
- **Runner**: `node scripts/run-unit-tests.mjs`
- **Total Duration**: > 400s (Timed Out)
- **Coverage**: Partial data collected.

## Critical Issues
### 1. Test Suite Timeout
The full unit test suite timed out after 400s (6.6 minutes).
The primary bottleneck appears to be `tests/profile-modal-controller.test.mjs`, which took over 60 seconds to run and eventually timed out when run individually with a 60s limit. Individual tests within it took 3s, 5s, and 10s.

### 2. Slow Tests
- `tests/profile-modal-controller.test.mjs`:
  - `Profile modal navigation buttons toggle active state`: ~10.8s
  - `Add profile request suspends focus trap and elevates login modal`: ~5.1s
  - `Profile modal Escape closes and restores trigger focus`: ~3.5s

### 3. Suspicious Patterns
- **SetTimeout Usage**: Found numerous instances of `setTimeout` in tests, which contributes to slowness and flakiness.
  - `tests/profile-modal-controller.test.mjs` uses `setTimeout(resolve, 0)` which is likely not the cause of the 10s delay, implying other blocking operations or implicit waits.
  - `tests/video-card-source-visibility.test.mjs` mocks `requestAnimationFrame` with `setTimeout`.

## Coverage
Partial coverage data was logged to `test-audit/coverage-run.log`.
The process timed out before full completion, but `c8` output a coverage table for the tests that ran.

## Remediation Plan
1.  **Investigate `tests/profile-modal-controller.test.mjs`**: This file is a major performance regression. It likely renders complex DOM or has inefficient polling.
2.  **Optimize Test Runner**: Consider parallelizing tests (sharding is supported but currently running sequentially in CI).
3.  **Refactor `setTimeout`**: Replace arbitrary sleeps with `waitFor` or mock timers where possible.

## Artifacts
- `test-audit/coverage-run.log`: partial coverage output.
- `test-audit/timeouts.txt`: list of `setTimeout` usages.
- `test-audit/console_logs.txt`: list of `console.log` usages.
