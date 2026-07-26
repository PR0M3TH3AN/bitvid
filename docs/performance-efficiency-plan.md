# BitVid Performance & Efficiency Plan

Status: **Stage 2 complete locally — recommendation indexes are demand-driven and coalesced; Stage 3 source-health cancellation audited next**

## Goal

Reduce idle CPU, GPU, memory, relay traffic, and unnecessary network activity
without making feeds stale or weakening BitVid's Nostr-native recommendation
system.

BitVid must continue to ingest relevant notes, follows, zaps, watch events, and
moderation signals promptly. The optimization is about scheduling and bounded
work, not removing recommendation inputs or live feed updates.

## Baseline findings

Local observations on 2026-07-26 while serving the production build:

| Component | Observed load | Conclusion |
| --- | --- | --- |
| Static `serve dist` process | under 1% CPU, about 115 MB RSS | Not the heat source. |
| Browser main/renderer/GPU processes | renderer about 22% CPU, GPU about 7% CPU, renderer about 430 MB RSS | Primary area for profiling and improvement. |
| System memory | 24 GiB available; no swap in use | Not currently memory pressured. |

Code audit candidates:

- `ExploreDataService` starts for every session and refreshes watch-history tags
  every minute and tag-IDF every five minutes, even outside Explore/For You.
- `devReqMonitor.js` automatically patches WebSocket sends on localhost and
  wakes every two seconds. This is development-only but makes local testing
  noisier and more expensive than production.
- App startup registers/checks the service worker and explicitly calls
  `registration.update()` on every load.
- URL/torrent health checks can allocate media probes and WebTorrent tracker
  work; they must remain viewport-driven, bounded, and cancellable.
- The video-modal ambient background can perform recurring canvas draws while a
  video plays. It is a likely GPU hotspot and needs measurement before tuning.
- The image service-worker cache revalidates external images in the background;
  warm feeds can still cause many network/cache operations.

## Deeper system audit

This table separates verified mechanics from hypotheses. It is deliberately not
a list of features to remove: every item has a product boundary that must stay
intact.

| System | Verified finding | Risk / opportunity | Planned boundary |
| --- | --- | --- | --- |
| Nostr subscriptions and feed loading | Feed loading deduplicates normal in-flight requests and active feeds need live relay updates. | Over-throttling would make Home, follows, zaps, and moderation stale. | Preserve subscriptions and event ingestion; coalesce only duplicate refresh/re-rank work. |
| For You / Explore indexes | `ExploreDataService` is constructed during bootstrap, clones the video set into a worker, refreshes history tags each minute and IDF each five minutes. Event, visibility, and timer paths can request the same broad work. | Unused views pay recurrent CPU, worker-message, and allocation cost. | Keep lightweight dirty/version signals live; create and refresh the worker only for an active or imminent recommendation view, with one serialized refresh per index. |
| Event persistence and relay cache | IndexedDB writes are differential and idle-scheduled, but the payload is built from the complete `allEvents` and tombstone maps; restore likewise rehydrates the complete unexpired cache. TTL expiry is 10 minutes, with no explicit record/byte budget. | Large relay sessions can raise startup, structured-clone/serialization, IndexedDB, and renderer-memory cost. | Measure actual record/byte growth first, then add an eviction budget that preserves active/latest, user-owned, watched, and moderation-relevant events. Never replace the cache with a smaller unscoped relay query. |
| URL liveness cards | The observer is viewport/prefetch-margin driven, and URL checks are deduplicated at controller level. Hidden-until-verified cards intentionally start an eager check so they can become visible. | A large hidden-card batch can still fill work queues; discarded cards cannot presently express cancellation through the generic observer. | Retain the reveal guarantee, but add queue cancellation, page/feed budgets, and primary-source-first fallback. |
| WebTorrent stream health | Torrent probes are globally queued (two at a time), cached, deduplicated, capped at four peer connections and destroy each probe torrent. A reusable probe client remains after first use. | The safeguards are good, but queue entries may outlive a discarded feed and a health badge can still pull WebTorrent into an otherwise hosted-video session. | Add cancellation/queue pruning and explicit health-probe telemetry before changing limits; evaluate lazy WebTorrent loading separately from playback correctness. |
| WebTorrent startup bundle | The WebTorrent facade imports the roughly 212 KB minified implementation at module evaluation time. | Browsers can download/parse a torrent stack before the viewer plays or probes a torrent. | Measure module transfer/parse on cold Home, then introduce a lazy implementation loader only if hosted playback and health-badge behavior remain correct. |
| Service worker and external images | Boot checks existing registrations and calls `update()`; the image strategy returns cache quickly but starts a network revalidation for each cached image request. | Warm feeds can produce avoidable fetch/cache churn even when their images are already fresh. | Keep deploy reliability and bounded cache trimming; add a tested freshness policy rather than disabling updates or image caching. |
| Modal visuals and UI rendering | The ambient-video helper schedules animation-frame callbacks while active, although its current modal wiring needs trace validation. Feed rerenders replace card DOM and attach health observers again. | Canvas work may be a GPU cost; observer lifecycle needs a retained-node/queue profile before calling it a leak. | Instrument active animation callbacks and observed-card counts. Tune only if a playback trace shows material cost; add explicit observer teardown if retained cards are confirmed. |
| Development diagnostics | On localhost, `devReqMonitor` patches WebSocket sends and wakes every two seconds. | It contaminates local CPU and relay measurements but is not a production heat source. | Make it opt-in so normal development reproduces production behavior. |

### What is *not* a candidate for removal

- Nostr notes, follows, zaps, reactions, watch events, and moderation signals
  remain the raw material for feeds and recommendations.
- Active-feed subscriptions, source fallback, WebTorrent playback, and the
  stale-while-revalidate cache remain product capabilities.
- A timer or worker is changed only after a trace identifies it as active in a
  relevant scenario; no optimization is justified merely because code exists.

## Design rules

1. **Nostr ingestion stays live.** Keep subscriptions for active feeds and
   logged-in viewer context. New relevant events update local indexes promptly.
2. **Expensive work is demand-driven.** A new event marks an index stale; it
   does not force a whole recommendation rebuild until the associated feed is
   active or about to become active.
3. **Inactive views do no recurring work.** Hidden tabs, closed modals, and
   inactive feed views must pause timers, observers, and probe queues.
4. **Every background task has a bound.** Cap concurrency, use TTL caches,
   cancel obsolete work, and destroy listeners/workers when their feature is no
   longer in use.
5. **No silent product degradation.** Feed freshness, source fallback,
   WebTorrent playback, moderation, and user-visible recommendation inputs are
   acceptance criteria in every stage.
6. **Use cancellation, not just lower limits.** A task belonging to a removed
   card, closed modal, inactive feed, or hidden document must be removable from
   the queue; lowering concurrency alone can leave obsolete work running.
7. **Measure both wall time and retained state.** A faster task that retains a
   large worker snapshot, observer target, cache record, or probe client is not
   an efficiency win.
8. **Preserve discovery boundaries.** A lifecycle or batching optimization must
   use the same scoped relay/source selection for historical fetch and live
   subscription. Never make a feature appear faster by querying a smaller,
   unrelated source set and silently omitting valid user data.
   Every affected feature needs a regression fixture containing data available
   only through its scoped historical source and data arriving live afterward.

## Measurement harness (Stage 0)

Create a local-only, opt-in performance harness. It must be disabled by
default and absent from production behavior.

Implemented baseline surface: on `localhost`, `127.0.0.1`, or `::1`, set
`localStorage.__bitvidPerformanceHarness__ = "1"` and reload. The console API
`window.__bitvidPerformance.snapshot()` reports bounded long-task, resource,
navigation, heap (when supported), mark, and manually supplied gauge data.
`mark`, `setGauge`, and `increment` are available for later stage-specific
instrumentation. The harness does not initialize on a public host, even if the
storage key is set.

### Measurements

- Long tasks via `PerformanceObserver`.
- JS heap, where the browser exposes it.
- Active workers, timers, observers, URL media probes, torrent probes, and
  relay subscription/request counts.
- Feed refresh duration, item count, and recomputation reason.
- Recommendation-index snapshots: input size, queue/coalescing count, worker
  lifetime, and stale-to-fresh latency.
- Event-cache record count, estimated serialized bytes, restore duration, IDB
  writes/deletes, and protected-versus-evicted record categories.
- Browser process CPU/RSS sampled externally during test scenarios.

### Standard scenarios

1. Cold load to Home; wait 60 seconds without interaction.
2. Scroll through two feed pages, then stop.
3. Open and close Profile; remain on Home.
4. Open Explore and For You; receive a new relevant note, follow, zap, and
   moderation update.
5. Open hosted playback, then close it.
6. Open torrent-backed playback, then close it.
7. Background the tab for two minutes and restore it.
8. Load an inbox with both legacy NIP-04 and historical NIP-17 conversations,
   then receive a live NIP-17 message; verify all conversations are present.

### Stage gate

Record baseline results before any optimization. The harness itself must have a
test proving it does not initialize unless its explicit local debug flag is
set.

## Stage 1 — Make localhost relay monitoring explicit — complete

### Change

Change `js/devReqMonitor.js` so it only installs when
`localStorage.__bitvidReqMonitor__ === "1"` on a loopback host. Do not
auto-enable merely because the host is localhost, and never permit the monitor
on a public host.

### Why

It patches every WebSocket send, parses REQ frames, and has a two-second timer.
It is useful during a relay-storm investigation but should not distort ordinary
local performance testing.

### Tests and acceptance

- With the flag off: no WebSocket patch and no monitoring timer.
- With the flag on: existing relay-storm warnings still identify REQ kinds.
- No production host can enable it without the explicit local flag.
- Compare idle local CPU/long-task baseline before and after.

Implemented with `isRequestMonitorEnabled()` / `installRequestMonitor()` and
regression coverage for disabled localhost, enabled loopback, and public-host
rejection. To use it during a targeted local relay investigation, set
`localStorage.__bitvidReqMonitor__ = "1"` and reload; remove the key or set it
to any other value for normal profiling.

### Rollback

One isolated commit; restoring the previous activation condition restores the
old diagnostic behavior.

## Stage 2 — Lazy recommendation indexes

Implemented: `ExploreDataService` is no longer created during
ordinary bootstrap. Home/Profile sessions therefore create no recommendation
worker or recommendation intervals. Opening For You or Explore creates and
activates the service; events received while inactive mark it dirty and are
included in the activation refresh. Concurrent history/IDF signals share one
running rebuild and retain one forced follow-up pass. Focused lifecycle,
feed-coordinator, production-build, and browser navigation checks pass; manual
For You/Explore validation confirmed normal recommendations and responsive Home.

### Change

Do not initialize `ExploreDataService` globally in application bootstrap.
Start it when Explore or For You is first opened, and stop/pause its intervals
when neither view is active or the document is hidden.

Keep Nostr ingestion active. Incoming videos, watch-history changes, follows,
zaps, preference changes, and relevant moderation changes mark the associated
index stale. Refresh the index immediately when its feed is visible, or just
before rendering it.

Use a small lifecycle coordinator with these states: `not-created`, `idle`,
`dirty`, `refreshing`, and `paused-hidden`. A refresh request while refreshing
sets one follow-up dirty bit rather than starting another full worker message.
Snapshot only the minimal fields required by the worker and record snapshot
size in the local-only harness.

### Why

The current worker receives cloned video/history data on a one-minute and
five-minute cadence even when the viewer is using Home, Profile, or a modal.

### Tests and acceptance

- Home/Profile-only session creates no Explore worker or recommendation
  intervals.
- Opening Explore or For You initializes the worker once and produces the same
  ranking inputs as today.
- A new relevant note, follow, watch event, zap, or moderation update is
  reflected on the next active-feed refresh.
- Backgrounding the tab pauses the intervals; restoring it performs one bounded
  catch-up refresh.
- Existing For You tiering, Trending, and recommendation tests remain green.
- Timer, visibility, and event triggers coalesce into at most one active and
  one follow-up index calculation per index.

### Rollback

Feature-scoped lifecycle change behind a small coordinator boundary; restore
eager initialization if feed freshness regresses.

## Stage 3 — Bound source-health work to visible cards

### Audit findings (2026-07-26)

- `createCardObserver` retains an `IntersectionObserver` per grid container but
  has no disposal API. `VideoListView.render()` replaces card DOM without
  disconnecting the old observer, so detached cards can stay observed.
- `gridHealth` has a globally bounded, priority-ordered torrent queue, but its
  queued jobs have no owner/cancellation handle. A discarded card can therefore
  still start a real tracker/WebRTC probe.
- URL health uses an independent observer and video-probe wait queue with the
  same missing ownership boundary. Its fetch timeout aborts only on timeout,
  not when the card/grid disappears.

Implementation order: add disposable observer registrations and call them from
grid replacement/unmount; associate queued jobs with card owners and prune jobs
when their last owner disappears; finally pass an abort signal into active URL
and torrent probes. Cache/in-flight deduplication stays shared so one visible
card never cancels work still needed by another visible card.

### Change

Keep the existing viewport/preload observer and current two-at-a-time torrent
queue. Add an abort/cancellation token through URL probes and queue pruning for
WebTorrent work when cards leave the feed or its container is discarded. Hidden
cards that must be verified before reveal receive a small, observable per-feed
budget rather than an unbounded eager batch. Preserve deduplication by
event/source and separate positive/negative TTLs.

Do not probe every alternate mirror eagerly. Probe the primary source first and
only test an alternate when the primary is unavailable or playback needs it.

### Why

Media-element probes and WebTorrent tracker probes are useful for accurate
source badges and fallback, but are among the most expensive background tasks.

### Tests and acceptance

- Scrolling a large feed never exceeds the configured URL/torrent concurrency
  limit.
- Off-screen and removed cards do not start or retain probes.
- Cached results render badges without a second request.
- Dead URL still falls back to a working mirror or WebTorrent source.
- Closing a feed/modal tears down pending health work.
- Hidden-card verification is bounded and still reveals cards whose source
  proves healthy.

### Rollback

Keep the existing probe implementation available behind the observer boundary
until playback and badge tests pass on Chromium and Firefox.

## Stage 4 — Reduce playback visual overhead

### Change

First trace whether the video-modal ambient canvas is actually wired into the
current modal path, then profile it. If it appears in the hot path,
replace the free-running animation loop with `requestVideoFrameCallback` where
available, a capped fallback cadence, and automatic disablement for
`prefers-reduced-motion` or a low-power preference.

The effect must exist only while the modal video is actively playing and be
fully torn down on pause, close, source change, and hidden document.

### Tests and acceptance

- Hosted and torrent playback remain visually correct.
- Pause/close/source-change cancel all animation callbacks and observers.
- Background tabs make no canvas draws.
- Reduced-motion mode does not attach the visual effect.
- Compare renderer/GPU CPU while playing the same short clip before and after.

### Rollback

Keep the visual treatment behind a feature/config gate until manual playback QA
is complete.

## Stage 5 — Service-worker and image-cache cadence

### Change

- Keep service-worker registration, but avoid forcing a full update check on
  every application boot. Use normal browser update cadence or a bounded
  version/age policy.
- Add an image-cache freshness window so a cached external image is served
  immediately and only revalidated when stale or needed by a visible card.

### Tests and acceptance

- A fresh deploy still activates normally without a hard refresh.
- Rollback deploy still works with hashed assets and normal reload.
- Cached thumbnails/avatars paint immediately.
- Warm feed loads do not revalidate every external image at once.
- Image cache remains bounded and recovers safely from quota failures.

### Rollback

Keep cache format/version semantics intact; any regression can revert the
freshness policy without deleting user-visible image caching.

## Stage 6 — Bundle and feature activation review

### Change

Start with the WebTorrent implementation, because it is currently imported by
the facade at module evaluation time. Review other heavy feature modules only
from measured cold-load transfer/parse evidence. Dynamically import at first
use where safe: profile management, DMs, upload, torrent playback, and
feature-specific Nostr helpers. Do not defer the active feed, authentication,
or basic playback path in a way that creates visible delay.

### Tests and acceptance

- Initial Home load has fewer transferred/parsed bytes.
- Opening each deferred UI initializes once and still works offline/static-hosted.
- No feature code is fetched when its flag is off.
- Build artifact, cache, E2E, and visual tests pass.

## Stage 7 — Cache budget and feed-refresh coalescing

### Change

After Stage 0 records real cache growth, add explicit event-cache record and
byte budgets plus category-aware eviction. Protect currently active feed items,
the newest active version of an event, local/user-owned content, recent watch
history pointers, and moderation state needed for the current viewer. Evict
older, unreferenced relay data first. In the feed coordinator, coalesce
same-feed refresh requests and record the initiating reason, without delaying
an explicit user refresh.

### Why

The cache is already incremental at write time, but its full-map snapshot and
restore behavior can become expensive as a long-lived relay session grows.
Coalescing protects against several valid live signals causing redundant
render/rank passes together.

### Tests and acceptance

- Seeded oversized caches restore only the protected/bounded record set and
  issue normal scoped relay fetches for missing items.
- Feed data, deletions, replacements, moderation decisions, and recent watch
  history produce the same visible result before and after eviction.
- A burst of equivalent refresh signals produces one running refresh plus, at
  most, one follow-up; an explicit refresh is never swallowed.
- IndexedDB and localStorage fallback behavior remain covered.

### Rollback

Version cache metadata and keep the current restore format readable. Reverting
the budget must not erase cached user data.

## Release procedure

Each stage ships independently. The recommended order is Stage 0, Stage 1,
Stage 2, Stage 3, Stage 7, Stage 5, then the measurement-dependent visual and
bundle work (Stages 4 and 6):

1. Capture baseline and define the expected improvement.
2. Make one focused implementation commit.
3. Run the stage's targeted tests plus relevant browser QA.
4. Compare measurement results to the baseline.
5. Run `npm run build` and the applicable design checks.
6. Promote only when no feed freshness, playback, moderation, or cache
   regression is observed.

Do not combine stages in one commit. A failed stage is reverted independently
without discarding validated improvements from earlier stages.
