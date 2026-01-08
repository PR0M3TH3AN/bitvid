# Watch history system overview

This doc ties the playback telemetry in `js/services/watchHistoryTelemetry.js` to
our watch history logging pipeline documented in
[`docs/watch-history-logging.md`](watch-history-logging.md).

## System map

* **Playback telemetry** (`WatchHistoryTelemetry`) listens to the active `<video>`
  element and decides when a watch should be logged.
* **Watch history service** (`WatchHistoryService`) batches views into a local
  queue, publishes snapshots to relays, and emits in-app events when the queue or
  snapshots change.
* **Watch history logging pipeline** (v2) describes how snapshots are encrypted
  and published to relays. See `docs/watch-history-logging.md` for the wire
  format and publish cadence.

## What gets captured

### Playback telemetry fields

`WatchHistoryTelemetry` watches playback and only logs a view once the viewer
passes the threshold duration (default 12 seconds). It also tracks a per-viewer
cooldown key so the same actor doesn’t log the same pointer repeatedly in a
single session. The telemetry payload stores a sanitized slice of video metadata
(id, title, thumbnail, pubkey, created_at) and intentionally omits playback
endpoints (URL/magnet/hash) so these never get persisted as watch history
metadata.

### Watch history snapshots

Once a view is accepted, the telemetry layer forwards the pointer to the watch
history service. The service packages pointer-only entries into watch-history
snapshots (chunked NIP-04 encrypted events) and emits a pointer index event. The
payload shape and relay publication sequence are documented in
`docs/watch-history-logging.md`.

## Where data is stored

* **Local queue:** `WatchHistoryService` uses `localStorage` to persist the
  in-flight view queue (`bitvid:watch-history:queue:v1`) so the history survives
  refreshes even before a snapshot succeeds.
* **Local cache:** A rolling watch-history cache (TTL controlled via
  `WATCH_HISTORY_CACHE_TTL_MS`) keeps recently synced history available without
  hitting relays on every page load.
* **Relay snapshots:** Chunked, encrypted watch-history events are sent to relays
  using the kind and list identifier configured in `config/instance-config.js`.

> **Roadmap note:** Current watch history is **not** stored as an encrypted
> local list. We plan to add encrypted local history in the future.

## Privacy considerations

* Watch history metadata is intentionally sanitized to exclude playback URLs,
  magnets, and hashes; only presentation-safe fields are kept for history
  rendering.
* Relay payloads store pointer tags rather than full metadata, ensuring that
  relays don’t learn titles or thumbnails unless an operator opts into local
  metadata caching (see `docs/watch-history-logging.md`).
* Session actors are treated as local-only history when they cannot publish to
  relays; the history service retains those pointers locally without attempting
  network sync.

## Event emission and consumption

### Telemetry → watch history service

`WatchHistoryTelemetry.preparePlaybackLogging` attaches listeners to the video
player. When the threshold is hit, it calls `watchHistoryService.publishView`
(when available) or falls back to `nostrClient.recordVideoView`. Successful
publish results are also forwarded to `ingestLocalViewEvent` so the view counter
can update immediately.

### Watch history service events

`WatchHistoryService` emits events to subscribers and to the browser via the
`bitvid:watchHistory` custom event. Any UI component can subscribe to these
updates and refresh the watch-history view or related counters.

## Configuration and sampling

* **Telemetry sampling threshold:** `WatchHistoryTelemetry` defaults to 12
  seconds before a view is logged. Integrations can override
  `viewThresholdSeconds` when constructing the class.
* **Feature flag:** Watch-history v2 is guarded by `FEATURE_WATCH_HISTORY_V2` in
  `js/constants.js`.
* **Instance configuration:** `config/instance-config.js` exposes watch-history
  limits (max items, payload size), batching controls
  (`WATCH_HISTORY_BATCH_RESOLVE`, `WATCH_HISTORY_BATCH_PAGE_SIZE`), and cache TTL
  (`WATCH_HISTORY_CACHE_TTL_MS`) for operator tuning.

## Related docs

* [`docs/watch-history-logging.md`](watch-history-logging.md)
* [`docs/instance-config.md`](instance-config.md)
