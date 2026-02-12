# Test Audit Report - 2026-02-12

## Summary
The unit test suite passed successfully (680 tests). A critical issue where `tests/auth-service.test.mjs` was skipped (resulting in 10% coverage for `authService.js`) was identified and fixed, raising coverage to 62%. Several critical production files remain with low coverage.

## Test Run Details
*   **Command:** `node --import ./tests/test-helpers/setup-localstorage.mjs --test --experimental-test-coverage tests/**/*.test.mjs`
*   **Result:** 680 passed, 0 failed.
*   **Duration:** ~42s

## Critical Coverage Gaps
The following critical files have low coverage (< 50%):

| File | Line Coverage | Function Coverage | Impact |
|------|--------------|-------------------|--------|
| `js/webtorrent.js` | 12.25% | 4.00% | **Critical** (Playback core) |
| `js/userBlocks.js` | 18.92% | 26.47% | **High** (Moderation) |
| `js/nostr/nip46Client.js` | 27.42% | 44.59% | **High** (Remote Signing) |
| `js/views/VideoListView.js` | 48.81% | 36.04% | **Medium** (Main Feed UI) |

## Fixed Issues
1.  **Auth Service Tests Skipped:** `tests/auth-service.test.mjs` was using raw async blocks without `node:test` imports, causing the runner to skip it.
    *   **Fix:** Refactored to use `describe`/`test` from `node:test`.
    *   **Result:** `js/services/authService.js` coverage improved from 10% to 62%.
2.  **Console Noise:** Removed a leftover `console.log` in `tests/watchHistory/watch-history-telemetry.test.mjs`.

## Static Analysis Findings
*   **Time Dependency:** Extensive use of `setTimeout` found in `tests/nostr/client.test.mjs`, `tests/moderation/video-card.test.mjs`, and others. These are potential sources of flakiness.
*   **Skipped Tests:** `tests/nostr/sessionActor.test.mjs` skips a test when WebCrypto is unavailable.
*   **Network Calls:** No unmocked external network calls detected in unit tests (mocks appear to be used).

## Recommendations
1.  **Prioritize Webtorrent Tests:** Add unit tests for `js/webtorrent.js` to cover the torrent client wrapper logic.
2.  **Moderation Coverage:** Expand `tests/user-blocks.test.mjs` (if it exists) or create it to cover `js/userBlocks.js`.
3.  **Refactor Timeouts:** Replace `await new Promise(r => setTimeout(r, N))` with deterministic `waitFor` helpers in `tests/nostr/client.test.mjs` to reduce flakiness risk.
