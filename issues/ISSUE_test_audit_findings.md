# Test Audit Findings - 2025-02-18

## Overview
The daily test audit has identified significant coverage gaps and suspicious patterns in the test suite.

## Critical Coverage Gaps (< 70%)
1. **js/userBlocks.js** (25.77% statements) - Critical for moderation.
2. **js/relayManager.js** (56.75% statements) - Core networking logic.
3. **js/nostr/watchHistory.js** (58.14% statements) - User data integrity.
4. **js/services/authService.js** (Branches: 62.71%) - Auth flow reliability.
5. **js/nostr/dmDecryptWorker.js** (Branches: 31.66%) - Privacy/Security.

## Suspicious Patterns
- **91 files** contain suspicious patterns.
- **Network Dependence**: High usage of `fetch` / `WebSocket` without apparent mocking in unit tests (e.g., `tests/nostr/client.test.mjs`, `tests/services/attachmentService.test.mjs`).
- **Time Dependence**: Frequent use of `sleep`/`setTimeout` (e.g., `tests/login-modal-controller.test.mjs`).
- **Console Usage**: Tests logging to console (e.g., `tests/nostr/watchHistory.test.js` has 19 occurrences).

## Recommended Actions
1. **Immediate**: Create a "fixit" sprint to address coverage in `js/userBlocks.js` and `js/relayManager.js`.
2. **Refactor**: Replace `sleep()` calls with `waitFor()` or mock timers in `tests/login-modal-controller.test.mjs`.
3. **Infrastructure**: Introduce `msw` or `nock` for network mocking to remove `fetch` dependencies in unit tests.
