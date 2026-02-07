# Known Issues

## Tests

### Unit Tests
- `npm run test:unit` may time out in resource-constrained environments (like CI) when running the full suite serially. CI workflows use sharding (`test:unit:shardX`) to mitigate this. Targeted testing (`test:dm:unit`, `test:dm:integration`) is recommended for local development focus. (Last checked: 2025-02-23)

### Skipped Tests
The following tests are skipped due to flakiness or environmental issues and should be investigated:

- `tests/e2e/popover.spec.ts`: `keeps the bottom-right grid menu inside the viewport` (Visual regression layout issue: Floating UI `flip` middleware fails to respect viewport boundary in constrained height scenarios. Verified 2025-02-23, fix attempt failed.)

### Visual Regression Tests (`test:visual`)
- **Artifact Retention**: Visual tests are configured to retain screenshots, traces, and videos on failure to assist with debugging. These artifacts can be found in `artifacts/test-results/`.
