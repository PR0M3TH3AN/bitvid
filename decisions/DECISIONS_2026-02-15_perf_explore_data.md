# Decisions: Explore Data Service Performance Optimization

## Decision 1: Gate intervals with `document.hidden`
**Context**: `setInterval` runs unconditionally.
**Choice**: Add `if (document.hidden) return;` at the start of the interval callback.
**Rationale**: Simple, effective way to stop processing. `clearInterval` / `setInterval` on visibility change is more complex to manage state.

## Decision 2: Add `visibilitychange` listener
**Context**: If we skip updates, data becomes stale.
**Choice**: Listen for `visibilitychange`. If visible, call `refreshWatchHistoryTagCounts()` and `refreshTagIdf()`.
**Rationale**: Ensures that when the user returns, they see fresh data immediately (or very soon). The existing `refresh...` methods already handle debounce/staleness checks, so calling them is safe.
