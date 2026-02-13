# Known Issues

## Tests

### Skipped Tests

The following tests are skipped due to flakiness or environmental issues and should be investigated:

_No skipped tests currently documented. Checked 2026-02-13._

### Visual Regression Tests (`test:visual`)

- **Artifact Retention**: Visual tests are configured to retain screenshots, traces, and videos on failure to assist with debugging. These artifacts can be found in `artifacts/test-results/`.
- **Status**: Checked 2026-02-13. Failing in agent environment due to missing browser binaries (see Environment section). Previously passing as of 2026-02-12.

## Environment

### Playwright Browsers

- **Issue**: Visual and E2E tests (`npm run test:visual`, `npm run test:e2e`) may fail with `browserType.launch: Executable doesn't exist`.
- **Workaround**: Run `npx playwright install` to download the required browser binaries if you are running tests outside of the pre-configured dev container or CI environment.
- **Last Checked**: 2026-02-13 (Confirmed failure in agent environment).

### Missing Dependencies

- **Issue**: `npm run test:unit` may fail with `Error: Cannot find package 'jsdom'` or similar missing module errors.
- **Workaround**: Run `npm ci` to ensure all development dependencies are installed correctly.
- **Last Checked**: 2026-02-13.
