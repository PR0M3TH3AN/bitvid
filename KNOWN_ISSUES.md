# Known Issues

## Tests

### Unit Tests
- `npm run test:unit` consistently times out in the CI environment due to resource constraints. Targeted testing (`test:dm:unit`, `test:dm:integration`) is recommended.

### Visual Regression Tests (`test:visual`)
- **Artifact Retention**: Visual tests are configured to retain screenshots, traces, and videos on failure to assist with debugging. These artifacts can be found in `artifacts/test-results/`.
