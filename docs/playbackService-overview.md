# PlaybackService Overview

The `PlaybackService` is the central orchestrator for video playback in bitvid. It implements a **Hybrid Playback Strategy**, prioritizing direct HTTP streams (hosted URLs) for speed and reliability, while seamlessly falling back to WebTorrent (P2P) if the direct stream fails or stalls.

This module resides in `js/services/playbackService.js` and is primarily consumed by `bitvidApp` (or the future `PlayerController`).

---

## Core Architecture

### 1. `PlaybackService` (Singleton-ish)
-   **Role:** Acts as the factory and manager for playback sessions.
-   **Responsibilities:**
    -   Creates `PlaybackSession` instances.
    -   Manages the global `currentSession` (usually only one active session).
    -   Provides shared utilities like `probeHostedUrl` (with caching) and `registerUrlPlaybackWatchdogs`.
    -   Handles global analytics events.

### 2. `PlaybackSession` (State Machine)
-   **Role:** Encapsulates the lifecycle of a *single* video playback attempt.
-   **Responsibilities:**
    -   Manages the state transition from "Preparing" -> "Probing URL" -> "Playing URL" -> "Fallback to Torrent" -> "Playing Torrent".
    -   Handles race conditions via `requestSignature` (ensures outdated sessions don't overwrite the UI).
    -   Cleans up resources (watchdogs, event listeners, torrent clients) when finished or replaced.

---

## Execution Flow: `PlaybackSession.execute()`

The heart of the service is the `execute()` method in `PlaybackSession`. It follows this decision tree:

1.  **Initialization**:
    -   Prepares the `<video>` element (unmutes based on preference).
    -   Extracts potential web seeds from the magnet URI (if provided).
    -   Emits `session-start` event.

2.  **Source Selection**:
    -   Determines if URL-first strategy is enabled (default: `true`).
    -   Checks if a specific source is forced (`forcedSource` option).

3.  **Attempt Direct URL (HTTP)** (if applicable):
    -   **Probe:** Sends a HEAD request to the URL (`probeHostedUrl`).
        -   *Cache:* Results are cached for 45s to prevent spamming.
    -   **Play:** If probe succeeds (200 OK), sets `video.src = url` and calls `play()`.
    -   **Watchdog:** Attaches listeners to monitor for stalls (`stallMs` default: 8000ms).
    -   **Outcome:**
        -   *Success:* Video plays without stalling. Session marks source as `url`.
        -   *Stall/Error:* Watchdog triggers fallback. Session proceeds to step 4.

4.  **Attempt WebTorrent (P2P)** (if URL failed or skipped):
    -   **Switch:** Clears URL source, resets video element.
    -   **Load:** Calls `playViaWebTorrent` (external handler) with the magnet URI.
    -   **WebSeeds:** Passes the failed HTTP URL as a potential web seed to the torrent client.
    -   **Outcome:**
        -   *Success:* P2P playback starts. Session marks source as `torrent`.
        -   *Failure:* Torrent client fails to connect or find peers.

5.  **Final State**:
    -   Emits `finished` or `error` event.
    -   Cleans up all watchdogs and debug listeners.

---

## Public API

### `PlaybackService`

| Method | Description |
| :--- | :--- |
| `constructor(options)` | Initializes the service with logger, torrent client, and config. |
| `createSession(options)` | Creates and returns a new `PlaybackSession`. |
| `probeHostedUrl({ url })` | Checks if a URL is reachable. Returns `{ outcome: 'success' | 'bad' | ... }`. |
| `registerUrlPlaybackWatchdogs(el, opts)` | Attaches stall detection listeners to a video element. |

### `PlaybackSession`

| Method | Description |
| :--- | :--- |
| `start()` | Kicks off the asynchronous `execute()` loop. |
| `isActive()` | Returns `true` if the session is currently running. |
| `matchesRequestSignature(sig)` | Checks if this session matches a given `{ url, magnet }` pair (prevents race conditions). |

---

## Edge Cases & Error Handling

-   **Stalled Playback:** If a direct URL buffers for >8 seconds (configurable via `stallMs`), the watchdog triggers a seamless switch to P2P.
-   **CORS/SSL Errors:** If the probe detects CORS or SSL issues, it immediately falls back to P2P.
-   **Autoplay Blocking:** If the browser blocks autoplay (`NotAllowedError`), the session pauses and waits for user interaction before retrying or falling back.
-   **Race Conditions:** If the user clicks "Play" on Video B while Video A is still loading, the UI uses `requestSignature` to discard Video A's session results.

---

## Why it works this way

-   **URL First:** Direct HTTP is almost always faster and more reliable than P2P for initial playback. We prioritize it to minimize "time to first frame".
-   **Aggressive Fallback:** We treat *any* hesitation (stall, error, timeout) as a signal to switch to P2P. This ensures the user eventually sees the video, even if the host is flaky.
-   **Web Seed Reuse:** When falling back, we feed the HTTP URL to WebTorrent as a web seed. This allows the P2P client to fetch pieces from the server even if no other peers are online.

## When to change

-   **Refactoring:** This logic is complex and coupled to the DOM. Future refactors should aim to decouple `PlaybackSession` from the `HTMLVideoElement` further, perhaps by introducing a `VideoController` adapter.
-   **New Protocols:** If adding support for HLS or DASH, `PlaybackSession.execute()` would need a new branch in its decision tree.
