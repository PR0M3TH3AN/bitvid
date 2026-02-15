# Decision: Visibility Gating for ExploreDataService

## Context
The `ExploreDataService` runs two `setInterval` loops (`watchHistoryInterval` and `tagIdfInterval`) to refresh data every 1 and 5 minutes, respectively. These loops spawn Web Workers to process data.

## Problem
These intervals continue to run even when the browser tab is hidden or backgrounded, consuming CPU and battery unnecessarily.

## Solution
Implement visibility gating:
- Listen for `visibilitychange` events on `document`.
- When `document.hidden` is true, clear the intervals.
- When `document.hidden` is false, restart the intervals.

## Alternatives Considered
- Use `requestIdleCallback`: Still might run if the browser thinks it's idle but hidden. Visibility check is more direct for "user not looking".
- Increase interval when hidden: Still consumes some resources. Complete pause is better for this non-critical background task.

## Verification
- Code review of `js/services/exploreDataService.js`.
- Lint check passed.
