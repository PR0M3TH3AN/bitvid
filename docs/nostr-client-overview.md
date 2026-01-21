# NostrClient Overview

The `NostrClient` class in `js/nostr/client.js` is the central controller for all Nostr protocol interactions in the application. It handles connection management, event publishing, state synchronization, and caching.

## Key Responsibilities

1.  **Connection Management**: Maintains a pool of connections to Nostr relays (`SimplePool`).
2.  **State Management**:
    *   `allEvents`: A raw map of all fetched events, useful for history.
    *   `activeMap`: A "materialized view" containing only the latest version of each video (deduplicated by `videoRootId` or `d` tag).
    *   `tombstones`: Tracks deleted events to prevent them from reappearing if an old relay broadcasts them.
3.  **Event Publishing**: Handles signing and broadcasting events (Kind 30078 video posts, Kind 1 metadata, etc.).
4.  **Buffering**: Implements a buffering strategy for incoming events to optimize UI rendering performance.
5.  **Caching**: Uses `EventsCacheStore` (IndexedDB + localStorage) to persist state across sessions for instant load times.
6.  **Signer Abstraction**: Manages different signing methods (NIP-07 extension, NIP-46 remote signer, local keys).

## Core Concepts

### Eventual Consistency & `activeMap`

Nostr is a decentralized protocol where events can arrive out of order or be duplicated across relays. The `activeMap` is critical for presenting a consistent view to the user.

*   **Logic**: When a new event arrives, `activeMap` only updates if the new event has a newer `created_at` timestamp than the existing entry for that `videoRootId` (or `d` tag).
*   **Deletions**: If an event is deleted (Kind 5 or explicit `deleted: true` flag), a "tombstone" is recorded. Future events with a timestamp older than the tombstone are ignored.

### Buffering Strategy (`subscribeVideos`)

To prevent the UI from freezing when thousands of events arrive during the initial connection:

1.  Incoming events are pushed into an `eventBuffer`.
2.  A debounced flush function processes the buffer every ~75ms.
3.  Events are processed in batches: validation, deduplication, and state updates happen in bulk.
4.  The UI is notified only once per batch.

### Caching (`EventsCacheStore`)

The client attempts to restore state immediately on load ("Stale-While-Revalidate"):

1.  **Restore**: `restoreLocalData` reads from IndexedDB (or localStorage fallback).
2.  **Display**: The UI renders cached content immediately.
3.  **Fetch**: The client connects to relays and fetches new events, updating the UI as they arrive.
4.  **Persist**: The `EventsCacheStore` periodically saves the current state to disk, using fingerprints to avoid unnecessary writes.

## Common Workflows

### 1. Publishing a Video
`publishVideo(videoPayload, pubkey)`

1.  Constructs the video metadata (Kind 30078).
2.  Signs the event using the active signer.
3.  Publishes to configured relays.
4.  **Side Effects**:
    *   If a hosted URL is present, publishes a NIP-94 mirror event (Kind 1063).
    *   If NIP-71 categorization tags are present, publishes a wrapper event (Kind 22).

### 2. Loading the Feed
`subscribeVideos(onVideo, options)`

1.  Checks cache for the latest timestamp.
2.  Subscribes to relays with `since` filter (if cached) or full history.
3.  Buffers incoming events.
4.  Updates `activeMap` and calls `onVideo` for valid updates.

## When to Modify

*   **New Event Kinds**: If adding support for a new NIP or event type, add handlers here.
*   **Performance Tuning**: Adjust buffering timeouts or cache policies in `EventsCacheStore` if UI responsiveness issues arise.
*   **Signer Logic**: If modifying how keys are handled (e.g., adding a new wallet adapter), update `signerHelpers.js` or `nip46Client.js`, but ensure `NostrClient` integrates it correctly.
