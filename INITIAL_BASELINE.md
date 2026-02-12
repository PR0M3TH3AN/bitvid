# Initial Baseline - Performance & Docs (Feb 2026)

## Performance Bottlenecks
- **Unbounded Concurrency (P0):** `js/nostr/commentEvents.js` uses `Promise.all` for relay requests in `publishComment` and `listVideoComments`. This can saturate network connections if a user has many relays (20+), causing UI freeze or timeouts.
  - **Remediation:** Apply `pMap` with `RELAY_BACKGROUND_CONCURRENCY` (3).

## Documentation Gaps
- **CORS Configuration:** `content/docs/guides/upload-content.md` suggests `http://localhost:5500` for CORS, but the default dev port is `3000`.
  - **Remediation:** Update port to `3000`.
