# TODO: Dependency Management

## Priority: High (Blockers)
- [ ] Fix E2E test environment: `npx playwright install` must be run in the CI/Agent environment before running `npm run test:e2e` for upgrades. This blocked the `esbuild` upgrade.

## Priority: Medium (Security/Compliance)
- [ ] Review `nostr-tools` upgrade (v2.19.4 -> v2.23.0). See `issues/upgrade-nostr-tools.md`.
- [ ] Review `tailwindcss` (v4). See `issues/upgrade-tailwindcss.md`.

## Priority: Low (Maintenance)
- [ ] Batch upgrade dev dependencies (`stylelint`, `postcss-import`).

## Priority: High (Performance)
- [x] Bound concurrency in `authService.js` for profile hydration (P0).
