# Agent Task Log: perf-agent

- **Date**: 2026-02-15
- **Status**: Completed
- **Agent**: perf-agent

## Summary
Optimized `ExploreDataService` to reduce background resource usage.

### Changes
- **ExploreDataService**:
  - Gated `setInterval` for watch history (1m) and IDF (5m) updates to skip execution when `document.hidden` is true.
  - Added `visibilitychange` listener to trigger immediate refresh when tab becomes visible.
- **Tests**:
  - Added `tests/unit/services/exploreDataService.test.mjs` to verify visibility logic.
- **CI Fix**:
  - Updated `scripts/check-hex.js` to ignore `perf/**` to prevent CI failure when `perf/hits-*.json` contains binary-like data or hex codes from `min.js` files.
  - Updated `rg` command to exclude `*.min.js` and `*.map` to prevent creating massive hits files.

### Artifacts
- `perf/daily-perf-report-2026-02-15.md`
- `tests/unit/services/exploreDataService.test.mjs`
- `perf/hits-2026-02-15.json`
- `context/CONTEXT_2026-02-15_perf_explore_data.md`
- `decisions/DECISIONS_2026-02-15_perf_explore_data.md`
