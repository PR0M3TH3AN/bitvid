# URL-first playback fallback orchestration

This document explains how `bitvidApp.playVideoWithFallback` in `js/app.js` coordinates hosted URL playback first and falls back to WebTorrent when needed. It also covers the supporting helpers in `js/services/playbackService.js`, `js/playbackUtils.js`, and `js/magnetUtils.js`, including how tracker lists and `ws=`/`xs=` hints are applied.

## High-level flow

1. `bitvidApp.playVideoWithFallback({ url, magnet })` trims inputs, ensures the video modal is ready, and constructs a playback session via `playbackService.createSession(...)`.
2. The session (from `js/services/playbackService.js`) derives a canonical magnet payload using `deriveTorrentPlaybackConfig` (from `js/playbackUtils.js`).
3. Playback starts with the hosted URL when `URL_FIRST_ENABLED` is true and a URL is available; otherwise, it goes directly to torrent playback.
4. If URL playback stalls or errors, the session triggers `playViaWebTorrent` with the normalized magnet and optional web seed hints.

## Call flow into playbackService

`bitvidApp.playVideoWithFallback` performs UI preparation and delegates the decision-making to a `PlaybackSession`:

- **Session setup**
  - `playbackService.createSession({ url, magnet, videoElement, probeUrl, playViaWebTorrent, ... })`
  - The session captures `url`, `magnet`, and a request signature to de-duplicate duplicate calls.
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
  participant App as bitvidApp (js/app.js)
  participant Service as PlaybackService (js/services/playbackService.js)
  participant Session as PlaybackSession
  participant Video as HTMLVideoElement
  participant Magnet as magnetUtils/playbackUtils

  App->>Service: createSession({ url, magnet, videoElement, ... })
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

## Implementation notes

- The playback session is responsible for cleanup and emits events (`status`, `sourcechange`, `error`, `finished`) that `bitvidApp` listens to for UI updates.
- `bitvidApp.playVideoWithFallback` keeps the current video card and modal state in sync with the normalized magnet values so copy actions and stats reflect the actual playback payload.

