# NostrClient Overview

`js/nostr/client.js` exports the `NostrClient` class, which serves as the central controller for all Nostr network interactions and state management within the application. It acts as a facade over `nostr-tools`, managing connections, subscriptions, caching, and signing.

## Key Responsibilities

1.  **Connection Management**: Maintains a pool of connections to multiple relays (`SimplePool`).
2.  **State Management**: Tracks video events, deduplicates them, and manages deletions via tombstones.
3.  **Caching**: Implements a "stale-while-revalidate" strategy using IndexedDB (with localStorage fallback) to restore UI state immediately upon load.
4.  **Event Publishing**: Orchestrates the signing and broadcasting of complex event chains (Video Note -> NIP-94 Mirror -> NIP-71 Metadata).
5.  **Signer Abstraction**: Unifies NIP-07 (Extension), NIP-46 (Remote/Bunker), and Local (nsec) signing under a single interface.
6.  **Video History**: Reconstructs the edit history of videos using `videoRootId` and `d` tags.

## Architecture & State

The client maintains several internal maps to manage state:

*   `allEvents`: A raw map of all fetched video events (key: event ID).
*   `activeMap`: A derived map containing only the *latest* version of each video, keyed by a stable identifier (`videoRootId` or addressable pointer).
*   `rawEvents`: A cache of the exact raw JSON events from relays, used for signature verification and re-publishing.
*   `tombstones`: Tracks timestamps of deletion events to prevent "zombie" events (deleted events reappearing from slow relays) from resurfacing.

### Caching Strategy (`EventsCacheStore`)

To ensure instant load times, the client persists its state to IndexedDB (`bitvid-events-cache`).
*   **Snapshot**: On a debounced timer (or idle callback), the current state (`allEvents`, `tombstones`) is serialized.
*   **Fingerprinting**: Events are fingerprinted to avoid writing unchanged data to the DB.
*   **Restore**: On `init()`, the client loads the latest snapshot into memory, allowing the UI to render before any network requests complete.

## Key Flows

### 1. Initialization (`init`)

```mermaid
graph TD
    A[init()] --> B[restoreLocalData]
    B --> C{IndexedDB Available?}
    C -- Yes --> D[Load Snapshot]
    C -- No --> E[Load localStorage]
    D & E --> F[Render UI with Cached Data]
    F --> G[ensurePool]
    G --> H[connectToRelays]
    H --> I[Ready for Subscriptions]
```

### 2. Video Subscription (`subscribeVideos`)

To prevent UI thrashing during high-volume event ingress (e.g., initial flood from relays), the client uses a **buffering and debouncing** strategy.

1.  **Buffer**: Incoming events are pushed to `eventBuffer` instead of being processed immediately.
2.  **Debounce**: A flush timer is scheduled (75ms).
3.  **Flush**: When the timer fires, the entire buffer is processed:
    *   Events are validated and converted.
    *   `activeMap` is updated (latest-wins logic).
    *   `onVideo` callback is fired once with the batch updates.
    *   Cache persistence is scheduled.

### 3. Publishing a Video (`publishVideo`)

Publishing is a multi-step process ensuring compatibility and discoverability.

1.  **Video Note (Kind 30078)**: The core content (magnet, infohash, metadata) is signed and published. A unique `videoRootId` is generated for new videos.
2.  **NIP-94 Mirror (Kind 1063)**: If a direct HTTP URL is provided, a file header event is published to point to the hosted file.
3.  **NIP-71 Metadata (Kind 22/21)**: Addressable metadata tags are published to support categorization/grouping without modifying the immutable video note.

### 4. Remote Signer Handshake (`connectRemoteSigner`)

For NIP-46 (Nostr Connect), the client implements a full handshake flow:

1.  **Ephemeral Key**: Generates a local key pair for the session.
2.  **Handshake**: Publishes a Kind 24133 (`NIP46_RPC_KIND`) event to the relay.
3.  **Wait**: Listens for an acknowledgment or `auth_url` challenge from the signer.
4.  **Session**: Once connected, stores the session metadata to allow auto-reconnection.

## Why it works this way

*   **Buffering**: essential for performance. React rendering cycles are expensive; updating state for every single event in a 5000-event relay dump would freeze the browser.
*   **Tombstones**: essential for eventual consistency. Relays are distributed and can be out of sync. If a user deletes a video, we must remember that deletion timestamp so a slow relay doesn't "undelete" it by serving the old event later.
*   **Dual-Layer Cache**: IndexedDB is asynchronous and large-capacity; localStorage is synchronous but small. We use IndexedDB for the bulk data but keep a fallback for environments where IDB might be flaky or slow to initialize.

## When to change

*   **Refactor `EventsCacheStore`**: If moving to a more robust state management library (like RxDB or dedicated worker), this logic should be extracted.
*   **New Event Kinds**: If the video data model changes (e.g., V4 schema), `convertEventToVideo` and `publishVideo` will need updates.
*   **Signer upgrades**: As NIP-46 evolves (e.g., Bunker standards), the handshake and connection logic in `nip46Client.js` (and its orchestration here) will need adjustment.

## Related Files

*   `js/nostrEventSchemas.js`: Defines the structure of the events being built/parsed.
*   `js/nostr/nip46Client.js`: Handles the low-level RPC for remote signers.
*   `js/state/profileCache.js`: Handles user profile metadata (Kind 0), which is separate from video data.
