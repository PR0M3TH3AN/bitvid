# Shorts (short-form vertical video) — Dev Plan

TODO ref: **#16b** in `todo/TODO_2026-06-20_pre-launch.md`.
Status: **PLANNING** — decisions open (see below). Not started.

Short-form vertical video is **NIP-71 kind 22** (the short counterpart to kind 21
normal video), plus the addressable short kind **34236**. It is a *different*
feature from live streams (#16, NIP-53) — do not conflate them.

The good news: **bitvid already ingests kind 22.** The inbound NIP-71 adapter
(`js/nostr/nip71IngestAdapter.js`, `NIP71_KINDS = {21, 22, 34235, 34236}`) parses
short-form notes today and they already flow into the main feed. So this feature
is **not new ingest code** — it is (a) a way to distinguish "short" videos,
(b) a dedicated **Shorts sidebar tab** with a vertical/swipe UI, and (c) a feed
source that lists only shorts. Everything ships behind a config flag that leaves
**no trace** when off.

---

## Decisions needed

> **DECISION 1 — Discovery scope.** Does Shorts pull from the **same whitelisted
> authors** as the main feed (reuse the existing render-time whitelist/WoT
> filter), or does it have its **own discovery scope** (e.g. all authors, capped)?
> *Recommendation: same whitelist scope as the main feed for v1 — least surprise,
> reuses the existing moderation filter, no new relay fan-out.*

> **DECISION 2 — Moderation / NSFW.** Inherit the existing filters
> (blacklist / WoT mute / NSFW / private), or add short-specific handling?
> *Recommendation: inherit — shorts are just kind-22 videos; the render-time
> `filterVideos` path already applies.*

> **DECISION 3 — Do shorts also appear in the main feed, or only under Shorts?**
> Today ingested kind-22 videos land in the main grids. Options:
> (a) leave them in the main feed AND add a Shorts tab (Shorts = a filtered view);
> (b) exclude shorts from the main/Recent/For-You feeds and surface them ONLY in
> the Shorts tab.
> *Recommendation: (a) for v1 — simplest, no changes to existing feeds; revisit
> exclusion later if the main feed feels diluted.*

> **DECISION 4 — What counts as a "short"?** See Field mapping below; confirm the
> detection rule (kind 22/34236 vs aspect-ratio) once we've eyeballed real events.

> **DECISION 5 — UI ambition for v1.** Minimal (a normal grid that opens shorts in
> a portrait player) vs full (TikTok-style full-screen vertical swipe/next feed)?
> *Recommendation: ship the grid + portrait player first (small), then layer the
> swipe feed as a phase 2 — keeps the first release cheap.*

---

## Config flag (off = no trace)

Add `FEATURE_SHORTS` to `config/instance-config.js` (default `false`), threaded
through `js/config.js` → `js/constants.js` exactly like `FEATURE_NIP71_INGEST`.

When the flag is off, **all** of the following must be absent (the "as if it were
never added" requirement):
1. **Sidebar tab** — the Shorts link is not rendered in `components/sidebar.html`
   (not merely `hidden`).
2. **Feed registration** — `FEED_TYPES.SHORTS` is not registered in
   `js/app/feedCoordinator.js` (no pipeline, no sorter).
3. **Subscription/source** — no shorts-specific relay subscription is created.
4. **Route** — `#view=shorts` falls back to the default view (a stale bookmark
   can't resurrect the tab).
5. **Config surface** — the flag is the only footprint.

---

## Field mapping — detecting a "short"

A video object needs a reliable `isShort` marker so a feed source can filter.
Candidate signals (to confirm against real events in Phase 0):

| Signal | Meaning | Notes |
|--------|---------|-------|
| `kind === 22` | NIP-71 regular short | primary signal for ingested foreign shorts |
| `kind === 34236` | NIP-71 **addressable** short | bitvid's own mirror uses 34235/36 (`nip71Mirror.js`) |
| `imeta dim` height > width | portrait aspect | fallback when kind is ambiguous (matches the mirror's `short = hasDims && height > width` heuristic) |

Plan: surface `isShort` on the bitvid video object in `nip71IngestAdapter.js`
(it already tracks the source kind) and in the local mirror path, so both foreign
and native shorts are detectable without re-fetching.

---

## Architecture

Reuses the existing feed engine + ingest; new pieces are thin.

- **Flag:** `FEATURE_SHORTS` (instance-config → config → constants).
- **Feed type:** add `SHORTS: "shorts"` to `FEED_TYPES` (`js/constants.js`).
- **Feed source/registration:** register `FEED_TYPES.SHORTS` in
  `js/app/feedCoordinator.js`, sourced from the already-populated active-video
  cache filtered to `isShort` (per DECISION 1, scoped to the same authors as the
  main feed). A dedicated sorter can be chronological or reuse the For-You scorer
  — TBD, likely chronological for v1.
- **Sidebar tab:** add a Shorts link in `components/sidebar.html`, rendered only
  when the flag is on.
- **View:** `views/shorts.html` (a portrait-oriented grid container).
- **Player UI:** v1 opens a short in the existing player modal with a portrait
  layout; v2 adds a full-screen vertical swipe/next feed.
- **Diversity:** apply the existing `spreadAuthors` pass (feed sorters) so the
  Shorts tab doesn't cluster by creator, consistent with For You / Trending.

---

## Phases (each flag-gated from day one)

- **Phase 0 — Detection + flag (small).** Add `FEATURE_SHORTS` (off), `isShort`
  derivation in the ingest adapter + mirror, unit tests for detection. No UI.
- **Phase 1 — Tab + feed (small–medium).** `FEED_TYPES.SHORTS`, sidebar link,
  `views/shorts.html`, feed registration filtered to `isShort`, route gated by
  flag. Grid renders; opens in the standard player.
- **Phase 2 — Vertical UX (medium).** Portrait player layout + swipe/next feel.
- **Phase 3 — Polish.** Autoplay-on-scroll, mute toggle, per-tab empty states,
  optional exclusion from the main feed (DECISION 3 revisit).

---

## Moderation, whitelist & NSFW

Per DECISION 2 (recommended: inherit): shorts pass through the same render-time
`filterVideos` path (blacklist event ids, author blacklist, WoT mute, NSFW gate,
private exclusion) as every other grid. No new moderation surface. The admin
per-event block list (#25) already applies to any event id, shorts included.

---

## Risks / watch-items

- **Aspect-ratio detection is soft** — not every short carries `imeta dim`; kind
  is the reliable signal, dims are the fallback. Confirm in Phase 0.
- **Double-listing** — if shorts stay in the main feed (DECISION 3a), make sure
  the cross-ecosystem dedup (import-link + infohash, see nip71 onboarding) still
  collapses a short that also exists as a 30078/34235 video.
- **Empty tab** — with a whitelist-scoped source, a small instance may have zero
  shorts; ship a clear empty state so the tab doesn't look broken.

---

## Sources

- NIP-71 (video events; kinds 21/22 regular, 34235/34236 addressable).
- Existing code: `js/nostr/nip71IngestAdapter.js`, `js/nostr/nip71Mirror.js`,
  `js/app/feedCoordinator.js`, `js/feedEngine/sorters.js`, `components/sidebar.html`.
- `docs/nip71-migration-plan.md` (dual-event model, short=34236 heuristic).
