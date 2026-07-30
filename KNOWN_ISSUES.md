# Known Issues

## Test Infrastructure

### Missing `jsdom` Dependency
- **Status:** Resolved (2026-07-30)
- **Detected:** 2026-02-26
- **Description:** Unit tests failed with `ERR_MODULE_NOT_FOUND` because `jsdom` was imported but not installed.
- **Resolution:** `jsdom` has been a devDependency for some time (28.1.0 installed and in `package.json`); the jsdom-based suites run clean.

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

## Run Notes (2026-06-20, updated 2026-07-30)

### `login-flows.spec.ts:149` — upload/profile buttons stay visible after logout
- **Status:** Active — NOT merely a parallel-load flake
- **Description:** Previously filed as a worker-contention flake that "passes deterministically in isolation." On 2026-07-28 it failed **in isolation** as well (chromium, local and CI `e2e-headless`), while passing in the CI `e2e-tests (e2e)` job — environment-sensitive, not load-sensitive. Direct probes of the same flow (raw `__bitvidTest__.loginWithNsec` → `logout()` against a mock relay) hide the button correctly, so the failure is specific to something in the Playwright fixture path. An attempted fix (running `applyLoggedOutUiState()` before the awaited NWC/profile teardown in `_executeAuthLogout`) did not change the outcome and was reverted rather than shipped unverified.
- **Impact:** One e2e failure in `e2e-headless`; logout hides gated UI correctly in manual testing and direct harness probes.
- **Next step:** Investigate alongside pre-launch TODO #33 ("logout logs out everyone" / NIP-46 session persistence) — same subsystem.

### `video-upload-publish-lifecycle.spec.ts:49` / `:79` flake under full parallel load
- **Status:** Active
- **Description:** Under the full `test:e2e` run these intermittently fail on feed-appearance timeouts but pass on retry (CI marks them flaky). Worker resource contention.
- **Impact:** Full-suite e2e occasionally needs retries; isolated reruns are green.

### `webseed-playback.spec.ts:31` fails on Firefox headless (CDN mode)
- **Status:** Resolved (2026-07-28, `f48150ed`)
- **Description:** The test asserted the **final** `src` equals the CDN URL while simultaneously tolerating "No playable source found" in its status assertion — contradictory, because a failed hosted attempt calls `resetVideoElement()`, which clears `src`. Headless CI cannot decode the archive.org H.264 sample, so the cleared-src path was routine there.
- **Resolution:** The test now records every `src` the player attaches via a MutationObserver and asserts the CDN URL was attached — the actual behavior under test. Green in both `e2e` and `e2e-firefox` CI jobs.

### `uploadModal-reset.test.mjs` ("UploadModal Reset Logic") hangs/cancels
- **Status:** Not reproducible (2026-07-30)
- **Description:** Intermittent `cancelledByParent` / "Promise resolution is still pending" hang, order/timing dependent.
- **Current state:** Passes cleanly (`pass=3 fail=0 cancelled=0`) in isolation and across repeated full-suite sweeps on 2026-07-28–30. Left on file because the original failure was ordering-dependent; if it recurs, capture the full-suite ordering that produced it.
