# Known Issues

## Tests

### Unit Tests
- `npm run test:unit` consistently times out in the CI environment due to resource constraints. Targeted testing (`test:dm:unit`, `test:dm:integration`) is recommended.

### Visual Regression Tests (`test:visual`)
- **Artifact Retention**: Visual tests are configured to retain screenshots, traces, and videos on failure to assist with debugging. These artifacts can be found in `artifacts/test-results/`.

## CSS / Design System
- The global CSS (`css/tailwind.source.css`) was updated to fix a linter error by using `calc(theme("screens.md") - var(--breakpoint-edge-offset))` instead of raw pixels.

## Retrospective & Future Improvements

### Challenges
- **Generated Artifacts**: The build process modifies `css/tailwind.generated.css`, which creates noise in diffs and potential merge conflicts. It is recommended to ignore this file in version control or enforce a check that it matches the build output without committing it manually in every PR.
- **Test Environment Isolation**: Debugging visual test failures was difficult without access to the live browser UI or artifacts. The reproduction script failed due to environment restrictions on launching browsers.
- **Test Flakiness**: E2E tests for modals are prone to timeouts, likely due to animation/transition handling or resource loading delays in the CI environment. Using `applyReducedMotion` consistently helps but doesn't solve all timing issues.

### Suggestions
- **Commit Hooks**: Implement a pre-commit hook that runs the linter and potentially the build to ensure generated files are in sync, or configure CI to fail if they are not.
- **Dockerized Testing**: Running tests in a consistent Docker container with Xvfb properly configured would help reproduce environment-specific failures locally.
- **Visual Testing improvements**: Ensure that test fixtures (like `moderation/fixtures/index.html`) correctly force UI updates after state injection to avoid race conditions.
