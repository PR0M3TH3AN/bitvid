# Active URL-media final-owner cancellation

Source: docs/performance-efficiency-plan.md Stage3 requires removed cards not retain probes and shared visible cards not cancel each other's work. PROGRAM records owner continuation "Then continue with the active-probe/URL cancellation work." Dispatch explicitly routed this correction at3dac0afb after independent nine-mode confirmation.

The prior queued-only lifecycle tests deliberately allowed an active probe to finish and cache healthy/offline after its final observer owner was disposed. That was the contract for items4/5, not evidence of a regression. This item implements the next planned boundary: last-owner disposal during active video-element probing now immediately pauses/removes src/reloads, removes media listeners and the timeout, and settles cancelled/null without writing health cache or starting mirrors. Existing finally releases the slot once and advances FIFO. Its cancelled marker is synchronous, so a fresh owner even in the same turn obtains a new promise; late old callbacks must not cache, paint, remove newer inflight or release slots again.

Explicit corrections in tests/url-health-lifecycle.test.mjs:
- Disposed active-success result/cache retention -> immediate cleanup/null/no-cache and stale success/error callback immunity, followed by a fresh successful request.
- Disposed final failure/offline cache -> separately retained live-owner offline cache check; disposed late error now strict null/no-cache.
- Disposed timeout-driven cleanup -> cancellation before any time tick, plus separate live-owner retry-success and retry-timeout/cache scenarios.
- Rejoin after final-owner disposal -> new promise/new primary; sharing before final owner leaves still uses the same promise/ordered mirrors.

Separate live-owner healthy/offline/timeout cache, timeout retry, shared/cross-controller/legacy ownerless consumers, bounded concurrency/FIFO, queued cancellation and ordered mirrors remain required. No observer/cache/HEAD/HLS/torrent/playback policy change. Browser/network/CPU/RSS evidence remains a later gate.
