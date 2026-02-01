# Known Issues

## Tests

### Unit Tests
- `npm run test:unit` consistently times out in the CI environment due to resource constraints. Targeted testing (`test:dm:unit`, `test:dm:integration`) is recommended.

### Visual Regression Tests (`test:visual`)
- **Artifact Retention**: Visual tests are configured to retain screenshots, traces, and videos on failure to assist with debugging. These artifacts can be found in `artifacts/test-results/`.
- **Moderation UI (`tests/visual/moderation.spec.ts`)**: The "Show anyway" button and related moderation badges fail to render in the test environment, causing `toBeVisible()` assertions to fail. The logic for creating the button appears correct (`allowOverride` is true), but the button element is not found in the DOM during the test execution. This might be due to a race condition in the test fixture's state initialization or an environment-specific rendering issue.
- **Sidebar Layout (`tests/visual/overlay-layers.spec.ts`)**: The `mobile sidebar shares desktop rail behavior` test fails. The expected margin for the app container does not match the computed margin in the test environment (diff of ~45px). Attempts to fix this by adjusting CSS margin calculations were incomplete and reverted to avoid instability.
- **Kitchen Sink (`tests/visual/kitchen-sink.spec.ts`)**: Minor pixel mismatch (width 1292 vs expected 1280) in snapshot comparison.

### E2E Tests (`test:e2e`)
- **Modals (`tests/e2e/ui-modals.spec.ts`)**:
    - `application-form` and `profile-modal` fail with 404 errors for requested resources (likely related to how `http-server` serves relative paths or nested components in the test runner).
    - Several modals (`upload-modal`, `edit-video-modal`, etc.) timeout waiting for close actions or visibility checks. This might be due to the `reducedMotion` application interacting poorly with visibility checks or genuine performance issues in the test runner.
    - `login-modal` fails to find the `[data-nsec-error]` element (it expects it to be visible but it remains hidden).
- **Popover (`tests/e2e/popover.spec.ts`)**: Fails with `ReferenceError: getPanelWithTriggerMetrics is not defined`. This helper function seems to be missing or not imported correctly in the test file.

## CSS / Design System
- The global CSS (`css/tailwind.source.css`) was updated to fix a linter error by using `calc(theme("screens.md") - var(--breakpoint-edge-offset))` instead of raw pixels.

## Retrospective & Future Improvements

### Challenges
- **Generated Artifacts**: The build process modifies `css/tailwind.generated.css`, which creates noise in diffs and potential merge conflicts. It is recommended to ignore this file in version control or enforce a check that it matches the build output without committing it manually in every PR.
- **Test Environment Isolation**: Debugging visual test failures (like the Sidebar Layout and Moderation UI) was difficult without access to the live browser UI or artifacts. The reproduction script failed due to environment restrictions on launching browsers.
- **Test Flakiness**: E2E tests for modals are prone to timeouts, likely due to animation/transition handling or resource loading delays in the CI environment. Using `applyReducedMotion` consistently helps but doesn't solve all timing issues.

### Suggestions
- **Commit Hooks**: Implement a pre-commit hook that runs the linter and potentially the build to ensure generated files are in sync, or configure CI to fail if they are not.
- **Dockerized Testing**: Running tests in a consistent Docker container with Xvfb properly configured would help reproduce environment-specific failures locally.
- **Visual Testing improvements**: Ensure that test fixtures (like `moderation/fixtures/index.html`) correctly force UI updates after state injection to avoid race conditions.
