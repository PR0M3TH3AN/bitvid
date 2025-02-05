# **bitvid: Enhanced Nostr Video/Audio Note Specification: Version 3**

This specification updates the previous version (Version 2) and introduces:

1. **videoRootId**: A dedicated field in the JSON content to group related edits and deletes under one “root” post.
2. **Support for Audio/Podcast**: Additional fields for music/podcast metadata.
3. **Adult Content, Multi-Category, and Extended Metadata**: Optional fields to handle specialized use cases.
4. **Backward Compatibility**: Clients implementing Version 2 can still display the basic fields.

---

## **1. Overview**

Nostr posts of **kind = 30078** are used for sharing media (videos, audio, podcasts, etc.). The JSON payload goes into the `content` field, while tags array can store quick references like `["t", "video"]` or `["d", "<unique-id>"]`.

### **Key Concepts**

- **videoRootId**: A unique identifier stored in the `content` JSON.
  - Ensures multiple edits or a delete event are recognized as referring to the same underlying post.
  - If missing (legacy posts), clients may fall back to the d-tag or event ID to group events, but using `videoRootId` is strongly recommended for consistent overshadow logic.
- **Backward Compatibility**: All newly introduced fields are optional. Version 2 clients see fields like `title`, `magnet`, `description`, but ignore new fields such as `adult`, `audioQuality`, etc.

---

## **2. Event Structure**

A typical event:

| **Field**    | **Type**      | **Description**                                                                            |
| ------------ | ------------- | ------------------------------------------------------------------------------------------ |
| `kind`       | Integer       | Fixed at `30078` for these media notes.                                                    |
| `pubkey`     | String        | Creator’s pubkey in hex.                                                                   |
| `created_at` | Integer       | Unix timestamp (seconds).                                                                  |
| `tags`       | Array         | Includes metadata such as `["t", "video"]` or `["t", "music"]` and `["d", "<unique-id>"]`. |
| `content`    | String (JSON) | JSON specifying metadata (see table below).                                                |

---

## **3. Version 3 Content JSON**

| **Field**                         | **Type**           | **Description**                                                                                                            |
| --------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `videoRootId`                     | String (optional)  | A stable root ID used to link multiple versions (edits) and a delete event together. **Recommended** for overshadow logic. |
| `version`                         | Integer            | Now set to `3`.                                                                                                            |
| `deleted`                         | Boolean            | `true` marks the post as “soft deleted.”                                                                                   |
| `isPrivate`                       | Boolean            | Indicates if `magnet` (and possibly other fields) are encrypted.                                                           |
| `title`                           | String             | Display title for the media.                                                                                               |
| `magnet`                          | String             | Magnet link for primary media (encrypted if `isPrivate = true`).                                                           |
| `extraMagnets`                    | Array (optional)   | Additional magnet links (e.g., multiple resolutions).                                                                      |
| `thumbnail`                       | String (optional)  | URL or magnet link to a thumbnail image (encrypted if `isPrivate = true` and `encryptedMeta = true`).                      |
| `description`                     | String (optional)  | A textual description (encrypted if `isPrivate = true` and `encryptedMeta = true`).                                        |
| `mode`                            | String             | Typically `live` or `dev`.                                                                                                 |
| `adult`                           | Boolean (optional) | `true` if content is adult-only. Default: `false` or omitted.                                                              |
| `categories`                      | Array (optional)   | Array of categories, e.g. `["comedy", "music"]`.                                                                           |
| `language`                        | String (optional)  | Language code (e.g. `"en"`, `"es"`).                                                                                       |
| `payment`                         | String (optional)  | Monetization field (e.g. a Lightning address).                                                                             |
| `i18n`                            | Object (optional)  | Internationalization map (e.g. `{"title_en": "...", "description_es": "..."}`).                                            |
| `encryptedMeta`                   | Boolean (optional) | Indicates if fields like `description` or `thumbnail` are encrypted.                                                       |
| **Audio/Podcast-Specific Fields** |                    |                                                                                                                            |
| `contentType`                     | String (optional)  | E.g., `"video"`, `"music"`, `"podcast"`, `"audiobook"`.                                                                    |
| `albumName`                       | String (optional)  | Name of the album (for music).                                                                                             |
| `trackNumber`                     | Integer (optional) | Track number in an album.                                                                                                  |
| `trackTitle`                      | String (optional)  | Track title if different from `title`.                                                                                     |
| `podcastSeries`                   | String (optional)  | Name of the podcast series.                                                                                                |
| `seasonNumber`                    | Integer (optional) | Season number for a podcast.                                                                                               |
| `episodeNumber`                   | Integer (optional) | Episode number for a podcast series.                                                                                       |
| `duration`                        | Integer (optional) | Duration in seconds (useful for audio or video players).                                                                   |
| `artistName`                      | String (optional)  | Artist or presenter name.                                                                                                  |
| `contributors`                    | Array (optional)   | List of additional contributors, e.g. `[{"name": "X", "role": "Producer"}]`.                                               |
| `audioQuality`                    | Array (optional)   | Array of objects indicating different audio bitrates/formats, each with a magnet link.                                     |
| `playlist`                        | Array (optional)   | For multi-track or multi-episode sets, e.g. `[ "magnet1", "magnet2" ]`.                                                    |

> **Note**: All fields except `version`, `deleted`, `title`, `magnet`, and `videoRootId` are optional. If an older post lacks `videoRootId`, fallback grouping may rely on the `d` tag or event ID.

---

## **4. Using `videoRootId`**

- **Purpose**: Ensures all edits and a final delete event share the same “root.”
- **Edit**: Keep the same `videoRootId` in the new content so clients know it’s an update of the same item.
- **Delete**: Reuse the same `videoRootId` (and typically the same `d` tag). Mark `deleted = true` to overshadow the old event.

**Fallback**: Legacy or older notes might not have a `videoRootId`. Clients can group them by `["d", "<id>"]` or treat the old event’s own ID as its “root.” However, for new posts, **always** set `videoRootId`.

---

## **5. Example Post: Version 3 (Video)**

```jsonc
{
  "kind": 30078,
  "pubkey": "npub1...",
  "created_at": 1700000000,
  "tags": [
    ["t", "video"],
    ["d", "my-unique-handle"]
  ],
  "content": "{
    \"videoRootId\": \"root-1678551042-abc123\",
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

- **videoRootId**: `root-1678551042-abc123` ensures future edits or deletes reference the same item.
- If `deleted = true`, the client sees it as a soft delete overshadowing the original.

---

## **6. Example Post: Version 3 (Audio)**

```jsonc
{
  "kind": 30078,
  "pubkey": "npub1...",
  "created_at": 1700000001,
  "tags": [
    ["t", "music"],
    ["d", "my-song-handle"]
  ],
  "content": "{
    \"videoRootId\": \"root-1678551042-xyz999\",
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
    \"description\": \"A track from the Great Album.\",
    \"categories\": [\"music\", \"pop\"],
    \"contributors\": [
      { \"name\": \"John Doe\", \"role\": \"Producer\" },
      { \"name\": \"Jane Smith\", \"role\": \"Writer\" }
    ]
  }"
}
```

- **videoRootId**: `root-1678551042-xyz999` used to link edits/deletes.

---

## **7. Tagging**

- `["t", "video"]` or `["t", "music"]` for quick type references.
- `["d", "<unique-handle>"]` for a stable “address” pointer.
- You can store adult flags or categories in tags, e.g. `["adult", "true"]` or `["category", "comedy"]`.
- However, storing them inside `content` (e.g. `adult=true` or `categories=["comedy"]`) is generally recommended so older clients can ignore them gracefully.

---

## **8. Handling Edits and Deletes**

### **8.1 Edits**

1. **videoRootId**: Keep the same `videoRootId` to overshadow the previous version.
2. **version**: Bump from `2` → `3` or `3` → a higher sub-version if you wish to track changes.
3. **tags**: Typically reuse `["d", "<unique-handle>"]` or create a new d-tag. The important part is to keep `videoRootId` consistent.

### **8.2 Deletion**

1. **deleted = true**: Mark the item as deleted in the `content` JSON.
2. **Remove or encrypt** sensitive fields (`magnet`, `description`, etc.).
3. **videoRootId**: Must remain the same as the original so clients remove/overshadow the old item.
4. **subscribeVideos** Logic:
   ```js
   if (video.deleted) {
     // remove from activeMap or overshadow the old entry
   }
   ```
5. **fetchVideos** Logic:
   ```js
   for (const [id, video] of allEvents.entries()) {
     if (video.deleted) continue; // skip deleted
     // ...
   }
   ```

---

## **9. Filtering Logic**

1. **Adult Content**: If `adult = true`, clients typically hide the post unless the user enables adult content in settings.
2. **Categories**: Provide optional grouping or searching by `categories`.
3. **Language**: If specified, clients can filter by language.
4. **Encryption**: If `isPrivate = true`, some fields (e.g., `magnet`) may need client-side decryption.

---

## **10. Submission Flow**

1. **Client Form**: Title, magnet link, optional category checkboxes, adult toggle, etc.
2. **videoRootId**: For new posts, generate a new root ID. For edits, reuse the old post’s root ID.
3. **Publish**:
   - `kind = 30078`
   - `content` → JSON with `videoRootId`, `version=3`, `title`, `magnet`, etc.
   - `tags` → e.g., `["t","video"]`, `["d","my-handle"]`.
4. **Visibility**: If `adult=true`, hide from minors or default searches. If `deleted=true`, overshadow old entry.

---

## **11. Example “Delete” Flow**

1. **Original Post** (not deleted):
   ```json
   {
     "content": "{
       \"videoRootId\": \"root-1234\",
       \"version\": 3,
       \"deleted\": false,
       \"title\": \"My Video\",
       \"magnet\": \"magnet:?xt=hash\"
       // ...
     }"
   }
   ```
2. **Delete Post** (new event):
   ```jsonc
   {
     "kind": 30078,
     "pubkey": "...",
     "tags": [
       ["t","video"],
       ["d","my-handle"] // same d-tag
     ],
     "content": "{
       \"videoRootId\": \"root-1234\", // same root as original
       \"version\": 3,
       \"deleted\": true,
       \"title\": \"My Video\",
       \"magnet\": \"\",   // blank or removed
       \"description\": \"Video was deleted by creator.\"
     }"
   }
   ```
3. **subscribeVideos** sees `deleted=true` and overshadow logic removes the old item from active view.

---

## **12. Backward Compatibility**

- **Version 2** fields remain recognized: `title`, `magnet`, `mode`, etc.
- **Older Clients**: Ignore fields like `videoRootId`, `categories`, `adult`, etc.
- **When Upgrading**: If you add `videoRootId` or adult flags to an older post, older clients still display basic info but won’t filter on the new fields.

---

## **13. Summary**

**Version 3** is a superset of previous versions, adding:

1. **videoRootId** for overshadow logic and grouping multi-edit threads.
2. **Adult content flag**, multi-category, i18n, and other optional fields.
3. **Audio/podcast support**: fields like `contentType = "music"`, `podcastSeries`, `episodeNumber`, and `playlist`.

Clients that implement these features can sort, filter, or display richer media experiences while remaining compatible with older Nostr note readers.

---

**End of Document**

This expanded spec ensures that **videoRootId** is used consistently, clarifies how to handle adult content, and extends the data model for new media types. By following this Version 3 guidance, you’ll maintain backward compatibility while enabling advanced features for media sharing on Nostr.
