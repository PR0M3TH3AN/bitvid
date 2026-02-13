# Daily Perf Report - 2026-02-13

## Summary
Implemented visibility gating for `VideoEventBuffer` to prevent UI thrashing when the tab is hidden. Audited upload documentation against implementation.

## P0/P1 Findings
-   **P1 - VideoEventBuffer Thrashing**: The `VideoEventBuffer` was flushing events and triggering UI callbacks every 75ms regardless of visibility. This wasted CPU on layout/paint recalculations for hidden tabs.
    -   **Fix**: Modified `flush()` to buffer updates when `document.hidden` is true, and flush them in a batch upon `visibilitychange`.
-   **P2 - Upload Limits**: Documentation states a 2GB limit due to client-side hashing. Verification confirmed `js/utils/torrentHash.js` reads the file for hashing, which is memory-bound in browsers. Docs are accurate.

## Metrics
-   **Login Time**: (Not measured this run)
-   **Queue Sizes**: (Not measured this run)

## PRs / Changes
-   **VideoEventBuffer**: Added visibility gating.

## Blockers & Decisions
-   **Decision**: Prioritized `VideoEventBuffer` fix over `WatchHistory` backoff as it affects the main feed loop directly.
-   **Decision**: Accepted the 2GB upload limit documentation as accurate for the current architecture.

## Next Steps
-   Investigate `WatchHistory` republish loop for similar visibility gating.
-   Consider using streaming hashing (e.g., `crypto.subtle`) to lift the 2GB limit in the future.
