# Daily Perf Report - 2026-02-17

**Summary:** Bounded concurrency for channel video fetching; audited upload documentation.

## Findings & Fixes

### P1: Unbounded Concurrency in Channel Profile
- **File:** `js/channelProfile.js`
- **Function:** `loadUserVideos`
- **Issue:** Used `Promise.allSettled` on a map of all relays to fetch videos. This would trigger N concurrent requests (where N = relay count), potentially saturating the network.
- **Fix:** Replaced with `pMap` using `RELAY_BACKGROUND_CONCURRENCY` (3). Preserved `Promise.allSettled` semantics by returning `{ status, value|reason }` objects from the mapper.
- **Status:** Fixed.

### P0: Comment Events Concurrency
- **File:** `js/nostr/commentEvents.js`
- **Status:** Validated as already fixed (uses `pMap`). Updated baseline.

## Docs Audit
- **Scope:** `content/docs/guides/upload-content.md`
- **Verification:**
  - **CORS Port:** Docs specify `http://localhost:3000`, matching the dev environment.
  - **Upload Limit:** Docs state 2GB, which matches the client-side hashing limitation.
- **Outcome:** Documentation is accurate; no changes needed.

## Metrics
- **Login Time:** (No change measured)
- **Relay Concurrency:** Enforced limit of 3 for background tasks.
