# Audio / Music / Podcasts — Dev Plan

Status: **DECISIONS LOCKED (D1–D10, per recommendations, 2026-07-09)** — ready to
build; config flag `FEATURE_AUDIO_INGEST` wired (default off). Sibling of the shorts
(`docs/shorts-plan.md`) and live (`docs/live-ingest-plan.md` /
`docs/live-publish-plan.md`) plans; shares the media-category model with both.
Tracks TODO #60. The near-term "keep audio out of the video feed" guard is
already shipped (see #60 / `convertEventToVideo` `isAudioOnlyVideoObject`).

## Executive summary

bitvid is video-only: it supports NIP-71 video (kinds 21/22/34235/34236) and
native kind 30078, and has **no `<audio>` player**. Podcasts/music published as
native 30078 with `imeta m audio/*` currently render as a broken `<video>`, so
they are now filtered out of the video feeds. This plan turns "filter them out"
into "give them a proper home": an **Audio** category with its own player,
sidebar tab, channel-profile tab, and "My Content" tab — built on a **shared
media-category resolver** (`video | audio | live | short`) used everywhere so a
note lands in exactly one bucket. Watch/ingest-first (mirrors live-ingest),
flag-gated from day one (off = no trace), whitelist-scoped like shorts/live.

## Landscape — audio kinds & NIPs (surveyed 2026-07-09, local NIP mirror)

| Surface | Kind / tag | Notes | Support |
| --- | --- | --- | --- |
| **Native re-upload** (today) | 30078 + `imeta m audio/*` | What Nostr Compass / Nodesignal use; bespoke, not a standard audio kind | pipeline exists |
| **NIP-A0 Voice Messages** | `kind 1222` (root), `1244` (reply) | Native short audio notes; URL to audio file, rec. `audio/mp4`/.m4a, ≤60s | ❌ |
| **NIP-73 External Content IDs** | `i`/`k` = `podcast:guid` / `podcast:item:guid` / `podcast:publisher:guid` | The Podcasting 2.0 / PodcastIndex / Fountain bridge — reference real feeds/episodes | ❌ |
| **NIP-53 live audio** | `kind 30311` (stream), `30312` (audio rooms/spaces) | Live audio; **owned by #16**, not this plan | ❌ (#16) |
| **NIP-71 audio variants** | `imeta m audio/*` + `waveform` | Already in the spec bitvid parses (audio track on a video) | partial |
| **Music apps** (Wavlake, Stemstr) | app-specific custom kinds | Not ratified NIPs → opt-in integration only, not core | ❌ |

## Decisions needed

> **DECISION 1 — v1 source scope. ✅ LOCKED (= recommendation below).**
> Which sources count as "audio" for the first release?
> - **Option A — Native only:** kind 30078 with `imeta m audio/*` (+ a native
>   `t:audio` marker for new bitvid publishing). Lowest effort — reuses the whole
>   existing 30078 pipeline; matches the data already in the wild.
> - **Option B — A + NIP-A0 voice notes** (`kind 1222`/`1244`). Adds a small,
>   standardized native audio kind. Moderate.
> - **Option C — A + B + NIP-73 podcast-feed ingest** (pull real podcast RSS via
>   PodcastIndex GUIDs). Full podcast client. Biggest — its own phase.
> _Recommendation: **A for v1**, B fast-follow, C as a later phase (D7)._

> **DECISION 2 — Discovery / whitelist scope. ✅ LOCKED (= recommendation below).**
> Mirror shorts D1 / live D1: list audio only from **whitelisted/trusted authors**?
> _Recommendation: **Yes** — same scope as video/shorts/live, one consistent trust
> model. (No separate audio allowlist.)_

> **DECISION 3 — Does audio appear in the main feed, or Audio-tab only? ✅ LOCKED (= recommendation below).**
> - **Option A — Audio-tab only** (excluded from main/discovery video feeds).
>   Consistent with the shipped guard that already excludes audio from video feeds,
>   and with shorts D3 (Shorts-tab only).
> - **Option B — also mixed into the main feed** with an audio card treatment.
> _Recommendation: **Option A** — keeps the video feed clean; audio is a
> deliberate destination, not an interruption._

> **DECISION 4 — Player model. ✅ LOCKED: A for v1, architected toward B.**
> - **Option A — Reuse the player modal in "audio mode":** detect audio → swap the
>   `<video>` for an `<audio>` element + big poster art, reuse the existing
>   zaps/comments/moderation/share chrome. Fastest; one modal.
> - **Option B — Persistent mini audio player** (bottom bar that keeps playing while
>   you browse — the podcast/music norm). Best listening UX; larger build (global
>   playback state, survives navigation).
> _Recommendation: **A for v1**, **B as the real target** — audio's whole value is
> "keep listening while you browse," so plan the architecture so A can grow into B._

> **DECISION 5 — Category signal / resolver. ✅ LOCKED (= recommendation below).**
> How is a note bucketed as audio (must be deterministic + shared)?
> Signals, in priority: (1) `imeta m audio/*` with no video variant, (2) kind
> `1222`/`1244` (if D1≥B), (3) `podcast:*` `i` tag (if D1=C), (4) native `t:audio`
> marker, (5) unambiguous audio URL extension (the shipped fallback). `.ogg` stays
> video unless imeta says audio.
> _Also decide: **adopt a `t:audio` marker** (parallel to `t:video`) for bitvid's
> own audio publishing so the Audio feed has a clean relay-side `#t` filter?
> Recommendation: **Yes.**_

> **DECISION 6 — Publish vs watch-only for v1. ✅ LOCKED (= recommendation below).**
> - **Option A — Watch/ingest-only** (mirrors live-ingest): bitvid surfaces others'
>   audio, no upload UI yet.
> - **Option B — Publish too:** upload an audio file → native 30078 with
>   `imeta m audio/*` + `t:audio` (and/or NIP-A0 `1222` for short voice notes).
> _Recommendation: **A for v1**; split publish into its own plan/phase like
> live-ingest vs live-publish._

> **DECISION 7 — Podcast-feed interop (NIP-73). ✅ LOCKED: Yes, Phase 3.**
> Should bitvid reference real Podcasting 2.0 feeds/episodes (link an audio note to
> its `podcast:guid` / `podcast:item:guid`, dedupe re-uploads, interop with Fountain
> / PodcastIndex)? _Recommendation: **Yes, but Phase 3** — high interop value, but
> pulls in RSS/GUID resolution; not v1._

> **DECISION 8 — One "Audio" category, or split Music vs Podcasts? ✅ LOCKED (= recommendation below).**
> _Recommendation: **one Audio category** for v1 (podcasts + music together); add a
> Music sub-filter later if Wavlake-style content appears. Splitting now needs a
> reliable music-vs-podcast signal we don't have._

> **DECISION 9 — Value-for-Value / zaps. ✅ LOCKED (= recommendation below).**
> Podcasting 2.0 has streaming V4V (per-minute sats). bitvid has one-shot zaps.
> _Recommendation: **reuse the existing zap system** for v1; per-minute streaming
> V4V is a future enhancement, not v1._

> **DECISION 10 — Config flag. ✅ LOCKED (= recommendation below).**
> Name + granularity. _Recommendation: `FEATURE_AUDIO_INGEST` (off = no trace),
> later `FEATURE_AUDIO_PUBLISH`; matches `FEATURE_LIVE_INGEST` / shorts pattern._

## Config flags (off = no trace)

- `FEATURE_AUDIO_INGEST` (default **false**) — gates the Audio sidebar tab, the
  channel/`My Content` Audio tabs, the audio player, and audio-category resolution.
  With it off, nothing audio renders and the shipped guard keeps audio out of the
  video feeds (current behavior).
- `FEATURE_AUDIO_PUBLISH` (default **false**, later) — gates the upload-side audio
  content-type + native marker.

## Field mapping — detecting an "audio" note (the shared resolver)

Add ONE `resolveMediaCategory(video) → "video" | "audio" | "live" | "short"` used
by the sidebar feeds, the public channel tabs, AND the profile-modal "My Content"
tabs (TODO #60). Audio branch reuses the already-shipped
`isAudioOnlyVideoObject(video)` logic:

- **audio** ⇐ no magnet AND no `imeta m video/*` AND ( `imeta m audio/*` OR audio
  kind `1222`/`1244` OR a `podcast:*` `i` tag OR `t:audio` OR an unambiguous audio
  URL `.mp3/.m4a/.m4b/.f4a/.aac/.wav/.flac/.opus/.oga/.weba/.mka` ). `.ogg` alone
  stays video.
- **short**/**live** per shorts-plan / live-ingest-plan.
- **video** otherwise (default).

Metadata an audio card wants (already present on the wild podcast notes):
`title`, `image`/`thumbnail` (cover art), `duration`, `summary`/`description`,
`channel`, `show`, podcast `t` tags. NIP-71 audio variants also carry `waveform`.

## Architecture

- **Category resolver** (`js/nostr/…` or `js/services/…`) — single source of truth
  (D5). Feed engine + channelProfile + MyVideosController all call it. This is the
  natural home for the #17 unified media grid.
- **Per-category lazy loaders** — each tab (sidebar + channel + My Content) fetches
  only its category on select; no cross-contamination (audio guard already keeps
  audio out of video and vice-versa).
- **Audio player** (D4) — v1: player modal detects `category==="audio"` → renders
  `<audio>` + poster + existing zap/comment/moderation chrome. Architect the
  playback/session layer so it can later hoist into a **persistent mini-player**
  (Option B) without rewriting the surfaces.
- **Channel profile + "My Content"** — TODO #60 tab strips (Videos / Audio / Live /
  Shorts), empty categories hidden; "My Videos" pane renamed **My Content**.

## Audio / podcast UX best practices

- **Keep playing while browsing** — the defining audio behavior; the persistent
  mini-player (D4-B) is what makes bitvid usable as a podcast/music app.
- **Cover art forward** — audio cards lead with `image`; no 16:9 letterboxing.
- **Duration + resume** — show length; remember playback position per episode
  (ties into watch-history).
- **Speed + skip** — 1x–2x rate, ±15/30s skip; background/lock-screen media session
  (`navigator.mediaSession`) so phones show cover art + transport controls.
- **Waveform** (nice-to-have) when NIP-71 `waveform` is present.

## Phases (each flag-gated from day one)

- **Phase 0 — Resolver + guard alignment.** Ship `resolveMediaCategory`; refactor
  the shipped `isAudioOnlyVideoObject` to feed it. No UX. (Unblocks shorts/live too.)
- **Phase 1 — Audio tab + player (watch-only, D1=A).** Sidebar Audio tab (whitelist-
  scoped), audio-mode player modal, native 30078 `m audio/*` + `t:audio`. The
  headline.
- **Phase 1.5 — Channel + My Content tabs** (TODO #60). Category tab strips on the
  public channel and the renamed "My Content" pane.
- **Phase 2 — NIP-A0 voice notes** (D1=B). Ingest `1222`/`1244`; short-note card.
- **Phase 2.5 — Publish** (`FEATURE_AUDIO_PUBLISH`, D6-B). Upload audio → native
  30078 `m audio/*` + `t:audio`; optional NIP-A0 for short voice.
- **Phase 3 — Persistent mini-player** (D4-B) + **NIP-73 podcast-feed interop** (D7):
  reference real feeds/episodes, dedupe re-uploads, PodcastIndex/Fountain interop.

## Moderation, whitelist & NSFW

Inherit the existing model unchanged (same as shorts/live): whitelist scope (D2),
web-of-trust mute/report blur, per-event blacklist, NSFW gate — all key off the
author + event, not the media type. The account-level WoT override (#24) applies
to audio creators too.

## Risks / watch-items

- **Broken/foreign audio formats** — some `audio/*` won't play cross-browser; the
  `<audio>` element degrades better than `<video>` but still probe/fallback.
- **Re-upload duplication** — the same episode as a native 30078 AND (later) a
  NIP-73-referenced feed item → dedupe by `podcast:item:guid` once D7 lands.
- **Persistent player scope creep** — global playback state touches routing/history;
  keep v1 to the modal, but don't design it in a way that blocks D4-B.
- **Empty tabs** — whitelist-scoped audio may be sparse; hide empty categories.
- **Music licensing** — surfacing Wavlake-style music is an integration, not core;
  keep it opt-in (D8).

## Cross-refs & sources

- TODO #60 (audio tab, channel/My Content tabs, resolver), #16 (live audio),
  #17 (unified media grid), #24 (WoT override).
- Sibling plans: `docs/shorts-plan.md`, `docs/live-ingest-plan.md`,
  `docs/live-publish-plan.md`, `docs/nip71-migration-plan.md`.
- Specs (local mirror `docs/nips/`): NIP-A0 (Voice Messages 1222/1244), NIP-73
  (External Content IDs / podcast GUIDs), NIP-53 (Live 30311/30312), NIP-71
  (video + audio variants), NIP-94/96 + Blossom (blob hosting — where the audio
  files live, e.g. `relay.towardsliberty.com`).
