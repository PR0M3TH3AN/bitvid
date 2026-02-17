# Daily Performance Report - 2026-02-17

**Summary**: Identified and fixed background CPU usage in `ExploreDataService` when the tab is hidden. Found unbounded concurrency in `RelayHealthService`.

## Findings

### P1: Background Interval Leaks (Fixed)
- **File**: `js/services/exploreDataService.js`
- **Issue**: `startIntervals()` initiated recurring timers (watch history sync, tag IDF calc) even if `document.hidden` was true at startup (e.g., background tab load).
- **Impact**: Wasted CPU and network in background tabs.
- **Fix**: Added explicit `document.hidden` check in `startIntervals`.

### P2: Unbounded Concurrency (Identified)
- **File**: `js/services/relayHealthService.js`
- **Issue**: `refresh()` uses `Promise.allSettled(urls.map(...))` to check all relays simultaneously.
- **Impact**: Can spike network connections (N+1) if the relay list is large.
- **Recommendation**: Implement a concurrency pool (e.g., limit to 3 parallel checks).

### Linting Issues
- `npm run lint:hex` failed with `ENOBUFS` due to large `js/webtorrent.min.js`.
- **Fix**: Increased `spawnSync` buffer size in `scripts/check-hex.js` and added exclusion (though git grep exclusion logic seems flaky for this file).

## Metrics
- **Login Time**: Not measured this run.
- **Background CPU**: Expected reduction in background tab CPU usage due to `ExploreDataService` fix.

## Actions Taken
- [x] Patched `js/services/exploreDataService.js`.
- [x] Patched `scripts/check-hex.js` to fix linter crash.
- [x] Created `perf/hits-2026-02-17.json` inventory.
