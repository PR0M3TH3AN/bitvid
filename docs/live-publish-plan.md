# BitVid Live — PUBLISH / "Go Live" — Dev Plan

TODO ref: **#16c** in `todo/TODO_2026-06-20_pre-launch.md` (this doc expands the
stub). Companion to **`docs/live-ingest-plan.md`** (#16, watch-only) — the *watch*
side (Live tab, player, chat, zaps) is built there and **reused** here; this doc
adds the *broadcast* side.
Status: **FUTURE / exploratory — all six decisions LOCKED** (see Core Decision's
blanket rule: bitvid hosts nothing; self-host or external only). Sequenced
**after** #16 (live ingest) and #16b (shorts). The largest plan, and the only one
touching **(self-hosted, never bitvid-run) media infrastructure**.

---

## Core decision

> **BLANKET RULE (maintainer, non-negotiable): bitvid.network hosts NOTHING but a
> static client — no servers, no media infrastructure, ever.** All media
> receiving/routing is **self-hosted by the creator** (the Bridge run headless — a
> single self-hosted binary, see `docs/bitvid-bridge-plan.md`) or handled by an
> **external provider** (zap.stream/YouTube/Twitch). There is no bitvid-operated
> Media Node and no managed publishing — those options are off the table.

Build **BitVid Live** as a **Nostr-native live-stream control layer**, not a
video-hosting backend. BitVid the client stays exactly what it is — a static site
that signs client-side, holds no keys, runs no server. The one thing a static
browser app genuinely *cannot* do (receive + route live media) is isolated into a
**separate, self-hosted-or-external** service (never bitvid-operated). Split:

```
BitVid static client   = identity, metadata, NIP-53 publishing, discovery, chat,
                         zaps, player UI, archive→VOD publishing
Media Node / Bridge    = RTMP/SRT/WHIP ingest, HLS/WebRTC output, recording,
   (self-hosted OR       restreaming, status API
    external provider)
```

This keeps BitVid's architecture intact while adding broadcast. Crucially,
**most of these modes need no bitvid infrastructure at all** — see the three-tier
spectrum next.

---

## Provider options — three tiers (bitvid hosts none of them)

The creator chooses who receives their media; bitvid only ever **publishes the
resulting `streaming` URL and plays it**. A VPS is only the *most sovereign* tier,
not a requirement — most creators never run a server.

| Tier | Setup / cost | Playback in bitvid | Trade-off | bitvid work |
|------|--------------|--------------------|-----------|-------------|
| **1. Platform embed** — StreamYard/OBS → YouTube/Twitch | free, **zero infra** | their **iframe** embed | their rules/ads; no native playback, no P2P/WebTorrent | external-embed adapter |
| **2. Serverless RTMP→HLS API** — Livepeer / Mux / Cloudflare Stream | ~free–cheap, **no server** | **native HLS** (+ P2P-assist possible) | small cost at scale; a 3rd-party account | native HLS (from #16) |
| **3. Self-hosted node** — the Bridge run headless on a VPS | most effort/cost | native HLS | full **sovereignty + WebTorrent VOD + restream** | native HLS + Bridge |

- **Recommended default "no-VPS but native": Tier 2, Livepeer** — decentralized,
  crypto-native, cheapest-aligned; the creator points OBS/StreamYard at Livepeer's
  RTMP ingest and pastes the HLS URL into bitvid. [Mux](https://www.mux.com/live)
  (free delivery allotment; live needs a paid quality tier) and
  [Cloudflare Stream](https://developers.cloudflare.com/stream/pricing/) (free
  ingest/encoding, cheap delivery) are alternatives.
- **StreamYard is a studio, not a CDN** — it broadcasts *out* to
  YouTube/Twitch/custom-RTMP (custom RTMP is paid), so with bitvid it's a Tier-1
  encoder feeding YouTube/Twitch, or a Tier-2/3 encoder feeding a serverless
  API / your node.
- **The same NIP-53 event + player serve all three tiers** — the only per-tier
  code is the playback adapter (external embed vs native HLS). So supporting the
  spectrum is cheap, and the VPS/Bridge is the *advanced* tier, not the default.

---

## Relationship to the other two plans

- **#16 (live-ingest) is a hard dependency.** It builds the NIP-53 **parsers**
  (30311/1311), the **Live tab**, `LiveCard`, `LivePlayer`, `LiveChatPanel`, HLS
  playback (hls.js), and host zaps. This plan **reuses** all of that to *watch*
  streams and adds the **builders** + Studio + Media Node/Bridge to *create* them.
- **Shared Phase 0 schema.** #16 adds `parseLiveStreamEvent`/`parseLiveChatMessageEvent`;
  this plan adds `buildLiveStreamEvent`/`buildLiveChatMessageEvent`/
  `updateLiveStreamStatusEvent`. Do them in `js/nostrEventSchemas.js` together so
  the catalogue stays consistent — coordinate so they aren't duplicated.
- **My Videos "Live" sub-tab** (noted in the shorts plan) belongs to *this*
  feature — managing your own streams only makes sense once you can publish.

---

## Why BitVid Live — advantages over the incumbents

Lean into what only bitvid can offer; these are the reasons a creator would pick
BitVid Live over zap.stream/Twitch/YouTube.

- **P2P bandwidth offload (WebTorrent-flavored live).** Classic WebTorrent can't
  carry a live stream (its infohash needs the *complete* file), but **P2P-assisted
  HLS** can: hls.js + [P2P Media Loader](https://github.com/novage/p2p-media-loader)
  (historically WebTorrent-tracker-based) lets concurrent viewers share HLS
  segments over WebRTC, so each extra viewer helps *serve* the stream. This
  directly cuts the Media Node's egress — the biggest cost of running live infra —
  and scales *better* the more popular a stream gets. (Enable when concurrency
  warrants; see the ingest plan.)
- **Recordings become full WebTorrent VODs.** The moment a stream ends, its
  recording is an ordinary bitvid video: complete file → infohash → **seed +
  webseed**, playable P2P + URL like everything else. Twitch/YouTube VODs are
  origin-only; bitvid VODs are P2P-distributable and self-hostable.
- **Nostr-native = portable + no lock-in.** The stream is a signed NIP-53 event on
  relays, not a row in a platform DB. It's discoverable by *any* Nostr app, the
  creator owns it, and it can't be de-platformed by a single company.
- **Zaps built in.** Instant Lightning value-for-value to the host during the
  stream (bitvid's existing NWC/zap system) — no ads, no 50% platform cut, no
  payout thresholds.
- **Bring-your-own everything.** Own storage (R2/B2/S3/MinIO) for recordings, own
  relays, self-hostable Media Node, and an **external-provider-only mode that needs
  zero bitvid infra**. No mandatory middleman.
- **One canonical stream, many mirrors.** Restream to YouTube/Twitch/zap.stream
  simultaneously while bitvid stays the sovereign home — reach without lock-in.
- **Archive is a first-class video, not a throwaway.** VODs flow into the same
  feeds, search, moderation, comments, and zaps as every other bitvid video (the
  `s`-tag/info.json/30078 model) — no separate "past broadcasts" ghetto.
- **Self-sovereign identity.** The creator signs; no BitVid account, no bridge
  ever holds their key.

---

## Decisions needed

> **DECISION 1 — Media hosting model. ✅ LOCKED by the blanket rule: a three-tier
> provider spectrum — bitvid hosts NONE of them.** The creator picks who receives
> their media; bitvid just publishes the resulting `streaming` URL. **A VPS is only
> the *most sovereign* tier, not a requirement.** See "Provider options" below:
> 1. **Platform embed** (StreamYard/OBS → YouTube/Twitch) — free, zero infra;
>    bitvid embeds their player. **Ships first (Phase 1).**
> 2. **Serverless RTMP→HLS API** (Livepeer / Mux / Cloudflare Stream) — no server
>    to run; the creator gets a real HLS URL bitvid plays **natively**. The
>    recommended "no-VPS but native" default. **Livepeer** is the most aligned.
> 3. **Self-hosted node** (the Bridge run headless on a VPS) — full sovereignty +
>    WebTorrent VOD + restream control; most effort. The advanced tier.
>
> The managed-BitVid-node option is **removed**. bitvid's job (publish the event,
> play the `streaming` URL) is **identical across all three** — the only code
> difference is a per-tier playback adapter (external embed vs native HLS).

> **DECISION 2 — Signing during a live stream. ✅ LOCKED: A for MVP, B (NIP-46)
> later; D removed by the blanket rule.** The node must NOT hold the creator's key.
> **(A) BitVid tab/app stays open** and signs status=live/ended (matches the
> Bridge's embedded-webview design) — MVP. **(B) NIP-46 remote signer** for a
> hands-off experience — later. **(C)** a *self-hosted* node may also publish
> provider-status under its own pubkey while the canonical 30311 stays user-signed
> — available to self-hosters. **(D) managed publishing account is off the table**
> (blanket rule).

> **DECISION 3 — Transcode. ✅ LOCKED: pass-through only (`-c copy`) in v1.**
> Require H.264/AAC + ~2s keyframes in; no transcode ladders. Transcoding is a
> heavy, self-hoster-only opt-in much later, if ever.

> **DECISION 4 — WebRTC low-latency. ✅ LOCKED: HLS first, WebRTC later.** HLS
> (~6–30s) works everywhere via #16's hls.js; WebRTC (<500ms) is a later phase.

> **DECISION 5 — Local Bridge in MVP. ✅ LOCKED: not required for the external-
> provider MVP; it IS the self-hosting path (DECISION 1b).** With the blanket rule,
> self-hosting a Media Node **is** running the Bridge headless, so the Bridge isn't
> an optional extra for self-hosters — it's *the* mechanism. The external-provider
> MVP (Phase 1) still needs neither. Full plan: `docs/bitvid-bridge-plan.md`.

> **DECISION 6 — Flag naming. ✅ LOCKED: keep the specific split.**
> `FEATURE_LIVE_INGEST` / `_PUBLISH` / `_BRIDGE` / `_RESTREAM` (+ `_CHAT_POST` from
> #16). No umbrella `FEATURE_LIVE`. `FEATURE_LIVE_PUBLISH` implies ingest is on.

---

## Config flags (off = no trace)

Every "Go Live" surface is instance-config gated and defaults **off**, threaded
`config/instance-config.js` → `js/config.js` → `js/constants.js` like
`FEATURE_NIP71_INGEST`. An operator can ship the code and have publishing be
completely invisible until they opt in.

- `FEATURE_LIVE_INGEST` — watch side (from #16; a dependency of publish).
- `FEATURE_LIVE_PUBLISH` — the Studio / Go-Live publishing UI (the master
  publish switch).
- `FEATURE_LIVE_BRIDGE` — Media Node / Bridge session API integration.
- `FEATURE_LIVE_RESTREAM` — external restream output management.

**Independent of watching.** These are separate from `FEATURE_LIVE_INGEST`, so an
instance can enable *watching* live streams without enabling *broadcasting* (or
vice-versa). `FEATURE_LIVE_PUBLISH` implies ingest is on (you watch your own
stream); it does not force ingest on for everyone if the operator wants
watch-only.

When `FEATURE_LIVE_PUBLISH` is off, **all** of the following are absent — no tab,
no button, no trace (as if never added):
1. **"Go Live" / Studio entry points** — no Studio launch anywhere (sidebar,
   upload modal, profile).
2. **My Videos → Live sub-tab** — not rendered (shorts-plan sub-tab treatment).
3. **Live-event builders** — `buildLiveStreamEvent` / `updateLiveStreamStatusEvent`
   are not wired into any UI (the schema definitions can exist dormant; nothing
   *invokes* them).
4. **Bridge/session UI** — pairing, ingest settings, health dashboard (also gated
   on `FEATURE_LIVE_BRIDGE`).
5. **Restream UI** — output manager (also gated on `FEATURE_LIVE_RESTREAM`).
6. **Archive→VOD "publish recording"** live-origin flow (a normal video upload is
   unaffected).
7. **Routes** — any `#view=live-studio` (or equivalent) falls back to default.
8. **Config surface** — the flags are the only footprint.

Bridge and restream have their own sub-flags so an operator can allow, e.g.,
publishing to their own Media Node **without** exposing external restreams.

**Who may go live (operator control).** Beyond the on/off flags, publishing on an
instance should respect the existing **whitelist/WoT** model — i.e. an operator
can allow only whitelisted creators to broadcast on their instance (reusing
`accessControl`), the same way the feeds are gated. Decide whether go-live is
whitelist-gated by default (recommended: yes on whitelist-mode instances) so a
public instance isn't an open ingest relay.

---

## Event model (NIP-53 — shared with #16)

Canonical live address = `30311:<creator-pubkey>:<d-tag>` (an addressable
replaceable event; dedupe by pubkey + `d`, exactly like bitvid treats video
`d`-tags). Key tags: `d`, `title`, `summary`, `image`, `streaming` (HLS/WebRTC
playback URL — the canonical first entry), `recording` (VOD when ended), `starts`,
`ends`, `status` (`planned`/`live`/`ended`), `relays`, `t` (hashtags), `p` (host +
participants), `service`.

Live chat = **kind 1311**, anchored to the activity via
`['a', '30311:<pubkey>:<d>', '<relay>', 'root']` — so bitvid live chat is just
Nostr, reusing #16's chat pipeline.

Schema work (in `js/nostrEventSchemas.js`, coordinated with #16):
- `NOTE_TYPES.LIVE_STREAM` (30311), `NOTE_TYPES.LIVE_CHAT_MESSAGE` (1311).
- Builders: `buildLiveStreamEvent`, `updateLiveStreamStatusEvent`,
  `buildLiveChatMessageEvent`. Parsers: from #16.
- Helper: `getLiveAddress(pubkey, d)` → the canonical `a` coordinate.

**Safety invariant:** the public 30311 event carries **only** the playback URL and
public metadata. **Never** publish RTMP/SRT ingest URLs or stream keys into Nostr.

---

## Auth & key custody (the non-negotiables)

1. **BitVid signs; the Bridge routes.** The Media Node/Bridge never receives the
   creator's Nostr private key. It controls *media sessions*, not *identity*.
2. **Bridge auth via NIP-98 HTTP-Auth (kind 27235).** bitvid already has this
   builder (`buildHttpAuthEvent`, `js/nostrEventSchemas.js`). The client signs a
   27235 event ("I, pubkey X, authorize creating session Y at URL Z"); the node
   verifies the signature, mints a stream key, returns ingest/playback URLs.
3. **Stream keys stay out of Nostr** — held node-side (encrypted config / secret
   store) or, in local-Bridge mode, in the OS keychain. Public event gets the HLS
   URL only.

---

## Architecture — four pieces

- **BitVid Live Client** *(static app; reuses #16)* — browse/watch, render NIP-53,
  play HLS/WebRTC/external, chat + zaps, planned/live/ended state, and the
  **archive→VOD** convert flow.
- **BitVid Live Studio** *(static app; new, this plan)* — create live-event
  metadata, publish planned→live→ended NIP-53 updates, show OBS/encoder ingest
  settings, connect to Bridge/Node, monitor health, manage restream outputs,
  publish the recording.
- **Media Node** *(server-side; **self-hosted by the creator**, never bitvid-run)*
  — RTMP/SRT/WHIP ingest → HLS/WebRTC out, recording, S3-compatible upload, status
  API, optional restream. **Built on
  [MediaMTX](https://mediamtx.org/docs/kickoff/introduction)** — not from scratch.
  Per DECISION 7 it's the **same binary as the Bridge, run headless**.
- **BitVid Bridge** *(the self-hosting vehicle — desktop app or headless node)* —
  local RTMP/SRT receiver for hardware encoders, one-input→many-outputs restream,
  local recording, archive upload, OBS-WebSocket control. **This is how a creator
  self-hosts** (DECISION 1b) and the seed of a future "BitVid Box".

New client modules (matching repo style): `js/services/liveEventService.js`,
`liveChatService.js`, `liveBridgeClient.js`, `livePlaybackService.js` (or extend
#16's), `liveArchiveService.js`; UI `js/ui/views/LiveStudioView.js`,
`js/ui/components/{LiveBridgeSetup,LiveRestreamOutputs}.js` (LiveCard/LivePlayer/
LiveChatPanel come from #16).

---

## Media Node & Bridge API

One stable path per session: `/live/<creator-pubkey>/<d-tag>`. Ingest via RTMP /
SRT / WHIP (key/token kept secret); playback via HLS (`/index.m3u8`) / WebRTC. The
client publishes only the playback URL into the 30311 `streaming` tag.

Bridge API surface (session lifecycle + SSE/WebSocket status):
`POST /sessions`, `GET /sessions/:id`, `.../start`, `.../end`, `.../outputs*`,
`GET /sessions/:id/status|manifest`, `GET /events` (SSE stream of
`input_connected|input_live|input_lost|recording_finalized|upload_complete|…`).
The client listens and decides when to sign+publish NIP-53 updates (DECISION 2).

---

## Outgoing streams — three distinct concepts

- **A. Primary BitVid output** — OBS/encoder → Media Node → HLS/WebRTC → the URL
  that goes in the 30311 `streaming` tag.
- **B. External restream outputs** *(`FEATURE_LIVE_RESTREAM`)* — the node forwards
  the same encoded stream to YouTube/Twitch/zap.stream/custom RTMP/SRT.
  **Stream-copy only** in v1 (`-c copy`, no transcode — MediaMTX `runOnReady` +
  FFmpeg forward). Output keys stay node-private; public mirrors optionally added
  as `['r', <public-watch-url>]`.
- **C. Archive / VOD output** — on end, MediaMTX records fMP4/TS → finalize →
  upload to R2/B2/S3/MinIO → produce `recording.mp4` + `.info.json` (+ optional
  thumbnail/torrent). This maps **directly onto bitvid's existing storage-pointer
  model**: the `['s', '<provider>:<prefix>']` tag + `js/utils/storagePointer.js`
  already derives `<prefix>.info.json`, so the archived stream becomes an ordinary
  bitvid video with zero new playback/metadata code.

---

## Archive → VOD publishing (reuses everything)

When the Bridge returns a recording manifest (url, thumbnail, duration, sha256,
infoJson, optional torrent/magnet/webseed), the Studio shows **"Publish recording
as a BitVid video."** On click bitvid publishes:
1. **Updated 30311** — `status=ended` + `recording=<url>`.
2. **Canonical bitvid video** — **kind 30078** (Content Schema v3, the same event
   the upload modal produces) with the hosted URL + `s` pointer.
3. **Optional NIP-71 mirror** — bitvid's addressable **34235** (normal) via the
   existing mirror service, so other apps see the VOD (per the nip71 plan; note
   bitvid mirrors to 34235/34236, not raw kind 21).

This is a specialized upload-modal flow, not a new publishing system.

---

## Playback strategy

Live: **HLS first** (works everywhere via #16's hls.js), then WebRTC later
(DECISION 4), then external-embed fallback. Mirror bitvid's URL-first ethos:
**primary live URL → external mirror → ended recording (VOD).** Optional
**P2P-assisted HLS** (P2P Media Loader) offloads Media Node egress once a stream
has enough concurrent viewers — see the ingest plan + Advantages above. The ended
**recording gets full classic WebTorrent** (seed + webseed), like any bitvid video.

---

## Build order & the static-first principle

> **PRIORITY (maintainer): pour effort into the static bitvid client before
> branching into any separate app.** Everything through the Go-Live MVP below lives
> **entirely in the static client** — no Bridge, no VPS, no bitvid infra. The
> Bridge (a second application) is deliberately deferred until this is shipped and
> maximally developed. See `docs/bitvid-bridge-plan.md`.

Recommended sequence across the live/short work:

```
1. Shorts (#16b)             ← smallest, ready to build, unrelated to live
2. Live ingest (#16)         ← the WATCH foundation (Live tab, player, hls.js,
                               chat, zaps) — a hard dependency of publishing
3. Go-Live MVP (#16c P0–P1)  ← Tiers 1 & 2 (external embed + serverless HLS);
                               CLIENT-SIDE ONLY, no Bridge / no VPS / no infra
   ── ship it; validate that people actually want live ──
4. (only if warranted) the Bridge app  ← Tier-3 sovereignty/power features;
                               its own repo/toolchain/code-signing — a later track
```

The Go-Live MVP (steps 1–3) is the "as much static bitvid as possible" target: a
real, working live experience where the creator brings their own provider
(StreamYard→YouTube, or OBS→Livepeer/Mux) and bitvid does the Nostr-native part —
publish, discover, watch, chat, zap, archive→VOD. Only after that proves out does
a second app (the Bridge) earn the investment.

---

## Phases

- **Phase 0 — Flags + schema (small).** `FEATURE_LIVE_PUBLISH/BRIDGE/RESTREAM`;
  30311/1311 **builders** + `updateLiveStreamStatusEvent` + `getLiveAddress`
  (coordinate with #16's parsers); `docs/live.md`; schema-doc update; unit tests.
- **Phase 1 — Provider-agnostic publishing (small; NO infra — Tiers 1 & 2).**
  "Create Live Stream" modal: title/summary/thumbnail/tags/starts + a paste-in
  `streaming` URL / platform link; publish planned→live→ended; chat + zaps against
  the live address (reusing #16). Playback adapter picks **external embed**
  (Tier 1: YouTube/Twitch) or **native HLS** (Tier 2: Livepeer/Mux/Cloudflare).
  *This is BitVid Live v0, needs zero servers, and covers the recommended no-VPS
  path (Tier 2 / Livepeer).*
- **Phase 2 — Bridge API client + mock backend (medium).** `liveBridgeClient`,
  Pair-Bridge UI, mocked `/sessions`, setup wizard, status dashboard,
  recording-ready flow — builds the client contract before real infra exists.
- **Phase 3 — Self-hosted Media Node MVP (large, server-side).** A **reference
  node the creator runs themselves** (never bitvid-operated) around MediaMTX:
  session API, NIP-98-verified auth, token'd RTMP ingest, HLS playback, start/stop
  detection, status endpoint. OBS → the creator's node → bitvid watches. No keys in
  Nostr. Per DECISION 7 (Bridge plan) this is the **same binary as the Bridge, run
  headless** — so Phase 3 and Phase 7 share code. *This is BitVid Live v1.*
- **Phase 4 — Recording → archive → VOD (medium).** MediaMTX recording → finalize
  → S3 upload → manifest → the archive→VOD publish flow above.
- **Phase 5 — Restream outputs (medium; `FEATURE_LIVE_RESTREAM`).** Output manager,
  provider presets (YouTube/Twitch/zap.stream/custom), copy-only forward,
  retry/backoff, per-output status. One canonical `streaming` URL; mirrors are
  optional `r` links.
- **Phase 6 — OBS Companion (medium).** Start/stop OBS + read bitrate/dropped
  frames via OBS-WebSocket (built into OBS 28+). Prefer routing through the local
  Bridge to avoid browser↔localhost/mixed-content pain.
- **Phase 7 — Local Bridge app (large; `FEATURE_LIVE_BRIDGE`).** Packaged desktop
  helper: local RTMP/SRT receiver, forward to Node + external, local record +
  archive upload, embedded Studio webview (signs) + optional localhost API.
  *BitVid Live v2 / "BitVid Box" seed.* **Full plan: `docs/bitvid-bridge-plan.md`**
  (cross-platform app; note DECISION 7 there — the Bridge and this Media Node can
  share one codebase running headless vs with-UI).
- **Phase 8 — WebRTC low-latency (later, DECISION 4).**

---

## Engineering rules (invariants)

1. **BitVid signs; the Bridge routes** — the node never owns the creator's Nostr
   identity.
2. **Public playback URLs are safe; ingest URLs are secret** — publish the
   `.m3u8`, never `rtmp://…?key=SECRET`.
3. **Pass-through first, transcode later** — copy the H.264/AAC stream in v1.
4. **One canonical stream, many optional mirrors** — the 30311 has one `streaming`
   URL; external platforms are outputs, not the source of truth (unless the creator
   picks an external provider as primary in Phase-1 mode).
5. **Archived live streams become normal BitVid videos** — no separate archive
   system; reuse the `s`-tag / info.json / 30078 model.

---

## Risks / watch-items

- **bitvid stays static; infra is the creator's.** The Media Node/Bridge is real
  server infra, but per the **blanket rule it's never bitvid-operated** — it's
  self-hosted by the creator or replaced by an external provider. So the ops/cost
  burden lives with whoever self-hosts, not bitvid.network. The static client is
  unaffected; Phase-1 external mode needs no infra at all.
- **Self-hoster burden (DECISION 1b).** Bandwidth/storage cost, encoder config, and
  keeping the node reachable fall on the self-hoster. Good docs + a turnkey
  headless Bridge (one binary) are the mitigation.
- **Signing during long streams (DECISION 2).** Tab-open (A) is fragile for long
  broadcasts; NIP-53 lets clients treat a live event with no update in ~1h as
  ended, so plan a heartbeat and a graceful "stale → ended" story.
- **CORS / cross-origin HLS** — segments served by the (self-hosted) node's origin
  must allow the bitvid origin (same class as the storage/edge CORS work).
- **Encoder compatibility** — pass-through requires H.264/AAC + sane keyframes;
  document encoder settings; reject or warn on incompatible input.
- **Scope discipline** — publishing is genuinely large; ship Phase 1 (no infra)
  first and treat the Media Node as a separate service milestone.

---

## Sources

- **NIP-53** (Live Activities; kind 30311, live chat 1311):
  https://nips.nostr.com/53
- **MediaMTX** (ingest/playback/record/forward/control API):
  https://mediamtx.org/docs/kickoff/introduction ·
  [forward](https://mediamtx.org/docs/usage/forward) ·
  [record](https://mediamtx.org/docs/usage/record)
- **OBS**: [SRT guide](https://obsproject.com/kb/srt-protocol-streaming-guide) ·
  [WebSocket remote control](https://obsproject.com/kb/remote-control-guide)
- Existing bitvid code this reuses: `js/nostrEventSchemas.js` (HTTP_AUTH/27235,
  30078 video), `js/utils/storagePointer.js` (`s` tag → `.info.json`),
  `docs/live-ingest-plan.md` (#16 watch side), `docs/nip71-migration-plan.md`
  (mirror to 34235/34236), `js/constants.js` (`FEATURE_*` flags).
