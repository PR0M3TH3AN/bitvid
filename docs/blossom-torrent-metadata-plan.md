# Blossom videos — WebTorrent metadata via a companion Nostr event — Dev Plan

Status: **DECISIONS LOCKED (D1–D6, per recommendations, 2026-07-10)** — ready to
build. Restores P2P/WebTorrent playback for Blossom-hosted videos without hosting a
`.torrent` file, by publishing the torrent piece-map as a separate, infohash-keyed
Nostr event that bitvid fetches lazily only when the torrent path actually runs.

Depends on: `docs/blossom-plan.md` (Blossom storage) and the existing WebTorrent
playback path (`js/webtorrent.js`, `js/services/playbackService.js`).

## Executive summary

Blossom servers accept media types only and reject a `.torrent`
(`application/x-bittorrent` → `415 "File type not allowed"`, verified live). A magnet
therefore ships with a webseed (`ws=` = the Blossom URL) but **no `xs=`** (no hosted
`.torrent`). WebTorrent cannot start from a webseed alone — it needs the torrent
**metadata** (the `info` dict / piece map) from either the hosted `.torrent` or a live
peer. So Blossom videos currently publish **URL-only** (they play via direct HTML5,
which works — verified: `video/mp4`, CORS `*`, Range `206` through blossom.band's
`307`→`video.nostr.build`).

This plan restores P2P by carrying the piece-map **on Nostr**: at upload bitvid already
generates the `.torrent` (that's how it gets the infohash), so it publishes that
`.torrent` as a **companion event addressed by infohash**. bitvid fetches it **only when
a viewer starts the torrent path**, verifies it, then `client.add(torrentBuffer, {
urlList:[videoUrl] })` — WebTorrent now has the map and streams the bytes from the
Blossom webseed over HTTP Range.

Why a companion event rather than inlining the blob in the video event: the constraint
that bites bitvid is the **feed**, not a single note. bitvid pulls hundreds of video
events per feed load and >90% are watched via direct URL and never touch the torrent
path. Inlining taxes every feed event for a feature most playbacks never use. A separate,
lazily-fetched event keeps the feed lean, removes any practical size cap (the blob is off
the feed), and is nostr-idiomatic: the metadata is **content-addressed by its own hash**.

## Background — the graceful ladder

For a video with a valid infohash, bitvid picks the best available P2P story:

1. **`.torrent` hosted (`xs=`)** — R2/S3, or a self-hosted/paid Blossom server that
   accepts `.torrent`. Full magnet, playable in any torrent client. *(unchanged today)*
2. **Companion event** — Blossom URL-only case: `ws=` magnet + an infohash-keyed
   metadata event. Playable **in bitvid** (which knows to do the lookup). *(this plan)*
3. **URL-only** — flag off, over cap, or publish failed. Direct HTML5 playback.
   *(current Blossom behavior; also the fallback for 1 and 2)*

The webseed (`ws=`) URL is also just the plain video URL, so **direct playback always
works** regardless of the torrent story — P2P is strictly additive.

## Applicability across media types

The trigger keys on **(a valid infohash + a hosted webseed URL)**, not on the "video"
label — so it is inherited by any media that flows through bitvid's upload + torrent seam
(`blossomService.uploadVideo`, i.e. "upload a media blob → generate a `.torrent`"), and
skipped by anything that doesn't.

| Type | Inherits it? | Why |
|---|---|---|
| **Regular video** | ✅ yes | The seam itself. |
| **Shorts** | ✅ yes, free | A Short is a regular video with `format:"short"` on the same upload+torrent path (`docs/shorts-plan.md` keeps "bitvid's WebTorrent advantage"). Uploaded to Blossom ⇒ same companion. |
| **Audio — publish** (`FEATURE_AUDIO_PUBLISH`, later) | ✅ yes, if it reuses the seam | WebTorrent is file-type-agnostic — an audio blob torrents/webseeds exactly like video. As long as audio *upload* routes through the shared upload+torrent path, no extra work. |
| **Audio — ingest** (`FEATURE_AUDIO_INGEST`) | ❌ no | Surfaces *others'* externally-hosted audio; bitvid uploads nothing, so there is no infohash/webseed to describe. |
| **Live streams** (`FEATURE_LIVE_INGEST`) | ❌ no | An HLS `.m3u8` stream isn't a static file — no fixed byte layout, no deterministic infohash, nothing on Blossom to seed. A **saved VOD later re-uploaded as a normal video** would qualify as a regular video, not as "the live stream." |

Design implication: keep the torrent + companion orchestration at the **generic
media-blob seam** (it already is — `uploadVideo` is "upload blob + optional torrent",
just video-flavored in name), so new *upload-based* types inherit it for free and
*ingest/stream* types are correctly excluded. No per-type wiring, no per-type schema — the
companion event is infohash-keyed and media-type-agnostic (`d = bitvid:torrent:<infohash>`).

## Why not NIP-35 (kinds 2003/2004)?

Nostr already has a torrent NIP — **NIP-35**: `kind 2003` (torrent) + `kind 2004`
(torrent comment). It carries a torrent's **`x` (infohash)**, `title`, `file` list,
`tracker` list, external-DB `i` references, and category `t` tags. It is deliberately
**not** used here, because it solves a *different* problem:

- NIP-35 is a torrent **announcement / index** format (a Nostr-native tracker listing).
  It records metadata *about* a torrent plus the infohash — but **not the piece hashes /
  the bencoded `info` dict / the `.torrent` bytes**. A client that has only a NIP-35 event
  still has to obtain the actual torrent metadata from **peers / DHT / trackers**.
- Our problem is exactly that a fresh Blossom video has **no seeders and no hosted
  `.torrent`**, so there is nowhere to fetch the piece map from. The companion event exists
  to **transport the piece map itself** (the full `.torrent`, base64) so WebTorrent can
  reconstruct the torrent and stream from the webseed with **zero peers**. NIP-35 omits the
  one field that makes that possible.

So NIP-35 can't replace the companion event for *playback*. The two are complementary: this
plan handles playback bootstrap; a `kind 2003` could be layered on later purely for
**cross-client discovery** (see Phase 3) without changing this mechanism. Caveat for that
future work: bitvid's webseed-first, no-seeder model doesn't map cleanly onto NIP-35's
"here's a torrent to download" expectation, and emitting a 2003 per video risks noise —
so treat it as opt-in reach, not a default.

## Decisions

> **DECISION 1 — Event kind + addressing. ✅ LOCKED.**
> Reuse **NIP-78 `kind:30078`** (bitvid already uses it for `bitvid:storage-connections`)
> as a parameterized-replaceable event with `d = "bitvid:torrent:<infohash>"` (infohash
> lowercase hex). bitvid derives the key from the magnet's `btih` and queries
> `authors:[videoAuthor], kinds:[30078], #d:["bitvid:torrent:<infohash>"]`.
> _Rationale: no new kind to define; matches bitvid's existing 30078 namespacing; keyed
> by infohash ⇒ self-verifying and content-addressed. A **dedicated kind** for
> cross-client discoverability is a future option (D6/Phase 3), not MVP._

> **DECISION 2 — Payload. ✅ LOCKED.**
> `content` is a small JSON envelope `{"v":1,"infohash":"<hex>","torrent":"<base64>"}`
> where `torrent` is the **full `.torrent` file bytes, base64** (preserves the infohash
> exactly; `client.add` accepts the raw buffer). Tags: `["d","bitvid:torrent:<infohash>"]`,
> `["x","<infohash>"]` (NIP-35/94 convention), `["client","bitvid"]`, and a back-reference
> `["e","<videoEventId>"]` for debug/discovery (not used for lookup).
> _Rationale: raw `.torrent` = zero reconstruction risk to the infohash; the `v` envelope
> gives forward-compat; the `x` tag makes it conventionally queryable._

> **DECISION 3 — Publish trigger. ✅ LOCKED.**
> Publish the companion **only** when: the video has a valid infohash **and** the
> `.torrent` could **not** be hosted (`torrentUrl === ""`, i.e. the Blossom URL-only case)
> **and** `FEATURE_BLOSSOM_TORRENT_METADATA` is on **and** the base64 payload ≤ the cap
> (D4). R2/S3 and `.torrent`-accepting Blossom servers keep using `xs=` and publish no
> companion.
> _Rationale: the companion exists to cover exactly the gap Blossom creates; never
> duplicate what `xs=` already provides._

> **DECISION 4 — Size cap (safety, not the feed gate). ✅ LOCKED.**
> Gate on the **actual base64 payload size**, not a file-size proxy (metadata scales
> sub-linearly with file size as WebTorrent grows the piece length; the encoded size is
> known exactly at upload). Default cap **65536 bytes (64 KB)** base64 → URL-only above
> it. A companion event ~this size is off the feed, so the cap is a pathological-case
> guard, not a feature limiter (metadata plateaus ~20–40 KB even for multi-GB videos).
> _Rationale: exact, robust, and generous enough to cover realistic videos._

> **DECISION 5 — Playback: lazy fetch + verify + trusted webseed. ✅ LOCKED.**
> On the torrent path, when the magnet has `btih` but no usable `xs=`: query the companion
> by infohash (author-scoped in MVP), base64-decode, **verify the reconstructed torrent's
> infohash === the magnet's `btih`**, then `client.add(buffer, { urlList:[videoUrl],
> announce: WSS_TRACKERS })`. The **webseed URL comes from the trusted video event's `url`
> field** — bitvid **ignores any url-list baked into the `.torrent`**. Cache by infohash.
> Any miss/mismatch/timeout ⇒ URL-only fallback (already the current behavior).
> _Rationale: content from other users is public + untrusted; the infohash check makes
> tampering un-actionable, and sourcing the webseed from the video event prevents a
> malicious companion from redirecting the byte source._

> **DECISION 6 — Config flag + scope. ✅ LOCKED.**
> `FEATURE_BLOSSOM_TORRENT_METADATA` in `config/instance-config.js` (default **false**),
> wired like `FEATURE_BLOSSOM_STORAGE` / `FEATURE_BITCOIN_CONNECT`. Off ⇒ no companion is
> published and the playback lookup is skipped (Blossom stays URL-only). MVP is
> **author-scoped** lookup (same pubkey as the video). Crowd-sourced metadata (accept a
> valid companion from **any** author, since it's self-verifying) and a dedicated,
> cross-client kind are **Phase 3**.

## Config flag (off = no trace)

- `FEATURE_BLOSSOM_TORRENT_METADATA` (default **false**) — gates both the publish side
  (no companion event) and the playback lookup (skip the query). Off ⇒ Blossom behaves
  exactly as it does today (URL-only). Constant `BLOSSOM_TORRENT_METADATA_MAX_BASE64 =
  65536` lives in `js/constants.js`.

## Event shape

```jsonc
// kind 30078 (NIP-78), parameterized-replaceable, signed by the video author
{
  "kind": 30078,
  "tags": [
    ["d", "bitvid:torrent:<infohash-lowercase-hex>"],
    ["x", "<infohash-lowercase-hex>"],
    ["client", "bitvid"],
    ["e", "<video-event-id>"]           // back-reference, debug/discovery only
  ],
  "content": "{\"v\":1,\"infohash\":\"<hex>\",\"torrent\":\"<base64 .torrent bytes>\"}"
}
```

Builder lives in `js/nostrEventSchemas.js` (source of truth) as
`buildTorrentMetadataEvent({ pubkey, created_at, infoHash, torrentFileBytes })`, alongside
the existing builders.

## Publish flow (Phase 1)

In `blossomService.uploadVideo`, inside the existing `if (torrent?.hasValidInfoHash …)`
block, extend the "`.torrent` not hosted" branch:

1. Compute `b64 = base64(torrent.torrentFile bytes)`.
2. If `FEATURE_BLOSSOM_TORRENT_METADATA` and `b64.length ≤ MAX`: build the companion event
   (schema above), sign via the active signer, publish to the user's write relays (reuse
   the existing publish helper), and set the result to the **companion tier**:
   `magnet = magnet:?xt=urn:btih:<infoHash>&dn=<name>&ws=<videoUrl>` (no `xs=`),
   `hasValidInfoHash = true`, `infoHash = <hex>`, `torrentUrl = ""`.
3. Else (flag off / over cap / publish failed): stay **URL-only** as today
   (`magnet = ""`, `hasValidInfoHash = false`). The local `.torrent` is still retained on
   `result.torrentFile`.

Orchestration note: `blossomService` stays WebTorrent-free; the companion publish uses an
injected `publishEvent`/signer callback (same injection pattern as `generateTorrent`), so
the service remains unit-testable in Node.

## Playback flow (Phase 2)

Add a `torrentMetadataService` (fetch/verify/cache) consumed by the WebTorrent add path
(`js/webtorrent.js`) or `playbackService`:

1. Torrent path selected; magnet has `btih:<infohash>` and no usable `xs=`.
2. Flag on → `getTorrentMetadata({ infoHash, author })`: relay query
   `kinds:[30078], authors:[author], #d:["bitvid:torrent:<infohash>"]`, newest wins.
   Cache the decoded buffer by infohash (memory; optional IndexedDB later).
3. Decode envelope → base64-decode → `.torrent` buffer → parse → **assert infohash ===
   btih** (reject + log on mismatch).
4. `client.add(buffer, { urlList: [videoUrl /* from the video event */], announce:
   WSS_TRACKERS })`. WebTorrent has the map; the webseed serves bytes over Range.
5. Any failure ⇒ URL-only (unchanged fallback). Never block first paint: URL-first plays
   immediately while this runs in the background.

## Security

- **Untrusted content:** verify reconstructed infohash === `btih` before use; on mismatch,
  discard and fall back. The infohash is the query key *and* the integrity check.
- **Webseed source:** always the video event's own `url`; never the `.torrent`'s embedded
  url-list — prevents byte-source redirection by a malicious companion.
- **Size guard:** refuse to decode a `content` whose base64 exceeds the cap.
- **Author scope (MVP):** query only the video's author, so no cross-author injection.
  Crowd-sourcing (Phase 3) stays safe *because* it's self-verifying, but is opt-in later.
- **No new signing surface:** reuse the active signer adapter; respect its circuit-breaker.

## Phases (flag-gated from day one)

- **Phase 0 — Flag + schema.** `FEATURE_BLOSSOM_TORRENT_METADATA` wired through
  instance-config → config → constants; `BLOSSOM_TORRENT_METADATA_MAX_BASE64`;
  `buildTorrentMetadataEvent` in `nostrEventSchemas.js` + docs in
  `docs/nostr-event-schemas.md`. No behavior change.
- **Phase 1 — Publish.** Companion publish in the Blossom URL-only branch (D3/D4); promote
  Blossom to the **companion tier** magnet when published. Unit tests: builder round-trip,
  cap gate, tier selection.
- **Phase 2 — Playback.** `torrentMetadataService` (fetch/verify/cache) + wire into the
  WebTorrent add path with trusted-webseed sourcing and URL-only fallback. Unit tests:
  infohash-mismatch rejection, webseed sourcing, cache hit. Live check: webseed follows the
  Blossom `307` redirect.
- **Phase 3 — Reach (later).** Crowd-sourced lookup (any author), a dedicated cross-client
  kind, republish-on-mirror, IndexedDB metadata cache, and an **optional NIP-35 `kind 2003`
  companion for cross-client discovery** (complementary to — not a replacement for — the
  piece-map event; see "Why not NIP-35" above).

## Test scenarios (scenario-first; see Dark Factory rules)

- **Builder round-trip:** a `.torrent` buffer → `buildTorrentMetadataEvent` → event with
  `d=bitvid:torrent:<infohash>`, `x` tag, and `content.torrent` base64 that decodes back to
  the exact input bytes.
- **Cap gate:** payload > `MAX` ⇒ no companion, `hasValidInfoHash=false` (URL-only);
  ≤ `MAX` ⇒ companion built, `hasValidInfoHash=true`, `ws=`-only magnet, no `xs=`.
- **Verify — reject tampering:** a fetched companion whose reconstructed infohash ≠ `btih`
  ⇒ rejected, URL-only fallback taken.
- **Webseed sourcing:** even when the `.torrent` embeds url-list `X`, the add path uses the
  video event's `url` as the sole webseed.
- **Round-trip discovery:** publish (mocked relay) → fetch by infohash → reconstruct →
  infohash matches → `client.add` invoked with the trusted `urlList`.

## Risks / watch-items

- **Companion availability** — if it isn't on the queried relays, P2P is skipped and the
  video still plays URL-only. Publish to the user's write relays; consider republish on
  re-open (Phase 3).
- **Extra signer prompt at upload** — one more sign (the companion) after the video event.
  Reuse the live session; acceptable. Surface it in the upload progress copy.
- **Standalone-client incompatibility** — a `ws=`-only magnet is playable **in bitvid**
  (which does the lookup), not in a generic torrent client. Guaranteed generic P2P needs a
  hosted `.torrent` (`xs=`, tier 1). Accepted tradeoff.
- **Webseed `307` redirect** — WebTorrent's HTTP webseed must follow blossom.band →
  video.nostr.build; browser `fetch` does, but verify live in Phase 2.
- **Very large / pathological piece counts** — metadata may exceed the 64 KB cap ⇒
  URL-only fallback (correct, not a failure). Optional future lever: raise the generated
  piece length to shrink metadata (harmless with a webseed serving pieces over Range).

## Rollback

Flip `FEATURE_BLOSSOM_TORRENT_METADATA = false`: no companion is published and the
playback lookup is skipped — Blossom instantly reverts to URL-only. Already-published
companion events are inert (bitvid won't query them); they're standard replaceable 30078
events the author can overwrite/delete via normal Nostr means.
