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
| View counter (`NOTE_TYPES.VIEW_EVENT`) | `WATCH_HISTORY_KIND` (default `30079`, clients also read legacy `30078`) | Canonical tag set: `['t','view']`, a pointer tag (`['e', <eventId>]` or `['a', <address>]`), and a stable dedupe tag `['d', <view identifier>]`, with optional `['session','true']` when a session actor signs; schema overrides may append extra tags. `['video', ...]` is supported for legacy overrides only. | Optional plaintext message |
| Watch history index (`NOTE_TYPES.WATCH_HISTORY_INDEX`) | `WATCH_HISTORY_KIND` (default `30079`, clients also read legacy `30078`) | `['d', WATCH_HISTORY_LIST_IDENTIFIER]`, `['snapshot', <id>]`, `['chunks', <total>]`, repeated `['a', <chunk address>]` pointers plus schema append tags | JSON payload `{ snapshot, totalChunks }` (may be empty when using tags only) |
| Watch history chunk (`NOTE_TYPES.WATCH_HISTORY_CHUNK`) | `WATCH_HISTORY_KIND` (default `30079`, clients also read legacy `30078`) | `['d', <snapshotId:index>]`, `['encrypted','nip04']`, `['snapshot', <id>]`, `['chunk', <index>, <total>]`, optional leading `['head','1']` on the first chunk, pointer tags for each item, plus schema append tags | NIP-04 encrypted JSON chunk (`{ version, snapshot, chunkIndex, totalChunks, items[] }`) |
| Subscription list (`NOTE_TYPES.SUBSCRIPTION_LIST`) | `30002` | `['d', 'subscriptions']` | NIP-04 encrypted JSON `{ subPubkeys: string[] }` |
| User block list (`NOTE_TYPES.USER_BLOCK_LIST`) | `30002` | `['d', 'user-blocks']` | NIP-04 encrypted JSON `{ blockedPubkeys: string[] }` |
| Admin moderation list (`NOTE_TYPES.ADMIN_MODERATION_LIST`) | `30000` | `['d', 'bitvid:admin:editors']`, repeated `['p', <pubkey>]` entries | Empty content |
| Admin blacklist (`NOTE_TYPES.ADMIN_BLACKLIST`) | `30000` | `['d', 'bitvid:admin:blacklist']`, repeated `['p', <pubkey>]` entries | Empty content |
| Admin whitelist (`NOTE_TYPES.ADMIN_WHITELIST`) | `30000` | `['d', 'bitvid:admin:whitelist']`, repeated `['p', <pubkey>]` entries | Empty content |

If you introduce a new Nostr feature, add its schema to
`js/nostrEventSchemas.js` so that the catalogue stays complete and so existing
builders inherit the same debugging knobs.

### Watch history identifiers

The encrypted watch history pipeline is gated by the `FEATURE_WATCH_HISTORY_V2`
runtime flag. When the flag is disabled, clients continue emitting view events
but skip publishing snapshots; the UI still resolves legacy `watch-history:v2:index`
lists so operators can stage the rollout per deployment.【F:config/instance-config.js†L69-L94】【F:js/watchHistoryService.js†L82-L140】【F:js/watchHistoryService.js†L948-L985】

Active identifiers include the default `WATCH_HISTORY_LIST_IDENTIFIER`
(`"watch-history"`) and the legacy aliases enumerated in
`WATCH_HISTORY_LEGACY_LIST_IDENTIFIERS`. Chunk events derive their `d` tag from
`<snapshotId>:<index>`, advertise `['snapshot', <id>]`, and carry `['chunk', <index>, <total>]`
plus an optional leading `['head','1']` marker so relays can prioritize the first
ciphertext. All chunk content is encrypted with NIP-04 and stores only pointer
entries; richer metadata remains on-device via the
[`WatchHistoryService`](../js/watchHistoryService.js) APIs, which default to
pointer-only writes and local-only metadata caches.【F:config/instance-config.js†L60-L78】【F:js/nostrEventSchemas.js†L157-L189】【F:js/nostr.js†L2329-L2369】【F:js/watchHistoryService.js†L331-L376】

Refer to the [`WatchHistoryService`](../js/watchHistoryService.js) for queue
management hooks, manual snapshot helpers, and metadata toggle controls that
complement these schema definitions.【F:js/watchHistoryService.js†L695-L776】【F:js/watchHistoryService.js†L1040-L1093】
