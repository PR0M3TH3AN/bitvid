# PlaybackService Overview

**File:** `js/services/playbackService.js`

The `PlaybackService` is the central orchestrator for video playback in bitvid. It implements the "Hybrid Playback Strategy", ensuring users get the fastest possible start (via direct URL) while maintaining the censorship-resistance of P2P (via WebTorrent) as a seamless fallback.

## Key Concepts

### 1. Hybrid Playback Strategy
The goal is to play video from a standard HTTPS URL (CDN/Server) first because it offers instant seek and low latency. If that fails (404, blocked, or stalls), the system automatically switches to the WebTorrent engine to stream the content from the P2P network using the magnet link.

### 2. PlaybackSession
Each attempt to play a video creates a `PlaybackSession`. This object encapsulates the state machine for that specific video request.
- **Request Signature:** A unique ID derived from the URL and Magnet. Used to prevent race conditions (e.g., user clicks the same video twice, or switches videos rapidly).
- **Watchdogs:** Event listeners attached to the `<video>` element that monitor for stalls, errors, or network timeouts. If a watchdog barks, the session triggers a fallback.

## Execution Flow

The `execute()` method in `PlaybackSession` drives the logic:

### URL-First (Default)
1.  **Probe:** Send a HEAD request to the HTTPS URL to check reachability and CORS status.
2.  **Play:** If reachable, set `video.src = url` and attempt playback.
3.  **Monitor:** Attach watchdogs.
    *   **Success:** If `playing` event fires and progress continues, keep playing.
    *   **Failure:** If `error`, `stalled`, or `timeout` occurs, stop playback and trigger **Torrent Fallback**.
4.  **Fallback:** Initialize WebTorrent with the magnet link.

### Torrent-First (Configurable)
If `urlFirstEnabled` is false or the user explicitly selects "P2P":
1.  **Torrent:** Start WebTorrent immediately.
2.  **Fallback:** If no peers are found within a timeout, fall back to the HTTPS URL (if available).

## Public API

### `playbackService.createSession(options)`
Creates a new session.
- `url`: HTTPS URL string.
- `magnet`: Magnet URI string.
- `videoElement`: The HTMLVideoElement to control.
- `forcedSource`: Optional 'url' or 'torrent' override.

### `session.start()`
Begins the playback flow. Returns a `Promise` that resolves when playback successfully starts (from either source) or rejects if both fail.

### `session.cleanupWatchdog()`
Removes all event listeners and timers. Automatically called when a session ends or is replaced.

## Example Usage

```javascript
import { playbackService } from './services/playbackService.js';

// 1. Create a session
const session = playbackService.createSession({
  url: 'https://example.com/video.mp4',
  magnet: 'magnet:?xt=urn:btih:...',
  videoElement: document.querySelector('video'),
  // Optional callbacks
  onSuccess: () => console.log('Playback started!'),
  onFallback: (reason) => console.log('Switched to torrent due to:', reason)
});

// 2. Start playback
try {
  const result = await session.start();
  console.log(`Playing via: ${result.source}`); // 'url' or 'torrent'
} catch (err) {
  console.error('Playback failed completely:', err);
}
```

## When to Refactor
- If the `execute()` method grows beyond 500 lines, consider splitting the URL and Torrent logic into separate strategy classes (`UrlPlaybackStrategy`, `TorrentPlaybackStrategy`).
- If the "Watchdog" logic becomes more complex (e.g., adaptive bitrates), extract it into a dedicated `PlaybackMonitor` class.
