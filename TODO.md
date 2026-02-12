# TODO: Audit Run 2026-02-12

## Priority: High (Audit)
- [x] Run `scripts/check-file-size.mjs --report`.
- [x] Run `scripts/check-innerhtml.mjs --report`.
- [x] Run `npm run lint`.
- [x] Parse logs into JSON.
- [x] Generate summary report.

## Priority: Medium (Backlog)
- [ ] Fix E2E test environment: `npx playwright install` must be run in the CI/Agent environment before running `npm run test:e2e` for upgrades. This blocked the `esbuild` upgrade.
- [ ] Review `nostr-tools` upgrade (v2.19.4 -> v2.23.0). See `issues/upgrade-nostr-tools.md`.
- [ ] Review `tailwindcss` (v4). See `issues/upgrade-tailwindcss.md`.

## Priority: Low (Maintenance)
- [ ] Batch upgrade dev dependencies (`stylelint`, `postcss-import`).
