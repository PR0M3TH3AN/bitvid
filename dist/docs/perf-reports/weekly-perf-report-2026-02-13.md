# Weekly Performance Report — 2026-02-13

**Agent:** `bitvid-perf-deepdive-agent`
**Focus:** Relay Request Concurrency

## Executive Summary

Identified a critical performance risk in `js/nostr/reactionEvents.js` where reaction list and publish operations were using unbounded `Promise.all` across all configured relays. This could lead to network saturation, browser connection limits (blocking other requests), and potential timeouts for users with many relays.

**Optimization:** Replaced `Promise.all` with `pMap` to enforce a concurrency limit of 3 (`RELAY_BACKGROUND_CONCURRENCY`), aligning with best practices established in `commentEvents.js`.

## Methodology

### Scenario
Simulate `listVideoReactions` call with a client configured for 20 relays.
- **Tools:** `benchmarks/reaction_loading_bench.mjs` (new harness)
- **Environment:** Node.js 22 (Agent Environment)
- **Metric:** Peak concurrent `pool.list()` calls.

### Baseline Measurements

| Metric | Value | Notes |
| :--- | :--- | :--- |
| Peak Concurrency | **20** | Unbounded; fired all requests simultaneously. |
| Total Time (Mock) | ~111ms | Limited only by the longest single request (mock delay 100ms). |

### After Optimization

| Metric | Value | Notes |
| :--- | :--- | :--- |
| Peak Concurrency | **3** | Capped by `RELAY_BACKGROUND_CONCURRENCY`. |
| Total Time (Mock) | ~705ms | Increased latency is expected and acceptable for background operations to preserve network health. |

## Changes

### 1. Concurrency Limiting in `js/nostr/reactionEvents.js`
- **Before:** `await Promise.all(relayList.map(...))`
- **After:** `await pMap(relayList, ..., { concurrency: 3 })`
- **Impact:** Prevents "thundering herd" of WebSocket requests.

### 2. New Benchmark Harness
- Added `benchmarks/reaction_loading_bench.mjs` to reproducible measure concurrency of reaction loading.

## Verification
- Unit tests (`tests/nostr/reaction-events.test.mjs`) passed.
- Benchmark confirmed concurrency cap is active.

## Next Steps
- **Audit `js/nostr/viewEvents.js`**: Similar unbounded `Promise.all` pattern exists there and should be patched in a future run.
- **Audit `js/nostr/dmSignalEvents.js`**: Another potential candidate for concurrency limiting.
