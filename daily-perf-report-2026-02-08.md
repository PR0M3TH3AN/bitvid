# Daily Performance Report - 2026-02-08

**Summary:** Bounded background relay concurrency to 3 to prevent network saturation and UI freezes. Verified upload documentation accuracy.

## Findings

### P1: Unbounded Relay Concurrency
- **Location:** `js/nostr/client.js` (`fetchAndCacheNip71Metadata`, `hydrateVideoHistory`, `_sendNip17DirectMessage`).
- **Impact:** Simultaneously opening connections to all relays (could be 20+) caused network congestion and potential UI jank.
- **Fix:** Implemented `pMap` with `RELAY_BACKGROUND_CONCURRENCY = 3`.
- **Status:** Fixed.

## Metrics
- **Max Concurrent Relay Requests:** Reduced from N (number of relays) to 3.
- **Login Time:** (Not measured directly today, but expected improvement due to reduced initial load).

## Docs Audit
- **Page:** `content/docs/guides/upload-content.md`
- **Result:** Verified accurate. Matches code behavior for file types, size recommendations, and HTTPS enforcement.

## Artifacts
- [PR #1] perf: bound relay background concurrency
- `benchmarks/relay_concurrency_repro.mjs` created.
