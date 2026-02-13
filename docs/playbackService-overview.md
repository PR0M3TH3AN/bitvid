# PlaybackService Overview

**File:** `js/services/playbackService.js`

## Summary

`PlaybackService` acts as the central orchestrator for video playback in bitvid. Its primary mission is to implement the **Hybrid Playback Strategy**: prioritizing fast, direct HTTP playback from a hosted URL, and seamlessly falling back to P2P WebTorrent if the URL fails, stalls, or is unavailable.

It manages the lifecycle of a `PlaybackSession`, which encapsulates the state machine for a single video attempt. It also handles "watchdog" monitoring to detect frozen playback and trigger fallbacks.

## Execution Flow

The core logic resides in `PlaybackSession.execute()`. Here is the standard flow:

1.  **Initialization**:
    *   The UI calls `playbackService.createSession(options)`.
    *   `session.start()` is called, triggering `execute()`.
    *   The video element is reset (volume, src cleared).

2.  **Source Selection**:
    *   The service checks `urlFirstEnabled` (default: true) and any `forcedSource` override.

3.  **Primary Attempt (URL-First)**:
    *   **Probe**: A HEAD request (`probeHostedUrl`) checks if the URL is reachable.
    *   **Play**: If reachable, `videoElement.src` is set to the URL.
    *   **Watchdog**: `registerUrlPlaybackWatchdogs` attaches listeners (`stalled`, `error`, `waiting`).
    *   **Success**: If `playing` fires and progress continues, the session locks to URL mode.

4.  **Fallback Trigger**:
    *   If the probe fails (404, CORS), or if the watchdog detects a stall (default 8s), the session triggers a fallback.
    *   **Autoplay Block**: If the browser blocks autoplay, the fallback is paused until user interaction.

5.  **Secondary Attempt (WebTorrent)**:
    *   The session switches to `playViaWebTorrent`.
    *   It uses the `magnet` URI and treats the original URL as a "WebSeed" to speed up P2P.
    *   If this fails, the session terminates with an error.

## Public API

### PlaybackService

| Method | Description |
| :--- | :--- |
| `createSession(options)` | Creates a new `PlaybackSession`. Returns the session instance. |
| `probeHostedUrl(params)` | Checks if a URL is reachable. Caches results to prevent spam. |
| `registerUrlPlaybackWatchdogs(el, opts)` | Attaches stall/error listeners to a video element. Returns a cleanup function. |
| `prepareVideoElement(el)` | Applies initial settings (volume, muted) based on user prefs. |

### PlaybackSession

| Method | Description |
| :--- | :--- |
| `start()` | Begins the async playback flow. Returns a promise resolving to the result. |
| `execute()` | The internal state machine (do not call directly; use `start()`). |
| `isActive()` | Returns `true` if the session is running. |
| `matchesRequestSignature(sig)` | Checks if this session matches a requested video (for race condition handling). |

## Key Invariants & Assumptions

*   **Single Active Session**: The UI generally manages one session at a time, though the service itself allows multiple instances if needed (rare).
*   **Video Element Ownership**: The service assumes it has exclusive control over `videoElement.src` during the session.
*   **Magnet Immutability**: The service does not mutate the magnet URI; it passes it raw to WebTorrent.
*   **Probe Caching**: URL probes are cached for 45s (`PROBE_CACHE_TTL_MS`) to avoid redundant network requests during rapid navigation.

## Edge Cases

*   **CORS/SSL**: If a URL is blocked by CORS or has a bad SSL cert, `probeHostedUrl` returns an error, triggering immediate fallback to WebTorrent.
*   **Autoplay Blocking**: Browsers often block programmatic playback. The service detects `NotAllowedError` and pauses the state machine, emitting a `status` event asking the user to click "Play".
*   **Stalls**: If the network is slow, the "watchdog" will fire after `stallMs` (default 8s), switching to P2P even if the URL was technically valid.

## When to Change This Module

*   **Adding New Sources**: If adding HLS (`.m3u8`) or DASH support, modify `PlaybackSession.execute()` to add a new step in the priority chain.
*   **Refactoring Fallback Logic**: If the stall detection is too aggressive or lenient, adjust `registerUrlPlaybackWatchdogs`.
*   **Telemetry**: If new analytics events are needed, update `handleAnalyticsEvent`.

## Testing

*   **Unit Tests**: `npm test tests/services/playbackService.test.mjs` verifies the session state machine and event emission.
*   **Manual Smoke Test**: Play a video with a valid URL, then one with a broken URL (to test fallback), then one with a valid URL but simulate a network throttle (to test watchdog).
