# perf-agent Daily Run - 2026-02-17

## Status: Completed

**Goals:**
- Identify and fix unbounded concurrency in network operations.
- Audit upload documentation.
- Fix CI failures (lint and unit tests).

**Actions:**
- **Identified:** Unbounded `Promise.all` usage in `js/nostr/dmSignalEvents.js` and `js/services/dmNostrService.js`.
- **Fixed:** Replaced with `pMap` and `RELAY_BACKGROUND_CONCURRENCY || 3`.
- **Fixed CI (lint):**
  - Increased `maxBuffer` in `scripts/check-hex.js` to 10MB.
  - Added exclusions for agent artifact directories (`perf/`, `test_logs/`, etc.) to `scripts/check-hex.js`.
- **Fixed CI (test):** Updated `ExploreDataService.handleVisibility` to trigger immediate data refresh when becoming visible, satisfying `tests/unit/services/exploreDataService.test.mjs`.
- **Verified:** Documentation in `content/docs/guides/upload-content.md` correctly specifies port 3000.
- **Tested:** Unit and integration tests passed.

**Files Changed:**
- `js/nostr/dmSignalEvents.js`
- `js/services/dmNostrService.js`
- `js/services/exploreDataService.js`
- `scripts/check-hex.js`
- `daily-perf-report-2026-02-17.md`
- Context/Logs: `context/`, `todo/`, `decisions/`, `test_logs/`

**Metrics:**
- DM network concurrency bounded to 3.
- Data refresh reliability on visibility change improved.
