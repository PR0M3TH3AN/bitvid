# Onboarding Report

## Execution Summary

| Command | Status | Notes |
| :--- | :--- | :--- |
| `npm ci` | ✅ Passed | Installed 315 packages. |
| `npm run build:css` | ✅ Passed | CSS built successfully. Warning: `Browserslist: caniuse-lite is outdated`. |
| `npm run format` | ✅ Passed | No formatting changes needed. |
| `npm run lint` | ✅ Passed | All lint checks passed. |
| `npm run test:unit` | ✅ Fixed | `tests/hashtag-preferences.test.mjs` and `tests/nostr-login-permissions.test.mjs` failures were fixed in this PR. |

## Detailed Findings & Fixes

### Unit Test Failures

Two test suites failed during the initial audit:

1.  **`tests/hashtag-preferences.test.mjs`**: Failed due to a race condition in the mock `fetchListIncrementally` implementation where it didn't return data on retries.
    *   **Fix Applied**: Updated the mock to return the event consistently.

2.  **`tests/nostr-login-permissions.test.mjs`**: Failed because `nostrClient` was requesting `DEFAULT_NIP07_CORE_METHODS` instead of `DEFAULT_NIP07_PERMISSION_METHODS` (which includes encryption permissions), causing assertions to fail.
    *   **Fix Applied**: Updated `js/nostr/client.js` to request the correct permission set.

### Browserslist Warning

The build command emitted: `Browserslist: caniuse-lite is outdated`.
*   **Action Taken**: Ran `npx update-browserslist-db@latest`. Note that `npm update caniuse-lite` was also attempted but reported no changes, likely due to dependency tree depth.

### Documentation

*   Updated `CONTRIBUTING.md` to recommend sharded tests (`npm run test:unit:shard1`) as the full suite runs sequentially and is slow.
