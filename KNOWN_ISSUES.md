# Known Issues

## Test Infrastructure

### Missing `jsdom` Dependency
- **Status:** Active
- **Detected:** 2026-02-26
- **Description:** Multiple unit tests fail with `ERR_MODULE_NOT_FOUND` because `jsdom` is imported but not installed in the project.
- **Impact:** Prevents running unit tests that rely on DOM simulation.
- **Remediation:** `npm install --save-dev jsdom`

## Run Notes (2026-03-04)

### Firefox E2E feed hydration flakes under full parallel load
- **Status:** Active
- **Description:** `test:e2e` can intermittently fail in Firefox with `[testHarness] Timed out waiting for <n> feed items (found 0)` in `waitForFeedItems`, while the same failing specs usually pass in isolated reruns.
- **Impact:** Full-suite Firefox E2E runs are flaky even after local polling hardening.
- **Observed failures:** `tests/e2e/video-crud-flows.spec.ts`, `tests/e2e/video-edit-delete-execution.spec.ts`, `tests/e2e/view-navigation.spec.ts`.

### Nostr tools signing/key API expectation in unit tests
- **Status:** Addressed
- **Description:** `tests/nostr-send-direct-message.test.mjs` must pass `Uint8Array` secret keys to `getPublicKey/finalizeEvent` for current `nostr-tools`.
- **Impact:** Passing hex strings causes failures like `expected Uint8Array, got type=string`.
