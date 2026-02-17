# Daily Performance Report - 2026-02-14

## Summary
Fixed critical P0 performance issue (unbounded concurrency) in comment subsystem and aligned developer documentation with runtime defaults.

## Findings & Fixes

### P0: Unbounded Relay Concurrency
- **File:** `js/nostr/commentEvents.js`
- **Issue:** `publishComment` and `listVideoComments` used `Promise.all(relayList.map(...))` to broadcast/fetch from all relays simultaneously. For users with large relay lists (20+), this caused network saturation and UI freezes.
- **Fix:** Refactored to use `pMap` with `RELAY_BACKGROUND_CONCURRENCY` (default: 3). This limits the number of active requests at any given time.
- **Verification:** `tests/nostr/comment-events.test.mjs` passed.

### Docs: Outdated CORS Port
- **File:** `content/docs/guides/upload-content.md`
- **Issue:** The guide recommended `AllowedOrigins` with port `5500`, but the project default via `npm start` is `3000`.
- **Fix:** Updated documentation to use `http://localhost:3000`.

## Artifacts Updated
- `INITIAL_BASELINE.md` created.
- `CONTEXT.md`, `TODO.md`, `DECISIONS.md`, `TEST_LOG.md` updated.

## Next Steps
- Investigate `js/utils/torrentHash.js` usage in `UploadModal` to ensure large file hashing doesn't block the main thread (potential P1).
- Audit `js/nostr/relayBatchFetcher.js` for similar optimizations (currently uses chunk size 8).
