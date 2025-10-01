# Nostr event schemas

BitVid now centralizes every note that it publishes to Nostr in
[`js/nostrEventSchemas.js`](../js/nostrEventSchemas.js). The module defines the
kind, required tags, and content format for each note type so troubleshooting
no longer requires hunting through the codebase. It also exposes helpers for
building events and for overriding the schema at runtime when you need to
experiment.

## Runtime helpers

```js
import {
  NOTE_TYPES,
  getNostrEventSchema,
  setNostrEventSchemaOverrides,
  buildVideoPostEvent,
} from "./nostrEventSchemas.js";

// Inspect the current schema
console.log(getNostrEventSchema(NOTE_TYPES.VIDEO_POST));

// Temporarily override the kind while debugging
setNostrEventSchemaOverrides({
  [NOTE_TYPES.VIDEO_POST]: { kind: 30000 },
});

// Build an event with the active schema
const event = buildVideoPostEvent({
  pubkey,
  created_at: Math.floor(Date.now() / 1000),
  dTagValue: "debug-video",
  content: { version: 3, title: "Test", videoRootId: "debug" },
});
```

In the browser you can call the same helpers from DevTools via
`window.BitVidNostrEvents` and `window.BitVidNostrEventOverrides`.

When managing relay metadata, use `buildRelayListEvent` so the resulting
replaceable event follows NIP-65 (`kind:10002`) with `"r"` tags describing the
read/write split.

## Event catalogue

| Note | Kind (default) | Tags | Content format |
| --- | --- | --- | --- |
| Video post (`NOTE_TYPES.VIDEO_POST`) | `30078` | `['t','video']`, `['d', <stable video identifier>]` plus optional schema append tags | JSON payload using Content Schema v3 (`version`, `title`, optional `url`, `magnet`, `thumbnail`, `description`, `mode`, `videoRootId`, `deleted`, `isPrivate`, `enableComments`, `ws`, `xs`) |
| NIP-94 mirror (`NOTE_TYPES.VIDEO_MIRROR`) | `1063` | Tags forwarded from `publishVideo` (URL, mime type, thumbnail, alt text, magnet) | Plain text alt description |
| Relay list (`NOTE_TYPES.RELAY_LIST`) | `10002` | Repeating `['r', <relay url>]` tags, optionally with a marker of `'read'` or `'write'` to scope the relay; marker omitted for read/write relays | Empty content |
| View counter (`NOTE_TYPES.VIEW_EVENT`) | `WATCH_HISTORY_KIND` (default `30078`) | `['t','view']`, `['video', <pointer id>]`, pointer tag (`['a', ...]` or `['e', ...]`), optional dedupe `['d', <scope>]`, optional `['session','true']` when a session actor signs, plus any extra debugging tags | Optional plaintext message |
| Watch history chunk (`NOTE_TYPES.WATCH_HISTORY_CHUNK`) | `WATCH_HISTORY_KIND` | `['d', <chunk identifier>]`, `['encrypted','nip04']`, `['snapshot', <id>]`, `['chunk', <index>, <total>]`, pointer tags for each entry, `['head','1']` + `['a', <address>]` pointers on the first chunk | NIP-04 encrypted JSON chunk (`{ version, snapshot, chunkIndex, totalChunks, items[] }`) |
| Subscription list (`NOTE_TYPES.SUBSCRIPTION_LIST`) | `30002` | `['d', 'subscriptions']` | NIP-04 encrypted JSON `{ subPubkeys: string[] }` |
| User block list (`NOTE_TYPES.USER_BLOCK_LIST`) | `30002` | `['d', 'user-blocks']` | NIP-04 encrypted JSON `{ blockedPubkeys: string[] }` |
| Admin moderation list (`NOTE_TYPES.ADMIN_MODERATION_LIST`) | `30000` | `['d', 'bitvid:admin:editors']`, repeated `['p', <pubkey>]` entries | Empty content |
| Admin blacklist (`NOTE_TYPES.ADMIN_BLACKLIST`) | `30000` | `['d', 'bitvid:admin:blacklist']`, repeated `['p', <pubkey>]` entries | Empty content |
| Admin whitelist (`NOTE_TYPES.ADMIN_WHITELIST`) | `30000` | `['d', 'bitvid:admin:whitelist']`, repeated `['p', <pubkey>]` entries | Empty content |

If you introduce a new Nostr feature, add its schema to
`js/nostrEventSchemas.js` so that the catalogue stays complete and so existing
builders inherit the same debugging knobs.

## Reliability backlog: Watch History & View Counter

The current unstable branch ships the first pass of Watch History chunking and view logging, but a few protocol mismatches make both features unreliable. Use the following Codex Task stubs to land hardened versions of the flows. Each task is self-contained so it can be assigned independently.

### Task: watch-history-indexed-chunking

**Goal:** Publish watch-history snapshots with replaceable semantics that avoid relay truncation.

**Background:** `buildWatchHistoryChunkEvent` always emits the same `['d', WATCH_HISTORY_LIST_IDENTIFIER]` tag. Relays therefore treat every chunk as the same replaceable event and keep only the last chunk. We need a tiny replaceable index event plus uniquely addressed chunk events.

**Steps:**

1. Add a new schema entry (`NOTE_TYPES.WATCH_HISTORY_INDEX`) in `js/nostrEventSchemas.js` describing the replaceable index note with identifier `watch-history:v2:index` (kind defaults to `WATCH_HISTORY_KIND`).
2. Extend the watch-history publisher to emit:
   * The index event with snapshot UUID + `totalChunks`.
   * Chunk events using `['d', "watch-history:v2/${snapshot}/${chunkIndex}"]` instead of the shared list identifier.
3. Update `buildWatchHistoryChunkEvent` to accept a fully-qualified chunk identifier so callers can pass the new value.
4. Document the new schema in this file’s event catalogue and ensure existing encryption + pointer tags survive.

**Acceptance criteria:**

* Publishing a three-chunk snapshot results in four events on relays (one index + three unique chunks).
* Reloading a relay only returns the latest snapshot’s chunks; older snapshots are ignored after the index switches to a new snapshot id.

**Testing:**

* Unit test `buildWatchHistoryChunkEvent` to confirm it keeps the new `['d', …]` value intact.
* Manual QA: publish >1 chunk per snapshot and verify all chunks persist on at least two relays (e.g., `wss://nos.lol`, `wss://relay.damus.io`).

### Task: watch-history-reader-resync

**Goal:** Fetch and assemble the new indexed watch-history snapshots while respecting caches.

**Background:** Readers currently fetch `WATCH_HISTORY_KIND` events with the shared `['d', WATCH_HISTORY_LIST_IDENTIFIER]` value, then trust local cache expiry. Once the index/chunk change above lands, the reader needs to fetch the index first and invalidate cache when the snapshot id changes.

**Steps:**

1. Update the history fetcher (`js/nostr.js` > `updateWatchHistoryList` and helpers) to request the index event by `#d = "watch-history:v2:index"`.
2. When the index is missing, fall back to the legacy single-chunk query so existing data still renders.
3. When the index is present, fetch all chunk events whose `['d', …]` tag begins with `watch-history:v2/<snapshot>/` and reassemble chunks using the `['chunk', <idx>, <total>]` tag.
4. Drop any cached snapshot when the index’s `snapshot` value differs from the cached one, even if the TTL has not expired.
5. Keep existing pointer resolution batching logic intact.

**Acceptance criteria:**

* The watch-history panel rebuilds itself whenever the index `snapshot` changes on relays.
* Legacy single-event histories still render for accounts that have not been migrated.

**Testing:**

* Add integration tests that stub relay responses for (a) legacy snapshots and (b) indexed snapshots to confirm the reader assembles the correct number of items.
* Manual QA: publish new chunks, reload the UI, confirm the cache refreshes immediately after the index flips.

### Task: view-counter-event-shape

**Goal:** Align view events with standard Nostr pointers so COUNT and REQ queries behave uniformly across relays.

**Background:** `buildViewEvent` emits a custom `['video', <id>]` tag and optionally adds a dedupe `['d', …]` tag. Relays do not index `#video`, so COUNT is unreliable. We should emit `['e', <video event id>]` or `['a', …]` pointers and remove the replaceable identifier so every view is unique.

**Steps:**

1. Update the VIEW_EVENT schema to default `pointerTagName` to `'e'` and remove the `identifierTag` definition so events are non-replaceable by default.
2. Adjust `buildViewEvent` call sites (notably `recordVideoView` in `js/nostr.js`) to pass the video address in the pointer tag and drop `dedupeTag` usage except for optional local-session instrumentation.
3. Document the new tag requirements here and in `docs/analytics.md` (if the analytics doc exists).
4. Provide a one-time migration helper to translate cached local view state to the new daily idempotency key format.

**Acceptance criteria:**

* Freshly published view events never include a `['d', …]` tag and always carry `['e', <video event id>]` or a caller-specified pointer tag.
* COUNT requests using `#e` filters return consistent values across at least two relays known to support NIP-45.

**Testing:**

* Unit test `buildViewEvent` to ensure `pointerTagName` defaults to `'e'` and no `['d', …]` tag is emitted.
* Manual QA: play a video twice within the same session, verify the local idempotency guard suppresses the duplicate publish.

### Task: view-counter-counting-fallback

**Goal:** Provide a resilient counting routine that falls back to client-side aggregation when NIP-45 COUNT is unavailable.

**Background:** The current implementation issues COUNT queries with `#video` filters and treats timeouts as zero. We need to try COUNT on the supported relays using `#e` and then fall back to a bounded REQ query with client-side deduplication.

**Steps:**

1. Build a `probeCountSupport(relayUrl)` helper that caches whether a relay responds to COUNT (use `reqSupportTimeoutMs` already defined in `js/nostr.js`).
2. Update the view-count fetcher to:
   * Issue COUNT requests with filter `{ kinds: [WATCH_HISTORY_KIND], '#e': [videoEventId] }` against relays that advertise support.
   * Sum fulfilled COUNT results across relays.
   * If every COUNT fails or times out, issue a normal `REQ` over the last 90 days, dedupe events by id, and return the resulting size.
3. Expose telemetry so we can monitor fallback frequency (log to console in dev mode, send to analytics in prod if available).
4. Update documentation with the new behavior and rationale.

**Acceptance criteria:**

* When at least one relay returns a COUNT result, the client displays the sum of all fulfilled counts.
* When no relay supports COUNT, the fallback REQ path still produces a non-zero tally if view events exist.

**Testing:**

* Add unit tests that mock the pool to simulate (a) COUNT success, (b) COUNT failure + REQ success, and (c) both failing.
* Manual QA: throttle COUNT support by temporarily editing the relay list and confirm the fallback path activates without UI regressions.

