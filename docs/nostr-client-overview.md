# NostrClient Architecture Overview

The `NostrClient` (`js/nostr/client.js`) is the central controller for all Nostr network interactions in the application. It acts as a singleton facade over the `nostr-tools` library, managing relay connections, event subscriptions, state synchronization, and cryptographic signing.

## Core Responsibilities

1.  **Connection Management**: Maintains a persistent connection pool (`SimplePool`) to multiple relays.
2.  **State Management**: Tracks the global state of video events, including history, active versions, and deletions.
3.  **Event Ingestion**: Handles high-volume event streams with buffering and deduplication.
4.  **Caching**: Implements a persistent IndexedDB cache to support "Stale-While-Revalidate" loading (instant UI render).
5.  **Signer Orchestration**: Manages NIP-07 (Browser Extension), NIP-46 (Remote Signer), and Local (nsec) signers seamlessly.

## State Management

The client maintains three primary state maps to ensure data consistency:

*   **`allEvents`** (`Map<string, VideoObject>`):
    *   Stores *every* valid video event fetched from relays, indexed by Event ID.
    *   Used for history preservation and resolving direct links to specific versions.

*   **`activeMap`** (`Map<string, VideoObject>`):
    *   The "materialized view" used by the UI.
    *   Keys are `videoRootId` (for versioned edits) or `pubkey:dTag` (for addressable events).
    *   Values are the *latest* valid version of the video.
    *   **Invariant**: Only one entry exists per "video entity", ensuring the UI displays the most recent edit.

*   **`tombstones`** (`Map<string, timestamp>`):
    *   Tracks deletions (Kind 5).
    *   Keys are the `activeKey` of the deleted item.
    *   Values are the timestamp of the deletion.
    *   **Invariant**: Events older than the tombstone are strictly ignored, preventing "zombie" events from reappearing.

## Data Ingestion Flow

The `subscribeVideos` method implements a buffered ingestion pipeline to handle high-throughput streams without freezing the UI:

1.  **Subscription**: Opens a subscription to all connected relays.
2.  **Buffering**: Incoming events are pushed to an `eventBuffer` array immediately.
3.  **Debouncing**: A timer flushes the buffer every ~250ms (or when full).
4.  **Processing (Flush)**:
    *   Events are parsed and validated.
    *   **Tombstone Check**: If an event predates a known deletion, it is discarded.
    *   **Latest-Wins Resolution**: The new event's `created_at` is compared against the existing entry in `activeMap`.
    *   **Update**: If the new event is newer, `activeMap` is updated, and the UI callback is triggered.
5.  **Persistence**: The updated state is asynchronously persisted to IndexedDB.

```mermaid
graph TD
    Relay[Relays] -->|Event Stream| Buffer[Event Buffer]
    Buffer -->|Debounce Timer| Processor[Processor]
    Processor -->|Check| Tombstones{Is Deleted?}
    Tombstones -->|Yes| Discard[Discard]
    Tombstones -->|No| Compare{Is Newer?}
    Compare -->|No| Discard
    Compare -->|Yes| ActiveMap[Update ActiveMap]
    ActiveMap --> UI[Update UI]
    ActiveMap --> IDB[(IndexedDB Cache)]
```

## Caching Strategy (`EventsCacheStore`)

To provide an "app-like" experience, the client persists its state to IndexedDB (`bitvid-events-cache`).

*   **Fingerprinting**: To minimize I/O, the store tracks JSON fingerprints (hashes) of all persisted events.
*   **Incremental Persistence**: Only changed events (where fingerprint differs) are written to IDB during a snapshot.
*   **Stale-While-Revalidate**: On startup (`init()`), the client immediately loads data from IDB to render the UI, then connects to relays to fetch updates.

## Signer Integration

The client abstracts the signing mechanism, allowing the user to switch between methods without changing application logic:

1.  **NIP-07 (Extension)**: Delegates signing to a browser extension (e.g., Alby, nos2x).
2.  **NIP-46 (Remote/Bunker)**: Uses a partial `NostrClient` instance to communicate with a remote signer via a relay.
3.  **Local (NIP-01)**: Uses a local private key (nsec) stored in `sessionStorage` (encrypted).

The `activeSigner` object is normalized to expose a standard interface (`signEvent`, `nip04Encrypt`, `nip44Encrypt`), regardless of the underlying implementation.
