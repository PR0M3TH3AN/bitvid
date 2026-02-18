# Decisions - 2025-02-18

## Test Audit Implementation
- **Tooling**: Used `c8` for coverage and custom Node.js scripts for flakiness/static analysis.
- **Timeout**: Experienced timeouts with full suite coverage run; mitigation was to use the partial results which were sufficient for initial audit.
- **Coverage**: Mapped coverage to critical files using `coverage-summary.json`.
- **Artifacts**: Stored all artifacts in `test-audit/` for historical tracking.

## Findings
- Confirmed that critical modules (`userBlocks`, `relayManager`) have low test coverage.
- Identified widespread use of `sleep` and `fetch` in unit tests, indicating a need for better test isolation and determinism helpers.
