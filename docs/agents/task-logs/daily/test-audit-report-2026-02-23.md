# Test Audit Report - 2026-02-23

## Summary
- **Status**: FAIL
- **Test Command**: (Check `test_logs/`)
- **Coverage**: Skipped (missing `c8` / `@vitest/coverage-v8`)

## Flakiness & Failures
- **Failures**: 3/3 runs failed.

### Failure Details
- `not ok 14 - load applies same-timestamp updates deterministically with overlap fetch`

### Run Matrix
| Iteration | Passed | TAP Failure |
|---|---|---|
| 1 | ❌ | Yes |
| 2 | ❌ | Yes |
| 3 | ❌ | Yes |

## Suspicious Tests (Static Analysis)

### Zero Assertions (Heuristic)
These test files contain `test(` or `describe(` but no obvious assertion keywords.
- tests/e2e/cache-upgrade-smoke.spec.ts
- tests/embed_playback_check.spec.mjs
- tests/minimal-webtorrent.test.mjs
- tests/ui/components/debug_hashtag_strip_helper.test.mjs
- tests/visual/reduced-motion.spec.ts

### Skipped or Focused Tests (`.skip`, `.only`)
- tests/nostr/sessionActor.test.mjs:20:t.skip("WebCrypto not available in this environment");

### Timing Dependencies (`setTimeout`, `sleep`)
Found 209 occurrences. Examples:
- `js/adminListStore.js:566:setTimeout(() => {`
- `js/app/authSessionCoordinator.js:714:new Promise((resolve) => setTimeout(resolve, FEED_SYNC_TIMEOUT_MS)),`
- `js/app/authSessionCoordinator.js:1385:setTimeout(resolve, 0);`
- `js/app.js:960:setTimeout(() => {`
- `js/channelProfile.js:4126:setTimeout(() => {`
- `js/docsView.js:582:: (callback) => setTimeout(callback, 0);`
- `js/index.js:807:timeoutId = window.setTimeout(() => {`
- `js/nostr/adapters/nip07Adapter.js:31:await new Promise((resolve) => setTimeout(resolve, delay));`
- `js/nostr/client.js:1443:timeoutId = setTimeout(() => {`
- `js/nostr/dmDecryptWorkerClient.js:112:const timeoutId = setTimeout(() => {`
- ... and 199 more.

## Coverage Gaps
- **Critical**: Coverage metrics could not be generated.
- **Action**: Install `c8` or configure `vitest` coverage.

## Recommendations
1. **Fix Failures**: Investigate any failures listed above.
2. **Remove Skips**: Address skipped tests.
3. **Reduce Timing Flakes**: Refactor tests using real `setTimeout` to use mock timers or deterministic waits.
4. **Tooling**: Add `c8` to `devDependencies` to enable coverage reporting for Node.js native runner.
