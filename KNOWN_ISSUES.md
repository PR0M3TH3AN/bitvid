# Known Issues

## Tests

### Skipped Tests

The following tests are skipped due to flakiness or environmental issues and should be investigated:

- **`tests/nostr/sessionActor.test.mjs`**: Skipped because `WebCrypto` is not available in the current environment. (Last checked: 2026-02-18)

### Visual Regression Tests (`test:visual`)

- **Artifact Retention**: Visual tests are configured to retain screenshots, traces, and videos on failure to assist with debugging. These artifacts can be found in `artifacts/test-results/`.
- **Note**: Visual tests fail if browsers are missing, consistent with the Environment issue. (Agent verified 2026-02-18).

## Environment

### Playwright Browsers

- **Issue**: Visual and E2E tests (`npm run test:visual`, `npm run test:e2e`) may fail with `browserType.launch: Executable doesn't exist`.
- **Workaround**: Run `npx playwright install` to download the required browser binaries if you are running tests outside of the pre-configured dev container or CI environment. (Last checked: 2026-02-18)
