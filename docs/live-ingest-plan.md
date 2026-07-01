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

> **DECISION 2 — Live chat in v1?** Read-only kind-1311 chat alongside the player,
> or playback-only for v1 (chat later)?
> *Recommendation: playback-only v1; add read-only chat in a later phase. Chat is
> a live subscription with its own moderation questions.*

> **DECISION 3 — HLS playback dependency.** OK to lazy-load a small HLS library
> (**hls.js**, ~cdn/vendored) ONLY when the flag is on, or must playback stay
> dependency-free (native `<video>` HLS, which only Safari supports reliably)?
> *Recommendation: allow hls.js, lazy-imported behind the flag (native HLS alone
> won't play `.m3u8` in Chrome/Firefox). It never loads when the flag is off.*

> **DECISION 4 — Ended streams / VOD.** When `status=ended`, some events carry a
> `recording` URL (a VOD). Show ended streams with playback of the recording,
> hide them, or list-but-mark-ended? *Recommendation: v1 shows only `status=live`;
> treat recordings as a later enhancement.*

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
- **Player:** a live player path. The current player
  (`js/services/playbackService.js`) sets `videoEl.src` for URL/WebTorrent; HLS
  needs hls.js attached to the `<video>` element when the source is `.m3u8`
  (native only on Safari). Lazy-load hls.js on first live play (DECISION 3).
- **Chat (later, DECISION 2):** read-only kind-1311 subscription by `#a`, rendered
  beside the player; teardown on close.
- **Liveness/staleness:** an event with `status=live` but no recent update / dead
  `.m3u8` should be de-emphasized or dropped (see Risks).

---

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
- **Phase 2 — HLS playback (medium).** Live player path + lazy hls.js; play the
  `streaming` URL; graceful error when the stream is down.
- **Phase 3 — Read-only chat (medium, DECISION 2).** kind-1311 subscription +
  render + teardown.
- **Phase 4 — Polish.** Viewer counts, ended/recording handling (DECISION 4),
  optional extra discovery relays (DECISION 5), poster/skeleton states.

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
  (`FEED_TYPES`).
- hls.js (candidate HLS playback dependency, DECISION 3).
