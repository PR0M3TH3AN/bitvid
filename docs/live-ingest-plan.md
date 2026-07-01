# Live Streams — INGEST / watch-only — Dev Plan

TODO ref: **#16** in `todo/TODO_2026-06-20_pre-launch.md` (watch-only).
Publishing / "Go Live" is **#16c** — a separate, larger effort with its **own**
config flag; it is explicitly **out of scope** for this doc.
Status: **DECISIONS LOCKED (D1–D5)** — Phase 0 research spike first (confirm tag
shapes + hls.js/CORS + default relays), then build. Not started.

Live streams are **NIP-53 Live Activities** — a *different* NIP from short-form
video (#16b / NIP-71). Kind **30311** is the live event (addressable, carries the
`streaming` URL — usually HLS `.m3u8` — plus `status`, title, host `p` tags);
kind **1311** is live chat. zap.stream and shosho.live publish these.

Scope of this feature: **discover live streams, play the HLS stream, chat
(read → post, phased), and zap the host.** No broadcasting, no media hosting.
Everything ships behind a config flag that leaves **no trace** when off.

---

## Decisions needed

> **DECISION 1 — Listing scope. ✅ LOCKED: Option A (whitelisted hosts only).**
> The Live tab lists only kind-30311 events whose host is a whitelisted/trusted
> author, reusing the existing whitelist/WoT filter — no new moderation surface,
> consistent with the main feed + Shorts. Accepted trade-off (maintainer): live
> is sparse, so the tab may be empty when no whitelisted creator is streaming;
> that's expected with a whitelist (ship a clear "no one you follow is live right
> now" empty state). A broader "discover live" surface can come later.

> **DECISION 2 — Chat level. ✅ LOCKED: read + post + zaps as the end state,
> reached in phases.** Target is full participation (read chat, post chat, zap the
> host). Phased so playback ships first and posting (a write path) lands cleanly:
> - **Phase 3** — read-only kind-1311 chat **+ host zaps** (zaps via the existing
>   NWC/zap system; active participation from day one of chat).
> - **Phase 3b** — **post chat**: sign/publish kind-1311 into the stream, behind
>   its own sub-flag (`FEATURE_LIVE_CHAT_POST` or similar), with a moderation
>   stance (rate-limit; you're publishing into someone else's stream — decide how
>   blocked/muted authors and your own outbound spam are handled).
> Rationale (maintainer): end up at read+post+zaps; phasing keeps the write path
> and its moderation questions out of the initial playback release.

> **DECISION 3 — HLS playback dependency. ✅ LOCKED: Option A (hls.js,
> lazy-loaded behind the flag).** Native `<video>` HLS only works in Safari, so a
> library is required for Chrome/Firefox/Edge; hls.js is the mature standard.
> Maintainer deferred to recommendation. Implementation guardrails:
> - **Vendored**, not a runtime CDN import (bitvid ships assets locally; keeps it
>   working offline/self-hosted and avoids a third-party origin dependency).
> - **Dynamically imported only when the live player opens** — never loaded when
>   `FEATURE_LIVE_INGEST` is off (honors "off = no trace"), and not on the
>   critical path for non-live pages.
> - Prefer native HLS where available (Safari) and fall back to hls.js elsewhere,
>   so Safari users don't pay for the library.
> - Precedent: bitvid already ships WebTorrent (a much heavier dep), so one small
>   well-established HLS lib is proportionate.

> **DECISION 4 — Past streams / VOD presentation. ✅ LOCKED: Option A (one Live
> tab: live first, then recent ended).** Currently-live streams sort to the top;
> recently-ended streams follow, clearly badged "Ended" and playing their
> `recording` VOD (normal scrubber) through the same HLS path. Bonus: this
> **mitigates the sparse-live empty-tab concern from DECISION 1** — a whitelisted
> creator's recent past streams keep the tab populated between live sessions.
> A separate "Past streams" section only if the single list gets crowded.

> **DECISION 5 — Discovery relays. ✅ LOCKED: Option B (user read relays + a
> configurable set of live-discovery relays).** Query kind-30311 on the user's
> read relays PLUS a small instance-config list of known stream relays
> (default a couple of well-known ones, e.g. zap.stream's relay; editable per
> deployment). Widens *where* we look without widening *who* — DECISION 1's
> whitelist still gates the hosts shown. Extra relays are only connected when
> `FEATURE_LIVE_INGEST` is on, capped/deferred per the relay-storm invariants.
> Phase 0 confirms which stream relays to ship as defaults.

---

## Config flags (off = no trace)

Flags introduced by this doc (both default `false`, threaded through
`js/config.js` → `js/constants.js` like `FEATURE_NIP71_INGEST`):
- **`FEATURE_LIVE_INGEST`** — the whole watch-only feature (tab, discovery,
  playback, read chat, host zaps).
- **`FEATURE_LIVE_CHAT_POST`** — the Phase 3b write path (posting chat); only
  meaningful when ingest is also on. Kept separate so an instance can allow
  watching + reading chat without enabling outbound posting.

(The `FEATURE_LIVE_PUBLISH` "Go Live" flag belongs to **#16c**, a separate doc.)

When `FEATURE_LIVE_INGEST` is off, all of the following must be absent:
1. **Sidebar tab** — the "Live" link is not rendered in `components/sidebar.html`.
2. **Feed/view registration** — `FEED_TYPES.LIVE` is not registered.
3. **Subscriptions** — no kind-30311 discovery subscription and no kind-1311 chat
   subscription are ever created.
4. **Route** — `#view=live` falls back to the default view.
5. **HLS library** — hls.js is dynamically imported only inside the live player,
   so it never loads when the flag is off (keeps the bundle/network clean).
6. **Chat-post UI** — the compose box (Phase 3b) is absent unless BOTH
   `FEATURE_LIVE_INGEST` and `FEATURE_LIVE_CHAT_POST` are on.
7. **Config surface** — the flags above are the only footprint.

> **Management UI note:** a **"Live" sub-tab in profile → My Videos** (alongside
> Videos / Shorts, reusing the admin sub-tab pattern) is for managing the user's
> OWN streams — so it belongs to **publishing (#16c / `FEATURE_LIVE_PUBLISH`)**,
> not this ingest feature. With ingest-only enabled there is nothing of the user's
> to manage, so no My-Videos Live sub-tab appears. (See the shorts plan's
> "Publish & management UI" section for the shared sub-tab treatment.)

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
- **Chat (DECISION 2):** read-only kind-1311 subscription by `#a` (Phase 3),
  rendered beside the player with WoT-mute filtering; a compose/post path in
  Phase 3b behind `FEATURE_LIVE_CHAT_POST`; teardown on close.
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
  Phase 3, zapping the host can ship earlier. **Zap target:** resolve from the
  host's profile `lud16`/LNURL, or a zap tag on the 30311 event if present
  (confirm in Phase 0); reuse the existing zap flow — no new payment code.
- Reuse the existing player shell where practical; HLS via lazy hls.js (DECISION 3).
- Respect `prefers-reduced-motion` and the relay-cap / circuit-breaker invariants
  for the discovery + chat subscriptions.

## Phases (each flag-gated from day one)

- **Phase 0 — Research spike (do FIRST, small but essential).**
  - Capture real kind-30311 events from zap.stream + shosho.live; confirm tags,
    `streaming` multiplicity, live/ended marking, host `p` roles.
  - Prototype HLS playback in a throwaway page: hls.js attaching to `<video>`
    with a real `.m3u8`; confirm CORS behavior from the static origin.
  - Pick the default **live-discovery relays** (DECISION 5) from where real
    30311 events actually land; resolve the **host zap target** (lud16/LNURL vs a
    `zap` tag on the event).
  - Output: **confirm** the field mapping + defaults (decisions are already
    locked); flag any surprises back into this doc.
- **Phase 1 — Discovery + Live tab (medium).** Flag, `FEED_TYPES.LIVE`, live
  service (30311 discovery, scoped), sidebar link, `views/live.html`, grid of
  live cards, route gated by flag. Clicking a card opens… (Phase 2).
- **Phase 2 — HLS playback + cinematic layout (medium).** Live player path + lazy
  hls.js; play the `streaming` URL; **desktop** player + collapsible chat rail
  (rail empty until Phase 3), theater/fullscreen, LIVE badge + viewer count;
  **mobile** player-top / chat-below; keyboard controls; graceful error when the
  stream is down. Set latency expectations (HLS ~6–30s).
- **Phase 3 — Read chat + host zaps (medium, DECISION 2).** Read-only kind-1311
  subscription by `#a`, auto-scroll with pause-on-scroll-up + jump-to-latest,
  teardown on close. **Host zaps** via the existing NWC/zap system (active
  participation from the start).
- **Phase 3b — Post chat (medium, DECISION 2).** Sign/publish kind-1311 into the
  stream, behind its own sub-flag, with a moderation stance (rate-limit; how
  blocked/muted authors + outbound spam are handled). This is the committed end
  state (read + post + zaps).
- **Phase 4 — Past streams / VOD (medium, DECISION 4).** List `status=ended`
  events and play their `recording` URL through the same HLS player; mark ended
  vs live in the UI. This is the "past zap.stream streams" capability.
- **Phase 5 — Polish.** Poster/skeleton states, liveness de-emphasis for stale
  events, high-volume-chat buffering, and (optional) surfacing `planned`/upcoming
  streams.

---

## Moderation, whitelist & NSFW

Per DECISION 1 (locked: whitelisted hosts): the live list is scoped to
whitelisted authors and reuses the existing trust filter, so the admin
whitelist/blacklist governs which streams appear.

**Chat moderation (two design items, before their phases):**
- **Read chat (Phase 3):** kind-1311 messages come from *arbitrary* viewers, not
  just whitelisted authors. Decide whether the read view applies the existing WoT
  **mute/blacklist** (hide messages from muted/blocked pubkeys) — recommend yes,
  reuse the same author filter so a globally-blocked spammer is hidden in live
  chat too. NSFW/text moderation of chat is out of scope for v1.
- **Post chat (Phase 3b):** you're publishing into someone else's stream — add
  rate-limiting and respect the host/relay's own rules; decide the outbound stance
  (e.g. block posting for lockdown/blacklisted local users).

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
- **High-volume chat.** A busy stream's kind-1311 can arrive fast; the read view
  must cap/virtualize the message buffer (drop-oldest) so it can't balloon memory
  or jank the UI. Tie into the auto-scroll/pause behavior.
- **`status=planned` (scheduled) streams.** 30311 supports a not-yet-live state.
  v1 shows only live + ended (DECISION 4); decide later whether to surface
  "upcoming" (with `starts`). Just don't let a `planned` event render as if live.
- **Multiple `streaming` renditions.** `streaming` may appear more than once
  (quality variants) or point at a master playlist. Pick one sensibly (hls.js
  handles master playlists); confirm shapes in Phase 0.
- **Private/token-gated streams.** Only public HLS is in scope — a stream whose
  `.m3u8` requires auth/tokens is treated as "can't play," gracefully.

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
