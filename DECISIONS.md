# Decisions Log

## 2026-02-12: Audit Run

### Context
Running the scheduled `audit-agent` task.

### Decision: Initial Run
- **Action:** Created initial audit report artifacts.
- **Rationale:** No previous reports found, so no delta comparison performed.

## 2026-02-17: Dependency Audit & Upgrade

### Context
Ran a daily dependency audit. Found `esbuild` (0.27.2 -> 0.27.3) as a safe candidate and `nostr-tools` (2.19.4 -> 2.23.0) as a risky candidate.

### Decision: Revert `esbuild` Upgrade
- **Proposal:** Upgrade `esbuild` to 0.27.3.
- **Outcome:** FAILED (Reverted).
- **Reason:** While `npm run build` and `npm run test:unit` passed, `npm run test:e2e` failed immediately with "Executable doesn't exist" (missing Playwright browsers).
- **Rationale:** Strict adherence to "If tests fail, do not open the PR".
- **Action:** Reverted changes to `package.json` / `package-lock.json`. Created `issues/upgrade-esbuild.md` to document the environment blocker.

### Decision: Do Not Auto-Upgrade `nostr-tools`
- **Proposal:** Upgrade `nostr-tools`.
- **Outcome:** BLOCKED (By Policy).
- **Reason:** `AGENTS.md` explicitly forbids auto-upgrading protocol/crypto libraries.
- **Action:** Created `issues/upgrade-nostr-tools.md` with a test plan for manual review.

### Decision: Do Not Auto-Upgrade `tailwindcss` (v4)
- **Proposal:** Upgrade `tailwindcss`.
- **Outcome:** BLOCKED (Major Version).
- **Reason:** Major version bump (v3 -> v4) carries significant risk of breaking changes.
- **Action:** Existing issue `issues/upgrade-tailwindcss.md` is sufficient.

## 2026-02-18: Performance - Bounded Concurrency in AuthService

### Context
`loadOwnProfile` in `js/services/authService.js` was using `Promise.allSettled` on all background relays simultaneously. For users with many relays (e.g., 50+), this caused a massive spike in network requests and CPU usage during login/startup.

### Decision: Use `pMap` with Concurrency Limit
- **Proposal:** Replace `Promise.allSettled` with `pMap` for background relays.
- **Outcome:** IMPLEMENTED.
- **Reason:** To prevent network saturation and UI freeze.
- **Details:** Used `RELAY_BACKGROUND_CONCURRENCY` (3) to limit concurrent background requests. Fast relays (top 3) are still fetched in parallel (unbounded, but small set).

## 2026-02-12: CI Health - Fix Flaky Watch History Test

### Context
`testWatchHistoryFeedHydration` in `tests/watch-history.test.mjs` was identified as flaky (explicit "Retry mechanism" comment) and swallowed assertions.

### Decision: Replace Loop with `waitFor`
- **Problem:** Manual `setTimeout` loop + `try/catch` masked errors and was fragile.
- **Decision:** Use `waitFor` utility to poll for state change and throw proper error on timeout.
- **Rationale:** Aligns with `ci-health-agent` prompt ("Add deterministic waits", "Fix safely").
- **Notes:** Test is not currently part of CI `npm run test:unit` (skipped by runner), but fixing the code improves health for future inclusion/manual runs.

## 2026-02-18: Constants Refactor

### Decision: Use `STANDARD_TIMEOUT_MS` for 10000
- **Proposal:** Replace literal `10000` with `STANDARD_TIMEOUT_MS`.
- **Outcome:** IMPLEMENTED.
- **Reason:** Canonicalize timeout values in `js/nostr/client.js`, `js/nostr/relayBatchFetcher.js`, `js/userBlocks.js`.

### Decision: Use `SHORT_TIMEOUT_MS` for 5000
- **Proposal:** Replace literal `5000` with `SHORT_TIMEOUT_MS`.
- **Outcome:** IMPLEMENTED.
- **Reason:** Canonicalize timeout values in `js/nostr/managers/SignerManager.js`, `js/nostr/nip07Permissions.js`, `js/nostr/nip46Client.js`, `js/ui/engagementController.js`, `js/ui/applicationBootstrap.js`.
