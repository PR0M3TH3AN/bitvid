# Embed Mode Notes and Recommendations

## Current Behavior
The embed player (`embed.html` / `js/embed.js`) initializes a full `NostrClient` instance within its iframe context. This includes:
-   Initializing `SimplePool` from `nostr-tools`.
-   Connecting to default relays (or configured ones).
-   Subscribing to metadata (Kind 0) for liveness check.

## Duplicate Initialization Issue
When multiple embeds are present on a single parent page:
1.  Each iframe creates its own `NostrClient` and `SimplePool`.
2.  Each iframe opens its own WebSocket connections to the same set of relays.
3.  This results in $N \times M$ connections (N embeds, M relays), which can be resource-intensive and trigger rate limits.

## Fixes Implemented
-   **Idempotent Initialization**: Added guards in `js/embed.js` (`window.__bitvidEmbedStarted`) and `js/nostr/client.js` (`this.isInitialized`) to prevent accidental double-initialization within the *same* execution context.
-   **Crash Fix**: Added missing `resetStats` method to `EmbedVideoModal` and a safety guard in `Application.resetTorrentStats` to prevent `TypeError`.

## Recommended Long-Term Fixes

To solve the multi-iframe connection duplication, a mechanism to share the relay connection across Same-Origin iframes is required.

### 1. SharedWorker Relay Manager (Recommended)
Implement a `SharedWorker` (`js/relayWorker.js`) that acts as a singleton relay manager for the origin.
-   **Architecture**:
    -   The worker holds the `SimplePool` and WebSocket connections.
    -   Embeds (and the main app) connect to the worker via `MessagePort`.
    -   The worker proxies subscription requests and events between the frames and the relays.
-   **Pros**:
    -   Single connection per relay for the entire browser session/origin.
    -   Efficient resource usage.
-   **Cons**:
    -   Requires refactoring `NostrClient` to support a "Worker Relay Adapter" instead of direct `SimplePool` usage.
    -   Browser support (SharedWorker not available in all contexts/browsers, fallback needed).

### 2. BroadcastChannel Leader Election
Use `BroadcastChannel` to elect a "Leader" tab/frame that manages connections.
-   **Architecture**:
    -   Frames join a channel.
    -   One frame becomes Leader.
    -   Followers request data via the channel.
-   **Pros**:
    -   Works where SharedWorker might fail (though support is similar).
-   **Cons**:
    -   Complex leader election/failover logic (what if leader frame closes?).

### 3. Embed-Specific Minimal Runtime
Create a stripped-down `EmbedClient` that only implements the subset of Nostr functionality needed for playback (fetch by ID/pointer), bypassing the heavier `NostrClient` if possible, or optimizing `NostrClient` to be lighter.
