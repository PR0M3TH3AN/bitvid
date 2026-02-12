# Test Audit Report (2025-02-18)

## Summary
The test suite is functional but slow (~6m+ if run fully with retry). Overall line coverage is ~42%, with critical gaps in `authService.js` (10%) and `playbackCoordinator.js` (9%). Static analysis reveals widespread usage of `setTimeout` in tests, which contributes to potential flakiness and slowness.

## Test Run
-   **Environment**: Node.js v22 (experimental-test-coverage enabled)
-   **Result**: 361 tests passed, 0 failed.
-   **Flakiness**: Unable to fully assess due to timeout (suite > 400s), but timeouts in test code indicate risk.

## Coverage Gaps (Critical Files)
| File | Coverage (Line) | Criticality |
| :--- | :--- | :--- |
| `js/services/authService.js` | 10.16% | **P0** (Login/Security) |
| `js/app/playbackCoordinator.js` | 9.70% | **P0** (Core Feature) |
| `js/userBlocks.js` | 18.92% | **P1** (Moderation) |
| `js/relayManager.js` | 49.94% | **P1** (Network) |
| `js/nostr/watchHistory.js` | 46.24% | **P1** (User Data) |
| `js/nostr/dmDecryptWorkerClient.js`| 44.09% | **P1** (Privacy) |

## Findings & Smells
1.  **Low Coverage in Auth**: `authService.js` is barely tested. It handles login, key management, and profile hydration.
2.  **Timeouts in Tests**: Found 19 instances of `setTimeout` in tests. `tests/nostr/dm-direct-message-flow.test.mjs` uses `setTimeout(r, intervalMs)` and `setTimeout(resolve, 100)` to wait for events, which is fragile.
3.  **Console Logs**: 20+ instances of `console.log` in test files.
4.  **Slow Tests**: The suite takes too long to run repeatedly for flakiness checks.

## Recommendations
1.  **Fix P0 Coverage**: Add unit tests for `authService.js` (login flows, error handling).
2.  **Refactor Timeouts**: Replace `setTimeout` with `waitFor` helpers or event listeners in `dm-direct-message-flow.test.mjs`.
3.  **Cleanup**: Remove `console.log` from tests.

## Remediation Plan
-   **Action**: Create a PR to add tests for `js/services/authService.js`.
-   **Target**: Increase coverage for `authService` to > 30% by testing the public `login` and `logout` methods.
