# Playwright Integration Recommendations (2026-02-22)

This document captures practical follow-ups for improving bitvid's end-to-end and extension integration testing.

## What is now in place

1. Deterministic E2E matrix projects:
- Chromium (`e2e`)
- Firefox (`e2e-firefox`)

2. Optional extension project:
- `e2e-nip07-extension` (opt-in via `PLAYWRIGHT_ENABLE_EXTENSION_E2E=1` and `PLAYWRIGHT_EXTENSION_PATH`)

3. Persistent-context extension launcher:
- Script: `scripts/playwright/run-extension-persistent.mjs`
- Command: `npm run test:e2e:extension`
- Purpose: run extension tests in Chromium with a real persistent profile context.

4. Test harness upgrades:
- `setTestRelays(urls)` aligns `relayManager` and `nostrClient`.
- `setSignerDecryptBehavior(mode, opts)` forces decrypt behavior for deterministic list-sync tests.
- `getListSyncEvents()`, `clearListSyncEvents()`, `waitForListSyncEvent()` capture and assert sync lifecycle.

5. Stable sync/test selectors:
- Permission prompt, hashtag/subscription statuses, blocked-list status/list/empty state.

## Recommended next steps

1. Add CI extension smoke lane (manual workflow dispatch only)
- Keep extension smoke out of default PR path.
- Add a separate workflow that runs only when maintainers provide:
  - `PLAYWRIGHT_EXTENSION_PATH` artifact or unpacked extension directory
  - any extension secrets/profile setup needed by the signer.

2. Add extension artifact capture on failure
- Always upload:
  - `playwright-report`
  - video/trace/screenshot for `tests/e2e-extension/**`
  - JSON summary of `window.nostr` capabilities.

3. Add capability contract test
- Add a single test that asserts minimum NIP-07 surface before running deeper flows:
  - `getPublicKey`
  - `signEvent`
  - at least one decrypt path (`nip04` or `nip44`).

4. Add "auth ready" test harness API
- Add a harness method that waits for authenticated app-ready state (`header UI + signer + relay ready`) so tests stop duplicating custom waits.

5. Add deterministic clock/random seed helper in test mode
- Expose optional fixed clock/random behavior to reduce cross-run variance in event ordering and timeout-sensitive tests.

6. Add a small extension compatibility matrix note
- Track known-good extension versions for:
  - Alby/Nostr Connect style extensions
  - Chromium version pinned in CI.

## Operational guardrails

1. Keep deterministic tests (mock signer + mock relay) as the default required PR gate.
2. Keep extension tests opt-in until flake rate is low and extension lifecycle setup is automated.
3. Do not treat extension `content.js` runtime noise as app regression unless bitvid telemetry/events also fail in the same window.

