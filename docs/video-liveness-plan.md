# Video Liveness / Card Health — Dev Plan

Status: **planned** (investigated; not started). Branch: `unstable`.

## Goal
Cards should only render videos that can actually play, decide fast, support
multiple source links (fall back if one is down), and never show two of the same
video (handled separately by cross-ecosystem dedup). Prefer CDN; if CDN is dead
but a WebTorrent source is live, keep the card.

## What already works (don't rebuild)
- **Hide/show policy is correct** (`js/utils/cardSourceVisibility.js`): a card
  hides only when **neither** CDN (`urlHealthState`) **nor** WebTorrent
  (`streamHealthState`) is healthy (and neither is pending); it un-hides the
  moment WebTorrent flips `healthy`. This already matches "no CDN → block; if a
  webtorrent flips green → bring it back."
- Owner's own videos bypass hiding.

## The real problems (diagnosis)
1. **Too slow.** `URL_PROBE_TIMEOUT_MS = 8s` (+ a retry), WebTorrent
   `PROBE_TIMEOUT_MS = 20s`. While a probe is *pending*, the card is **shown**
   (pending ≠ hidden). So unplayable videos sit visible for many seconds before
   being hidden. → tune timeouts + concurrency for a faster verdict.
2. **Probe accuracy.** The CDN check races a `HEAD {mode:"no-cors"}` which is
   **opaque** (status unreadable) for cross-origin hosts (most NIP-71 CDNs like
   `relay.towardsliberty.com`). Opaque without `confirmPlayable` → `unknown` (not
   healthy). Whether a card shows then hinges on timing/streamState. Net: foreign
   CDNs are judged unreliably. → use the **video-element probe** (`confirmPlayable`,
   actually loads the media) as the source of truth for the card verdict.
3. **Single source only.** The ingest adapter keeps ONE `url` (the primary imeta
   variant) and drops the rest. NIP-71 events can list **multiple imeta** (mirrors
   / alternate media). Example: Walker/THE Bitcoin Podcast event has a `video/mp4`
   imeta AND an `audio/mpeg` imeta; other events may list multiple video mirrors.
   → capture all playable sources and fall back across them.

## Plan

### Phase 1 — Multi-source capture (adapter + video model)
- `buildVideoFromNip71Event` (and the 30078 path where applicable) should expose a
  `sources` list: every imeta `url` whose `m` is a video type (and the magnet),
  in order, each with `{ url, mimeType, sha256, dim, duration }`. Keep the primary
  `url`/`magnet` for back-compat; add `sources` for fallback.
- Skip non-video media (e.g. `audio/mpeg`) for the *video* player, but we may keep
  audio as a separate affordance later (out of scope).

### Phase 2 — Liveness uses real playability across sources
- The card URL probe should try sources **in order** via the video-element probe
  (`confirmPlayable`); `healthy` if ANY source loads; `offline` only if ALL fail.
- Cache per-source results (already have a probe cache) so scrolling doesn't
  re-probe.
- Player playback should consume the same ordered `sources` so the one that
  probed healthy is what plays (and can fail over at play time too).

### Phase 3 — Speed
- Lower `URL_PROBE_TIMEOUT_MS` (8s → ~3–4s) and the video-element probe timeout;
  keep one retry only for `timeout` (not `error`). Consider bumping URL-probe
  concurrency (it's cheap vs WebTorrent swarm joins).
- WebTorrent `PROBE_TIMEOUT_MS` (20s): keep generous (swarm joins are slow) but
  ensure it runs in parallel and never blocks the CDN verdict.
- DECISION NEEDED: **show-pending (current) vs hide-until-verified.** Showing
  pending means a brief flash of soon-to-be-hidden dead cards; hide-until-verified
  means good cards pop in after the probe. Recommend: keep show-pending for cards
  with a *bitvid-native/whitelisted* source (fast/trusted), but **hide-until-verified
  for foreign/ingested** videos (so unplayable strangers never flash in).

## Reuse map
- `js/ui/urlHealthController.js` (probeUrl / probeUrlWithVideoElement) — make
  it iterate sources + prefer the video-element verdict.
- `js/gridHealth.js` (WebTorrent swarm probe) — timing only.
- `js/utils/cardSourceVisibility.js` — policy already correct; no change expected.
- `js/nostr/nip71IngestAdapter.js` — add `sources`.
- `js/constants.js` — `URL_PROBE_TIMEOUT_MS`, probe concurrency.
- Player/playback service — consume `sources` for fail-over.
