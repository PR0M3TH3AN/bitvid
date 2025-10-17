# Watch history logging (v2 pipeline)

bitvid's watch history sync is orchestrated by the
[`WatchHistoryService`](../js/watchHistoryService.js). The service collects
per-video pointer data during playback, batches it in session storage, and emits
encrypted snapshots to relays only when a publish is triggered. Relay payloads
stick to pointer identifiers so title, thumbnail, and profile context remain on
the client unless an operator opts into local metadata caching.

## Snapshot composition

Snapshots publish two event types to the shared `WATCH_HISTORY_KIND` stream:

1. **Chunk events** — Each chunk carries a deterministic identifier in its
   `d` tag, advertises its `snapshot` and `chunk` position, and is tagged with
   `['encrypted','nip04']`. The first chunk is additionally marked as
   `['head','1']` and may append `"a"` tags that reference previous chunk
   addresses, allowing readers to reconstruct the full set even when relays
   deduplicate aggressively.【F:js/nostrEventSchemas.js†L175-L189】【F:js/nostr.js†L2329-L2369】
2. **Pointer event** — After chunks are accepted, bitvid emits a compact index
   event containing the canonical list identifier (`['d', WATCH_HISTORY_LIST_IDENTIFIER]`),
   the `snapshot` label, the total chunk count, and an `a` tag for each chunk
   address.【F:js/nostrEventSchemas.js†L157-L170】【F:js/nostr.js†L2425-L2441】

Chunk content is a NIP-04 encrypted JSON envelope of `{ version: 2, snapshot,
chunkIndex, totalChunks, items[] }`. Items are pointer descriptors (`e` or `a`
references plus optional relay hints) so that relays never learn which titles
were played—only which events or addresses the client can dereference later.【F:js/nostr.js†L2337-L2364】

## Batching configuration

Operators can toggle grouped resolution with `WATCH_HISTORY_BATCH_RESOLVE` and
optionally cap each response by defining `WATCH_HISTORY_BATCH_PAGE_SIZE` in
`config/instance-config.js`. Leaving the page size unset returns the full
`WATCH_HISTORY_MAX_ITEMS` window while still letting the UI paginate locally,
but setting a positive integer keeps API payloads in lockstep with batched
renderers like `historyView`.【F:config/instance-config.js†L101-L123】【F:js/nostr.js†L2987-L2998】【F:js/historyView.js†L1-L38】

## Snapshot cadence

`WatchHistoryService.publishView` queues pointer entries while the feature flag
is enabled, merging repeats with a one-minute throttle and persisting the queue
in `sessionStorage`. Snapshots run when `watchHistoryService.snapshot()` is
invoked (e.g., on `beforeunload`, `visibilitychange`, or manual sync actions in
the history UI) and clear the queue on success.【F:js/watchHistoryService.js†L872-L917】【F:js/app.js†L6041-L6081】【F:js/app.js†L7467-L7484】
If no items are pending, the snapshot resolves with an empty result so UI calls
remain idempotent.【F:js/watchHistoryService.js†L932-L944】

## Republish and backoff

When a snapshot publish fails but the response is retryable, the service stores
the returned `snapshotId`, records the originating reason, and delegates to the
Nostr client to retry with exponential backoff. Retries start after two seconds,
double per attempt with 25% jitter, cap at five minutes, and stop after eight
attempts unless a publish succeeds sooner.【F:js/watchHistoryService.js†L948-L985】【F:js/watchHistoryService.js†L723-L777】【F:js/nostr.js†L1988-L2087】

## Legacy payload handling

Readers hydrate history by combining the pointer event, any encrypted chunks,
and fallback metadata embedded in legacy watch-history lists. The resolver still
accepts the `watch-history:v2:index` identifier, merges pointer tags from the
index event, and falls back to plaintext content when decryption fails so older
relays remain compatible.【F:config/instance-config.js†L60-L78】【F:js/nostr.js†L2704-L2779】【F:js/nostr.js†L5216-L5264】

## Local metadata toggles

By default the service only persists pointer data to relays; richer metadata is
stored locally (and opt-in). Users can toggle the "store watch history metadata"
preference, which flips a localStorage flag, clears cached entries when
disabled, and never pushes the sanitized video/profile cache over the network.【F:js/watchHistoryService.js†L82-L140】【F:js/watchHistoryService.js†L232-L313】【F:js/watchHistoryService.js†L331-L376】

See the [`WatchHistoryService` API](../js/watchHistoryService.js) for
event hooks, queue inspection helpers, and manual snapshot controls.
