# PlaybackService Overview

**File:** `js/services/playbackService.js`

`PlaybackService` is the core engine for video playback orchestration in bitvid. It implements the "Hybrid Playback Strategy," prioritizing direct HTTP/CDN streams while seamlessly falling back to WebTorrent (P2P) when needed.

> **See also:** `docs/playback-fallback.md` for the architectural view of the fallback strategy.

## Key Responsibilities

1.  **Orchestration**: Manages the lifecycle of a `PlaybackSession`, ensuring only one session is active (or properly deduped) at a time.
2.  **Probing**: Checks if a hosted URL is reachable (via HEAD/GET) before attempting to play it, caching results to avoid redundant network requests.
3.  **Monitoring (Watchdogs)**: Attaches event listeners to the `<video>` element to detect stalls, network errors, or playback failures.
4.  **Fallback Execution**: Triggers the switch to WebTorrent if the hosted URL fails or stalls.

## Public API

The `PlaybackService` class exports the following methods:

### `constructor(options)`
Initializes the service.
- **options.logger**: Logging interface.
- **options.torrentClient**: The WebTorrent client instance.
- **options.deriveTorrentPlaybackConfig**: Helper to normalize/canonicalize magnets.
- **options.urlFirstEnabled**: Boolean flag to enable/disable the URL-first strategy.

### `createSession(options)`
Creates a new `PlaybackSession`.
- **options.url**: The hosted URL (optional).
- **options.magnet**: The magnet URI (optional).
- **options.videoElement**: The DOM element to control.
- **Returns**: A `PlaybackSession` instance.

### `probeHostedUrl({ url, magnet })`
Checks if a URL is reachable.
- Deduplicates concurrent requests for the same URL.
- Caches results (TTL defined by `PROBE_CACHE_TTL_MS`).
- **Returns**: `{ outcome: 'ok'|'bad'|'error', status: number }`.

### `registerUrlPlaybackWatchdogs(videoElement, options)`
Attaches stall detection listeners.
- **options.stallMs**: Timeout in milliseconds before declaring a stall (default 8000ms).
- **options.onFallback**: Callback triggered when a stall or error occurs.
- **Returns**: A cleanup function to remove listeners.

## PlaybackSession Flow

The `PlaybackSession` encapsulates a single attempt to play a video. Its `execute()` method runs the following state machine:

1.  **Initialization**: Prepares the video element (unmuting logic, clearing old sources).
2.  **Decision**: Checks `forcedSource` (user override) and `urlFirstEnabled`.
3.  **Attempt URL (if eligible)**:
    -   **Probe**: Calls `probeHostedUrl`.
    -   **Play**: Sets `video.src = url`.
    -   **Watch**: Registers watchdogs.
    -   **Success**: If playback starts, clears watchdogs.
    -   **Failure**: If probe fails, play throws, or watchdog triggers -> proceed to step 4.
4.  **Attempt Torrent**:
    -   Clears video source.
    -   Calls `playViaWebTorrent` (using the magnet).
    -   WebTorrent handles the rest (seeding from peers or web seeds).

## Key Invariants

- **Single Active Session**: The UI layer (via `PlaybackStrategyService`) typically ensures only one session runs, but `PlaybackService` itself is stateless regarding *other* sessions (except for the singleton pattern in `app.js`).
- **Raw Magnets**: The service relies on `deriveTorrentPlaybackConfig` (from `js/playbackUtils.js`) to handle magnet normalization. It does not mutate magnets internally.
- **Watchdog Cleanup**: Watchdogs *must* be cleaned up when a session ends or switches sources to prevent memory leaks and "zombie" callbacks triggering fallbacks for old videos.

## When to Change

- **New Playback Sources**: If adding HLS/DASH support (e.g., `hls.js`), this service would need to be updated to handle the new player instantiation and lifecycle.
- **Refactoring Watchdogs**: The `registerUrlPlaybackWatchdogs` method is complex DOM event handling. If this grows, extract it to a `VideoWatchdog` class.
- **Telemetry**: Changes to analytics events (`session-start`, `fallback`, `error`) should be coordinated here.
