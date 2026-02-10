# Known Issues

## Tests

### Skipped Tests

The following tests are skipped due to flakiness or environmental issues and should be investigated:

- `tests/e2e/popover.spec.ts`: `keeps the bottom-right grid menu inside the viewport`
  - **Issue:** Visual regression layout issue: Floating UI `flip` middleware fails to respect viewport boundary in constrained height scenarios.
  - **Reference:** `issues/popover-flip-bug.md`
  - **Status:** Verified 2026-02-08. Fix attempt failed previously. Test is skipped.

### Visual Regression Tests (`test:visual`)

- **Artifact Retention**: Visual tests are configured to retain screenshots, traces, and videos on failure to assist with debugging. These artifacts can be found in `artifacts/test-results/`.
- **Note:** Visual tests are passing as of 2026-02-08, except for the skipped popover test.
