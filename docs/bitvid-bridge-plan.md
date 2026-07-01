# BitVid Bridge — cross-platform streaming helper app — Dev Plan

Companion to **`docs/live-publish-plan.md`** (#16c) — this expands its **Phase 7
(Local Bridge app)** into its own plan. The Bridge is the piece that fills the one
gap a static web client can't: **receiving and routing live media** on the
creator's machine.
Status: **FUTURE / exploratory — all design decisions LOCKED** (maintainer
accepted every recommendation). Sequenced after the #16c Media Node MVP; the
Bridge and the server-side Media Node share one codebase (DECISION 7).

Goal (maintainer): a **super-simple, easy-to-install, easy-to-use** cross-platform
app (Windows / macOS / Linux) that makes going live on bitvid turnkey.

---

## Core decision

The Bridge is a **local media receiver + router**, not a Nostr identity holder.
It pairs a **native media core** (receive/record/restream/upload) with an
**embedded bitvid "Studio" webview** that does all Nostr signing. The two stay
logically separated inside one app:

```
BitVid Bridge (one installable app)
├── Native media core  → RTMP/SRT/WHIP ingest, HLS/WebRTC out, record, restream,
│                         S3 upload   (never sees the Nostr key)
└── Embedded Studio webview → bitvid client that signs NIP-53 + publishes VOD
                              (talks to the core over in-app IPC, not localhost HTTP)
```

**Why an embedded webview instead of "the website controls a localhost server":**
it solves two hard problems at once —
1. **No browser↔localhost pain.** An HTTPS page calling `http://127.0.0.1` hits
   mixed-content + Private-Network-Access preflight/permission rules. In-app IPC
   (Tauri commands / Wails bindings) sidesteps all of it.
2. **Signing stays in the web layer.** The webview is a bitvid client, so it signs
   exactly as the browser does; the native core never touches the key. This
   honors the publish plan's Rule 1 ("BitVid signs; Bridge routes") while still
   being one self-contained app.

**When you don't need the Bridge at all:** OBS → the public Media Node works for a
basic stream. The Bridge earns its place via multi-restream, local recording,
hardware/appliance input, and turnkey UX — and later, built-in capture (no OBS).

---

## Decisions — ✅ ALL LOCKED

The maintainer accepted every recommendation below; each *Recommendation* line is
now the **locked choice**. Summary:

| # | Decision | Locked |
|---|----------|--------|
| 1 | App framework | **Wails (Go)** — one Go binary for desktop + headless node (ties to D7); Tauri was the close alt |
| 2 | Control model | **Embedded Studio webview** primary; optional localhost API later |
| 3 | Capture vs receive | **Receiver-first MVP**; built-in capture as a fast-follow (Phase 5) |
| 4 | Webview signer | **NIP-46 + encrypted-nsec**, NIP-46 preferred |
| 5 | Ingest protocols | **RTMP for MVP**; SRT + WHIP later |
| 6 | Recording upload | **Bundled rclone** (multi-provider, resumable) |
| 7 | One codebase, two modes | **Yes** — desktop Bridge == self-hosted Media Node run `--headless` |
| 8 | Transcode | **Pass-through only** (`-c copy`) |
| 9 | Code signing | **Project owns** Apple notarization + Windows cert (budgeted) |
| 10 | License / telemetry | **Match bitvid; no telemetry by default** |

D1 resolves to **Go/Wails** specifically because D7 (one codebase, two modes) is a
"yes": a single Go binary serves the desktop Bridge (with UI) and the headless
self-hosted Media Node — Go being MediaMTX's own language makes that clean.

> **DECISION 1 — App framework.** Go/**Wails** vs **Tauri** vs Electron.
> *Recommendation: **Wails (Go)** or **Tauri (Rust)** — both give a web UI (reuse
> bitvid's components/tokens) and small binaries; Electron is ~100MB+ and heavy,
> against "simple install." Slight lean **Wails/Go**: the media stack is Go-native
> and **MediaMTX is written in Go**, so it's one language, one small static binary,
> trivial cross-compile. Tauri is a very close second with a more mature app-shell
> + updater. Pick based on team comfort (Go vs Rust).*

> **DECISION 2 — Control model.** Embedded Studio webview (self-contained app) vs
> website-drives-localhost-API vs both.
> *Recommendation: **embedded webview primary** (dodges PNA/mixed-content + keeps
> signing in the web layer). Optionally expose a **localhost API later** for people
> who want to drive it from the bitvid website (with the PNA/CORS work done then).*

> **DECISION 3 — Capture vs receive.** MVP receives (OBS/hardware → Bridge) vs push
> built-in screen/camera capture earlier.
> *Recommendation: **receiver-first MVP** — works with the OBS/encoders people
> already have and ships fast. **Built-in capture (no OBS)** is the "super simple"
> headline but is effectively a mini-OBS (encoder is hard) → make it a fast-follow
> phase, not MVP.*

> **DECISION 4 — Signer support in the Bridge webview.** Since the webview signs,
> which login methods? **NIP-46 remote signer** (no key on device — safest), the
> **encrypted-nsec** flow the web app already has (key encrypted on-device), or
> both. NIP-07 extensions generally aren't available inside an app webview.
> *Recommendation: **both NIP-46 + encrypted-nsec**, NIP-46 preferred/first. Reuse
> the web app's existing session/signer code so there's nothing new to audit.*

> **DECISION 5 — Ingest protocols for MVP.** RTMP only, or RTMP + SRT + WHIP.
> *Recommendation: **RTMP for MVP** (universal — OBS/hardware all speak it), add
> **SRT** (better over lossy networks) and **WHIP** (WebRTC ingest, low latency)
> in a later phase. MediaMTX supports all three, so it's mostly UI/config.*

> **DECISION 6 — Recording upload mechanism.** Bundle **rclone** (one binary,
> speaks R2/B2/S3/MinIO + resumable) vs a native S3 SDK in the core vs reuse
> bitvid's browser S3 upload from the webview.
> *Recommendation: **rclone** bundled as a sidecar — dead-simple multi-provider
> support + resumable uploads of large recordings, matches the storage providers
> bitvid already supports. Native SDK only if we want to drop the extra binary.*

> **DECISION 7 — One codebase, two modes?** The server-side **Media Node** (#16c)
> and the local **Bridge** are ~the same thing (MediaMTX + session API + upload +
> restream). Build **one codebase that runs headless (Media Node) or with the
> embedded UI (Bridge)?**
> *Recommendation: **yes** — "self-host the Media Node" (publish-plan DECISION 1b)
> becomes literally "run the Bridge in `--headless` mode on a VPS." Big reuse win;
> steers DECISION 1 toward Go (server + desktop from one Go binary).* 

> **DECISION 8 — Transcode.** Pass-through (`-c copy`) only, or offer local
> transcode profiles?
> *Recommendation: **pass-through only** (same as the publish plan). Require
> H.264/AAC in; the Bridge repackages/forwards without re-encoding — keeps CPU low
> and the app light. Transcoding is a later, opt-in power feature.*

> **DECISION 9 — Code signing + distribution ownership.** "Easy install" *requires*
> **Apple notarization** (Developer ID — or macOS Gatekeeper blocks it) and a
> **Windows Authenticode cert** (or SmartScreen scares users). Who holds the certs
> and pays (~$99/yr Apple + Windows cert)? Linux = AppImage + `.deb`/`.rpm`
> (no signing gate). *Recommendation: the project owns the certs; budget for them —
> this is the true cost of "easy to install," not optional.*

> **DECISION 10 — License / telemetry.** Open-source license (match bitvid's) and
> **no telemetry by default** (opt-in crash reports at most). *Recommendation:
> same license as bitvid; privacy-first, opt-in only.*

---

## Architecture

```
BitVid Bridge
├── App shell (Tauri/Rust or Wails/Go)         DECISION 1
│    └── Embedded Studio webview (bitvid client, signs NIP-53/VOD)   DECISION 2,4
├── Native media core
│    ├── MediaMTX (bundled sidecar)   → ingest RTMP/SRT/WHIP, HLS/WebRTC out, record
│    ├── FFmpeg (bundled)             → copy-forward restreams (-c copy)   DECISION 8
│    └── rclone (bundled)             → upload recordings to R2/B2/S3/MinIO  DECISION 6
├── Session/state manager             → LiveSession model, status, tokens
├── IPC bridge                        → webview ↔ core (Tauri cmds / Wails bindings)
└── (optional) localhost API          → for website control, later   DECISION 2
```

- **Media core = a local Media Node.** Same engine as the server-side node (#16c),
  which is why DECISION 7 (one codebase, two modes) is attractive.
- **Stream keys / ingest URLs never leave the device** and never go into Nostr; the
  webview only ever publishes the *playback* URL.
- **Status → Nostr:** MediaMTX hooks fire `input_connected / input_live /
  input_lost / recording_finalized / upload_complete`; the core forwards these to
  the webview over IPC; the **webview signs** the corresponding NIP-53 update
  (planned → live → ended + recording).

---

## UX flow (the "super simple" target)

```
1. Install (signed installer / AppImage).                            DECISION 9
2. Open app → sign in (NIP-46 or encrypted nsec) in the Studio webview. DECISION 4
3. Fill title/thumbnail/tags → "Prepare stream" (publishes status=planned).
4. App shows one of:
   a. RECEIVE MODE: local ingest URL + key to paste into OBS/encoder.  DECISION 3
   b. (later) CAPTURE MODE: pick a screen/window/camera → "Go Live".
5. Encoder connects → core detects input → webview publishes status=live.
6. (optional) toggle restream outputs (YouTube/Twitch/zap.stream).     DECISION 5
7. "End" → status=ended → core finalizes recording → uploads → webview
   offers "Publish recording as a BitVid video" (archive→VOD).
```

The whole point: **one window, sign in, go live, done** — and the recording
becomes a normal bitvid video automatically.

---

## Cross-platform packaging

- **Windows:** signed `.msi`/`.exe` (Authenticode). Auto-update.
- **macOS:** signed **+ notarized** `.dmg` (Developer ID) — mandatory. Universal
  (arm64 + x86_64).
- **Linux:** **AppImage** (zero-install portable) + `.deb`/`.rpm`; consider Flatpak.
- **Bundled binaries per-platform:** MediaMTX, FFmpeg, rclone. FFmpeg is the size
  hog (~50–80MB) — ship a **minimal build** (only the muxers/protocols we use:
  flv/rtmp/mpegts/hls/webrtc, aac/h264 passthrough) to keep the installer lean.
- **Auto-updater** (both Tauri and Wails have one) with signed release artifacts.

---

## Phases

- **Phase 0 — Shell + media core (foundational).** App skeleton (DECISION 1),
  bundle + supervise MediaMTX, embedded Studio webview, webview↔core IPC, signed
  dev builds on all three OS. Sign-in works (DECISION 4).
- **Phase 1 — Receive → BitVid (the MVP).** Local RTMP ingest; copy-forward to the
  BitVid Media Node; publish planned→live→ended NIP-53 from the webview driven by
  MediaMTX input hooks. "OBS → Bridge → bitvid, one window."
- **Phase 2 — Record → archive → VOD.** Local recording, finalize, rclone upload
  to the user's storage, manifest → webview publishes a normal bitvid video
  (reuses the `s`-tag/info.json/30078 flow). Optional torrent/webseed for full
  WebTorrent VOD.
- **Phase 3 — Multi-restream (`FEATURE_LIVE_RESTREAM`).** One input → many outputs
  (YouTube/Twitch/zap.stream/custom RTMP/SRT), copy-only, per-output status +
  retry/backoff. Keys stay local; optional public mirror links as `r` tags.
- **Phase 4 — Turnkey UX + packaging.** One-click go-live, OBS auto-config or
  OBS-WebSocket control, signed/notarized installers + AppImage, auto-update.
- **Phase 5 — Built-in capture (no OBS).** Screen/window/camera capture + encode
  inside the app (`getDisplayMedia`/`getUserMedia` → WebCodecs/FFmpeg). The "super
  simple" headline: go live with no external encoder.
- **Phase 6 — SRT/WHIP ingest + WebRTC low-latency** (DECISION 5).
- **Phase 7 — Headless "Media Node" mode + hardware / "BitVid Box".** Run the same
  binary headless as the self-hosted Media Node (DECISION 7); harden for
  appliance/headless use — the seed of a physical device.

---

## Engineering rules (invariants)

1. **The native core never sees the Nostr key.** Only the webview signs.
2. **Ingest URLs/keys stay on the device; only playback URLs reach Nostr.**
3. **Pass-through first** — copy H.264/AAC, don't transcode (DECISION 8).
4. **Reuse bitvid's web client** for the Studio webview (session, signer, publish,
   upload-modal-style VOD flow) — minimize net-new signing/auth code.
5. **Optional, not required** — a creator can still stream OBS → public Media Node
   without the Bridge; the Bridge only *adds* convenience/power.

---

## Risks / watch-items

- **Code signing is the real "easy install" cost (DECISION 9).** Apple
  notarization + Windows cert are non-negotiable for a frictionless install and
  cost money + setup. Budget for them up front.
- **Bundle size vs simplicity.** MediaMTX + FFmpeg + rclone add up; a minimal
  FFmpeg build and per-platform packaging keep it reasonable, but it won't be
  tiny. Trade-off vs "super light."
- **Built-in capture is a mini-OBS (DECISION 3/Phase 5).** Reliable capture +
  encode across GPUs/OSes is genuinely hard — don't let it block the receiver MVP.
- **Signing during long streams.** Same issue as the publish plan (DECISION 2
  there): the webview must stay running to sign status updates + heartbeats;
  handle sleep/crash gracefully (NIP-53 treats no-update-in-~1h as ended).
- **Webview signer support.** NIP-07 extensions typically aren't present in an app
  webview → lean on NIP-46 / encrypted-nsec (DECISION 4).
- **Encoder compatibility.** Pass-through needs H.264/AAC + sane keyframes;
  detect + warn on incompatible input rather than failing silently.
- **Scope creep.** This app can sprawl (capture, transcode, appliance). Ship the
  receiver MVP (Phase 0–1) first; everything else is additive.

---

## Sources

- **MediaMTX** (ingest/playback/record/forward/control API):
  https://mediamtx.org/docs/kickoff/introduction
- **OBS WebSocket** (built into OBS 28+):
  https://obsproject.com/kb/remote-control-guide
- App frameworks: [Tauri](https://tauri.app/) · [Wails (Go)](https://wails.io/) ·
  packaging binaries (MediaMTX, [FFmpeg](https://ffmpeg.org/),
  [rclone](https://rclone.org/)).
- Companion plans: `docs/live-publish-plan.md` (#16c, this expands its Phase 7),
  `docs/live-ingest-plan.md` (#16, watch side + P2P-assisted HLS).
- bitvid code reused by the Studio webview: session/signer (NIP-46 + encrypted
  nsec), the upload/publish flow, `js/utils/storagePointer.js` (`s`-tag →
  `.info.json`) for archive→VOD.
