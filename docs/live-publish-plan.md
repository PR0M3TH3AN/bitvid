# BitVid Live — PUBLISH / "Go Live" — Dev Plan

TODO ref: **#16c** in `todo/TODO_2026-06-20_pre-launch.md` (this doc expands the
stub). Companion to **`docs/live-ingest-plan.md`** (#16, watch-only) — the *watch*
side (Live tab, player, chat, zaps) is built there and **reused** here; this doc
adds the *broadcast* side.
Status: **FUTURE / exploratory.** Sequenced **after** #16 (live ingest) and #16b
(shorts) ship. This is the largest of the three plans and the only one that
introduces **server-side media infrastructure** — read the Core Decision first.

---

## Core decision

Build **BitVid Live** as a **Nostr-native live-stream control layer**, not a
video-hosting backend. BitVid the client stays exactly what it is — a static site
that signs client-side, holds no keys, runs no server. The one thing a static
browser app genuinely *cannot* do (receive + route live media) is isolated into a
**separate, optional** service. Split:

```
BitVid static client   = identity, metadata, NIP-53 publishing, discovery, chat,
                         zaps, player UI, archive→VOD publishing
BitVid Media Node/Bridge = RTMP/SRT/WHIP ingest, HLS/WebRTC output, recording,
                         restreaming, status API   (server-side, optional)
```

This keeps BitVid's architecture intact while adding broadcast. Crucially,
**external-provider-only mode needs no BitVid infrastructure at all** — a creator
streams to zap.stream/YouTube/Twitch and BitVid just publishes the NIP-53 event
around it. That's Phase 1 and delivers value with zero servers.

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

## Decisions needed

> **DECISION 1 — Media hosting model.** Who runs the Media Node? (a) a **managed
> BitVid Media Node** (bitvid-operated infra — easiest for creators, but ops/cost
> and least "self-sovereign"); (b) **self-hosted** (creator/instance runs their
> own node — most aligned, higher friction); (c) **external-provider-only** (no
> node; stream to zap.stream/YouTube and just publish the NIP-53 event).
> *Recommendation: ship (c) first — zero infra, immediate utility — then offer (b)
> self-host with a reference node, and consider (a) managed as an opt-in later.*

> **DECISION 2 — Signing during a live stream.** The Media Node can detect
> start/stop, but must NOT hold the creator's Nostr key. How do status updates get
> signed? (A) **BitVid tab stays open**, browser signs status=live/ended;
> (B) **NIP-46 remote signer** so the node can request signatures; (C) node
> publishes *provider-status* under its **own** pubkey while the creator's canonical
> 30311 stays user-signed; (D) managed publishing account (least sovereign).
> *Recommendation: A for MVP, explore B (NIP-46) later. Never D.*

> **DECISION 3 — Transcode now or pass-through only?** v1 should be **stream-copy
> only** (`-c copy`, no transcode) — require OBS to send H.264/AAC, ~2s keyframes.
> Transcoding (multi-bitrate ladders) adds heavy CPU/GPU + cost. *Recommendation:
> pass-through v1; transcode profiles much later, if ever.*

> **DECISION 4 — WebRTC (low-latency) in scope for v1?** HLS (~6–30s latency) is
> the safe default and works everywhere via hls.js (from #16). WebRTC (<500ms) is
> nicer but more complex. *Recommendation: HLS first; WebRTC as a later phase.*

> **DECISION 5 — Local Bridge app in scope, or Media Node only?** The local Bridge
> (desktop helper for hardware encoders / multi-restream / local recording) is
> powerful but a separate packaged app. *Recommendation: NOT required for MVP —
> OBS → public Media Node covers most creators; Bridge is a later phase and the
> seed of a future "BitVid Box".*

> **DECISION 6 — Flag naming reconciliation.** #16 already established
> `FEATURE_LIVE_INGEST` (watch) + `FEATURE_LIVE_CHAT_POST`. This plan adds
> `FEATURE_LIVE_PUBLISH` (Studio / Go Live), `FEATURE_LIVE_BRIDGE` (Media
> Node/Bridge integration), `FEATURE_LIVE_RESTREAM` (external outputs). Confirm we
> keep the specific `*_INGEST` / `*_PUBLISH` split rather than a single umbrella
> `FEATURE_LIVE`. *Recommendation: keep the specific flags; publishing needs
> ingest on (you watch your own stream), so `FEATURE_LIVE_PUBLISH` implies
> `FEATURE_LIVE_INGEST`.*

---

## Config flags (off = no trace)

All default `false`, threaded `config/instance-config.js` → `js/config.js` →
`js/constants.js` like `FEATURE_NIP71_INGEST`:

- `FEATURE_LIVE_INGEST` — watch side (from #16; dependency).
- `FEATURE_LIVE_PUBLISH` — the Studio / Go-Live publishing UI.
- `FEATURE_LIVE_BRIDGE` — Media Node / Bridge session API integration.
- `FEATURE_LIVE_RESTREAM` — external restream output management.

When `FEATURE_LIVE_PUBLISH` is off: no Studio, no "Go Live" entry point, no My
Videos → Live sub-tab, no Bridge/session UI, no live-event **builders** wired into
any surface. Bridge/restream UI additionally gated on their own flags. Config
flags are the only footprint.

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
- **BitVid Media Node** *(server-side; new)* — RTMP/SRT/WHIP ingest → HLS/WebRTC
  out, recording, S3-compatible upload, status API, optional restream. **Built on
  [MediaMTX](https://mediamtx.org/docs/kickoff/introduction)** (handles the
  protocol matrix, recording, hooks, control API) — not from scratch.
- **BitVid Bridge** *(local helper; optional, later)* — local RTMP/SRT receiver
  for hardware encoders, one-input→many-outputs restream, local recording, archive
  upload, OBS-WebSocket control bridge. Foundation for a future "BitVid Box".

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
**primary live URL → external mirror → ended recording (VOD).**

---

## Phases

- **Phase 0 — Flags + schema (small).** `FEATURE_LIVE_PUBLISH/BRIDGE/RESTREAM`;
  30311/1311 **builders** + `updateLiveStreamStatusEvent` + `getLiveAddress`
  (coordinate with #16's parsers); `docs/live.md`; schema-doc update; unit tests.
- **Phase 1 — External-provider publishing (small; NO infra).** "Create Live
  Stream" modal: title/summary/thumbnail/tags/starts + a paste-in `streaming` URL;
  publish planned→live→ended; chat + zaps against the live address (reusing #16).
  *This is BitVid Live v0 and needs zero servers — DECISION 1(c).*
- **Phase 2 — Bridge API client + mock backend (medium).** `liveBridgeClient`,
  Pair-Bridge UI, mocked `/sessions`, setup wizard, status dashboard,
  recording-ready flow — builds the client contract before real infra exists.
- **Phase 3 — Media Node MVP (large, server-side).** `bitvid-media-node` around
  MediaMTX: session API, NIP-98-verified auth, token'd RTMP ingest, HLS playback,
  start/stop detection, status endpoint. OBS → node → bitvid watches. No keys in
  Nostr. *This is BitVid Live v1.*
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
  archive upload, localhost API + pairing. *BitVid Live v2 / "BitVid Box" seed.*
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

- **Departure from static-only.** The Media Node/Bridge is real server infra with
  real ops + cost — the biggest philosophical + practical shift. Mitigated by
  keeping it **optional** (Phase-1 external mode needs none) and off by default.
- **Signing during long streams (DECISION 2).** Tab-open (A) is fragile for long
  broadcasts; NIP-53 lets clients treat a live event with no update in ~1h as
  ended, so plan a heartbeat and a graceful "stale → ended" story.
- **CORS / cross-origin HLS** — segments served by the node's origin must allow the
  bitvid origin (same class as the storage/edge CORS work).
- **Cost & abuse of a managed node (DECISION 1a)** — bandwidth/storage cost,
  transcode temptation, and moderation of who can ingest. Self-host (1b) pushes
  this to the operator.
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
