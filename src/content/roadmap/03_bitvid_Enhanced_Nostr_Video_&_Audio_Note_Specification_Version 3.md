# **bitvid: Enhanced Nostr Video/Audio Note Specification: Version 3**

This document updates the existing Version 2 specification by adding optional fields for adult content, multiple categories, extended metadata, audio/podcast features, and more. These changes remain backward-compatible so Version 2 clients can continue to display basic information.

---

## Overview

Nostr posts use **kind = 30078**, with a JSON structure stored in the `content` field. Version 3 retains all fields from Version 2 while adding new ones for richer functionality, easier filtering, and support for audio content.

---

## General Format

A typical note follows this format:

| **Field**     | **Type**       | **Description**                                                    |
|---------------|----------------|--------------------------------------------------------------------|
| `kind`        | Integer        | Fixed as `30078` for media-sharing events (video, music, etc.).    |
| `pubkey`      | String         | Public key of the note creator.                                    |
| `created_at`  | Integer        | Unix timestamp (seconds).                                          |
| `tags`        | Array of Arrays| Includes metadata such as `["t", "video"]` or `["t", "music"]` and `["d", "<id>"]`. |
| `content`     | JSON String    | JSON object containing the post data (detailed below).             |

---

## Post Content for Version 3

| **Field**         | **Type**               | **Description**                                                                                                      |
|-------------------|------------------------|----------------------------------------------------------------------------------------------------------------------|
| `version`         | Integer               | Now set to `3`.                                                                                                      |
| `deleted`         | Boolean               | Indicates soft deletion.                                                                                             |
| `isPrivate`       | Boolean               | `true` if content is private (magnet and certain optional fields may be encrypted).                                  |
| `title`           | String                | Title of the media (video title, track title, podcast episode, etc.).                                               |
| `magnet`          | String                | Magnet link for the primary media file (encrypted if `isPrivate = true`).                                            |
| `extraMagnets`    | Array (optional)      | Additional magnet links for multiple resolutions/versions (commonly used for video but can be used for audio too).   |
| `thumbnail`       | String (optional)     | URL or magnet link to a thumbnail image.                                                                             |
| `description`     | String (optional)     | Description of the media.                                                                                            |
| `mode`            | String                | Indicates `live` or `dev` mode for streaming or test scenarios.                                                     |
| `adult`           | Boolean (optional)    | `true` if content is adult-only. Default is `false` or omitted.                                                     |
| `categories`      | Array (optional)      | A list of categories or tags, e.g., `["comedy", "music"]`.                                                           |
| `language`        | String (optional)     | Language code (e.g., `en`, `es`).                                                                                    |
| `payment`         | String (optional)     | Monetization field, such as a Lightning address.                                                                     |
| `i18n`            | Object (optional)     | Holds internationalized fields (e.g., `{"title_en": "Hello", "title_es": "Hola"}`).                                  |
| `encryptedMeta`   | Boolean (optional)    | If `true`, indicates fields like `description` or `thumbnail` may be encrypted.                                      |
| **Audio/Podcast-Specific Fields** |                        |                                                                                                                      |
| `contentType`     | String (optional)     | Type of media, e.g., `"video"`, `"music"`, `"podcast"`, `"audiobook"`.                                               |
| `albumName`       | String (optional)     | Name of the album (if part of a music album).                                                                        |
| `trackNumber`     | Integer (optional)    | Track number in an album.                                                                                            |
| `trackTitle`      | String (optional)     | Track title if different from `title`.                                                                               |
| `podcastSeries`   | String (optional)     | Name of the podcast series.                                                                                          |
| `seasonNumber`    | Integer (optional)    | Season number for a podcast.                                                                                         |
| `episodeNumber`   | Integer (optional)    | Episode number for a podcast series.                                                                                 |
| `duration`        | Integer (optional)    | Duration in seconds (useful for audio or video players).                                                             |
| `artistName`      | String (optional)     | Main artist or presenter.                                                                                            |
| `contributors`    | Array (optional)      | List of additional contributors, e.g., `[{"name": "John", "role": "Producer"}]`.                                     |
| `audioQuality`    | Array (optional)      | Multiple magnet links with different audio formats or bitrates. Example: `[{"quality": "lossless", "magnet": "..."}]`.|
| `playlist`        | Array (optional)      | Array of magnet links or references forming a playlist (useful for albums or sets).                                  |

> **Note**: All fields except `version`, `deleted`, `isPrivate`, `title`, `magnet`, and `mode` are optional. You can omit fields that are not relevant to your post.

---

## Tagging

### `tags`
- Purpose: Quick lookups for content type, unique IDs, or user-defined categories.
- Examples:
  - `["t", "video"]` — Type indicator for videos.
  - `["t", "music"]` — Type indicator for audio/music.
  - `["d", "unique-identifier"]` — Unique ID for direct references.
  - `["adult", "true"]` — Optional. Some clients may store adult flags here rather than in `content`.

No changes are required for Version 3 tagging, but more detailed tags (e.g., `"music"`, `"podcast"`, or `"audiobook"`) can be used to help clients sort or filter specific media.

---

## Behavior Based on Privacy

### Public Posts
- `isPrivate = false`.
- Magnet and other fields are in plaintext.
- Visible to all users.

### Private Posts
- `isPrivate = true`.
- Main magnet link (and optional fields like `description` or `thumbnail`) are encrypted with the preferred encryption method.
- `extraMagnets` may also be encrypted if the user chooses.

---

## New or Expanded Features in Version 3

1. **Adult Content Flag**  
   - `adult: true` marks content as adult-only.
   - Clients can filter this by default.

2. **Multiple Categories**  
   - `categories` can hold several entries, e.g. `["comedy", "music"]`.
   - Advanced filtering is possible.

3. **Extended Metadata**  
   - Fields like `language`, `payment`, and custom data let creators provide more details.
   - Optional, so older clients ignore what they do not recognize.

4. **Multi-Resolution or Multi-Format Links**  
   - `extraMagnets` for video variants.  
   - `audioQuality` for different audio formats or bitrates.

5. **Internationalization (`i18n`)**  
   - Include translated or localized titles, descriptions, and more.

6. **Encrypted Metadata**  
   - `encryptedMeta: true` to signal that certain fields (e.g., `description`, `thumbnail`) may be encrypted.

7. **Audio, Podcast, Audiobook Support**  
   - New optional fields: `contentType`, `albumName`, `trackNumber`, `podcastSeries`, etc.  
   - `playlist` can reference multiple tracks under one post.

---

Below is a section you can drop into your Version 3 specification. It expands on filtering logic for adult content and outlines a basic submission flow to help implementers. Feel free to adjust headings or formatting as needed.

---

## Filtering Logic and Submission Flow

### Filtering Logic

1. **Adult Content Detection**  
   - To mark posts as adult-only, set `adult = true` inside the content object (e.g., `"adult": true`) or include `["adult", "true"]` in the `tags` array.  
   - Clients should exclude these posts by default unless users explicitly enable adult content in their settings or preferences.

2. **Category-Based Filtering**  
   - If `categories` is present (e.g., `["comedy", "music"]`), clients can allow users to search or filter based on these entries.  
   - Alternatively, if tags such as `["t", "video"]` or `["category", "comedy"]` are used, handle them in the same way by grouping or filtering.

3. **Default UI Behavior**  
   - Provide a toggle or checkbox for “Show Adult Content.” If unchecked, do not display posts marked as adult content.  
   - Offer a dropdown or checkbox list for category filters. Only display posts that match selected categories.

4. **Edge Cases**  
   - If both `adult = true` and one or more categories are set, the post should remain hidden unless the user opts into adult content, even if it matches other selected categories.  
   - When a post omits `adult`, assume it is not adult content unless the user or platform policy states otherwise.

### Submission Flow Example

Below is a simple illustration of how a client could guide users when creating or editing a post:

1. **User Fills Out the Form**  
   - Title, magnet link, description, and any other relevant fields.

2. **Set the Version**  
   - When adding new Version 3 features (e.g., multiple categories, adult flag), ensure `version` is set to `3`.  
   - If editing a Version 2 post to add adult or category data, update `version` to `3`.

3. **Adult Content Checkbox**  
   - If the user marks the post as adult-only, set `"adult": true` in `content` or include `["adult", "true"]` in `tags`.  
   - If not marked, leave the field out or set it to `false`.

4. **Category Selection**  
   - Let users select categories (e.g., “comedy,” “music,” “gaming”). Store them in `categories` or as tags (`["category", "comedy"]`).

5. **Publish**  
   - Create the Nostr event with `kind = 30078`.  
   - In the `content` field (as JSON), include the user-provided data plus the new fields (e.g., `adult`, `categories`).  
   - In the `tags` array, ensure `["t", "video"]` or any other relevant tags. Add `["adult", "true"]` if needed.

6. **Post-Submission**  
   - When the post is published, clients or relays can immediately filter or categorize it according to the adult flag and categories.  
   - Users who opted in to adult content see the post, while others do not.

This process helps developers maintain a consistent approach to adult content handling, category-based filtering, and integration of new Version 3 features.

---

## Editing and Deleting Posts

### Editing
- Retain the same `["d", "<unique-id>"]` tag.
- Update or add new fields (e.g., adding `extraMagnets` or switching `contentType` to `"music"`).
- When moving from `version=2` to `version=3`, older clients ignore new fields but still see basic fields like `title` and `magnet`.

### Deletion
- Mark `deleted: true` in the `content`.
- Remove or encrypt sensitive fields (e.g., `magnet`, `description`) so they are not visible to others.

---

## Example Post: Version 3 (Video)

```jsonc
{
  "kind": 30078,
  "pubkey": "npub1...",
  "created_at": 1700000000,
  "tags": [
    ["t", "video"],
    ["d", "unique-identifier"]
    // ["adult", "true"] // optional if storing adult info in tags
  ],
  "content": "{
    \"version\": 3,
    \"deleted\": false,
    \"isPrivate\": false,
    \"adult\": true,
    \"categories\": [\"comedy\", \"pranks\"],
    \"title\": \"Funny Prank Video\",
    \"magnet\": \"magnet:?xt=urn:btih:examplehash\",
    \"extraMagnets\": [
      \"magnet:?xt=urn:btih:examplehashHD\",
      \"magnet:?xt=urn:btih:examplehashMobile\"
    ],
    \"thumbnail\": \"https://example.com/thumb.jpg\",
    \"description\": \"An adult-oriented prank video.\",
    \"mode\": \"live\",
    \"language\": \"en\",
    \"payment\": \"alice@getalby.com\",
    \"i18n\": {
      \"title_es\": \"Video de broma chistosa\",
      \"description_es\": \"Un video de bromas para adultos.\"
    }
  }"
}
```

---

## Example Post: Version 3 (Music Track)

```jsonc
{
  "kind": 30078,
  "pubkey": "npub1...",
  "created_at": 1700000000,
  "tags": [
    ["t", "music"],
    ["d", "unique-id-for-track"]
  ],
  "content": "{
    \"version\": 3,
    \"deleted\": false,
    \"isPrivate\": false,
    \"contentType\": \"music\",
    \"title\": \"Amazing Track\",
    \"trackTitle\": \"Amazing Track\",
    \"albumName\": \"Great Album\",
    \"trackNumber\": 1,
    \"artistName\": \"Awesome Artist\",
    \"duration\": 300,
    \"magnet\": \"magnet:?xt=urn:btih:examplehash\",
    \"audioQuality\": [
      {
        \"quality\": \"lossless\",
        \"magnet\": \"magnet:?xt=urn:btih:losslessHash\"
      },
      {
        \"quality\": \"mp3\",
        \"magnet\": \"magnet:?xt=urn:btih:mp3Hash\"
      }
    ],
    \"description\": \"This is an amazing track from the Great Album.\",
    \"categories\": [\"music\", \"pop\"],
    \"contributors\": [
      { \"name\": \"John Doe\", \"role\": \"Producer\" },
      { \"name\": \"Jane Smith\", \"role\": \"Writer\" }
    ]
  }"
}
```

---

## Example Post: Version 3 (Playlist or Album)

```jsonc
{
  "kind": 30078,
  "pubkey": "npub1...",
  "created_at": 1700000000,
  "tags": [
    ["t", "playlist"],
    ["d", "unique-id-for-playlist"]
  ],
  "content": "{
    \"version\": 3,
    \"deleted\": false,
    \"isPrivate\": false,
    \"title\": \"Chill Vibes Playlist\",
    \"contentType\": \"music\",
    \"playlist\": [
      \"magnet:?xt=urn:btih:hashTrack1\",
      \"magnet:?xt=urn:btih:hashTrack2\",
      \"magnet:?xt=urn:btih:hashTrack3\"
    ],
    \"description\": \"Curated set of relaxing tracks.\",
    \"categories\": [\"music\", \"chill\"]
  }"
}
```

---

## Transition Plan from Version 2 to 3

1. **Backward Compatibility**  
   - All new fields are optional.  
   - Version 2 clients still see basic fields like `title` and `magnet`.

2. **Gradual Roll-Out**  
   - Existing posts remain at `version=2`.  
   - Users can adopt `version=3` when editing or creating new posts with extra features.

3. **Client Handling**  
   - If a client detects `version=3`, it can display or parse additional fields.  
   - Otherwise, it treats posts with older logic.

4. **Relay Compatibility**  
   - The same `kind=30078` is used.  
   - Relays generally store the data as-is.

5. **Potential Breaking Changes**  
   - If certain new fields are mandatory in your app, older clients may not parse them.  
   - Keep new features optional where possible.

---

## Summary

Version 3 extends the specification to include adult flags, multi-category tagging, multi-resolution magnet links, internationalization, and now audio-specific fields like `contentType = "music"`, `podcastSeries`, and `playlist`. Older clients can keep working without error, while new clients can take advantage of these extra fields for better organization and search.