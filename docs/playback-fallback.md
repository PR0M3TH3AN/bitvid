# URL-first playback fallback orchestration

This document explains how `bitvidApp.playVideoWithFallback` (implemented via `PlaybackCoordinator` in `js/app/playbackCoordinator.js` and bound to the application instance in `js/app.js`) coordinates hosted URL playback first and falls back to WebTorrent when needed. It details the orchestration layer (`PlaybackStrategyService`), the supporting helpers in `js/services/playbackService.js`, `js/playbackUtils.js`, and `js/magnetUtils.js`, and how tracker lists and `ws=`/`xs=` hints are applied.

## High-level flow

1. `bitvidApp.playVideoWithFallback({ url, magnet })` (via `PlaybackCoordinator`) trims inputs and delegates to `playbackStrategyService.play(...)`.
2. `PlaybackStrategyService` (in `js/services/playbackStrategyService.js`) checks for existing sessions to deduplicate requests, manages the video modal element lifecycle, and constructs a playback session via `playbackService.createSession(...)`.
3. The session (from `js/services/playbackService.js`) derives a canonical magnet payload using `deriveTorrentPlaybackConfig` (from `js/playbackUtils.js`).
4. Playback starts with the hosted URL when `URL_FIRST_ENABLED` is true and a URL is available; otherwise, it goes directly to torrent playback.
5. If URL playback stalls or errors, the session triggers `playViaWebTorrent` with the normalized magnet and optional web seed hints.

## Call flow into playbackService

`bitvidApp.playVideoWithFallback` delegates the decision-making to `PlaybackStrategyService`, which then creates a `PlaybackSession`:

- **Strategy orchestration**
  - `playbackStrategyService.play({ url, magnet, ... })`
  - The strategy handles request deduplication (reusing an active session if the inputs match) and ensures the UI video element is ready/replaced if needed.
  - It calls `playbackService.createSession(...)` to instantiate the mechanism.
- **Session setup**
  - `playbackService.createSession({ url, magnet, videoElement, probeUrl, playViaWebTorrent, ... })`
  - The session captures `url`, `magnet`, and a request signature.
- **Hosted URL probe**
  - `PlaybackSession.execute()` calls `probeUrl(url)` to check availability and decides whether to attempt direct playback.
- **Hosted URL playback**
  - On a successful probe, the session assigns `video.src = url` and calls `video.play()`.
  - It registers watchdogs (`registerUrlPlaybackWatchdogs`) to detect stalls, errors, or aborts.
- **Fallback to WebTorrent**
  - If watchdogs trigger or direct playback fails, `PlaybackSession` calls `playViaWebTorrent(magnet, { fallbackMagnet, urlList })`.
  - `urlList` includes the hosted URL (if present) so it becomes a WebTorrent web seed.

## Magnet helpers and normalization

`playbackService` doesn’t manipulate magnets directly. It relies on `deriveTorrentPlaybackConfig` in `js/playbackUtils.js`, which does the following:

- Calls `safeDecodeMagnet()` from `js/magnetUtils.js` so URL-encoded magnets become raw `magnet:?xt=urn:btih:...` strings.
- Accepts bare info hashes and promotes them to full magnet URIs when needed.
- Runs `normalizeAndAugmentMagnet()` (from `js/magnetUtils.js`) to:
  - Append `ws=` web seed hints when a hosted URL is present.
  - Append `xs=` torrent hints when supplied.
  - Ensure WSS-only tracker URLs are present.

The result is a canonical magnet used by WebTorrent, plus an optional `fallbackMagnet` that preserves the original raw input if normalization changed it.

## Tracker lists, ws/xs hints, and constants

Tracker and hint behavior is centralized in `js/constants.js` and `js/magnetUtils.js`:

- `WSS_TRACKERS` in `js/constants.js` is the canonical browser-safe tracker list. `normalizeAndAugmentMagnet()` merges this list into the magnet if trackers are missing.
- `normalizeAndAugmentMagnet()` also applies `ws=` web seed hints (from the hosted URL) and `xs=` torrent hints (from user input), enforcing HTTPS when appropriate.
- `URL_FIRST_ENABLED` (also in `js/constants.js`) controls whether the hosted URL probe is attempted before torrent fallback.

## Failure detection and hand-off points

The fallback hand-off happens in these places inside `PlaybackSession.execute()`:

1. **URL probe fails**: `probeUrl(url)` reports a bad outcome → session skips direct playback and goes straight to WebTorrent.
2. **Playback errors**: `video.play()` throws or fires `error` → session triggers the fallback.
3. **Playback stalls**: the watchdog timer (`registerUrlPlaybackWatchdogs`) detects `stalled`, `abort`, or no progress → session triggers the fallback.
4. **Autoplay blocked**: the browser blocks autoplay → session waits for a user gesture, re-enables watchdogs, and only falls back if playback still fails.

## Sequence diagram

```mermaid
sequenceDiagram
  participant App as App (Coordinator)
  participant Strategy as PlaybackStrategyService
  participant Service as PlaybackService (js/services/playbackService.js)
  participant Session as PlaybackSession
  participant Video as HTMLVideoElement
  participant Magnet as magnetUtils/playbackUtils

  App->>Strategy: play({ url, magnet, ... })
  Strategy->>Service: createSession({ url, magnet, videoElement, ... })
  Service->>Session: new PlaybackSession(...)
  Session->>Magnet: deriveTorrentPlaybackConfig()
  Magnet-->>Session: normalized magnet + fallbackMagnet

  Session->>App: showModalWithPoster()
  Session->>App: probeUrl(url)
  alt URL probe ok + URL_FIRST_ENABLED
    Session->>Video: src=url; play()
    Session->>Session: registerUrlPlaybackWatchdogs()
    alt hosted playback succeeds
      Session-->>App: sourcechange("url")
    else watchdog/error triggers
      Session->>App: playViaWebTorrent(magnet, { urlList })
      Session-->>App: sourcechange("torrent")
    end
  else URL probe fails or URL-first disabled
    Session->>App: playViaWebTorrent(magnet, { urlList })
    Session-->>App: sourcechange("torrent")
  end
```

## HLS (.m3u8) sources

Hosted sources whose path ends in `.m3u8` are HLS playlists and cannot be
assigned to `videoEl.src` on every browser. `js/services/hlsPlayback.js` owns
the decision and the hls.js lifecycle.

**Engine choice.** hls.js (MSE) wins whenever `MediaSource` can back it; native
playback is used only when MSE is unavailable. Do NOT branch on `canPlayType`
alone — measured behavior differs sharply:

| Browser | `canPlayType("application/vnd.apple.mpegurl")` | bare `<video src=…m3u8>` |
| --- | --- | --- |
| Firefox 146 | `""` | `MEDIA_ERR_SRC_NOT_SUPPORTED` (code 4) |
| Chrome 149 | `"maybe"` | plays natively |

Before this existed, Firefox reported `No playable source found.` for every HLS
note (and the URL-health badge showed `❌ CDN`), while Chrome happened to work.

**Wiring.**

- `js/services/playbackService.js` — `attemptHostedPlayback` routes HLS
  candidates through `attachHlsSource()`; `resetVideoElement()` calls
  `detachHls()` before clearing `src`.
- `js/app/modalCoordinator.js` — `teardownVideoElement` calls `detachHls()`
  first; otherwise the transmuxer worker and segment fetches outlive the modal.
- `js/ui/urlHealthController.js` — probes HLS by fetching the playlist and
  checking for `#EXTM3U` instead of using a bare `<video>` (which cannot load it
  and, on Chrome, emits no events at all — burning the whole probe timeout).
- `HLS_PLAYBACK_START_TIMEOUT` (`js/constants.js`) widens the 3s start window,
  which fires mid-startup for HLS: the bundle, master playlist, variant
  playlist, init segment and first media segment are serial round trips.

**Vendoring.** `npm run build:hls` regenerates `vendor/hls.bundle.min.js` from
the pinned devDependency. It is the FULL hls.js build, not `hls.js/light` —
light drops the alternate-audio stream controller, and real ladders (e.g.
nostube/slidestr) demux audio into its own `EXT-X-MEDIA` rendition group. The
bundle is lazy-imported only when an HLS URL is encountered, so ordinary
MP4/WebTorrent playback never pays for it.

**Rollback.** Stop calling `attachHlsSource()` from `playbackService.js` /
`playbackCoordinator.js` and the previous `videoEl.src = url` behavior returns;
revert the `urlHealthController.js` branch to restore the old element probe.
Nothing else imports `hlsPlayback.js`, and the vendored bundle is inert once
unreferenced.

## Implementation notes

- The playback session is responsible for cleanup and emits events (`status`, `sourcechange`, `error`, `finished`) that `bitvidApp` listens to for UI updates.
- `bitvidApp.playVideoWithFallback` keeps the current video card and modal state in sync with the normalized magnet values so copy actions and stats reflect the actual playback payload.


## Link previews (NIP-92 imeta + per-video OpenGraph)

Two independent surfaces make a shared bitvid video render richly.

**1. Inside nostr clients — `js/nostrEventSchemas.js`.**
`buildShareEvent()` appends a NIP-92 `imeta` entry describing the thumbnail URL
that the note body ends with. Many clients only inline such a URL when an imeta
entry backs it; without it the viewer sees a bare link. The media type is
inferred from the extension (`inferImageMimeTypeFromUrl`, `js/utils/mime.js`)
and OMITTED when unknown — a wrong `m` is worse than a missing one, because
clients use it to decide whether to render inline at all. Extensionless
Blossom-style URLs therefore ship `url` + `alt` only.

**2. Everywhere else — `api/og.js` + `api/_lib/ogRenderer.mjs`.**
`index.html` carries one set of site-wide OG tags, so every `/?v=<nevent>` link
previewed as the same generic card. Crawlers don't run JS, so this is rendered
server-side on demand.

- **Nothing is pre-generated or stored.** One stateless function serves all
  videos; the video is a query param, not a path. `dist/` is byte-identical
  with or without it. The only caching is the CDN edge (`s-maxage=300`) plus a
  per-container in-memory memo of the admin lists.
- **Never load-bearing.** Only crawler user-agents are rewritten to it
  (`vercel.json`), humans get the untouched SPA, and a static/nsite deploy with
  no functions keeps working — it just serves the site-wide card. Rollback is
  deleting the `rewrites` block.
- **Player card, not just an image.** It emits `twitter:player` / `og:video:url`
  pointing at `embed.html?pointer=<nevent>`, so a shared link plays inline on
  Twitter/Discord/Telegram. `frame-ancestors *` (`_headers`) already permits it.
- **Fails closed.** A crawler never authenticates, so anything emitted is public
  forever in third-party caches. `isPubliclyShareable()` requires an
  affirmatively public video: `deleted`, `isPrivate`, `isNsfw`/`content-warning`,
  blacklisted authors, and — while whitelist mode is on — an unavailable or
  empty whitelist all fall back to the generic card.
- **Both event shapes.** `parseVideoEvent()` reads bitvid's kind-30078 v3 JSON
  AND the NIP-71 tag shape (kinds 21/22/34235/34236) that nostube/slidestr
  publish, where the title lives in a `title` tag and the thumbnail in an
  `imeta image` entry.
- **Timeouts.** A cold pool's first relay read measured ~3s, so the budget is
  4s (Twitter allows ~5s); warm containers answer in <600ms because the admin
  lists are memoized for 5 minutes.

Config is imported from `js/config.js`, `js/nostr/toolkit.js` and
`js/nostrEventSchemas.js` rather than duplicated, and `tests/og-renderer.test.mjs`
fails if that regresses to hardcoded literals.

### Quoting the NIP-71 mirror

When a video has a NIP-71 mirror, the share note embeds `nostr:naddr1…` for it.
Nostr clients render that as a **native video quote card** — the closest thing
to a rich preview that does not depend on any client fetching OpenGraph tags
(most never do; the OG endpoint above mainly serves Twitter/Discord/Telegram).

The mirror is addressable (kind 34235/34236, author = video pubkey,
`d` = `videoRootId`), so `js/nostr/mirrorPointer.js` derives the coordinate with
no relay lookup, and the pointer survives the author editing the video — a plain
`nevent` would rot on the next replace.

Rules that keep this from looking worse than the plain link:

- **Verify before pointing.** `ShareNostrController.resolveMirrorPointer()`
  confirms the mirror exists via `nip71MirrorService.findMirror()` before
  embedding anything. A pointer to a missing event renders as a broken/empty
  quote box. Every failure path — service disabled, lookup throws, lookup times
  out (2.5s), no `videoRootId` — falls back to the thumbnail-URL note.
- **Use the observed kind.** `resolveMirrorKind()` prefers the kinds actually
  seen on relays over the portrait heuristic. Only when nothing was observed does
  it fall back to the SAME rule the mirror builder uses (`nip71Mirror.js`:
  `hasDims && height > width`), so a derived pointer matches what would be
  published rather than guessing independently.
- **Never emit both images.** While quoting, the raw thumbnail URL is dropped
  from the body and the `imeta` tag is skipped — the quote card already shows the
  thumbnail, and keeping both rendered the same image twice.
- An `a` tag (`kind:pubkey:d`) links the note to the quoted coordinate for
  quote-aware clients and indexers.

Known limitation: a client rendering the quote card still needs to play the
video, and mirrors whose `imeta url` is an `.m3u8` hit the same HLS wall bitvid
did — the thumbnail and title render, playback depends on the client.
