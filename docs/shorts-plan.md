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

> **DECISION 1 — Discovery scope. ✅ LOCKED: Option A (same whitelist scope).**
> Shorts pulls from the same whitelisted/WoT authors as the main feed and reuses
> the existing render-time moderation filter — no new moderation surface, no extra
> relay fan-out. Rationale (maintainer): the existing moderation + ingest system
> is already good; keep Shorts consistent with it. A broader/Explore-style scope
> can be added later if desired.

> **DECISION 2 — Moderation / NSFW. ✅ LOCKED: Option A (inherit, no special
> handling).** Shorts pass through the same render-time `filterVideos` path as
> every grid (event blacklist / author blacklist / WoT mute / NSFW / private).
> No short-specific moderation. Note: the NSFW gate already *excludes* NSFW from
> users who haven't opted in, so the immersive autoplay feed carries no extra
> NSFW-exposure risk — opted-in users chose to see it, everyone else never
> receives it. Rationale (maintainer): no reason to treat shorts differently.
> **One agreed safeguard:** even for opted-in users, an **NSFW short does NOT
> autoplay** in the immersive feed — it stays blurred/paused with a tap-to-play
> affordance (autoplay resumes on the next non-NSFW short). This is the only
> short-specific behavior; all *filtering* still inherits the shared pipeline.

> **DECISION 3 — Do shorts also appear in the main feed? ✅ LOCKED: Option B
> (Shorts tab ONLY; excluded from the main/discovery feeds).** Rationale
> (maintainer): shorts should not dilute the main feed at all — the Shorts tab is
> their only home.
> **Build implication:** add an `isShort` **exclusion** to the general feeds —
> Recent, For You, Explore, Trending, Kids — so kind-22/short videos never render
> there (they currently do via NIP-71 ingest). The Shorts feed is the inverse
> filter (`isShort` only). This touches each feed source/sorter, so verify no
> feed regressions (couples with #20/#21 feed-identity work).
> **Sub-point (recommend, not blocking):** a creator's shorts SHOULD still appear
> on their **Channel profile** page (it's their full catalogue) and in
> **Subscriptions** is TBD — default: exclude from Subscriptions too (it's a
> discovery feed), keep on Channel profile. Confirm during Phase 1.

> **DECISION 4 — What counts as a "short"? ✅ LOCKED: Option A (kind is the
> definer).** A video is a short iff its event kind is **22** or **34236**;
> kind 21/34235 = regular. No aspect-ratio heuristic — the publisher's declared
> kind decides. Rationale (maintainer): shorts are typically vertical, but the
> protocol kind is the source of truth; a vertical video mis-published as regular
> just renders in the 16:9 card (thumbnail center-cropped via `object-fit:cover`;
> the player letterboxes it via `object-fit:contain`, never distorts) and stays in
> the main feed — the publisher's choice. Aspect-ratio fallback can be added later
> if too many real shorts leak in as kind-21.

> **DECISION 5 — UI ambition for v1. ✅ LOCKED: Option C (phased).** Phase 1 ships
> the grid + portrait card + the main-feed exclusion (DECISION 3) so shorts are
> corralled into their own tab immediately (the maintainer's priority); Phase 2
> adds the full immersive autoplay/swipe feed later. Front-loads "shorts out of
> the main feed," defers the heavier immersive build.

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

> **DECISION 7 — Publish side: content-type selector + native short marker.
> ✅ AGREED (maintainer-proposed).** Add an **upload-modal content-type selector**
> (Regular video ⟷ Short) with **visual + text helpers** so creators pick the
> right type and understand placement — e.g. landscape/portrait icons + copy like
> *"Shorts appear only in the Shorts tab, not the main feed."* This is not just
> UX: bitvid's canonical event is **kind 30078** (not 21/22), and the schema has
> **no short marker today** (short is only inferred from dimensions at mirror
> time). So this decision also adds an explicit **`isShort` (or `format:
> "short"`) field to the v3 content schema**, set by the selector, which (a) lets
> the Shorts feed filter + main-feed exclusion catch bitvid-native shorts, and
> (b) forces the NIP-71 mirror to kind **34236**. Detection becomes: a video is a
> short iff `kind ∈ {22,34236}` (foreign/ingested) **OR** `isShort === true`
> (bitvid-native). *Open sub-choices for build time: default selection (recommend
> "Regular"), whether to auto-suggest "Short" when the uploaded file is portrait,
> and exact copy/icons.*

> **DECISION 8 — Native short representation. ⏳ LEANING: marker on kind 30078
> (both options mirror to 34236).** Hard requirement (maintainer): a native short
> MUST keep bitvid's WebTorrent advantage AND mirror to the standard NIP-71 short
> kind via the existing mirror system. Both viable options satisfy that — they
> produce the *same external result* (a WebTorrent-rich native event + a standard
> **34236** mirror carrying the magnet via `imeta`):
>
> - **Option 1 (recommended) — kind 30078 + `isShort` marker.** Native short = a
>   normal bitvid video flagged short; the *existing* mirror emits 34236. No new
>   kind. Reuses 100% of the publish/edit/delete/moderation/view-count/zap/mirror
>   pipeline (all keyed on 30078). Least code, least risk.
> - **Option 2 — a distinct bitvid-short kind that mirrors to 34236.** A separate
>   kind number for rich native shorts + the mirror to 34236 for interop.
>   *Trade-off:* the external result is identical to Option 1, but the distinct
>   *native* kind is non-standard (only the 34236 mirror is recognized by other
>   clients) and it forks every pipeline that's currently keyed on 30078 — i.e.
>   more work for the same outcome. A new kind buys a distinct native kind number;
>   it does **not** buy WebTorrent or interop that Option 1 lacks.
>
> Net: Option 1 already delivers "WebTorrent + mirror to the standard kind"
> without minting a kind. Only pick Option 2 if a distinct native kind number is
> itself a requirement.
>
> **✅ LOCKED: Option 1 (marker on kind 30078), provided shorts are reliably
> distinguishable.** They are: a single `isShort` boolean discriminates them
> everywhere — set from the `isShort`/`format:"short"` content field for native
> videos and from `kind ∈ {22,34236}` for ingested ones (see Field mapping). The
> Shorts feed filters `isShort === true`; the main feeds exclude it.

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
5. **Publish UI** — the upload-modal content-type selector (DECISION 7) is not
   rendered; uploads are plain regular videos exactly as today.
6. **Management UI** — no Shorts sub-tab in profile → My Videos (see below).
7. **Config surface** — the flag is the only footprint.

---

## Publish & management UI (flag-gated)

Both the publish and management surfaces must obey "off = no trace" (points 5–6
above), and reuse patterns already in the app.

- **Upload modal — content-type selector (DECISION 7).** Regular ⟷ Short, with
  visual + text placement helpers ("Shorts appear only in the Shorts tab").
  Rendered only when `FEATURE_SHORTS` is on; otherwise uploads are plain regular
  videos exactly as today.
- **Profile → My Videos — sub-tabs.** Reuse the **admin-pane sub-tab toolbar
  pattern** just shipped (`ProfileAdminController` sub-tabs) to split My Videos
  into **Videos / Shorts / Live** sub-tabs for easier content management. Each
  sub-tab appears **only when its feature flag is on**:
  - `FEATURE_SHORTS` off → no Shorts sub-tab.
  - Live sub-tab is tied to **publishing** live (**#16c** / `FEATURE_LIVE_PUBLISH`),
    NOT ingest (#16) — with ingest-only there is nothing of the user's to manage,
    so no Live sub-tab.
  - **All flags off → no sub-tab bar at all**, just the plain My Videos list
    exactly as today (true "no trace").
  - Videos sub-tab lists regular bitvid/NIP-71 videos (excludes `isShort`);
    Shorts sub-tab lists the user's `isShort` videos.

## Field mapping — detecting a "short"

A video object needs a reliable `isShort` marker so a feed source can filter.
Candidate signals (to confirm against real events in Phase 0):

Per DECISION 4 + 7, `isShort` is derived from **kind for foreign/ingested videos**
and from an **explicit marker for bitvid-native videos** (which are kind 30078):

| Signal | Applies to | Meaning |
|--------|-----------|---------|
| `kind === 22` | ingested foreign | NIP-71 regular short |
| `kind === 34236` | ingested foreign | NIP-71 **addressable** short |
| `isShort` / `format:"short"` in kind-30078 content | **bitvid-native** | set by the upload-modal content-type selector (DECISION 7) |
| `imeta dim` height > width | (future fallback) | portrait aspect; **not** used in v1 (DECISION 4) — kept only as a possible later fallback |

Plan: surface a single `isShort` boolean on the bitvid video object —
`nip71IngestAdapter.js` sets it from the source kind (it already tracks kind);
the native publish path sets it from the new content-schema field. The Shorts
feed filters `isShort === true`; the main feeds exclude `isShort === true`
(DECISION 3). No re-fetching needed.

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
  persist the user's mute choice across shorts. **Exception (agreed):** NSFW-
  flagged shorts do **not** autoplay even for opted-in users — blurred/paused with
  tap-to-play (see DECISION 2).
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

- **Phase 0 — Detection + flag (small).** Add `FEATURE_SHORTS` (off), the
  `isShort` content-schema field (DECISION 7), and `isShort` derivation (foreign =
  kind, native = marker) in the ingest adapter + mirror, with unit tests. No UI.
- **Phase 0b — Publish-side selector (small–medium, DECISION 7).** Upload-modal
  content-type selector (Regular ⟷ Short) with visual + text placement helpers;
  wires the `isShort` marker + forces mirror kind 34236. Lets bitvid creators
  actually publish shorts (without it, the Shorts tab only shows ingested foreign
  shorts).
- **Phase 1 — Tab + feed + portrait card + main-feed exclusion (medium).**
  `FEED_TYPES.SHORTS`, sidebar link, `views/shorts.html`, feed registration
  filtered to `isShort`, route gated by flag, and the **new portrait 9:16 card**
  (DECISION 6). **Per DECISION 3 (B):** add the `isShort` **exclusion** to the
  main/discovery feeds (Recent, For You, Explore, Trending, Kids; likely
  Subscriptions) so shorts never appear outside the Shorts tab — with regression
  checks on each feed. Opens in the standard player for now.
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
