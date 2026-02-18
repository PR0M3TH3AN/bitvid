# Daily Performance Report - 2026-02-17

**Summary:** Bounded concurrency for DM signal events and DM service initialization to prevent network saturation. Fixed CI failure in `lint:hex` and `unit-tests`.

## Findings & Fixes

### P0: Unbounded Concurrency in DM Subsystem
- **Files:** `js/nostr/dmSignalEvents.js`, `js/services/dmNostrService.js`
- **Impact:** `Promise.all` was used to map over all relays (potential for 20+ connections simultaneously) for DM read receipts, typing indicators, and service connections.
- **Fix:** Replaced with `pMap` using `RELAY_BACKGROUND_CONCURRENCY || 3`.
- **Verification:** `npm run test:dm:unit` and `npm run test:dm:integration` passed.

### CI Failure (lint:hex)
- **Problem:** The `npm run lint:hex` script failed in CI because `git grep` scanned `perf/hits-2026-02-17.txt` (which contained a dump of `webtorrent.min.js` from an agent search) and found hex codes, treating it as a violation.
- **Fix:** Updated `scripts/check-hex.js` to exclude agent artifact directories (`perf/`, `test_logs/`, `context/`, `decisions/`, `todo/`).
- **Additional Fix:** Increased `maxBuffer` in `scripts/check-hex.js` to 10MB to be robust against large matches.

### CI Failure (unit-tests)
- **Problem:** `tests/unit/services/exploreDataService.test.mjs` failed with `0 !== 1` for "visibility change triggers refresh". The test expected an immediate data refresh when `document.hidden` changed to `false`, but the implementation only started the interval timer.
- **Fix:** Updated `handleVisibility` in `js/services/exploreDataService.js` to trigger `refreshWatchHistoryTagCounts` and `refreshTagIdf` immediately when becoming visible.

### Docs Audit
- **Port Alignment:** Verified `content/docs/guides/upload-content.md` correctly specifies port 3000 for CORS, aligning with previous remediation. No changes needed.

## Metrics
- **Login Time:** N/A (change affects background network tasks).
- **DM Decrypt Queue:** N/A (network bounding).

## Decisions
- Used `RELAY_BACKGROUND_CONCURRENCY || 3` for DM operations to match relay manager behavior and ensure robustness against missing constants.

## PRs / Commits
- `perf: bound DM subsystem network concurrency & fix CI lint/tests`
