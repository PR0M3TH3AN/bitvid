# Known Issues

## Environment

### Missing Dependencies

The current development environment is missing critical `devDependencies` (`jsdom`, `playwright`, `fake-indexeddb`), preventing many test suites from running.

- **Affected:** `tests/app/channel-profile-moderation.test.mjs`, `test:dm:unit`, `test:dm:integration`, `test:e2e`, `test:visual`.
- **Reference:** `issues/test-env-deps.md`
- **Last checked:** 2026-02-08

## Tests

### Unit Tests

- `npm run test:unit` generally passes, but `tests/app/channel-profile-moderation.test.mjs` fails due to missing `jsdom`.
- Timeouts may occur in resource-constrained environments (like CI) when running the full suite serially. CI workflows use sharding (`test:unit:shardX`) to mitigate this. Targeted testing (`test:dm:unit`, `test:dm:integration`) is recommended for local development focus but currently fails due to missing `fake-indexeddb`. (Last checked: 2026-02-08)

### Skipped Tests

The following tests are skipped due to flakiness or environmental issues and should be investigated:

- `tests/e2e/popover.spec.ts`: `keeps the bottom-right grid menu inside the viewport`
  - **Issue:** Visual regression layout issue: Floating UI `flip` middleware fails to respect viewport boundary in constrained height scenarios.
  - **Reference:** `issues/popover-flip-bug.md`
  - **Status:** Verification attempted 2026-02-08 but failed due to missing `@playwright/test`. (Verified 2025-02-23, fix attempt failed.)

### Visual Regression Tests (`test:visual`)

- **Artifact Retention**: Visual tests are configured to retain screenshots, traces, and videos on failure to assist with debugging. These artifacts can be found in `artifacts/test-results/`.
- **Note:** `test:visual` currently fails due to missing `@playwright/test`.
