# Test Audit Report: 2026-02-15

## Summary
- **Date**: 2026-02-15
- **Test Runner**: Node.js built-in runner (`node:test`)
- **Total Tests**: ~370
- **Pass Rate**: 100% (based on available runs)
- **Coverage**: Mixed. Core services like `authService` are well covered (77%), but `userBlocks.js` (26%) and `relayManager.js` (50%) need attention.

## Findings

### 1. Suspicious Tests
The following tests were identified as suspicious due to having zero assertions or relying on anti-patterns:
- `tests/minimal-channel-profile.test.mjs`: Zero assertions (smoke test).
- `tests/ui/components/debug_hashtag_strip_helper.test.mjs`: Zero assertions.
- `tests/minimal-webtorrent.test.mjs`: Zero assertions.
- Heavy reliance on `setTimeout` and `sleep` in many tests (e.g., `tests/webtorrent-regression.test.mjs`, `tests/video-card-source-visibility.test.mjs`), which can lead to flakiness.

### 2. Coverage Gaps (Critical Files)
| File | Coverage | Status |
|------|----------|--------|
| `js/userBlocks.js` | 25.86% | **CRITICAL** |
| `js/ui/ambientBackground.js` | 33.02% | High |
| `js/relayManager.js` | 49.93% | Medium |
| `js/nostr/watchHistory.js` | 58.14% | Medium |
| `js/services/authService.js` | 77.34% | Good |
| `js/nostr/dmDecryptWorkerClient.js` | 96.85% | Excellent |

`js/userBlocks.js` implements critical moderation logic (blocking/muting) and its low coverage is a significant risk. It includes a custom Bech32 decoder which appears to be largely untested (or testing relies on `NostrTools` which bypasses it).

### 3. Flakiness
No flaky tests were definitively identified in the sample runs, though the `setTimeout` usage suggests potential for future flakiness.

## Remediation Plan

### Immediate Actions
1.  **Fix Zero Assertions**: Update `tests/minimal-channel-profile.test.mjs` to include explicit assertions.
2.  **Coverage Improvements**: Plan to add tests for `js/userBlocks.js`, specifically targeting the internal Bech32 implementation and error handling paths.

### Tickets / Issues
-   **ISSUE-001**: Increase test coverage for `js/userBlocks.js`.
    -   **Context**: Current coverage is 25%.
    -   **Action**: Add tests for internal Bech32 decoder (by simulating missing `NostrTools`) and edge cases in encryption/decryption ordering.
-   **ISSUE-002**: Refactor `setTimeout` usage in tests.
    -   **Context**: 50+ instances of `setTimeout` found.
    -   **Action**: Replace with deterministic `waitFor` helpers or mock timers.

## Logs
- `test_logs/TEST_LOG_2026-02-15_20-00-00.md`
- `test-audit/suspicious-tests.txt`
- `test-audit/coverage-gaps.json`
