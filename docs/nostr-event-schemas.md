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
  buildShareEvent,
  buildProfileMetadataEvent,
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
  content: {
    version: 3,
    title: "Test",
    videoRootId: "debug",
    infoHash: "0123456789abcdef0123456789abcdef01234567",
  },
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
`nostrClientFacade.js`) routes signing and encryption through the adapter
registry in `js/nostr/client.js`, prefers the registered signer, and falls back
to the strongest available capability (or session actors for telemetry) when a
method is unavailable. Permission prompts are surfaced via
`nostrClient.ensureExtensionPermissions()` or the
`requestDefaultExtensionPermissions()` helper from
`js/nostr/defaultClient.js`, so features can ask for access before issuing
sign/encrypt calls. Call `clearActiveSigner()` on logout if your integration
manages session state manually; the built-in logout handler already does this
for the default extension flow.

For adapter implementation details and test guidance, see
[`docs/signing-adapter.md`](signing-adapter.md).

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

The compatibility shim has been removed; import from the facades above to avoid
broken references.【F:js/nostr/defaultClient.js†L1-L25】

For analytics, route through the
[NIP-71](https://github.com/nostr-protocol/nips/blob/master/71.md) helpers in
`nostrViewEventsFacade.js`:

```js
import { recordVideoView } from "./nostrViewEventsFacade.js";
```

Watch-history list management layers a replaceable,
[NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md)-style list
of monthly records. Import from `nostrWatchHistoryFacade.js` to stay aligned
with the simplified month-by-month lifecycle:

```js
import { updateWatchHistoryListWithDefaultClient } from "./nostrWatchHistoryFacade.js";
```

## Event catalogue

| Note | Kind (default) | Tags | Content format |
| --- | --- | --- | --- |
| Video post (`NOTE_TYPES.VIDEO_POST`) | `30078` | `['t','video']`, `['d', <stable video identifier>]`, `['s', <storage pointer>]` plus optional schema append tags | JSON payload using Content Schema v3 (`version`, `title`, optional `url`, `magnet`, `thumbnail`, `description`, `mode`, `videoRootId`, `deleted`, `isPrivate`, `isNsfw`, `isForKids`, `enableComments`, `infoHash`, `fileSha256`, `originalFileSha256`, `ws`, `xs`) |
| NIP-94 mirror (`NOTE_TYPES.VIDEO_MIRROR`) | `1063` | Tags forwarded from `publishVideo` (URL, mime type, thumbnail, alt text, magnet) | Plain text alt description |
| Repost (`NOTE_TYPES.REPOST`) | `6` | `['e', <event id>, <relay?>]` with optional address pointer `['a', <kind:pubkey:identifier>, <relay?>]`, and `['p', <pubkey>]` when the origin author is known; inherits schema append tags | JSON-serialized event being reposted (or empty if unavailable) |
| Generic Repost (`NOTE_TYPES.GENERIC_REPOST`) | `16` | Same as Repost; specific for non-text kinds (e.g. videos). | Same as Repost. |
| Share note (`NOTE_TYPES.SHARE`) | `1` | `['e', <video id>, '', 'mention']` plus `['p', <video pubkey>, '', 'mention']` when available; repeating `['r', <relay url>, <read/write?>]` tags for relay hints; inherits schema append tags | Plain text share content from the compose modal |
| Video reaction (`NOTE_TYPES.VIDEO_REACTION`) | `7` | `['e', <event id>, <relay?>]` or `['a', <kind:pubkey:identifier>, <relay?>]`, and `['p', <author pubkey>]` | Reaction content (e.g. `+`, `-`, or emoji) |
| Video comment (`NOTE_TYPES.VIDEO_COMMENT`) | `1111` | NIP-22 root scope tags `['A'\|`E`\|`I`, <pointer>, <relay?>?], `['K', <root kind>]`, and `['P', <root author pubkey>, <relay?>?]` plus parent metadata `['E'\|`I`, <parent pointer>, <relay?>?, <author?>], `['K', <parent kind>]`, `['P', <parent author>, <relay?>?]`; inherits schema append tags | Plain text body sanitized to valid UTF-8 |
| DM attachment (`NOTE_TYPES.DM_ATTACHMENT`) | `15` | `['p', <recipient pubkey>]`, `['x', <sha256 of uploaded bytes>]`, `['url', <download url>]`, optional `['name', <filename>]`, `['type', <mime>]`, `['size', <bytes>]`, optional `['k', <base64 key>]`; inherits schema append tags | Empty content; attachment metadata is represented as tags |
| DM read receipt (`NOTE_TYPES.DM_READ_RECEIPT`) | `20001` | `['p', <recipient pubkey>]`, `['e', <message event id>]`, optional `['k', <message kind>]`; inherits schema append tags | Empty content; ephemeral receipt for message activity |
| DM typing indicator (`NOTE_TYPES.DM_TYPING`) | `20002` | `['p', <recipient pubkey>]`, optional `['e', <conversation event id>]`, `['t','typing']`, `['expiration', <unix seconds>]`; inherits schema append tags | Empty content; ephemeral typing indicator that expires quickly |

> **Publishing note:** Session actors only emit passive telemetry (for example, view counters) and must **not** sign video comments. Require a logged-in Nostr signer for comment publishing via [`commentEvents`](../js/nostr/commentEvents.js).

Video posts now include a required storage pointer tag (`['s', '<provider>:<prefix>']`). The `buildVideoPostEvent` helper automatically generates this tag from available metadata (`infoHash`, `url`, or `videoRootId`) if it is omitted from the input. The `<prefix>` should resolve to the public storage base for the video assets (for example, a public bucket URL plus the object key without its extension). Clients derive `info.json` by appending `.info.json` to the prefix (or by combining a path-style prefix with the hosted URL origin if needed).

Video posts should treat `videoRootId` as the stable series identifier that remains unchanged across edits and deletes. File fingerprints such as `infoHash` or `fileSha256` live alongside the content payload so media swaps do not break the version chain.

| NIP-71 video (`NOTE_TYPES.NIP71_VIDEO`) | `21` | `['title', <title>]`, optional `['published_at', <unix seconds>]`, optional `['alt', <text>]`, repeated `['imeta', ...]` entries describing NIP-92 media variants, optional `['duration', <seconds>]`, repeated `['text-track', <url>, <kind>, <language>]`, optional `['content-warning', <reason>]`, repeated `['segment', <start>, <end>, <title>, <thumbnail>]`, repeated hashtags `['t', <tag>]`, repeated participants `['p', <pubkey>, <relay?>]`, repeated references `['r', <url>]` | Plain text summary carried in the content field. Publishing is gated by the `FEATURE_PUBLISH_NIP71` runtime flag while the rollout stabilizes. |
| NIP-71 short video (`NOTE_TYPES.NIP71_SHORT_VIDEO`) | `22` | Same as `NOTE_TYPES.NIP71_VIDEO`; the kind differentiates short-form presentations. | Plain text summary; gated by `FEATURE_PUBLISH_NIP71`. |
| Relay list (`NOTE_TYPES.RELAY_LIST`) | `10002` | Repeating `['r', <relay url>]` tags, optionally with a marker of `'read'` or `'write'` to scope the relay; marker omitted for read/write relays | Empty content |
| DM relay hints (`NOTE_TYPES.DM_RELAY_LIST`) | `10050` | Repeating `['relay', <relay url>]` tags to advertise delivery relays for NIP-17 gift-wrapped DMs | Empty content |
| View counter (`NOTE_TYPES.VIEW_EVENT`) | `WATCH_HISTORY_KIND` (default `30079`) | Canonical tag set: `['t','view']`, a pointer tag (`['e', <eventId>]` or `['a', <address>]`), and a stable dedupe tag `['d', <view identifier>]`, with optional `['session','true']` when a session actor signs; schema overrides may append extra tags. `['video', ...]` is supported for legacy overrides only. | Optional plaintext message |
| Watch history month (`NOTE_TYPES.WATCH_HISTORY`) | `WATCH_HISTORY_KIND` (default `30079`) | Replaceable list tag `['d', `${WATCH_HISTORY_LIST_IDENTIFIER}:<YYYY-MM>`]` with optional `['month', <YYYY-MM>]` marker plus schema append tags; no chunk pointers required. | JSON payload `{ version, month: 'YYYY-MM', items: [{ id: <eventId\|address>, watched_at?: <unix seconds> }] }` |
| Subscription list (`NOTE_TYPES.SUBSCRIPTION_LIST`) | `30000` | `['d', 'subscriptions']` | NIP-04/NIP-44 encrypted JSON array of NIP-51 follow-set tuples (e.g., `[['p', <hex>], …]`) |
| User block list (`NOTE_TYPES.USER_BLOCK_LIST`) | `10000` | `['d', 'user-blocks']` | NIP-04/NIP-44 encrypted JSON `{ blockedPubkeys: string[] }` |
| Hashtag preferences (`NOTE_TYPES.HASHTAG_PREFERENCES`) | `30015` | `['d', 'bitvid:tag-preferences']` plus schema-appended `['encrypted','nip44_v2']` | NIP-44 encrypted JSON `{ version, interests: string[], disinterests: string[] }` |
| Admin moderation list (`NOTE_TYPES.ADMIN_MODERATION_LIST`) | `30000` | `['d', 'bitvid:admin:editors']`, repeated `['p', <pubkey>]` entries | Empty content |
| Admin blacklist (`NOTE_TYPES.ADMIN_BLACKLIST`) | `30000` | `['d', 'bitvid:admin:blacklist']`, repeated `['p', <pubkey>]` entries | Empty content |
| Admin whitelist (`NOTE_TYPES.ADMIN_WHITELIST`) | `30000` | `['d', 'bitvid:admin:whitelist']`, repeated `['p', <pubkey>]` entries | Empty content |
| Profile metadata (`NOTE_TYPES.PROFILE_METADATA`) | `0` | `['d', ...]` is not used | JSON payload with NIP-01 fields (`name`, `about`, `picture`, `nip05`, etc.) |
| Mute list (`NOTE_TYPES.MUTE_LIST`) | `10000` | Repeated `['p', <pubkey>]` tags for blocked/muted users | Optional content (often encrypted) |
| Deletion (`NOTE_TYPES.DELETION`) | `5` | `['e', <event id>]` or `['a', <coordinate>]` | Reason for deletion |
| Legacy Direct Message (`NOTE_TYPES.LEGACY_DM`) | `4` | `['p', <recipient pubkey>]` | NIP-04 encrypted ciphertext |
| Zap request (`NOTE_TYPES.ZAP_REQUEST`) | `9734` | `['p', <recipient pubkey>]` plus optional `['e', <event id>]`, `['a', <coordinate>]`, `['amount', <msats>]`, `['lnurl', <bech32>]`, and `['relays', ...]` for receipt publishing | Optional plaintext zap note |
| Zap receipt (`NOTE_TYPES.ZAP_RECEIPT`) | `9735` | `['bolt11', <invoice>]`, `['description', <zap request JSON>]`, `['p', <recipient pubkey>]` plus optional `['e', <event id>]` and `['a', <coordinate>]` | Empty content; receipts are published by the recipient's LNURL server |
| HTTP Auth (`NOTE_TYPES.HTTP_AUTH`) | `27235` | `['u', <url>]`, `['method', <http method>]`, `['payload', <payload hash>]` | Optional plaintext content (NIP-98 recommends empty, but implementations may vary) |
| Report (`NOTE_TYPES.REPORT`) | `1984` | `['e', <event id>, <report type>]`, `['p', <pubkey>, <report type>]`, and optional `['t', <report type>]` | Plaintext report reason |

### Share notes (kind `1`)

Share notes are plain text `kind:1` events generated by the Share modal. The
`content` field is preserved verbatim (after UTF-8 sanitization) and can contain
any short message or commentary accompanying the share.

The builder attaches the following tags:

* `['e', <event id>, '', 'mention']` — the shared video’s event id, normalized to
  lowercase hex.
* `['p', <pubkey>, '', 'mention']` — the shared video’s author pubkey,
  normalized to lowercase hex.
* `['r', <relay url>, <read/write?>]` — optional relay hints. Relay URLs are
  trimmed, duplicates are removed, and the optional marker is normalized to
  `read` or `write` when provided.

Subscription lists therefore match the
[NIP-51 follow-set specification](./nips/51.md#sets) by emitting kind `30000`
events with the shared `['d','subscriptions']` identifier. Builders continue to
encrypt the payload so individual follows stay private unless explicitly
revealed by the author.

NIP-94 compliance: mirror events now normalize the `['m', <mime>]` tag to lowercase—covering both user input and inferred values—so they satisfy [NIP-94's lowercase MIME requirement](./nips/94.md). Related helpers reuse the same normalization to keep future publishers aligned.

### Direct messages

bitvid now consumes both legacy direct messages (kind `4`) and modern gift-wrap envelopes (kind `1059`). The `js/dmDecryptor.js` helper unwraps these events by:

* checking `['encrypted']` hints on kind `4` events to prioritize `nip44` ciphertext before falling back to `nip04`
* unwrapping kind `1059` gift wraps with nested `nip44` decrypt operations until the inner rumor payload is available
* returning a normalized payload that carries sender metadata, recipient relay hints, the decrypted plaintext, and derived timestamps for sorting

`NostrClient` exposes `listDirectMessages()` and `subscribeDirectMessages()` APIs that hydrate decryptors lazily (preferring extension-provided helpers) and cache results in an LRU keyed by event id. `NostrService` mirrors the normalized messages via `getDirectMessages()` and emits updates as new events arrive so the UI can render private conversations without reimplementing the unwrap logic.

The `isPrivate` flag in Content Schema v3 marks cards that should stay off shared or public grids. Clients should suppress these events for everyone except the owner, even though the payload stays in clear text for compatibility.

For the privacy model, relay hint selection flow, and user controls (privacy
toggle, relay list publishing, and metadata toggles), see
[`docs/dm-privacy-model.md`](dm-privacy-model.md).

If you introduce a new Nostr feature, add its schema to
`js/nostrEventSchemas.js` so that the catalogue stays complete and so existing
builders inherit the same debugging knobs.

### Hashtag preference lists

Hashtag preference events (`NOTE_TYPES.HASHTAG_PREFERENCES`) now publish as a
replaceable `30015` list with a stable identifier tag of
`['d','bitvid:tag-preferences']`. The builder appends `['encrypted','nip44_v2']`
so downstream clients can detect that the payload is encrypted. The `content`
field must be a NIP-44 ciphertext representing the JSON shape
`{ version, interests: string[], disinterests: string[] }`, allowing clients to
share their preferred and muted hashtags without exposing the raw preferences on
relays.

### Migration approach: auto-republish on next user change

We are **not** shipping a one-off migration helper. Instead, the existing
`HashtagPreferencesService.publish()` flow reissues preferences as kind `30015`
the next time a user saves their interests from the profile modal. Legacy
`30005` payloads are no longer read, so users with only legacy events must
resave their preferences to publish the canonical kind. That publish path
already:

* rehydrates the signer via `getActiveSigner()` and aborts when no signer is
  available, so background jobs cannot emit preferences without user consent;
* encrypts the normalized payload once per save using the strongest available
  NIP-44/NIP-04 scheme before calling `buildHashtagPreferenceEvent()`; and
* writes a single replaceable event per account thanks to the stable
  `['d','bitvid:tag-preferences']` tag, avoiding duplicate relay load because
  later publishes overwrite the previous value.【F:js/services/hashtagPreferencesService.js†L604-L788】

To prevent relay spikes, we only invoke `publish()` when the local interests or
disinterests change—UI handlers short-circuit if a user toggles a tag back to
its prior state. The method fans out to the configured write relays via
`publishEventToRelays`, and `assertAnyRelayAccepted` ensures at least one relay
acknowledges the update before treating the migration as complete.【F:js/services/hashtagPreferencesService.js†L761-L784】

### Operator checklist

Operators should monitor the rollout as follows:

1. After deploying this change, review relay dashboards or logs for accounts
   saving preferences to confirm new `30015` writes are accepted (look for the
   `bitvid:tag-preferences` `d` tag).
2. Spot-check a few migrated accounts by fetching `30015` events; the canonical
   kind should present the newest `created_at` timestamp once a user saves.
3. If relays reject events, correlate the warnings emitted by
   `HashtagPreferencesService.publish()` in operator consoles to identify relay
   outages or permission errors.

When decrypting, the client inspects both `['encrypted', ...]` and
`['encryption', ...]` hints on the event to prioritize NIP-44 v2 payloads,
falling back to legacy NIP-44 or NIP-04 decryptors when required. Publishing
performs the same capability probe, updating the existing `encrypted` tag with
the negotiated scheme before signing so other readers know which cipher to try
first.【F:js/services/hashtagPreferencesService.js†L356-L511】【F:js/services/hashtagPreferencesService.js†L520-L657】

### NIP-71 rollout

bitvid now emits a paired NIP-71 event (kind `21` for long-form, `22` for short
form) whenever the `FEATURE_PUBLISH_NIP71` flag is enabled. The builder converts
structured upload metadata—image variants, captions, segments, hashtags, and
participant pointers—into canonical tags so other clients can discover the same
video. The legacy kind `30078` post remains the source of truth during the
transition, and schema overrides can adjust either kind if relays need
experimentation.

### Watch history identifiers

The watch history pipeline is always enabled and publishes encrypted monthly
records to the canonical `WATCH_HISTORY_KIND` stream. Clients rely on the
default `WATCH_HISTORY_LIST_IDENTIFIER` (`"watch-history"`) and store each
month as a replaceable record keyed by `['d', `${identifier}:${YYYY-MM}`]`,
optionally echoed in a `['month', <YYYY-MM>]` tag for readability. The content
contains a compact JSON body such as:

```json
{
  "version": 2,
  "month": "2025-01",
  "items": [
    { "id": "<event id>", "watched_at": 1735689600 },
    { "id": "30078:<pubkey>:video-123", "watched_at": 1735776000 }
  ]
}
```

Entries store only the watched event identifier (an event id or address string)
and an optional `watched_at` timestamp so relays never receive per-playback
device metadata. Additional playback context (duration, progress, playback
device, etc.) should remain on-device via the
[`WatchHistoryService`](../js/watchHistoryService.js) APIs.【F:config/instance-config.js†L60-L78】【F:js/nostrEventSchemas.js†L157-L189】【F:js/watchHistoryService.js†L331-L376】

Refer to the [`WatchHistoryService`](../js/watchHistoryService.js) for queue
management hooks and metadata toggle controls that complement these schema
definitions.【F:js/watchHistoryService.js†L695-L776】【F:js/watchHistoryService.js†L1040-L1093】

## Validation

bitvid now enforces schema validation at runtime during development. Every event
builder automatically runs the generated event against its definition using
`validateEventStructure` (called via `validateEventAgainstSchema`) when
`isDevMode` is true. Violations (missing required tags, invalid JSON content,
type mismatches, etc.) are logged to the console via `devLogger`.

### Continuous Integration

A standalone validation suite runs in CI to ensure that all builders produce
valid events:

```bash
# Run the validation script
node scripts/agent/validate-events.mjs

# Run the unit test suite
npm run test:unit
```

When modifying schemas or builders, use `scripts/agent/validate-events.mjs` to
verify your changes locally. This tool also scans the codebase to ensure all
active event builders are covered by tests.
