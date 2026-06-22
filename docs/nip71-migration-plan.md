# NIP-71 Interop Plan for bitvid

Status: **planning / spec** (no code yet). Last updated 2026-06-22.

Goal: let a publisher **opt in** to making a bitvid video fully NIP-71 compliant so
it (a) shows up on other Nostr video clients (Nostube, Amethyst, Flare, zap.stream
recordings, …) and (b) still carries bitvid's extra data (WebTorrent, flags) for a
richer experience inside bitvid. Eventually bitvid also **ingests** other clients'
NIP-71 videos. Decisions below were made with the maintainer; see "Decisions".

---

## Decisions (locked)

1. **Kind: addressable `34235` (normal) / `34236` (short).**
2. **Opt-in, off by default** — per-video toggle; private videos never mirrored.
3. **Scope: outbound first, inbound later** (Phase 1 vs Phase 2).

### Why 34235/34236 (research-validated)

The earlier assumption that 34235/36 were "deprecated legacy" was **wrong**. The
current NIP-71 (master) defines **all four** kinds and explicitly designates the
addressable pair for editable content:

> "For content that may need updates after publication (such as correcting
> metadata, descriptions, or handling URL migrations), addressable versions are
> available: Kind `34235` … Kind `34236` … include a `d` tag as a unique
> identifier and can be updated while maintaining the same addressable reference."

That is **exactly** bitvid's model (replaceable kind 30078, edit-in-place via
`d` = `videoRootId`). So 34235/36 is not a compromise — it's the spec-recommended
kind for what bitvid does, and it's what Nostube/Goblinbox consume today.

> Hedge: keep the builder **kind-parameterized** so we can also emit / switch to
> `21`/`22` (regular) later without a rewrite if the ecosystem leans that way.

---

## Architecture: dual-event, additive

- **Canonical stays kind 30078** (NIP-78 app-data), unchanged. Source of truth for
  WebTorrent, private videos, moderation, view counts — none of which NIP-71 models.
- **Mirror = kind 34235/34236**, addressable with **`d` = `videoRootId`** (same
  d-tag as the 30078), so the mirror edits/deletes in **lockstep** with the canonical.
- Correlation is automatic via `(pubkey, videoRootId)`. We also set:
  - `["origin", "bitvid", "<videoRootId>", "https://bitvid.network/?v=<nevent|naddr>"]`
    so other clients can attribute + deep-link back ("watch on bitvid").
  - Optionally `["a", "30078:<pubkey>:<videoRootId>"]` back-pointer (harmless elsewhere).

---

## Field mapping: 30078 JSON → 34235/36 tags

Sourced against NIP-71 + NIP-92 (`imeta`) + NIP-94 (file metadata fields).

| bitvid (30078 content) | NIP-71 / imeta | notes |
|---|---|---|
| — | `["d", videoRootId]` | required for addressable; lockstep with 30078 |
| `title` | `["title", …]` | required |
| `description` | `.content` and `["alt", …]` | |
| first publish time | `["published_at", …]` | **stable across edits** (no reordering elsewhere) |
| `url` (HTTPS) | `imeta url <…>` | primary playable source for foreign clients |
| derived MIME | `imeta m <…>` | not stored today → derive from extension, default `video/mp4` |
| `thumbnail` | `imeta image <…>` | |
| `fileSha256` | `imeta x <…>` | |
| `originalFileSha256` | `imeta ox <…>` | |
| `magnet` | `imeta magnet <magnet:?xt=…&ws=…&xs=…>` | **standard NIP-94 field** — torrent-aware clients can use it |
| `infoHash` | `imeta i <infohash>` | **standard NIP-94 field** |
| `ws` / `xs` | encoded into the `magnet` URI (`&ws=`/`&xs=`) | also kept on 30078 canonical |
| `isNsfw` | `["content-warning", "<reason>"]` | standard |
| hashtags | `["t", <tag>]` (repeated) | written to **both** 30078 and the mirror; see "Hashtags & the feed" |
| `isForKids`, `mode`, etc. | bitvid-namespaced extra tags | ignored by other clients |
| — | `["client", "bitvid"]` | |

**Two hard rules that fall out of this:**

1. **Private videos are never mirrored.** NIP-71 has no encryption; mirroring would
   leak them. The toggle is disabled (with explanation) for private videos.
2. **A hosted HTTPS `url` is required to mirror.** Foreign clients can't play a
   magnet-only video; bitvid's magnet still rides along (`magnet`/`i`) for
   torrent-aware clients, but `url` must be present or the toggle is disabled.

**Timestamp hygiene:** `created_at` = actual signing time; `published_at` = display
time. (Avoids the future-`created_at` weirdness seen in some published events.)

---

## Hashtags & the feed (no algo changes)

The explore/kids feed scoring **already** consumes NIP-71 hashtags:
`js/feedEngine/exploreScoring.js` builds each video's tag vector from **both** the
raw `["t", …]` tags on the event **and** `video.nip71.hashtags`, then matches it
against the user's interests/disinterests vector. `nip71.js` already parses `t`
tags into `metadata.hashtags` and merges NIP-71 metadata onto videos by
`videoRootId` (`nip71Cache`). So a native 30078 video, a 34235/36 mirror, and an
ingested foreign NIP-71 video all slot into the **same** hashtag-driven scoring —
**the feed algorithm needs zero changes.**

The only gap is **capture**: bitvid's current 30078 content schema has no per-video
hashtags field (videos only get the topic tag `["t","video"]`). So the work is to
add a hashtags input and emit `["t", tag]` on **both** events. This is part of
Phase 1.

## Converting existing videos (the edit/upgrade flow)

Opting an existing video into NIP-71 is just an **edit**. When the publisher toggles
the mirror on (or edits an already-mirrored video), bitvid maps every available
30078 field into its NIP-71 home per the table above — title→`title`,
description→`.content`/`alt`, url→`imeta url`, thumbnail→`imeta image`,
magnet/infoHash→`imeta magnet`/`i`, nsfw→`content-warning`, hashtags→`t`, etc. —
and writes the 34235/36 mirror with `d` = `videoRootId` so it stays addressable and
lockstep-editable.

Practical notes for conversion:
- Existing videos have **no user hashtags yet**, so the edit form surfaces the new
  hashtags input; tags the publisher adds are written to **both** the 30078 and the
  mirror (keeping the feed unified, native + mirrored).
- Conversion is non-destructive: the 30078 stays canonical; the mirror is additive.
- Re-editing later updates both in lockstep (same `d`-tag); toggling off NIP-09s the
  mirror only.

---

## Phases

### Phase 0 — Retarget builders (no UX; flag stays off)
- Point existing `buildNip71VideoEvent` at **34235/36 + `d`=`videoRootId`** (it
  currently targets 21/22). Implement the field mapping incl. `magnet`/`i`/`ox`.
- Normal-vs-short selection: default 34235; choose 34236 when known-portrait
  (dimensions when available; otherwise a manual "short" toggle).
- Cheat-resistant tests: bitvid video → spec-valid 34235 event → round-trips back
  via `convertEventToVideo`; magnet/infohash present; private refused; url-less refused.

### Phase 1 — Outbound publish/edit/delete (the headline feature)
- Edit form toggle: **"Also publish to other Nostr video apps (NIP-71)"** — off by
  default, gated to public + HTTPS-url videos.
- **Add a hashtags input** to the publish/edit form; write `["t", tag]` on **both**
  the 30078 and the 34235/36 mirror (the feed already scores these — no algo change).
- **Field conversion on edit/upgrade**: map all available 30078 fields into their
  NIP-71 homes per the mapping table (see "Converting existing videos").
- Publish: 30078 (as today) **+** the 34235/36 mirror to the write-relay set
  (reuse `getDeletePublishRelays` write set + the publish-outcome toast).
- Lifecycle parity: **edit** updates both (same d-tag); **delete** NIP-09s both
  addresses; **toggle-off** NIP-09s the mirror (removes it from other clients).
- Mutation-verified lifecycle tests, then flip `FEATURE_PUBLISH_NIP71` on.

### Phase 1.5 — Discoverability glue (cheap, high interop value)
- **NIP-89 handler registration** (kind `31990`): publish once that bitvid handles
  video kinds `21/22/34235/34236` with a `web` URL template. Result: other clients
  (Amethyst, etc.) can show **"Open in bitvid"** when they encounter a video event.
- **NIP-51 video curation sets** (kind `30005`): publish/read bitvid playlists as
  portable video sets so playlists interop across clients. (Sets reference videos
  by `e`/`a` tags.)

### Phase 2 — Inbound ingest (separate, bigger)
- Feed source querying `34235/36` (and `21/22`) from relays; map via
  `convertEventToVideo`.
- Dedup vs bitvid-native (by `a`-address / `x` hash / `url`), moderation + trust
  gating (reuse blacklist / NIP-51 mute), and a **distinct discovery surface** so
  foreign videos read as "from the wider Nostrverse," not bitvid-native.
- Honor `origin` for attribution; respect the no-URL-allowlist rule but apply
  existing moderation.
- (Cross-client comments/zaps via NIP-22 `kind:1111` addressed to the 34235 event
  is a further follow-on — bitvid comments currently target 30078.)

---

## Enrichment backlog (nice-to-have, not v1)
`dim`, `duration`, `bitrate`, `waveform`, multiple `imeta` variants + multi-audio
(`ov`/language) tracks, `text-track` (WebVTT captions/subtitles/chapters),
`segment` (chapters) — all need more captured at upload time. v1 ships the minimal
spec-valid imeta (`url`/`m`/`image` + `magnet`/`i`) and grows from there.

---

## Risks / watch-items
- **Editing addressable events across foreign clients**: some cache aggressively;
  edits may lag elsewhere. Acceptable; document it.
- **Magnet-only catalogs**: those videos simply won't appear on non-torrent clients
  (by design — they still work in bitvid).
- **Kind drift**: if the ecosystem consolidates on 21/22, add/dual-emit later
  (builder stays kind-parameterized).
- **Ingest safety (Phase 2)**: arbitrary foreign media + metadata → keep moderation,
  no autoplay of untrusted sources, sanitize before render.

---

## Sources
- NIP-71 Video Events (current): https://github.com/nostr-protocol/nips/blob/master/71.md (vendored at `docs/nips/71.md`)
- NIP-92 inline metadata (`imeta`): https://github.com/nostr-protocol/nips/blob/master/92.md
- NIP-94 file metadata (`magnet`, `i`, `x`, `ox`, `fallback`, …): https://github.com/nostr-protocol/nips/blob/master/94.md
- NIP-89 recommended application handlers (`31989`/`31990`): https://github.com/nostr-protocol/nips/blob/master/89.md
- NIP-51 lists/sets incl. kind `30005` video curation: https://github.com/nostr-protocol/nips/blob/master/51.md
- Existing bitvid code: `js/nostr/nip71.js` (builders/parser), `js/nostrEventSchemas.js` (`NIP71_VIDEO`/`NIP71_SHORT_VIDEO`), `js/constants.js` (`FEATURE_PUBLISH_NIP71`).
