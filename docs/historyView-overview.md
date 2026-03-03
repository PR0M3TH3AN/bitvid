# Overview: `js/historyView.js`

## Summary
The `js/historyView.js` module is responsible for rendering and managing the watch history user interface. It handles loading history data (via a preferred feed engine or a service fallback), formatting it chronologically, displaying moderation states for videos, and allowing users to interact with history items (play, view channel, or remove).

It fits into the application as a view-layer controller. It retrieves application state and services via `getApplication()` and relies heavily on `watchHistoryService` for data and NIP-07/NIP-46 signers (via `nostrClientFacade`) to identify the user.

## Public Surface

### `buildHistoryCard({ item, video, profile, variant })`
Creates a DOM article element representing a single watch history entry.
- **Parameters:**
  - `item` (Object): The history item metadata (contains `pointerKey`, `watchedAt`, etc.).
  - `video` (Object): The associated video object.
  - `profile` (Object): The creator's profile object.
  - `variant` (String): UI variant (e.g., "compact").
- **Returns:** `HTMLElement` (an `<article>` tag).
- **Side effects:** Registers the created card in a local `historyCardRegistry` to manage moderation states dynamically.

### `createWatchHistoryRenderer(config = {})`
Factory function that creates a stateful renderer object to manage the history grid.
- **Parameters:**
  - `config` (Object): Overrides for DOM selectors, fetch strategies, and batch sizes.
- **Returns:** An object with lifecycle methods (`init`, `ensureInitialLoad`, `refresh`, `loadMore`, `destroy`) and event handlers (`handleRemove`).
- **Side effects:** Attaches global event listeners for moderation updates (`video:moderation-override`, `video:moderation-block`), DOM event listeners for clicks on the grid, and Intersection Observers for infinite scrolling.

### `initHistoryView()`
Entry point intended to be called when the watch history page/view is initialized.
- **Returns:** `Promise<void>`
- **Side effects:** Attaches an info popover to `#historyInfoTrigger` and calls `init()` on the default `watchHistoryRenderer`.

## Main Execution Paths

1. **Initialization (`initHistoryView` -> `renderer.init`)**
   - Resolves DOM elements via selectors.
   - Attaches event listeners (click handlers for actions, intersection observer for load more).
   - Subscribes to `fingerprint` updates from `watchHistoryService` and moderation events from `document`.
   - Checks feature flags (sync enabled, local only) to update the feature banner.
   - Triggers `refresh(force: true)` to fetch data.

2. **Fetching Data (`loadHistory`)**
   - Calls `fetchHistory` (which attempts the `watch-history` feed engine first, falling back to `watchHistoryService`).
   - Normalizes the retrieved items (`normalizeHistoryItems`), grouping and sorting by `watchedAt`.
   - Computes a `fingerprint` string to detect changes.

3. **Rendering Data (`renderInitial` -> `renderNextBatch`)**
   - Clears the existing grid.
   - Slices the normalized items based on `batchSize`.
   - Hydrates the batch (applies moderation decorators).
   - Groups items by day (Today, Yesterday, Date) and appends `buildHistoryCard` results to the DOM.

4. **User Interactions (Grid Click Handler)**
   - Catches click events bubbling up from the grid.
   - Dispatches based on `data-history-action`:
     - `"play"`: Calls `app.playVideoWithFallback()`.
     - `"channel"`: Calls `app.goToProfile()`.
     - `"remove"`: Calls `renderer.handleRemove()`, which removes the DOM node, updates the service, and optionally refreshes the view.

## Assumptions & Invariants
- Assumes the presence of a global application context accessible via `getApplication()`.
- Relies on DOM structure matching hardcoded selectors (e.g., `#watchHistoryGrid`, `#watchHistoryLoading`).
- Assumes `watchHistoryService` exposes `loadLatest`, `snapshot`, `subscribe`, and capability flags (`isEnabled`, `isLocalOnly`).
- Invariant: A card's moderation state is managed dynamically via `historyCardRegistry`; cards must be registered upon creation and cleaned up upon removal.

## Edge Cases & Error Paths
- **Feed Engine Failure:** If the primary feed engine fails or isn't registered, it gracefully falls back to a locally instantiated engine or directly to the `watchHistoryService`.
- **Empty/Disabled States:** Handles scenarios where history is empty or unsupported (e.g., guest users) by swapping visibility of grid, loading, and empty state containers.
- **Moderation Overrides:** Handles moderation overrides asynchronously. If an override fails, it resets the loading state of the override button and logs the error.

## Performance & Concurrency Considerations
- Infinite scrolling is implemented via `IntersectionObserver` to lazily render DOM elements in batches (`WATCH_HISTORY_BATCH_SIZE`).
- Uses `DocumentFragment` to batch DOM insertions during rendering.
- Prevents redundant renders by comparing the computed `fingerprint` of the item list before committing changes.

## When to Change
- Consider refactoring if the hardcoded DOM selectors become brittle during UI component migrations.
- Extract the complex moderation badge generation (`createHistoryCardBadge`, `applyHistoryCardModeration`) if moderation logic needs to be shared across other views (like feeds or search).

## Why it works this way
- The factory pattern (`createWatchHistoryRenderer`) allows the same logic to power the main page view and potentially smaller embedded views (like a modal variant) by passing different config selectors.
- Keeping a local `historyCardRegistry` prevents having to do expensive DOM queries to find and update video cards when moderation events (like blocking a user globally) occur.