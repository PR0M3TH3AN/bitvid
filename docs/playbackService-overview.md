# PlaybackService Overview

The `PlaybackService` (`js/services/playbackService.js`) is the central orchestrator for video playback in bitvid. It implements a **Hybrid Playback Strategy** that prioritizes user experience by attempting the fastest source first (usually a direct HTTPS URL) while seamlessly falling back to a decentralized P2P source (WebTorrent) if the primary source fails or stalls.

## Core Responsibilities

1.  **Orchestration**: Manages the `PlaybackSession` lifecycle, ensuring only one active video request controls the player at a time.
2.  **Probing**: Checks if direct URLs are reachable via `HEAD` requests before attempting playback, avoiding broken links.
3.  **Watchdogs**: Monitors the `<video>` element for stalls, errors, or timeouts (e.g., 8s stall limit).
4.  **Fallback**: Automatically switches to WebTorrent if the direct URL fails or stalls.
5.  **Race Condition Prevention**: Uses request signatures (JSON of `url` + `magnet`) to ignore stale playback requests.

## Architecture

- **`PlaybackService`**: Singleton service. Holds configuration and the active session.
- **`PlaybackSession`**: Ephemeral object representing one "play attempt". Contains the state machine for a specific video.
- **`SimpleEventEmitter`**: Internal utility for event-driven communication (e.g., status updates, errors).

## The Hybrid Playback Flow (`execute`)

The `PlaybackSession.execute()` method drives the logic:

1.  **Initialization**:
    - Cleans up previous sessions.
    - Prepares the `<video>` element (unmuting logic).
    - Parses magnets and webseeds (using `extractWebSeedsFromMagnet`).

2.  **Source Selection**:
    - Determines preference based on `urlFirstEnabled` config or `forcedSource` override (e.g., user clicked "Switch to P2P").

3.  **URL Attempt (Primary)**:
    - **Probe**: Sends a `HEAD` request via `probeHostedUrl`.
    - **Play**: Sets `video.src = url` and calls `video.play()`.
    - **Watchdog**: Attaches listeners via `registerWatchdogs`. If no `timeupdate` or `progress` events fire within `stallMs` (default 8s), triggers fallback.

4.  **Torrent Attempt (Fallback/Secondary)**:
    - Triggered if URL fails, stalls, or is disabled.
    - Cleans up URL watchers.
    - Initializes `WebTorrent` engine with the magnet link.
    - Uses the URL as a "webseed" to speed up P2P loading.

## Usage Example

```javascript
import { playbackService } from "./services/playbackService.js";

// 1. Create a session
const session = playbackService.createSession({
  url: "https://example.com/video.mp4",
  magnet: "magnet:?xt=urn:btih:...",
  requestSignature: "unique-id-for-this-request",
  videoElement: document.querySelector('video')
});

// 2. Listen for events
session.on("status", ({ message }) => console.log(message));
session.on("sourcechange", ({ source }) => console.log("Playing via:", source));
session.on("error", ({ message }) => console.error(message));

// 3. Start playback
session.start();
```

## Key Invariants

- **One Active Session**: Only one session should control the `<video>` element at a time.
- **Magnet Safety**: Magnets are decoded safely and never re-encoded via `URL()` constructors.
- **Watchdog Cleanup**: Watchdogs must be aggressively cleaned up to prevent memory leaks or phantom fallbacks.

## When to Change

- **Modify Fallback Logic**: If adding new sources (e.g., IPFS) or changing the stall timeout.
- **Update Error Handling**: To provide better user feedback for specific HTTP errors (403/404).
- **Refactor**: If the `execute()` method grows too large, consider extracting the URL and Torrent strategies into separate strategy classes.
