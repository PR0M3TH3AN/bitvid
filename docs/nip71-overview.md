# NIP-71 Video Events Module (`js/nostr/nip71.js`)

This module implements the **NIP-71** specification for video events in BitVid. It handles the lifecycle of video metadata, including creation, parsing, caching, and association with playable video notes (Kind 30078).

## Core Responsibilities

1.  **Event Building**: Constructs NIP-71 events (Kind 22/21) with standardized tags (`imeta`, `segment`, `p`, etc.).
2.  **Parsing**: Extracts structured metadata from raw Nostr events.
3.  **Caching**: Manages a memory cache of NIP-71 metadata, indexed by video root ID, event ID, and `d` tags.
4.  **Hydration**: Merges cached NIP-71 metadata into legacy or standard video objects for the UI.

## Typical Data Flow

### 1. Publishing a Video
When a user uploads a video, `Nip71FormManager` (in `js/ui/`) collects metadata and calls:
```javascript
import { buildNip71VideoEvent } from './js/nostr/nip71.js';

const event = buildNip71VideoEvent({
  metadata: { ... }, // title, summary, imeta, etc.
  pubkey: userPubkey,
  title: "My Video",
  pointerIdentifiers: { videoRootId: "..." }
});
// Sign and publish `event`
```

### 2. Viewing the Feed
The app fetches video notes (Kind 30078) and potential NIP-71 metadata events (Kind 22/21).
1.  **Ingestion**: `processNip71Events(events, { nip71Cache })` parses incoming NIP-71 events and updates the cache.
2.  **Hydration**: `mergeNip71MetadataIntoVideo(video, { nip71Cache })` attaches the best available metadata to the video object.
   - It checks `videoRootId` -> `eventId` -> `d` tag priority.
   - Falls back to the most recent metadata if specific pointers miss.

## Key Exports

| Function | Purpose |
|----------|---------|
| `buildNip71VideoEvent` | Creates a signed-ready NIP-71 event object. |
| `extractNip71MetadataFromTags` | Parses a raw event into `{ metadata, pointers }`. |
| `processNip71Events` | Updates the global `nip71Cache` with new events. |
| `mergeNip71MetadataIntoVideo` | Enriches a video object with cached metadata. |
| `populateNip71MetadataForVideos` | Batch-fetches metadata for a list of videos (if missing). |

## Invariants & Assumptions

-   **Video Root ID**: The stable identifier for a video series/content, usually the `d` tag of the first Kind 30078 note.
-   **Cache Structure**: The `nip71Cache` is a `Map<VideoRootId, CacheEntry>`.
-   **Immutability**: Metadata objects in the cache are cloned before being attached to video objects to prevent mutation side-effects.

## When to Refactor
-   If the cache logic becomes too complex or memory-intensive, move `nip71Cache` to a dedicated `Nip71Service` or `CacheService`.
-   If NIP-71 spec changes significantly, versioning logic in `extractNip71MetadataFromTags` may need expansion.
