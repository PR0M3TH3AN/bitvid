# NostrClient Overview

The `NostrClient` (`js/nostr/client.js`) is the central controller for all Nostr network interactions, state management, and cryptographic operations in the application. It acts as a facade over `nostr-tools` and manages the complexity of connecting to relays, syncing data, and handling various NIPs (Nostr Implementation Possibilities).

## Core Responsibilities

1.  **Connection Management**: Maintains persistent connections to multiple relays using `SimplePool`.
2.  **State Management**: Tracks video events, deletions (tombstones), and deduplicates content.
3.  **Caching**: Implements a "stale-while-revalidate" strategy using IndexedDB (`EventsCacheStore`) to load content immediately while fetching updates in the background.
4.  **Publishing**: Orchestrates the signing and broadcasting of events, including complex multi-event flows (e.g., Video + Mirror + NIP-71).
5.  **Signer Management**: Abstracts the differences between NIP-07 (Extension), NIP-46 (Remote/Bunker), and Local (nsec) signers.

## State Architecture

The client maintains several in-memory maps to manage state:

*   **`allEvents`** (`Map<string, Video>`): A raw collection of all fetched video events, keyed by Event ID. This includes history (older versions) and is used for hydration.
*   **`activeMap`** (`Map<string, Video>`): The "materialized view" used by the UI. It maps a unique key (Video Root ID or `pubkey:dTag`) to the *latest* valid version of a video. It automatically handles deduplication and versioning.
*   **`rawEvents`** (`Map<string, Event>`): caches the exact raw JSON events received from relays. This is crucial for signature verification and republishing (e.g., NIP-94 mirrors) without altering the original signature.
*   **`tombstones`** (`Map<string, number>`): Tracks the timestamp of deletions. This prevents older versions of a video from "resurrecting" if a relay sends them after a user has deleted the video.

## Caching Strategy

To ensure a snappy UX, the client uses `EventsCacheStore` to persist `allEvents` and `tombstones` to IndexedDB.

1.  **Load**: On `init()`, the client loads the snapshot from IndexedDB into memory.
2.  **Fingerprinting**: To minimize write overhead, objects are fingerprinted. Only changed items are written back to disk.
3.  **Persistence**: Changes are persisted periodically (debounced) or on critical actions (like a flush after a batch subscription).

## Subscription Model: Buffering & Debouncing

Relays often send events in bursts (e.g., thousands of events on initial load). Processing each event individually would freeze the UI. `NostrClient` implements a **Buffering & Debouncing** strategy in `subscribeVideos`:

1.  **Buffer**: Incoming events are pushed into an `eventBuffer` array.
2.  **Debounce**: A flush is scheduled (e.g., 75ms delay).
3.  **Flush**: When the timer fires, the entire buffer is processed in a batch:
    *   Events are converted to `Video` objects.
    *   `activeMap` is updated (latest-wins logic).
    *   `onVideo` callback is fired once for the batch or per-item, but React updates are batched effectively.
    *   State is persisted to the local cache.

## Publishing Lifecycle

Publishing a video is a multi-step process to ensure compatibility and discoverability:

1.  **Video Note (Kind 30078)**: The primary payload containing metadata (title, magnet, etc.).
2.  **NIP-94 Mirror (Kind 1063)**: (Optional) If a HTTP URL is provided, a "File Header" event is published to support clients that only rely on NIP-94.
3.  **NIP-71 Metadata (Kind 22)**: (Optional) If the user adds categories or tags, a separate metadata event is linked to the video.

## Code Example

```javascript
import { NostrClient } from "./js/nostr/client.js";

const client = new NostrClient();

// 1. Initialize (loads cache, connects to relays)
await client.init();

// 2. Subscribe to videos
const sub = client.subscribeVideos((video) => {
  console.log("New video received:", video.title);
});

// 3. Login (NIP-07)
await client.login();

// 4. Publish a video
await client.publishVideo({
  title: "My Video",
  magnet: "magnet:?xt=urn:btih:...",
  // ...
}, client.pubkey);
```

## Why it works this way

*   **Active Map**: The `activeMap` ensures that if a user edits a video (publishing a new version), the UI automatically shows the new one and hides the old one, even if relays send them out of order.
*   **Tombstones**: Distributed systems are eventually consistent. A relay might send a "deleted" video event *after* we've processed the deletion locally. Tombstones ensure we ignore it.
*   **Raw Events**: We never modify the original event object for verification purposes. The `Video` object in `allEvents` is a normalized, app-specific representation.
