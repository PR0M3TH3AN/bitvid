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

> **DECISION 6 — Card design.** Shorts need a **new portrait (9:16) card** — the
> existing `js/ui/components/VideoCard.js` hardcodes a **16:9 landscape** media
> ratio (`ratio-16-9`), so it can't render shorts correctly as-is. Two options:
> (a) a **new `ShortCard` component** (portrait thumbnail, compact meta, its own
> `data-testid`); or (b) a **portrait "mode"/variant of `VideoCard`** driven by a
> flag (e.g. `variant: "short"` swapping the ratio class + layout).
> *Recommendation: (b) a portrait variant of `VideoCard` if the internals are
> clean enough to parameterize the ratio + layout — it inherits thumbnail
> binding, moderation badges, engagement controls, and the ⋯ menu for free;
> fall back to (a) a dedicated `ShortCard` only if forcing a variant makes
> `VideoCard` unwieldy or pushes it past its size cap.* Either way this is a
> **first-class deliverable**, not an afterthought — the grid can't ship without it.

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
- **Card design (new):** a portrait **9:16** card — either a `variant: "short"`
  mode of `js/ui/components/VideoCard.js` (which is currently 16:9 / `ratio-16-9`)
  or a dedicated `ShortCard` (DECISION 6). Portrait thumbnail, compact title +
  author, reuse of thumbnail binding, moderation badges, engagement + ⋯ menu. New
  design tokens if needed (existing `--video-card-*` tokens live in
  `css/tokens.css`). A distinct `data-testid` for e2e selectors.
- **Player UI:** v1 opens a short in the existing player modal with a portrait
  layout; v2 adds a full-screen vertical swipe/next feed.
- **Diversity:** apply the existing `spreadAuthors` pass (feed sorters) so the
  Shorts tab doesn't cluster by creator, consistent with For You / Trending.

---

## Short-form UX best practices (researched July 2026)

Short-form is a **mobile-first** format (~70%+ of social video is watched on
phones, held vertically), but bitvid is a desktop-capable web app, so the Shorts
experience must be **responsive** — the same feed, two presentations. Sources at
the bottom of this doc.

### The immersive feed (both platforms)
- **One short at a time, full-height 9:16**, not a scroll-list of small cards.
  The grid (Phase 1) is the *entry point*; tapping/clicking a short drops into an
  immersive one-at-a-time feed (Phase 2).
- **Autoplay + loop.** The active short autoplays and loops. Browser autoplay
  policy requires **muted autoplay** — so start muted with an obvious unmute, and
  persist the user's mute choice across shorts.
- **Preload the next 2–3.** Buffer upcoming shorts in the background so advancing
  is instant. "If your platform shows a loading spinner between videos, you've
  already lost the session." (This is the single most-cited make-or-break detail.)
- **Overlaid chrome, safe zones.** Title/author bottom-left, an **action rail**
  bottom-right, controls over the frame — keep them inside 9:16 safe zones so they
  don't collide with the video edges.
- **Action rail** (bitvid mapping): **Zap** (bitvid's primary engagement, via the
  existing NWC/zap system — replaces the generic "like"), **Comment**, **Share**,
  and **author avatar + follow/subscribe**. Reuse the existing engagement + ⋯
  menu wiring.
- **Captions/muted-friendliness.** A large share of viewing happens muted at some
  point; surface captions when a short provides them and make the mute state
  obvious. (bitvid can't generate captions — show them when present.)
- **Accessibility:** respect `prefers-reduced-motion` (no auto-advance / disable
  scroll-snap animation), full keyboard support, focus management on advance.

### Mobile presentation
- **Full-screen** vertical player; **swipe up/down = next/previous**; tap =
  pause/play; the action rail sits on the right thumb-reach edge.

### Desktop presentation
- **Centered vertical player with letterboxed / blurred side panels** — never
  stretch a 9:16 short to fill a wide viewport (this is the YouTube-Shorts-on-
  desktop pattern).
- **Keyboard navigation is a real differentiator.** YouTube Shorts on desktop has
  notoriously weak keyboard support (users install extensions to get it). bitvid
  should ship it natively: **↑/↓ = prev/next short**, **Space = pause/play**,
  **M = mute**, **←/→ = seek** (or prev/next — pick one and document it), Esc =
  exit to grid.
- **Action rail beside the player** (to the right of the letterboxed video) rather
  than overlaid, since desktop has the horizontal room.
- Advance via scroll-snap (wheel/trackpad) **and** the arrow keys; a subtle
  next/prev affordance for mouse users.

### bitvid-specific notes
- Playback rides the existing URL-first + WebTorrent pipeline
  (`playbackService`); shorts are just kind-22 videos, so no new transport.
- Zaps (not likes) are the headline action — this is a genuine differentiator vs
  the incumbents and it already exists in bitvid.
- Everything still flows through the render-time moderation filter (DECISION 2).

## Phases (each flag-gated from day one)

- **Phase 0 — Detection + flag (small).** Add `FEATURE_SHORTS` (off), `isShort`
  derivation in the ingest adapter + mirror, unit tests for detection. No UI.
- **Phase 1 — Tab + feed + portrait card (medium).** `FEED_TYPES.SHORTS`, sidebar
  link, `views/shorts.html`, feed registration filtered to `isShort`, route gated
  by flag, and the **new portrait 9:16 card** (DECISION 6) so the grid renders
  shorts correctly. Opens in the standard player for now.
- **Phase 2 — Immersive vertical feed (medium–large).** The one-at-a-time
  responsive feed described in "Short-form UX best practices": muted autoplay +
  loop, **preload next 2–3** (no spinner between shorts), overlaid action rail
  (Zap/Comment/Share/follow), captions-when-present, `prefers-reduced-motion`
  handling. **Mobile:** full-screen + swipe up/down. **Desktop:** centered
  letterboxed player + **native keyboard nav** (↑/↓ prev/next, Space, M, Esc) +
  side action rail. Grid (Phase 1) remains the entry point.
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
  `js/app/feedCoordinator.js`, `js/feedEngine/sorters.js`, `components/sidebar.html`,
  `js/ui/components/VideoCard.js` (16:9 card to variant/replace).
- `docs/nip71-migration-plan.md` (dual-event model, short=34236 heuristic).
- Short-form UX research (July 2026):
  - [Top 10 Features Every Short Video App Needs in 2026 — Primocys](https://primocys.com/blog/top-10-short-video-app-features-2026/) (full-screen player, autoplay/loop, swipe-next, preload next 2–3)
  - [Short-Form Video Strategy 2026 — Teleprompter](https://www.teleprompter.com/blog/short-form-video-strategy) (9:16 mobile-first, overlaid chrome/safe zones, captions)
  - [Why Vertical Video Is Becoming the Default Format — Oyelabs](https://oyelabs.com/why-vertical-video-is-default-content-format/) (mobile share, vertical engagement)
  - [Keyboard shortcuts for YouTube — YouTube Help](https://support.google.com/youtube/answer/7631406) & [YouTube Arrow Keys Fix (Chrome Web Store)](https://chromewebstore.google.com/detail/youtube-arrow-keys-fix/hbnlngeljeofecndhmebgpgpccfnkgjb) (desktop Shorts keyboard-nav gap → do it natively)
