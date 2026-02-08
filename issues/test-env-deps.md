# Test Environment Missing Dependencies

## Problem

The current development environment is missing several `devDependencies` that are listed in `package.json`. This prevents running certain test suites.

## Affected Dependencies

- `jsdom`: Required for `tests/app/channel-profile-moderation.test.mjs`.
- `fake-indexeddb`: Required for `test:dm:unit` and `test:dm:integration`.
- `@playwright/test` (and `playwright`): Required for E2E tests (`test:e2e`, `tests/e2e/popover.spec.ts`, etc.) and visual regression tests (`test:visual`).

## Impact

- `npm run test:unit` fails partially (`tests/app/channel-profile-moderation.test.mjs` fails with `ERR_MODULE_NOT_FOUND`).
- `npm run test:dm:unit` fails completely.
- `npm run test:dm:integration` fails completely.
- `npm run test:e2e` fails completely.
- `npm run test:visual` fails completely.

## Notes

- `npm install` is restricted in this environment, preventing easy re-installation.
- This issue was verified on 2026-02-08.

## Tags

- environment
- testing
- dependencies
