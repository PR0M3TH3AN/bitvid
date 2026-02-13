# PlaybackService Overview

**File:** `js/services/playbackService.js`

## Purpose

The `PlaybackService` is the central orchestrator for bitvid's **Hybrid Playback Strategy**. Its primary goal is to play video content reliably by attempting to stream from a direct HTTP(S) URL first (the "Hosted" source) and seamlessly falling back to a P2P WebTorrent stream if the hosted source fails, stalls, or is unavailable.

## Core Concepts

### 1. Hybrid Playback
The service manages a priority queue of sources:
1.  **Hosted URL:** A direct link to a video file (e.g., S3, specialized host). Preferred for speed and reliability.
2.  **WebTorrent (P2P):** A magnet link. Used as a fallback or primary if no URL is present.

### 2. PlaybackSession
Every attempt to play a video creates a `PlaybackSession`. This session encapsulates the state machine for that specific video request. It uses a **Request Signature** (JSON of URL + Magnet) to identify unique requests.
- **Race Condition Prevention:** If the user clicks "Video A" and then quickly "Video B", the service checks the signature. If the active session doesn't match the new request, it cancels the old session and starts a new one.

### 3. Watchdogs
To ensure reliability, the service attaches "watchdog" listeners to the `<video>` element during hosted playback.
- **Stall Detection:** If `timeupdate` or `progress` events stop firing for >8 seconds (default), the watchdog triggers a fallback to WebTorrent.
- **Error Detection:** Catches `error`, `abort`, `stalled` events immediately.

## Execution Flow

The `PlaybackSession.execute()` method drives the logic:

1.  **Initialization:**
    - Prepares the `<video>` element (unmutes based on settings).
    - Cleans up previous torrent clients.
    - Resolves WebSeed candidates from the URL and Magnet.

2.  **Source Selection:**
    - Determines if "URL First" is enabled (default: true).
    - Checks for forced overrides (e.g., user manually selected "Torrent").

3.  **URL Attempt (Primary):**
    - **Probe:** Sends a HEAD request (`probeHostedUrl`) to check availability/CORS.
    - **Play:** Sets `video.src = url` and attempts `video.play()`.
    - **Monitor:** Attaches Watchdogs.
    - **Success:** If playback starts and sustains, the session locks to "URL".
    - **Failure:** If probe fails, play errors, or watchdog barks, the session proceeds to Fallback.

4.  **Torrent Fallback (Secondary):**
    - Cleans up URL watchers.
    - Initializes `WebTorrent` client with the magnet link.
    - Uses the Hosted URL as a "WebSeed" to speed up P2P (if valid).
    - Sets `video.src` to the torrent stream.

## Key Public API

### `PlaybackService` (Singleton/Service)

```javascript
// Instantiate
const service = new PlaybackService({ logger, torrentClient, ... });

// Start playback
const session = service.createSession({
  url: "https://...",
  magnet: "magnet:?xt=...",
  videoElement: document.querySelector("video")
});

session.start(); // Returns Promise<Result>
```

### `PlaybackSession` (Instance)

-   `start()`: Begins the state machine.
-   `isActive()`: Returns true if the session is currently running.
-   `cleanupWatchdog()`: Manually removes listeners (called on destroy).

## When to Change

Consider refactoring or splitting this module if:

1.  **`execute()` grows larger:** The `execute` method is currently ~400 lines. It should be decomposed into `attemptHostedPlayback()` and `attemptTorrentPlayback()` methods on the session class.
2.  **New Sources:** If adding a third source type (e.g., IPFS, HLS-specific handler), the state machine will become unmanageable and should be refactored into a "Strategy" pattern.
3.  **Watchdog Logic:** If stall detection needs to be more complex (e.g., adaptive timeouts), extract `registerUrlPlaybackWatchdogs` into a `PlaybackMonitor` class.
