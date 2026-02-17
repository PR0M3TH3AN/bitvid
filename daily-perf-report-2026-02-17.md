# Daily Perf Report: 2026-02-17

**Summary**: Initial run established baseline hits. Identified and fixed P0 unbounded concurrency in `relayManager.js` causing potential network saturation during relay list hydration.

## Findings

### P0: Unbounded Relay List Hydration
- **File**: `js/relayManager.js`
- **Location**: `loadRelayList` (lines 376-384)
- **Impact**: Simultaneously opens connections to all relays in a user's list (often > 20) during hydration, causing main-thread stutter and potential socket timeouts.
- **Fix**: Implemented bounded concurrency using `pMap` (limit = 3).
- **Status**: **FIXED** (PR pending)

### P1: Potential Unbounded Promise.all in App Initialization
- **File**: `js/app.js`
- **Location**: `refreshAllVideoGrids`
- **Impact**: Runs multiple refresh tasks in parallel. Currently low impact as tasks are fixed (subscription + channel), but warrants monitoring.
- **Status**: Monitoring.

### P2: WebTorrent Polling Interval
- **File**: `js/webtorrent.js`
- **Location**: `probePeers`
- **Impact**: Polling `setInterval` runs every ~2.5s during probes.
- **Mitigation**: Bounded by timeout and cleanup logic. Low priority.

## Metrics
- **Hits**: 1308
- **PRs Opened**: 1 (Fix unbounded relay concurrency)

## Decisions
- Using `RELAY_BACKGROUND_CONCURRENCY = 3` from `js/nostr/relayConstants.js`.
- Refactored `loadRelayList` to use `pMap`.
