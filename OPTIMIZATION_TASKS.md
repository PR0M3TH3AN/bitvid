# Optimization Task Stubs

The following tasks were identified and implemented to resolve high CPU/GPU usage and potential crashes on the website.

## Completed Tasks

### 1. Optimize Ambient Background Animation
**Problem:** The `AmbientBackground` controller was calling `resizeCanvas` inside the `requestAnimationFrame` loop. This function accessed `getBoundingClientRect()`, causing synchronous layout thrashing (forced reflow) on every frame, leading to high CPU/GPU usage.
**Fix:**
- Refactor `js/ui/ambientBackground.js` to use `ResizeObserver`.
- Only update canvas dimensions when the element actually resizes.
- Remove layout reads from the animation loop.

### 2. Async Chunking for Explore Data Service
**Problem:** `ExploreDataService` performed heavy synchronous iterations over large datasets (Watch History and Video Tags) on the main thread. This could cause the UI to freeze (long tasks) during initialization or updates.
**Fix:**
- Refactor `buildWatchHistoryTagCounts` and `buildTagIdf` in `js/services/exploreDataService.js`.
- Implement processing in chunks (e.g., 500 items).
- Yield to the main thread using `setTimeout` between chunks to allow user interaction and frame rendering.

### 3. Throttle URL Health Video Probes
**Problem:** The `UrlHealthController` spawned a `<video>` element for every video card to probe connectivity. When loading a grid of 50+ videos, this caused a storm of simultaneous media decoding requests, leading to resource exhaustion and browser instability.
**Fix:**
- Refactor `js/ui/urlHealthController.js`.
- Implement a concurrency limiter (queue) for `probeUrlWithVideoElement`.
- Limit active video probes to a maximum of 3 concurrent instances.

## Future Optimization Tasks

### 4. Virtualize Video List Rendering
**Description:** Implement virtual scrolling (windowing) for the main video grid.
**Benefit:** Reduces DOM node count and memory usage when displaying thousands of videos.
**Action:**
- Create a `VirtualScroller` component.
- Only render video cards that are currently in the viewport (plus a buffer).

### 5. Move Heavy Computation to Web Worker
**Description:** Move the tag IDF and Watch History analysis entirely off the main thread.
**Benefit:** Zero impact on UI responsiveness during data refreshes.
**Action:**
- Create `js/workers/exploreData.worker.js`.
- Move `ExploreDataService` logic into the worker.
- Use `postMessage` to send video data and receive calculated stats.

### 6. Optimize Image Loading with `loading="lazy"` & `decoding="async"`
**Description:** Ensure all thumbnails and avatars use modern browser lazy loading.
**Benefit:** Faster initial page load and lower bandwidth usage.
**Action:**
- Audit `VideoCard` and `VideoModal` templates.
- Ensure `<img>` tags have `loading="lazy"` and `decoding="async"`.
