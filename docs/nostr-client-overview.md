# NostrClient Overview

`js/nostr/client.js` exports the `NostrClient` class, which serves as the central controller for all Nostr protocol interactions in the application. It acts as a bridge between the UI components, the local state (React/Redux/Listeners), and the decentralized Nostr network.

## Responsibilities

1.  **Connection Management**:
    *   Maintains a persistent connection pool (`SimplePool` from `nostr-tools`) to multiple relays.
    *   Handles relay discovery, connection retries, and error reporting.
    *   Supports "Read" vs. "Write" relay splitting.

2.  **Event Publishing (Write Path)**:
    *   Constructs spec-compliant Nostr events (Kind 1, 30078, etc.).
    *   Handles **signing**:
        *   NIP-07 (Browser Extensions like Alby/nos2x).
        *   NIP-46 (Remote Signers / Bunker).
        *   Local Private Keys (nsec).
    *   Broadcasts events to write relays and verifies acceptance.
    *   Implements **NIP-94** (File Metadata) and **NIP-71** (Video Categorization) mirroring.

3.  **Data Fetching & Subscription (Read Path)**:
    *   **Live Feeds**: Uses persistent subscriptions (`sub`) to stream new events.
    *   **Buffering**: Implements a debounced buffer strategy (`subscribeVideos`) to handle relay floods without freezing the UI.
    *   **Caching**: Stores events in `allEvents` (memory) and persists to IndexedDB/LocalStorage for instant load ("Stale-While-Revalidate").

4.  **State Management**:
    *   **`allEvents`**: Map of all raw video events fetched, keyed by Event ID.
    *   **`activeMap`**: A "materialized view" of the latest video state. It deduplicates multiple versions of the same video (edits) based on `videoRootId` or `d` tag, ensuring the UI only shows the most recent valid version.
    *   **`tombstones`**: Tracks deleted events to prevent "zombie" events from reappearing during partial syncs.

## Key Architectures

### 1. The "Active Map" & Deduplication
Nostr is immutable; "editing" a video means publishing a NEW event with the same identifier (`d` tag).
The client listens to *all* versions but only keeps the latest one in `activeMap`.

```javascript
// Simplified Logic
if (incomingEvent.createdAt > currentActiveEvent.createdAt) {
  activeMap.set(videoRootId, incomingEvent);
  notifyUI();
}
```

### 2. Buffering Strategy
When the app loads, relays might send 1000+ events in a second. Rendering React components 1000 times is too slow.
`subscribeVideos` pushes events to a buffer and flushes them every 75ms.

```javascript
sub.on("event", (evt) => {
  buffer.push(evt);
  debounce(flushBuffer, 75);
});
```

### 3. Tombstoning (Deletes)
Since relays are eventually consistent, a "delete" event (Kind 5) might arrive *before* the event it deletes, or *after*.
The client tracks `tombstones` (map of ID -> deletedAt timestamp). Any incoming event older than its tombstone is immediately discarded.

## Main Entry Points

*   `init()`: Bootstraps the client, restores local cache, connects to relays.
*   `subscribeVideos(callback)`: Main feed subscription.
*   `publishVideo(payload)`: Complex flow to upload -> sign -> publish -> mirror.
*   `connectRemoteSigner(uri)`: Handshake protocol for NIP-46.
