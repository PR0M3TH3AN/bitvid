# Daily Performance Report - 2026-02-17

**Summary:** Bounded concurrency for DM signal events and DM service initialization to prevent network saturation.

## Findings & Fixes

### P0: Unbounded Concurrency in DM Subsystem
- **Files:** `js/nostr/dmSignalEvents.js`, `js/services/dmNostrService.js`
- **Impact:** `Promise.all` was used to map over all relays (potential for 20+ connections simultaneously) for DM read receipts, typing indicators, and service connections.
- **Fix:** Replaced with `pMap` using `RELAY_BACKGROUND_CONCURRENCY` (3).
- **Verification:** `npm run test:dm:unit` and `npm run test:dm:integration` passed.

### Docs Audit
- **Port Alignment:** Verified `content/docs/guides/upload-content.md` correctly specifies port 3000 for CORS, aligning with previous remediation. No changes needed.

## Metrics
- **Login Time:** N/A (change affects background network tasks).
- **DM Decrypt Queue:** N/A (network bounding).

## Decisions
- Used `RELAY_BACKGROUND_CONCURRENCY` (3) for DM operations to match relay manager behavior.

## PRs / Commits
- `perf: bound DM subsystem network concurrency` (this change).
