# Test Audit Report - 2026-02-23

## Summary
- **Test Runner:** Custom script `scripts/run-unit-tests.mjs` executing Node.js native test runner.
- **Coverage:** Not available in current environment (missing `c8` or similar tool).
- **Flakiness:** No flaky tests detected in sample run (Shard 1 x 3).
- **Static Analysis:** Identified several files using `node:assert` instead of `expect`.

## Failing Tests
None observed in captured logs. See `test-audit/test-run.log`.

## Flaky Tests
- **Matrix:** `test-audit/flakiness-matrix.json` (Empty)
- **Status:** Stable.

## Suspicious Tests
The following files were flagged for potentially zero assertions (using `expect`), but manual inspection reveals they likely use `node:assert`:
- `tests/nostr/nostrClientFacade.test.js`
- `tests/nostr/nip07Permissions.test.js`
- `tests/nostr/nip71.test.js`
- `tests/nostr/sessionActor.test.js`

## Coverage Gaps
Unable to determine due to missing coverage tool. Recommendation: Add `c8` to devDependencies to enable coverage collection for Node.js native tests.

## Recommendations
1.  **Enable Coverage:** Install `c8` and update `scripts/run-unit-tests.mjs` to support coverage collection.
2.  **Standardize Assertions:** Consider migrating `node:assert` usage to a consistent assertion library if desired, or update audit tooling to recognize `assert`.
3.  **Flakiness Monitoring:** Continue monitoring flakiness with larger sample sizes in CI.
