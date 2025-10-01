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
| View counter (`NOTE_TYPES.VIEW_EVENT`) | `WATCH_HISTORY_KIND` (default `30078`) | Canonical tag set: `['t','view']` plus either `['e', <eventId>]` or `['a', <address>]`, with optional `['session','true']` when a session actor signs; schema overrides may append extra tags. `['video', ...]` is supported for legacy overrides only. | Optional plaintext message |
| Watch history index (`NOTE_TYPES.WATCH_HISTORY_INDEX`) | `WATCH_HISTORY_KIND` | `['d', WATCH_HISTORY_LIST_IDENTIFIER]`, `['snapshot', <id>]`, `['chunks', <total>]`, repeated `['a', <address>]` pointers to each chunk event plus schema append tags | JSON payload `{ snapshot, totalChunks }` |
| Watch history chunk (`NOTE_TYPES.WATCH_HISTORY_CHUNK`) | `WATCH_HISTORY_KIND` | `['d', <chunk identifier>]`, `['encrypted','nip04']`, `['snapshot', <id>]`, `['chunk', <index>, <total>]`, pointer tags for each entry, plus schema append tags | NIP-04 encrypted JSON chunk (`{ version, snapshot, chunkIndex, totalChunks, items[] }`) |
| Subscription list (`NOTE_TYPES.SUBSCRIPTION_LIST`) | `30002` | `['d', 'subscriptions']` | NIP-04 encrypted JSON `{ subPubkeys: string[] }` |
| User block list (`NOTE_TYPES.USER_BLOCK_LIST`) | `30002` | `['d', 'user-blocks']` | NIP-04 encrypted JSON `{ blockedPubkeys: string[] }` |
| Admin moderation list (`NOTE_TYPES.ADMIN_MODERATION_LIST`) | `30000` | `['d', 'bitvid:admin:editors']`, repeated `['p', <pubkey>]` entries | Empty content |
| Admin blacklist (`NOTE_TYPES.ADMIN_BLACKLIST`) | `30000` | `['d', 'bitvid:admin:blacklist']`, repeated `['p', <pubkey>]` entries | Empty content |
| Admin whitelist (`NOTE_TYPES.ADMIN_WHITELIST`) | `30000` | `['d', 'bitvid:admin:whitelist']`, repeated `['p', <pubkey>]` entries | Empty content |

If you introduce a new Nostr feature, add its schema to
`js/nostrEventSchemas.js` so that the catalogue stays complete and so existing
builders inherit the same debugging knobs.

### Watch history identifiers

Watch-history snapshots now publish a dedicated index event with
`#d ${WATCH_HISTORY_LIST_IDENTIFIER}` (defaults to `watch-history:v2:index`). The
index advertises the active snapshot id, total chunk count, and a pointer to
each chunk via `a` tags so clients can fetch the encrypted payloads without
guessing identifiers.

Every chunk event uses a unique `d` tag such as
`watch-history:v2/<snapshot>/<chunkIndex>`. Legacy snapshots created before the
index event shipped stored the first chunk at `#d watch-history`; new clients
should continue reading that identifier for backward compatibility when
hydrating older histories.
