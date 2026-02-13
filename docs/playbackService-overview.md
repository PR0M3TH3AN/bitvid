# PlaybackService Overview

The `PlaybackService` is the central orchestrator for video playback in bitvid. It manages the "Hybrid Playback Strategy," prioritizing direct HTTP/CDN URLs for speed and reliability, while seamlessly falling back to WebTorrent (P2P) if the hosted source fails or stalls.

## Core Responsibilities

- **Orchestration**: Manages the lifecycle of a playback session.
- **Hybrid Fallback**: URL first -> WebTorrent fallback (or vice versa based on config).
- **Watchdog Monitoring**: Detects playback stalls and errors in real-time.
- **Race Condition Prevention**: Uses request signatures to ensure UI consistency.

## Execution Flow

When a video is requested via `createSession(...)` and `start()`:

1. **Initialization**: A `PlaybackSession` is created with the target URL and Magnet URI.
2. **Priority Check**: Determines whether to try URL or Torrent first (default: URL first).
3. **URL Phase** (if prioritized):
   - **Probe**: Sends a HEAD request to the URL to check availability.
   - **Play**: Sets `video.src = url` and attempts to play.
   - **Monitor**: Attaches "watchdogs" to listen for `stalled`, `error`, or timeout events.
   - **Success**: If playback proceeds smoothly, the session locks to URL mode.
   - **Failure**: If the watchdog triggers, the session switches to the Torrent Phase.
4. **Torrent Phase**:
   - **WebSeeds**: Adds the direct URL as a webseed to the torrent engine.
   - **Engine Start**: Initializes WebTorrent with the magnet link.
   - **Stream**: Streams the file to the video element.
5. **Completion**: Emits `finished` or `error` events.

## Usage Example

```javascript
import playbackService from '../services/playbackService.js';

// 1. Create a session
const session = playbackService.createSession({
  url: 'https://example.com/video.mp4',
  magnet: 'magnet:?xt=urn:btih:...',
  videoElement: document.querySelector('video'),
  // Optional callbacks
  onSuccess: () => console.log('Playback started!'),
  onFallback: (reason) => console.log('Fallback triggered:', reason),
});

// 2. Start playback
session.start()
  .then(result => {
    console.log('Final source:', result.source); // 'url' or 'torrent'
  })
  .catch(err => {
    console.error('Fatal playback error:', err);
  });

// 3. Listen to events
session.on('status', ({ message }) => {
  console.log('Status update:', message);
});
```

## Public API

### `PlaybackService`

| Method | Description |
|--------|-------------|
| `createSession(options)` | Creates and returns a new `PlaybackSession`. |
| `probeHostedUrl(params)` | Checks if a direct URL is reachable (HEAD request). |
| `registerUrlPlaybackWatchdogs(video, options)` | Low-level utility to monitor video element health. |
| `pruneProbeCache()` | Cleans up old probe results. |

### `PlaybackSession`

| Method | Description |
|--------|-------------|
| `start()` | Begins the async playback flow. Returns a Promise. |
| `on(event, handler)` | Subscribes to events (`status`, `error`, `fallback`, `sourcechange`). |
| `matchesRequestSignature(sig)` | Checks if this session matches a given request (for race control). |
| `cleanupWatchdog()` | Manually removes event listeners. |

## Key Invariants

1. **Single Source of Truth**: Only one `currentSession` is active at a time in the UI context (though the service itself is stateless regarding sessions).
2. **Raw Magnets**: Magnet links are preserved in their raw string form to avoid hash corruption.
3. **WebSeed Reuse**: The direct URL is *always* passed as a webseed to WebTorrent to maximize P2P performance.
4. **Watchdog Reliability**: The watchdog timer resets on *every* progress event (`timeupdate`, `download`, etc.).

## Why it works this way

- **Browser Limitations**: Browsers cannot natively fail over from HTTP to WebTorrent. We must manually handle the error and switch the `src`.
- **Latency vs. Resilience**: Direct URLs are fast (low latency) but centralized. WebTorrent is resilient but slow to start. The hybrid approach gives the "best of both worlds."
- **Memory Safety**: We destroy the WebTorrent client immediately when switching back to URL or when the session ends to prevent memory leaks.

## When to Change

- **New Playback Engines**: If adding HLS or DASH support, extend `PlaybackSession.execute` to handle manifest probing.
- **Watchdog Tuning**: If users report false positives (fallback happening too aggressively on slow connections), adjust `PLAYBACK_START_TIMEOUT` or watchdog `stallMs`.
- **Refactoring**: If `execute()` grows beyond ~400 lines, consider extracting the URL and Torrent logic into separate `Strategy` classes.
