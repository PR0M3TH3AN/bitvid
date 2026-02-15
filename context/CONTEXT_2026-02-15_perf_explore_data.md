# Context: Explore Data Service Performance Optimization

**Goal**: Reduce background CPU and battery usage by pausing `ExploreDataService` updates when the tab is hidden.

**Scope**:
- `js/services/exploreDataService.js`

**Problem**:
- The service runs two `setInterval` timers (1 minute and 5 minutes) to refresh watch history counts and tag IDF.
- These run even when the tab is hidden or minimized, consuming resources unnecessarily.

**Proposed Solution**:
- Modify the interval callbacks to check `document.hidden`. If true, skip the update.
- Add a `visibilitychange` listener to trigger an immediate update when the tab becomes visible (if the data is stale).

**Assumptions**:
- `document.hidden` is supported in target browsers (modern browsers support it).
- Users do not need real-time updates for "explore" data when the tab is not visible.
