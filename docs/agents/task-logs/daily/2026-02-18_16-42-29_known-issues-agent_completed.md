# Daily Known Issues Report

## Summary
- **Verified Skipped Tests**: Found one skipped test in `tests/nostr/sessionActor.test.mjs` due to `WebCrypto` unavailability.
- **Verified Playwright Browsers**: Confirmed `browserType.launch: Executable doesn't exist` error when running e2e tests.
- **Updated KNOWN_ISSUES.md**:
  - Added skipped test entry.
  - Updated "Last checked" dates for Playwright Browsers and Visual Regression Tests.

## Verification
- `grep` search for skipped tests.
- `npx playwright test` execution.
- `npm run lint` passed.
