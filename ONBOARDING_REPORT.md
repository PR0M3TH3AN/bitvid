# Developer Onboarding Audit Report

**Date:** 2026-01-30
**Agent:** Jules

## Summary

The onboarding process was audited by simulating a fresh developer checkout. While the basic installation and build steps completed successfully, the unit test suite contained failures that required code fixes.

## Steps Executed

1.  **Dependencies**: `npm ci` (Success)
2.  **Build**: `npm run build:css` (Success, with warning)
3.  **Format**: `npm run format` (Success)
4.  **Lint**: `npm run lint` (Success)
5.  **Tests**: `npm run test:unit` (Failure initially)

## Findings & Fixes

### 1. Unit Test Failure: `tests/app-batch-fetch-profiles.test.mjs`

*   **Issue**: The test failed with `expected a query per relay. 4 !== 2`.
*   **Cause**: The test mocked `nostrClient.relays` and `writeRelays` but not `readRelays`. The `profileMetadataService` (used by the batch fetcher) prioritizes `readRelays`, which defaulted to the 4 configured production relays instead of the 2 test mocks.
*   **Fix**: Updated the test to explicitly mock `nostrClient.readRelays` to match the test configuration.

### 2. Unit Test Failure: `tests/profile-modal-controller.test.mjs`

*   **Issue**: The test failed with `TypeError: this.hashtagPreferencesService.load is not a function`.
*   **Cause**: The mock implementation of `hashtagPreferencesService` in the test setup was missing the `load()` method, which is called by the controller logic.
*   **Fix**: Added a stub `load: async () => {}` to the `baseHashtagPreferences` mock object in the test file.

### 3. Build Warning: `caniuse-lite is outdated`

*   **Issue**: `npm run build:css` outputs a warning: `Browserslist: caniuse-lite is outdated`.
*   **Action**: Executed `npx update-browserslist-db@latest`.
*   **Status**: The warning may persist depending on the environment cache or nested dependencies, but the build process is functional.

## Recommendations

*   **Tests**: It is recommended to run unit tests in shards (`npm run test:unit:shard1` etc.) locally if the full suite times out, as observed in this environment.
*   **Documentation**: The `CONTRIBUTING.md` guide is generally accurate.

## Conclusion

The onboarding friction was primarily due to bit-rot in unit tests. These have been corrected. The environment is now ready for development.
