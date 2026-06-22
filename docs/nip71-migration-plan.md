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
- **bitvid never double-renders its own mirror.** Inside bitvid the 34235/36 is
  merged onto its 30078 by `videoRootId` (`nip71Cache` already keys on it) — it is
  metadata enrichment, never a second feed card. This dedup applies from Phase 1
  (our own mirror), not just Phase 2 (foreign videos).

---

## Field mapping: 30078 JSON → 34235/36 tags

Sourced against NIP-71 + NIP-92 (`imeta`) + NIP-94 (file metadata fields).

| bitvid (30078 content) | NIP-71 / imeta | notes |
|---|---|---|
| — | `["d", videoRootId]` | required for addressable; lockstep with 30078 |
| `title` | `["title", …]` | required |
| `description` | `.content` (full description) | |
| short text | `["alt", …]` | accessibility text — title / first line, NOT a dump of the full description |
| first publish time | `["published_at", …]` | read from the ORIGINAL 30078 (root `created_at`/`published_at`); **stable across edits** so foreign clients don't reorder |
| `url` (HTTPS) | `imeta url <…>` | primary playable source for foreign clients |
| derived MIME | `imeta m <…>` | not stored today → derive from extension, default `video/mp4` |
| `thumbnail` | `imeta image <…>` | |
| `duration` (upload `#input-duration`) | `imeta duration <sec>` | already collected at upload — wire it through |
| dimensions (probe at upload) | `imeta dim <w>x<h>` **+ 34235-vs-34236 selection** | not captured today → add a `loadedmetadata` probe |
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
3. **The `url` must be publicly reachable** (CORS + range requests) so other
   clients can actually play it. Gate the toggle on bitvid's existing public-access
   verification (`verifyPublicAccess`) — don't advertise a video elsewhere that
   only bitvid can fetch.

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

## Discovery & relays (the part that decides if anyone sees it)

A format-perfect mirror is **invisible** if it isn't on the relays other clients
read. This is the #1 thing that makes or breaks interop, and it's a *relay* problem,
not a format problem.

- bitvid already has NIP-65 (`relayManager.publishRelayList`, kind 10002, + outbox
  reads), and `publishVideo` targets `this.writeRelays`. The mirror must publish to
  the user's **NIP-65 write relays (outbox model)** — that's where outbox-aware
  clients (Amethyst, etc.) look for that author's content.
- **Ensure the user has a published, accurate NIP-65 list** when they first enable
  the mirror (publish kind 10002 if missing). Without it, outbox clients can't find
  the video regardless of correctness.
- Consider also fanning the mirror out to a small set of **well-known general/video
  relays** so non-outbox clients (and search) can discover it. Keep this list short
  and configurable; respect the relay-fan-out cap lessons (don't storm).
- Relay reads for any future ingest go through the subscription manager
  (lint:pool-access), never `pool.list` directly.

---

## Phases

### Phase 0 — Retarget builders (no UX; flag stays off)
- Point existing `buildNip71VideoEvent` at **34235/36 + `d`=`videoRootId`** (it
  currently targets 21/22). Implement the field mapping incl. `magnet`/`i`/`ox`/
  `duration` (already collected at upload).
- Normal-vs-short selection: default 34235; choose 34236 when known-portrait
  (from captured dimensions; otherwise a manual "short" toggle).
- Cheat-resistant tests: bitvid video → spec-valid 34235 event → round-trips back
  via `convertEventToVideo`; magnet/infohash present; private refused; url-less refused.
- **Interop golden test**: assert the produced event matches the spec shape
  (`d`/`title`/`published_at`/`imeta url`+`image`) so a foreign parser (Nostube-style)
  can read it — guards against silent shape drift.

### Phase 1 — Outbound publish/edit/delete (the headline feature)
- Edit form toggle: **"Also publish to other Nostr video apps (NIP-71)"** — off by
  default, gated to **public + HTTPS-url + public-access-verified** videos, and
  **not offered for `isNsfw` videos when `ALLOW_NSFW_CONTENT=false`** (see
  "Moderation, web-of-trust, mute/block & NSFW").
- Surface the same control in the **My Videos tab** (per-video mirror status +
  toggle; it already lists owned videos with action buttons). Optional bulk
  "make discoverable" there later.
- **Capture dimensions at upload** (`loadedmetadata` probe) for 34235-vs-34236
  selection + `imeta dim`; wire the existing `duration` through.
- **Add a hashtags input**; write `["t", tag]` on **both** the 30078 and the mirror
  (the feed already scores these — no algo change).
- **Field conversion on edit/upgrade**: map all available 30078 fields into their
  NIP-71 homes per the mapping table (see "Converting existing videos").
- Publish: 30078 (as today) **+** the 34235/36 mirror to the user's **outbox
  (NIP-65 write) relays**; publish a kind-10002 list first if the user has none
  (see "Discovery & relays"). Reuse the publish-outcome toast.
- Lifecycle parity: **edit** updates both (same d-tag); **delete** publishes a
  NIP-09 (`kind 5`) referencing the mirror's `["a","34235:<pubkey>:<d>"]` (+ `k`),
  AND empties the addressable event (empty-replace, the watch-history/encrypted-sync
  lesson) so clients that ignore NIP-09 still see it cleared; **toggle-off** does the
  same for the mirror only.
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

## Moderation, web-of-trust, mute/block & NSFW (audited 2026-06-22)

The existing controls key on **author pubkey** and **event id**, so they apply to
NIP-71 videos automatically — *as long as ingested videos flow through the same feed
pipeline*. One real gap (inbound NSFW) + one config-respect (outbound).

**Outbound (Phase 1):**
- [ ] Respect the site `ALLOW_NSFW_CONTENT` config (`config/instance-config.js`,
      default `false`): when false, **do not offer/allow the mirror for `isNsfw`
      videos** — an instance that won't surface NSFW shouldn't publish it outward.
      The pure builder stays config-agnostic and always sets `content-warning` when
      NSFW; gate at the call site.
- Mute/block/WoT/admin-blacklist don't newly apply outbound — it's the user's own
  content (a blacklisted user can't publish anyway).

**Inbound (Phase 2) — the real moderation work:**
- [ ] **`content-warning` → `isNsfw`**: `mergeNip71MetadataIntoVideo` does NOT
      currently map a NIP-71 `content-warning` to `video.isNsfw`. The site NSFW
      filter keys on `isNsfw`, so foreign NSFW would bypass it. Map it in the ingest
      path so `ALLOW_NSFW_CONTENT=false` filters foreign NSFW too.
- [ ] **Same pipeline, no bypass**: route every ingested video through the existing
      stages — `blacklist-filter` (`shouldIncludeVideo`: admin/event-id blacklist +
      blocked authors), `moderation` (admin whitelist/blacklist + trusted-mute /
      trusted-report thresholds = web-of-trust), watch-history suppression,
      kids-audience, NSFW. These key on pubkey/id, so mute lists (NIP-51 kind 10000),
      blocks, admin lists, and WoT thresholds catch foreign authors automatically.
- [ ] **Trust gate for strangers**: don't surface unknown/untrusted foreign authors
      by default — apply the same trust-seed / web-of-trust gating native videos get
      (consider requiring author ∈ WoT, or a stricter default threshold for ingest).
- **Kids feed is already safe**: `kidsAudienceFilterStage` is allowlist-based
  (`isForKids !== true` ⇒ excluded) and also drops `isNsfw` + disallowed
  content-warnings, so foreign videos (no `isForKids`) never enter the kids feed.

---

## Enrichment backlog (nice-to-have, not v1)
`bitrate`, `waveform`, multiple resolution `imeta` variants + multi-audio
(`ov`/language) tracks, `text-track` (WebVTT captions/subtitles/chapters),
`segment` (chapters) — all need more captured/transcoded at upload time. v1 ships
spec-valid imeta with `url`/`m`/`image`/`dim`/`duration`/`x` + `magnet`/`i`, and
grows from there. (`dim`/`duration` are pulled into v1 — see Phase 1.)

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
