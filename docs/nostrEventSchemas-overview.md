# Nostr Event Schemas (`js/nostrEventSchemas.js`)

This module is the central definition for all Nostr event kinds, tags, and content structures used in the application. It provides builder functions to construct valid events and validation logic to ensure compliance with the defined schemas.

## Purpose

*   **Centralized Definitions**: Maps application-specific event types (e.g., `VIDEO_POST`) to Nostr Kinds (e.g., `30078`) and required tags.
*   **Event Builders**: Pure functions that take parameters and return a signed-ready event object (excluding the signature).
*   **Validation**: Development-mode validation to catch malformed events before they are signed or published.
*   **Sanitization**: Helpers to clean and normalize input data (e.g., UTF-8 enforcement, tag normalization).

## Public API

### Constants

*   `NOTE_TYPES`: An enum of all supported event types (e.g., `NOTE_TYPES.VIDEO_POST`, `NOTE_TYPES.ZAP_REQUEST`).
*   `KIND_MUTE_LIST`: The kind number for NIP-51 Mute Lists (10000).

### Builder Functions

Each builder function accepts a parameters object and returns a standard Nostr event object:
`{ kind, pubkey, created_at, tags, content }`.

Common parameters:
*   `pubkey`: The hex public key of the author.
*   `created_at`: Unix timestamp (in seconds).
*   `additionalTags`: Array of extra tags to append (e.g., `[['t', 'hashtag']]`).

**Key Builders:**

*   `buildVideoPostEvent(params)`: Constructs a Kind 30078 video metadata event.
*   `buildVideoCommentEvent(params)`: Constructs a Kind 1111 comment event.
*   `buildVideoReactionEvent(params)`: Constructs a Kind 7 reaction event.
*   `buildRepostEvent(params)`: Constructs a Kind 6 (Repost) or Kind 16 (Generic Repost).
*   `buildZapRequestEvent(params)`: Constructs a Kind 9734 zap request.
*   `buildViewEvent(params)`: Constructs a view analytics event (Kind 30078 variant).

### Schema & Validation

*   `getNostrEventSchema(type)`: Returns the schema configuration for a given `NOTE_TYPE`.
*   `validateEventStructure(type, event)`: checks if an event object matches the schema for `type`.
*   `setNostrEventSchemaOverrides(overrides)`: Allows runtime injection of schema overrides (useful for feature flags or testing).

## Usage Example

```javascript
import { NOTE_TYPES, buildVideoPostEvent } from './nostrEventSchemas.js';

const params = {
  pubkey: '...hex_pubkey...',
  created_at: Math.floor(Date.now() / 1000),
  dTagValue: 'my-video-slug',
  content: {
    title: 'My Awesome Video',
    videoRootId: 'my-video-slug',
    url: 'https://example.com/video.mp4',
    thumbnail: 'https://example.com/thumb.jpg'
  },
  additionalTags: [['t', 'art']]
};

const event = buildVideoPostEvent(params);

// Result:
// {
//   kind: 30078,
//   pubkey: '...',
//   created_at: ...,
//   tags: [['d', 'my-video-slug'], ['t', 'video'], ['t', 'art'], ['s', 'nostr:my-video-slug']],
//   content: '{"title":"My Awesome Video",...}'
// }
```

## Internal Details

### Schema Configuration
Each entry in `BASE_SCHEMAS` defines:
*   `kind`: The Nostr event kind.
*   `requiredTagNames`: List of tag names that must be present.
*   `identifierTag`: Configuration for NIP-33 `d` tags.
*   `appendTags`: Fixed tags to always include.
*   `content`: Format specification (`json`, `text`, `empty`, etc.).

### Sanitization
*   `ensureValidUtf8Content`: Ensures the `content` field contains valid UTF-8, stripping invalid surrogates to prevent relay rejection.
*   `sanitizeAdditionalTags`: Normalizes user-provided tags (trimming strings, handling pointers).
