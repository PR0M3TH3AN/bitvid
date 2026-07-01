# Live Streams — INGEST / watch-only — Dev Plan

TODO ref: **#16** in `todo/TODO_2026-06-20_pre-launch.md` (watch-only).
Publishing / "Go Live" is **#16c** — a separate, larger effort with its **own**
config flag; it is explicitly **out of scope** for this doc.
Status: **PLANNING → needs a research spike (Phase 0)**. Not started.

Live streams are **NIP-53 Live Activities** — a *different* NIP from short-form
video (#16b / NIP-71). Kind **30311** is the live event (addressable, carries the
`streaming` URL — usually HLS `.m3u8` — plus `status`, title, host `p` tags);
kind **1311** is live chat. zap.stream and shosho.live publish these.

Scope of this feature: **discover live events, play the HLS stream, optionally
show read-only chat.** No broadcasting, no media hosting. Everything ships behind
a config flag that leaves **no trace** when off.

---

## Decisions needed

> **DECISION 1 — Listing scope.** List only **whitelisted hosts** (reuse the
> existing whitelist/WoT filter on the host `p`/author), or **all** `status=live`
> events discovered on the read relays (capped)?
> *Recommendation: whitelisted hosts for v1 — consistent with the rest of bitvid's
> trust model and avoids surfacing arbitrary/abusive streams.*

> **DECISION 2 — Chat level (read-only vs read + post).** Chat is **committed to
> the roadmap** (Phase 3), the only open question is how far: **read-only** (kind
> 1311 ingest — stays cleanly inside "ingest"), or **read + post** (signing/
> publishing 1311 events — a write path, likely its own sub-flag + moderation
> stance). *Recommendation: read-only in Phase 3, then read + post as Phase 3b if
> wanted. Playback (Phases 1–2) ships before chat regardless.*

> **DECISION 3 — HLS playback dependency.** OK to lazy-load a small HLS library
> (**hls.js**, ~cdn/vendored) ONLY when the flag is on, or must playback stay
> dependency-free (native `<video>` HLS, which only Safari supports reliably)?
> *Recommendation: allow hls.js, lazy-imported behind the flag (native HLS alone
> won't play `.m3u8` in Chrome/Firefox). It never loads when the flag is off.*

> **DECISION 4 — Past streams / VOD presentation.** Past (ended) streams are
> **committed to the roadmap** (Phase 4): a `status=ended` event carries a
> `recording` URL (a VOD, usually `.m3u8`/mp4) which plays through the same HLS
> path as live. Open question is only *presentation*: mix ended streams into the
> Live tab (marked "ended"), or give them a separate "Past streams" section/sort?
> *Recommendation: one Live tab that lists live first, then recent ended streams
> marked accordingly; a dedicated section only if it gets crowded.*

> **DECISION 5 — Discovery relays.** Use the user's normal read relays, or add
> stream-heavy relays (zap.stream's relay etc.) for discovery? *Recommendation:
> user read relays first; make an optional extra-relay list configurable if
> coverage is thin.*

---

## Config flags (off = no trace)

Add **`FEATURE_LIVE_INGEST`** to `config/instance-config.js` (default `false`),
threaded through `js/config.js` → `js/constants.js` like `FEATURE_NIP71_INGEST`.
(The separate `FEATURE_LIVE_PUBLISH` for #16c is **not** part of this doc.)

When `FEATURE_LIVE_INGEST` is off, all of the following must be absent:
1. **Sidebar tab** — the "Live" link is not rendered in `components/sidebar.html`.
2. **Feed/view registration** — `FEED_TYPES.LIVE` is not registered.
3. **Subscriptions** — no kind-30311 discovery subscription and no kind-1311 chat
   subscription are ever created.
4. **Route** — `#view=live` falls back to the default view.
5. **HLS library** — hls.js is dynamically imported only inside the live player,
   so it never loads when the flag is off (keeps the bundle/network clean).
6. **Config surface** — the two flags are the only footprint.

---

## Field mapping — kind 30311 (to VERIFY in Phase 0)

Expected tag shape (confirm against captured real events before building):

| Tag | Purpose |
|-----|---------|
| `d` | unique identifier (addressable key with pubkey+kind) |
| `title` / `summary` | stream title / description |
| `streaming` | **HLS `.m3u8` playback URL** (may appear more than once) |
| `recording` | VOD URL when ended |
| `status` | `planned` / `live` / `ended` |
| `starts` / `ends` | unix timestamps |
| `image` | thumbnail/poster |
| `p` (role `host`/`participant`) | host + participants (pubkeys) |
| `service` | provider hint (zap.stream etc.) |
| `current_participants` / `total_participants` | viewer counts (optional) |

Kind 1311 (live chat): a note tagged with the 30311 `a`-address; content is the
chat message. Read-only ingest = subscribe by `#a`, render newest.

> These are the *documented* shapes; **Phase 0 captures real events** from
> zap.stream and shosho.live to confirm exact keys, multiplicity of `streaming`,
> and how each provider marks live vs ended.

---

## Architecture

- **Flag:** `FEATURE_LIVE_INGEST` (instance-config → config → constants).
- **Feed type:** add `LIVE: "live"` to `FEED_TYPES` (`js/constants.js`).
- **Discovery source:** a new live service (e.g. `js/services/liveIngestService.js`)
  subscribing to kind 30311 (`status=live`, scoped per DECISION 1), normalizing
  events into a lightweight "live card" model (title, host, image, streaming URL,
  status, viewer count). Mirrors the deferred/throttled pattern of
  `nip71IngestService` so it stays off the cold-start critical path.
- **Sidebar tab + view:** "Live" link in `components/sidebar.html` (flag-gated) +
  `views/live.html` (grid of live cards).
- **Card design (new):** a **live card** distinct from `VideoCard.js` — a **LIVE
  badge**, viewer count, host name/avatar, and an "ended" state for past streams
  (Phase 4). Likely a dedicated `LiveCard` (the live/ended metadata differs enough
  from a video card that a variant is awkward). New `data-testid` for e2e.
- **Player:** a live player path. The current player
  (`js/services/playbackService.js`) sets `videoEl.src` for URL/WebTorrent; HLS
  needs hls.js attached to the `<video>` element when the source is `.m3u8`
  (native only on Safari). Lazy-load hls.js on first live play (DECISION 3).
- **Chat (later, DECISION 2):** read-only kind-1311 subscription by `#a`, rendered
  beside the player; teardown on close.
- **Liveness/staleness:** an event with `status=live` but no recent update / dead
  `.m3u8` should be de-emphasized or dropped (see Risks).

---

## Live watch UX best practices (researched July 2026)

Unlike shorts, live is a **landscape 16:9, "cinematic"** experience, and the watch
page is a well-established pattern (Twitch / YouTube Live). Sources at the bottom.

### Desktop presentation (cinematic)
- **Player + chat side rail.** 16:9 player on the left/center, a **collapsible chat
  rail on the right**. Below the player: title, **host (avatar + name + follow/
  subscribe)**, **LIVE badge + viewer count**, elapsed time, description/tags.
- **Theater mode** (player widens, chat stays docked) and **fullscreen** (chat
  becomes an optional overlay or hides) — both standard viewer expectations.
- Keyboard: **Space** pause, **F** fullscreen, **T** theater, **M** mute.

### Mobile presentation
- **Player on top (16:9), chat below** in a scrollable panel. In landscape /
  fullscreen, chat becomes a **resizable/draggable overlay** (the current Twitch/
  YouTube mobile pattern) rather than eating the video. Picture-in-picture
  "keep playing while I browse" is a nice-to-have, not v1.

### Live-specific affordances
- **Prominent red LIVE badge + viewer count** (from 30311 `current_participants`)
  and elapsed-since-`starts`. These are retention cues, keep them visible.
- **Latency is real and must be expected:** standard **HLS is ~6–30s behind**
  real-time (LL-HLS 1–5s, WebRTC <500ms). zap.stream serves HLS, so **chat will
  run ahead of the video** — don't promise low-latency, and don't try to hard-sync
  chat to the frame.
- **Auto-scrolling chat** that **pauses when the user scrolls up**, with a
  "jump to latest" affordance (Phase 3).
- **Live vs ended seeking:** a live stream has only edge/limited seeking; an
  **ended stream plays its `recording` as a normal VOD** with a full scrubber
  (Phase 4).

### bitvid-specific notes
- **Zaps fit live perfectly** — zap.stream's whole model is zapping streamers, and
  bitvid already has the NWC/zap system. Live zaps to the host are a natural
  headline action (surface them alongside chat). Even if chat is read-only in
  Phase 3, zapping the host can ship earlier.
- Reuse the existing player shell where practical; HLS via lazy hls.js (DECISION 3).
- Respect `prefers-reduced-motion` and the relay-cap / circuit-breaker invariants
  for the discovery + chat subscriptions.

## Phases (each flag-gated from day one)

- **Phase 0 — Research spike (do FIRST, small but essential).**
  - Capture real kind-30311 events from zap.stream + shosho.live; confirm tags,
    `streaming` multiplicity, live/ended marking, host `p` roles.
  - Prototype HLS playback in a throwaway page: hls.js attaching to `<video>`
    with a real `.m3u8`; confirm CORS behavior from the static origin.
  - Output: lock DECISIONS 1–5 and the field mapping; update this doc.
- **Phase 1 — Discovery + Live tab (medium).** Flag, `FEED_TYPES.LIVE`, live
  service (30311 discovery, scoped), sidebar link, `views/live.html`, grid of
  live cards, route gated by flag. Clicking a card opens… (Phase 2).
- **Phase 2 — HLS playback + cinematic layout (medium).** Live player path + lazy
  hls.js; play the `streaming` URL; **desktop** player + collapsible chat rail
  (rail empty until Phase 3), theater/fullscreen, LIVE badge + viewer count;
  **mobile** player-top / chat-below; keyboard controls; graceful error when the
  stream is down. Set latency expectations (HLS ~6–30s).
- **Phase 3 — Chat (medium, DECISION 2).** Read-only kind-1311 subscription by
  `#a`, auto-scroll with pause-on-scroll-up + jump-to-latest, teardown on close.
  **Host zaps** can surface here (or earlier) via the existing zap system.
  Optional **Phase 3b — post chat** (sign/publish 1311, its own sub-flag +
  moderation stance) if read+post is chosen.
- **Phase 4 — Past streams / VOD (medium, DECISION 4).** List `status=ended`
  events and play their `recording` URL through the same HLS player; mark ended
  vs live in the UI. This is the "past zap.stream streams" capability.
- **Phase 5 — Polish.** Viewer counts, optional extra discovery relays
  (DECISION 5), poster/skeleton states, liveness de-emphasis for stale events.

---

## Moderation, whitelist & NSFW

Per DECISION 1 (recommended: whitelisted hosts): the live list is scoped to
whitelisted authors and reuses the existing trust filter, so the admin
whitelist/blacklist governs who can appear. Open question for chat (Phase 3):
kind-1311 messages come from arbitrary viewers — decide whether chat inherits the
WoT mute list or is simply unmoderated/read-only-with-hide. **Flag this before
Phase 3.**

---

## Risks / watch-items

- **HLS is new to the player.** Native `.m3u8` works only in Safari; Chrome/
  Firefox need hls.js. This is the main build risk — de-risk in Phase 0.
- **CORS on external streaming servers.** The `.m3u8` + segments are served by a
  third-party origin; playback in a static site depends on their CORS. Verify in
  Phase 0 (same class of constraint as the storage/edge CORS work).
- **Stale "live" events.** Streams end without always updating `status`; a dead
  `.m3u8` must fail gracefully and ideally be filtered. Needs a liveness signal
  (recent update time / probe).
- **Relay fan-out.** A live-discovery subscription adds REQ load — respect the
  cold-login relay-cap / circuit-breaker invariants (AGENTS.md §17); keep it
  deferred and capped like nip71 ingest.
- **Scope creep into #16c.** Keep this strictly watch-only; broadcasting is a
  separate flag + plan.

---

## Sources

- NIP-53 (Live Activities; kind 30311 live event, kind 1311 live chat).
- Reference implementations: zap.stream, shosho.live.
- Existing code: `js/services/nip71IngestService.js` (deferred/throttled ingest
  pattern to mirror), `js/services/playbackService.js` (player entry for HLS),
  `js/app/feedCoordinator.js`, `components/sidebar.html`, `js/constants.js`
  (`FEED_TYPES`), `js/ui/components/VideoCard.js` (contrast for the new LiveCard).
- hls.js (candidate HLS playback dependency, DECISION 3).
- Live watch-UX research (July 2026):
  - [Streaming App UX Best Practices: 7 Pillars — Fora Soft](https://www.forasoft.com/blog/article/streaming-app-ux-best-practices) (player+chat layout, live vs VOD, social overlays as retention)
  - [Top Live Streaming Platforms 2026 — VdoCipher](https://www.vdocipher.com/blog/live-streaming-platforms/) (latency: HLS/DASH 6–30s, LL-HLS 1–5s, WebRTC <500ms)
  - [Twitch mobile viewer update, resizable chat overlay + PiP (Stream-Rise)](https://stream-rise.com/blog/twitch-mobile-broadcasting) (mobile chat-below / draggable overlay pattern)
