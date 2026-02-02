# Comment threads & discussion counts (Nostr → UI flow)

This note documents how bitvid turns Nostr comment events into UI comment threads and discussion counts. The primary implementations live in:

- `js/services/commentThreadService.js` (comment thread hydration + caching)
- `js/services/discussionCountService.js` (NIP-45 count queries + DOM updates)

## Comment thread flow (`CommentThreadService`)

### Data sources

`CommentThreadService` is the single place that fetches and subscribes to comment events for a video. It relies on the injected `nostrClient` APIs:

- `fetchVideoComments(target, options)` for the initial thread load.
- `subscribeVideoComments(target, options)` to keep the thread up to date in real time.

The service builds a `target` payload using the current video metadata:

- `videoEventId` (event id)
- `videoDefinitionAddress` from `buildVideoAddressPointer(video)`
- `videoKind`
- `videoAuthorPubkey`
- `rootIdentifier` / `rootIdentifierRelay` (derived from `video.videoRootId`, pointer identifiers, or tag data)
- optional `parentCommentId` context when fetching a reply thread

Internally, it also infers parentage from the incoming comment events by looking at `e` tags; the most recent `e` tag that is **not** the video event id becomes the parent comment id for threading. It also watches for the `i` tag to update root identifier and relay details.

### Caching

When `FEATURE_IMPROVED_COMMENT_FETCHING` is enabled, comment events are cached in `localStorage`:

- Key format: `bitvid:comments:<videoEventId>`
- TTL: 5 minutes
- Versioned schema: `COMMENT_CACHE_VERSION = 2`

Cache usage is simple: load from cache during `loadThread`, and write the latest event list after thread updates. Cache diagnostics (`commentCacheDiagnostics.storageUnavailable`) are surfaced to consumers to indicate storage issues.

### Polling & refresh

There is **no polling loop** for comments. Refresh happens through:

1. A one-time fetch via `fetchVideoComments` during `loadThread`.
2. A live subscription via `subscribeVideoComments`, which streams new comments into the thread.

Profile hydration for comment authors is batched and debounced (default 25ms), with up to three retry attempts and a backoff delay between attempts.

### UI surfacing

`VideoModalCommentController` owns the comment UI and subscribes to `CommentThreadService` callbacks:

- `onThreadReady` → full thread render
- `onCommentsAppended` → incremental updates
- `onError` → status messaging

The controller translates the thread snapshot into UI state for the modal and uses the comment thread’s profile cache to annotate authors.

### Telemetry/logging

All comment-thread telemetry is routed through `logger.dev`/`logger.user` (no direct console logging). The service emits warnings for:

- Nostr client failures (fetch/subscribe)
- Comment cache read/write errors
- Profile hydration retries and failures

## Discussion count flow (`DiscussionCountService`)

### Data sources

`DiscussionCountService` uses NIP-45 COUNT queries to count comment events across relays. It requires a Nostr client that exposes:

- `nostrClient.pool` (relay pool)
- `nostrClient.countEventsAcrossRelays(filters)`

### Filters & event kinds

The service builds COUNT filters based on the current video metadata. The base event kind is `COMMENT_EVENT_KIND` (video comment kind). Filters include:

- `#E` (root event id)
- `#A` (address pointer from `buildVideoAddressPointer(video)`)
- `#I` (root identifier / videoRootId)
- `#K` (root kind)
- `#P` (root author)

It always tries an `#E` filter first, then constructs an uppercase-tag filter that uses the best available pointer information, and finally a lowercase `#A` filter when available.

### Caching

Counts are cached in-memory per video id during a session:

- `videoDiscussionCountCache` stores resolved counts.
- `inFlightDiscussionCounts` deduplicates concurrent requests.

There is no persistence beyond the runtime session.

### Polling & refresh

Discussion counts are not polled on a timer. They refresh when the UI asks for them (typically after feed renders). The application triggers refreshes via `app.refreshVideoDiscussionCounts`, which is wired into video list rendering flows.

### UI surfacing

The service updates DOM nodes directly using data attributes:

- Root node: `[data-discussion-count="<video id>"]`
- Count value: `[data-discussion-count-value]`

The element’s `data-count-state` is set to:

- `pending` while a COUNT request is in flight
- `ready` after a successful response
- `unsupported` or `error` when COUNT is unavailable or fails

If relay support is missing, the service sets a tooltip (`title`) explaining that COUNT is unsupported.

### Telemetry/logging

Failures to fetch counts are logged through the injected logger (default `devLogger.warn`), and the UI falls back to the `error`/`unsupported` state rather than throwing.
