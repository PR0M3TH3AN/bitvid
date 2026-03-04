# Weekly Race Condition Report: 2026-02-14

## Audit Overview
- **Agent**: bitvid-race-condition-agent
- **Focus Areas**: `js/nostr/client.js`, `js/nostr/managers/ConnectionManager.js`, `js/nostr/videoEventBuffer.js`
- **Cadence**: Weekly

## Executive Summary
One critical race condition was identified in the `NostrClient` initialization logic. The client flagged itself as `isInitialized = true` synchronously at the start of the `init()` method, before the connection pool was actually ready. This allowed concurrent calls (or UI components checking the flag) to access the uninitialized pool, causing crashes (`TypeError: Cannot read properties of null`).

## Findings

### 1. Critical: NostrClient Initialization Race
- **Location**: `js/nostr/client.js`
- **Severity**: Critical
- **Description**: The `init()` method set `this.isInitialized = true` immediately to prevent re-entrant calls. However, `ensurePool()` and `connectToRelays()` are asynchronous. Any component checking `client.isInitialized` during this window would proceed to use the client and crash.
- **Interleaving**:
  1. Caller A calls `client.init()`.
  2. `client.isInitialized` becomes `true`.
  3. Caller A awaits `restoreLocalData()` (async).
  4. Caller B checks `client.isInitialized` -> `true`.
  5. Caller B calls `client.subscribeVideos()`.
  6. `subscribeVideos` calls `this.pool.sub`.
  7. `this.pool` is `null` (because Caller A hasn't reached `ensurePool` yet).
  8. Crash.

- **Fix Implemented**:
  - Introduced `this.initPromise` to track the ongoing initialization.
  - `init()` now returns the existing promise if called concurrently.
  - `this.isInitialized` is only set to `true` **after** the pool is ready and relays are connected.
  - Fix validated with a new reproduction test `tests/race/nostr-client-init-race.test.mjs`.

## Other Observations

### VideoEventBuffer (Low Risk)
- `js/nostr/videoEventBuffer.js` uses a debounce timer (`scheduleFlush`) and checks `document.hidden` to prevent UI thrashing.
- A potential "render race" exists where `flush()` triggers `onVideo` before NIP-71 metadata is fully hydrated. This is an intended trade-off for responsiveness (Stale-While-Revalidate pattern) and not a data corruption bug.

### ConnectionManager (Safe)
- `js/nostr/managers/ConnectionManager.js` properly guards `ensurePool` with `this.poolPromise`, which prevented double-instantiation but didn't protect the `NostrClient` wrapper from the race described above.

## Next Steps
- **Next Audit**: Review `js/nostr/nip07Permissions.js` and `js/nostr/nip46Client.js` for signer negotiation races.
- **Monitoring**: Watch for `Cannot read properties of null` errors in Sentry related to `pool.sub`.
