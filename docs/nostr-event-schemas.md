# Nostr event schemas

bitvid now centralizes every note that it publishes to Nostr in
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
  buildRepostEvent,
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
`window.bitvidNostrEvents` and `window.bitvidNostrEventOverrides`.

When managing relay metadata, use `buildRelayListEvent` so the resulting
replaceable event follows NIP-65 (`kind:10002`) with `"r"` tags describing the
read/write split.

### Active signer registry

Authentication providers should register their capabilities with the
`nostrClient` after login so every publish helper can reuse them:

```js
import { nostrClient } from "./nostrClientFacade.js";
import { setActiveSigner } from "./nostr/client.js";

setActiveSigner({
  type: "extension", // optional label, used to request NIP-07 permissions
  pubkey, // hex or npub of the active account
  signEvent: (event) => extension.signEvent(event),
  nip04Encrypt: (targetHex, plaintext) => extension.nip04.encrypt(targetHex, plaintext),
  nip04Decrypt: (actorHex, ciphertext) => extension.nip04.decrypt(actorHex, ciphertext),
  nip44Encrypt: (targetHex, plaintext) => extension.nip44.encrypt(targetHex, plaintext),
  nip44Decrypt: (actorHex, ciphertext) => extension.nip44.decrypt(actorHex, ciphertext),
});

await nostrClient.ensureExtensionPermissions();
```

`setActiveSigner` accepts any object that implements the subset of capabilities
you support. `nostrClient` (imported from the
[NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md)-aligned
`nostrClientFacade.js`) will prefer the registered signer for signing and
encryption before falling back to session actors. Call `clearActiveSigner()` on
logout if your integration manages session state manually; the built-in logout
handler already does this for the default extension flow.

### Accessing raw events

`NostrClient` now keeps a lightweight cache of parsed videos alongside a
separate cache of the untouched event payloads. Call
`nostrClient.fetchRawEventById(eventId)` when you need the original JSON that
was received from the relay. For convenience,
`nostrClient.getEventById(eventId, { includeRaw: true })` returns both shapes at
once:

```js
const { video, rawEvent } = await nostrClient.getEventById(eventId, {
  includeRaw: true,
});

// `video` is the normalized bitvid object and `rawEvent` is the original
// Nostr event with `sig`, `id`, and relay metadata intact.
```

In DevTools the active client lives at `window.bitvidApp?.nostrClient`.

Use the `rawEvent` blob when implementing “Rebroadcast” style flows so the
client can republish exactly what was signed, including the original
`sig`. Republishers should prefer `rawEvent.sig` over re-signing unless the
payload actually changes; this avoids accidental drift in dedupe tags or
timestamps.

### Default client bootstrap

[`js/nostr/defaultClient.js`](../js/nostr/defaultClient.js) builds the shared
`nostrClient` instance, registers it with the runtime via
`registerNostrClient`, and exposes helpers like
`requestDefaultExtensionPermissions`. Import the singleton or permission helper
through the dedicated facade when you need to run a NIP-07 handshake:

```js
import { nostrClient, requestDefaultExtensionPermissions } from "./nostrClientFacade.js";
```

`js/nostr.js` remains as a compatibility shim while downstream packages migrate;
it forwards to the new facades but is slated for removal once legacy imports
are retired.【F:js/nostr/defaultClient.js†L1-L25】【F:js/nostr.js†L1-L92】

For analytics, route through the
[NIP-71](https://github.com/nostr-protocol/nips/blob/master/71.md) helpers in
`nostrViewEventsFacade.js`:

```js
import { recordVideoView } from "./nostrViewEventsFacade.js";
```

Watch-history list management layers
[NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) semantics on
encrypted snapshots—import from `nostrWatchHistoryFacade.js` to stay aligned
with the chunk/index lifecycle:

```js
import { updateWatchHistoryListWithDefaultClient } from "./nostrWatchHistoryFacade.js";
```

## Event catalogue

| Note | Kind (default) | Tags | Content format |
| --- | --- | --- | --- |
| Video post (`NOTE_TYPES.VIDEO_POST`) | `30078` | `['t','video']`, `['d', <stable video identifier>]` plus optional schema append tags | JSON payload using Content Schema v3 (`version`, `title`, optional `url`, `magnet`, `thumbnail`, `description`, `mode`, `videoRootId`, `deleted`, `isPrivate`, `isNsfw`, `isForKids`, `enableComments`, `ws`, `xs`) |
| NIP-94 mirror (`NOTE_TYPES.VIDEO_MIRROR`) | `1063` | Tags forwarded from `publishVideo` (URL, mime type, thumbnail, alt text, magnet) | Plain text alt description |
| Repost (`NOTE_TYPES.REPOST`) | `6` | `['e', <event id>, <relay?>]` with optional address pointer `['a', <kind:pubkey:identifier>, <relay?>]`, and `['p', <pubkey>]` when the origin author is known; inherits schema append tags | Empty content |
| NIP-71 video (`NOTE_TYPES.NIP71_VIDEO`) | `21` | `['title', <title>]`, optional `['published_at', <unix seconds>]`, optional `['alt', <text>]`, repeated `['imeta', ...]` entries describing NIP-92 media variants, optional `['duration', <seconds>]`, repeated `['text-track', <url>, <kind>, <language>]`, optional `['content-warning', <reason>]`, repeated `['segment', <start>, <end>, <title>, <thumbnail>]`, repeated hashtags `['t', <tag>]`, repeated participants `['p', <pubkey>, <relay?>]`, repeated references `['r', <url>]` | Plain text summary carried in the content field. Publishing is gated by the `FEATURE_PUBLISH_NIP71` runtime flag while the rollout stabilizes. |
| NIP-71 short video (`NOTE_TYPES.NIP71_SHORT_VIDEO`) | `22` | Same as `NOTE_TYPES.NIP71_VIDEO`; the kind differentiates short-form presentations. | Plain text summary; gated by `FEATURE_PUBLISH_NIP71`. |
| Relay list (`NOTE_TYPES.RELAY_LIST`) | `10002` | Repeating `['r', <relay url>]` tags, optionally with a marker of `'read'` or `'write'` to scope the relay; marker omitted for read/write relays | Empty content |
| View counter (`NOTE_TYPES.VIEW_EVENT`) | `WATCH_HISTORY_KIND` (default `30079`, clients also read legacy `30078`) | Canonical tag set: `['t','view']`, a pointer tag (`['e', <eventId>]` or `['a', <address>]`), and a stable dedupe tag `['d', <view identifier>]`, with optional `['session','true']` when a session actor signs; schema overrides may append extra tags. `['video', ...]` is supported for legacy overrides only. | Optional plaintext message |
| Watch history index (`NOTE_TYPES.WATCH_HISTORY_INDEX`) | `WATCH_HISTORY_KIND` (default `30079`, clients also read legacy `30078`) | `['d', WATCH_HISTORY_LIST_IDENTIFIER]`, `['snapshot', <id>]`, `['chunks', <total>]`, repeated `['a', <chunk address>]` pointers plus schema append tags | JSON payload `{ snapshot, totalChunks }` (may be empty when using tags only) |
| Watch history chunk (`NOTE_TYPES.WATCH_HISTORY_CHUNK`) | `WATCH_HISTORY_KIND` (default `30079`, clients also read legacy `30078`) | `['d', <snapshotId:index>]`, `['encrypted','nip04']`, `['snapshot', <id>]`, `['chunk', <index>, <total>]`, optional leading `['head','1']` on the first chunk, pointer tags for each item, plus schema append tags | NIP-04 encrypted JSON chunk (`{ version, snapshot, chunkIndex, totalChunks, items[] }`) |
| Subscription list (`NOTE_TYPES.SUBSCRIPTION_LIST`) | `30002` | `['d', 'subscriptions']` | NIP-04 encrypted JSON `{ subPubkeys: string[] }` |
| User block list (`NOTE_TYPES.USER_BLOCK_LIST`) | `30002` | `['d', 'user-blocks']` | NIP-04 encrypted JSON `{ blockedPubkeys: string[] }` |
| Admin moderation list (`NOTE_TYPES.ADMIN_MODERATION_LIST`) | `30000` | `['d', 'bitvid:admin:editors']`, repeated `['p', <pubkey>]` entries | Empty content |
| Admin blacklist (`NOTE_TYPES.ADMIN_BLACKLIST`) | `30000` | `['d', 'bitvid:admin:blacklist']`, repeated `['p', <pubkey>]` entries | Empty content |
| Admin whitelist (`NOTE_TYPES.ADMIN_WHITELIST`) | `30000` | `['d', 'bitvid:admin:whitelist']`, repeated `['p', <pubkey>]` entries | Empty content |

The `isPrivate` flag in Content Schema v3 marks cards that should stay off shared or public grids. Clients should suppress these events for everyone except the owner, even though the payload stays in clear text for compatibility.

If you introduce a new Nostr feature, add its schema to
`js/nostrEventSchemas.js` so that the catalogue stays complete and so existing
builders inherit the same debugging knobs.

### NIP-71 rollout

bitvid now emits a paired NIP-71 event (kind `21` for long-form, `22` for short
form) whenever the `FEATURE_PUBLISH_NIP71` flag is enabled. The builder converts
structured upload metadata—image variants, captions, segments, hashtags, and
participant pointers—into canonical tags so other clients can discover the same
video. The legacy kind `30078` post remains the source of truth during the
transition, and schema overrides can adjust either kind if relays need
experimentation.

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
pointer-only writes and local-only metadata caches.【F:config/instance-config.js†L60-L78】【F:js/nostrEventSchemas.js†L157-L189】【F:js/nostr/watchHistory.js†L1343-L1400】【F:js/watchHistoryService.js†L331-L376】

Refer to the [`WatchHistoryService`](../js/watchHistoryService.js) for queue
management hooks, manual snapshot helpers, and metadata toggle controls that
complement these schema definitions.【F:js/watchHistoryService.js†L695-L776】【F:js/watchHistoryService.js†L1040-L1093】
