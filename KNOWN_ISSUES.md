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

## Run Notes (2026-06-20)

### Additional E2E specs flake under full parallel load (pass in isolation)
- **Status:** Active
- **Description:** Under the full `test:e2e` run (378 tests, 4 workers) these intermittently fail on `not.toBeVisible`/feed-appearance timeouts, but pass deterministically when re-run in isolation (`--workers=1`): `login-flows.spec.ts:149` (upload/profile buttons hide after logout), `video-upload-publish-lifecycle.spec.ts:49` and `:79` (URL-first publish appears / owner delete). Same root cause as the Firefox feed-hydration flakes above — worker resource contention, not an app regression (verified: pass in isolation on the current branch).
- **Impact:** Full-suite e2e is flaky; isolated reruns are green.

### `webseed-playback.spec.ts:31` fails on Firefox headless (CDN mode)
- **Status:** Active (pre-existing — reproduced on pre-refactor commit `1b11cb1b`)
- **Description:** "plays directly from HTML link (CDN mode)" fails on `--project=e2e-firefox` with `#modalVideo` `src` empty instead of the test's archive.org URL. The Chromium variant and the WebTorrent-fallback variant (`:63`) both pass. Firefox-headless-specific (external URL reachability/codec), not an app regression.
- **Impact:** One Firefox-only e2e failure; CDN playback works on Chromium and in manual testing.

### `uploadModal-reset.test.mjs` ("UploadModal Reset Logic") hangs/cancels
- **Status:** Active (pre-existing — reproduced on pre-refactor commit `1b11cb1b`)
- **Description:** The jsdom-based UploadModal reset suite intermittently fails with `cancelledByParent` / "Promise resolution is still pending but the event loop has already resolved" (~12s hang). It passes or fails depending on full-suite test ordering/timing (an async-hang flake, likely a torrent-metadata/upload promise not settling under the mocked services). Not a regression from the MediaUploader extraction — it fails identically on `1b11cb1b`.
- **Impact:** One unit suite can report `not ok 1`; the runner still exits 0. Other tests unaffected.
