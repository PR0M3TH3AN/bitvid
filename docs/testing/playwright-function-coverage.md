# Playwright Function Coverage + Console Diagnostics

Use this workflow to measure how much of bitvid's runtime code is exercised by E2E Playwright tests and to export browser console/page errors for triage.

## Run

```bash
npm run test:e2e:coverage
```

This command:

1. Builds `dist/`
2. Runs `tests/e2e` on Chromium with browser JS coverage enabled
3. Captures browser `console` and `pageerror` output for every test
4. Generates aggregate reports

## Artifacts

- `artifacts/playwright-coverage/raw/*.json`
  - Per-test raw coverage + console/page-error logs
- `artifacts/playwright-coverage/function-coverage-summary.json`
  - Machine-readable function coverage report
- `artifacts/playwright-coverage/function-coverage-summary.md`
  - Human-readable summary with coverage percentage and low-coverage files
- `artifacts/playwright-coverage/console-log-summary.json`
  - Full exported console/page-error logs
- `artifacts/playwright-coverage/console-issues.log`
  - Grouped issue signals for fast triage

## Notes

- Coverage is captured from Chromium runtime execution (`page.coverage`), then combined with static function estimates for source files in `js/` and `torrent/`.
- Firefox coverage is not included in this report because Playwright JS coverage is Chromium-only.

## Current Baseline (2026-02-22)

From a full real run (`npm run test:e2e:coverage`) on 2026-02-22:

- E2E result: `40 passed`
- Function coverage: `29.9%` (`2863/9576`)
- Loaded source files: `297/313`
- Console logs: `72`
- Console error-like entries: `4`
- Page errors: `0`

Primary issue groups captured:

1. `404 Not Found` resource errors (2 occurrences)
2. Forced decrypt-timeout warning in diagnostics test (expected by test, 1 occurrence)
3. CORS-blocked `.torrent` fetch in webseed playback test (1 occurrence)
4. `net::ERR_FAILED` in webseed playback test (1 occurrence)
5. WebSocket tracker handshake failure for `wss://tracker.btorrent.xyz/` (1 occurrence)

Recent high-impact coverage improvements:

- `js/nostr/commentEvents.js`: `90.91%` (`20/20`)
- `js/nostr/reactionEvents.js`: `78.57%` (`11/14`)
- `js/nostr/publishHelpers.js`: `79.41%` (`27/34`)
- `js/nostr/sessionActor.js`: `79.41%` (`27/34`)

## Integration Rules For Agents

1. For `tests/e2e/*.spec.ts`, import from `tests/e2e/helpers/instrumentedTest.ts` so coverage/log capture stays enabled.
2. For harness-based tests, use `tests/e2e/helpers/bitvidTestFixture.ts` (it already includes auto-capture).
3. Keep coverage runs Chromium-only when collecting percentages (`page.coverage` is Chromium-specific).
4. Do not remove `playwright.config.ts` global setup (`tests/e2e/helpers/playwrightCoverageGlobalSetup.ts`), which resets raw coverage artifacts.
5. Use `npm run test:e2e:coverage:report` only after a prior coverage-enabled run; it reads existing raw artifacts.

## How To Improve Coverage

Priority order for fastest gains:

1. Add E2E for high-function files currently at `0%` but loaded:
   - Start with `js/nostr/commentEvents.js`, `js/nostr/reactionEvents.js`, `js/nostr/publishHelpers.js`, `js/nostr/sessionActor.js`.
2. Add deterministic DM coverage lane in E2E harness:
   - Exercise NIP-04 and NIP-44 decrypt/encrypt flows through UI and harness hooks.
3. Add upload + publish deep-path tests:
   - Validate URL-only, magnet-only, and dual-source publish paths with assertions on fallback behavior.
4. Add negative-path assertions that currently only surface in console:
   - Explicitly assert/handle CORS/torrent fetch failures and tracker handshake failures.
5. Keep tests routed through test-harness APIs:
   - Prefer `setTestRelays`, `setSignerDecryptBehavior`, and seeded relay events over live-network dependence.

## Suggested Quality Gates

1. Track `functionCoveragePct` trend in CI artifacts per PR.
2. Add a soft warning threshold first (for example `>=30%`), then ratchet upward as flaky paths are stabilized.
3. Fail PRs only after baseline is stable across multiple runs.
