# PlaybackService Internals

This document details the internal architecture and execution flow of `js/services/playbackService.js`.

For a higher-level view of how playback is orchestrated across the application (including `PlaybackStrategyService`), see [playback-fallback.md](playback-fallback.md).

## Core Responsibilities

The `PlaybackService` is the low-level engine responsible for:

1.  **Orchestrating the Hybrid Playback Strategy**: Attempting to play a video from a direct HTTPS URL first, and seamlessly falling back to WebTorrent (P2P) if the URL fails or stalls.
2.  **Session Management**: Encapsulating each playback attempt in a `PlaybackSession` to manage state, cleanup, and race conditions.
3.  **Health Monitoring (Watchdogs)**: actively monitoring the `<video>` element to detect stalls, network errors, or interruptions.
4.  **Probe Caching**: Caching the results of URL reachability checks (HEAD requests) to avoid redundant network calls.

## Architecture

### PlaybackService (Singleton)

The service itself is a lightweight factory and cache manager.

-   **`createSession(options)`**: Instantiates a new `PlaybackSession`.
-   **`probeHostedUrl(...)`**: performs a HEAD request to check if a URL is reachable. Results are cached for 45 seconds (`PROBE_CACHE_TTL_MS`) using a key derived from the URL and Magnet.
-   **`registerUrlPlaybackWatchdogs(...)`**: Attaches event listeners to the video element to detect failures.

### PlaybackSession (State Machine)

The `PlaybackSession` is the workhorse. It represents a single attempt to play a video.

-   **Request Signature**: Each session is created with a `requestSignature` (usually `JSON.stringify({ url, magnet })`). This allows the UI to check `matchesRequestSignature(sig)` to decide if an existing session can be reused or if a new one is needed (preventing race conditions when users click rapidly).
-   **State**: Tracks `finished` (boolean) and `result` (outcome).
-   **Events**: Emits `status`, `sourcechange`, `error`, `finished`, and telemetry events.

## Execution Flow (`execute()`)

The `PlaybackSession.execute()` method implements the following logic:

1.  **Preparation**:
    -   Cleans up previous sessions/clients.
    -   Configures the `<video>` element (muting, autoplay).
    -   Parses **WebSeeds** from the magnet link (query params `ws=` or `webseed=`) and adds the hosted URL as a candidate webseed.

2.  **Strategy Selection**:
    -   Determines whether to try URL first or Torrent first based on `urlFirstEnabled` config or `forcedSource` override.

3.  **URL Playback Attempt** (Primary Path):
    -   **Probe**: Calls `service.probeHostedUrl()` to check reachability.
    -   **Play**: Sets `video.src = url` and calls `video.play()`.
    -   **Watchdog**: Attaches listeners via `registerUrlPlaybackWatchdogs`. If the video stalls for `8000ms` (default), or emits an error, the watchdog triggers the fallback callback.
    -   **Success**: If playback proceeds (time advances), the watchdog is cleared, and the session locks into "URL mode".

4.  **Fallback to WebTorrent**:
    -   If the URL probe fails, or the watchdog triggers:
        -   The session cleans up URL listeners.
        -   It calls `playViaWebTorrent` (injected dependency).
        -   It passes the hosted URL as a **WebSeed** to help the torrent client bootstrap.

5.  **Completion**:
    -   Emits `sourcechange` (e.g., `'url'` -> `'torrent'`).
    -   Resolves the start promise.

## Watchdog Mechanism

The watchdog (`registerUrlPlaybackWatchdogs`) is critical for user experience. It listens for:
-   **Stalls**: `stalled`, `waiting`, or lack of `timeupdate`/`progress` events for `stallMs`.
-   **Errors**: `error`, `abort` events.
-   **Success**: `playing`, `timeupdate` (resets the stall timer).

If a stall is detected, it immediately invokes the `onFallback` callback, allowing the session to switch to P2P without the user having to manually intervene.

## Caching

Probe results are cached in memory to reduce latency when navigating back and forth.

-   **Key**: `${url}::${magnet}`
-   **TTL**: 45 seconds.
-   **In-Flight**: Concurrent requests for the same key reuse the same promise.

## Key Invariants

1.  **One Session at a Time**: The service tracks `currentSession`. While it doesn't strictly enforce a singleton session (the UI controller does), it provides the mechanism to do so.
2.  **Clean Teardown**: `cleanupWatchdog()` must be called when a session ends or switches sources to prevent memory leaks and zombie listeners.
3.  **Magnet Safety**: Magnets are parsed using safe decoding utilities (`safeDecodeURIComponent`) to prevent URI malformation.

## When to Refactor

-   **Complexity**: The `execute()` method is large and handles both URL and Torrent paths with complex error handling. It could be split into `executeUrlStrategy()` and `executeTorrentStrategy()` helpers.
-   **Dependencies**: The service currently depends on `playViaWebTorrent` being passed in via options. This dependency injection is good for testing but makes the call signature complex.
