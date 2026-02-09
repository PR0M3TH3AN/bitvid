# Validation Report

This report documents the verification of user-facing documentation in `/content` against the codebase.

## 1. Storage Configuration (CORS)

**Claim:** Users must configure CORS with specific headers to allow browser uploads.
**Source:** `content/docs/guides/upload-content.md`
**Code:** `js/storage/s3-multipart.js` (function `ensureBucketCors`)

**Verification:**
The `ensureBucketCors` function hardcodes the following CORS rules:
- `AllowedHeaders`: `["*"]` (Matches docs)
- `AllowedMethods`: `["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"]` (Matches docs, order irrelevant)
- `ExposeHeaders`: `["ETag", "Content-Length", "Content-Range", "Accept-Ranges"]` (Matches docs)
- `MaxAgeSeconds`: `3600` (Matches docs)

The `AllowedOrigins` in code is dynamic (`allowedOrigins` variable), while the docs provide a concrete example (`["http://localhost:5500", "https://bitvid.network"]`) which is correct for users.

## 2. File Type Limits

**Claim:** Accepted file types are `.mp4, .webm, .mov, .mkv, .ts, .m3u8, .mpg, .mpeg`.
**Source:** `content/docs/guides/upload-content.md`
**Code:** `components/upload-modal.html`

**Verification:**
The input element is defined as:
```html
<input id="input-file" type="file" class="hidden" accept="video/*,.m3u8,.ts,.mp4,.webm,.mov,.mkv,.mpg,.mpeg" />
```
The documentation matches the specific extensions listed in the code. The docs now also clarify that "other standard video formats" are accepted via `video/*`.

## 3. File Size Limit

**Claim:** Recommended limit is 2GB due to browser memory.
**Source:** `content/docs/guides/upload-content.md`
**Code:** `js/utils/torrentHash.js`

**Verification:**
The client-side hashing logic uses `FileReader.readAsArrayBuffer(file)`. This loads the entire file into memory. Browser implementations (especially Chrome) typically crash or fail when allocating ArrayBuffers larger than ~2GB. This technical constraint confirms the documentation's warning.

## 4. Moderation (Whitelist Mode)

**Claim:** "Whitelist Mode" restricts visibility to approved accounts.
**Source:** `content/docs/guides/upload-content.md` & `getting-started.md`
**Code:** `js/accessControl.js`

**Verification:**
The `AccessControl` class implements `canAccess(candidate)`:
```javascript
if (this.whitelistEnabled && !this.whitelistPubkeys.has(hex)) {
    return false;
}
```
If `whitelistEnabled` is true (Whitelist Mode), non-whitelisted pubkeys return `false`, blocking their content from being displayed in feeds that use this check. This confirms the documentation.

## 5. Upload Lifecycle

**Claim:** Direct upload to bucket -> Client-side hashing -> NIP-71/Nostr publication.
**Source:** `content/docs/guides/upload-content.md`
**Code:** `js/ui/components/UploadModal.js`

**Verification:**
`handleVideoSelection` in `UploadModal.js`:
1.  Calls `service.uploadFile` (Direct upload to R2/S3).
2.  Calls `generateTorrentMetadata` (Client-side hashing).
3.  Calls `publish` -> `publishVideoNote` (Nostr publication).

This flow matches the documentation exactly.
