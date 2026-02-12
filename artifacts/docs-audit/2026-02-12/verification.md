# Verification Report

## 1. Accepted File Types
- **Claim**: `.mp4`, `.webm`, `.mov`, `.mkv`, `.ts`, `.m3u8`, `.mpg`, `.mpeg`.
- **Code**: `components/upload-modal.html`
  ```html
  <input id="input-file" type="file" class="hidden" accept="video/*,.m3u8,.ts,.mp4,.webm,.mov,.mkv,.mpg,.mpeg" />
  ```
- **Status**: **Verified**.

## 2. File Size Limits
- **Claim**: 2GB recommended due to browser memory hashing.
- **Code**: `js/services/s3UploadService.js` calls `this.deps.calculateTorrentInfoHash(file)`. `js/utils/torrentHash.js` reads file into memory/buffer for hashing.
- **Status**: **Verified**.

## 3. Metadata Validation
- **Claim**: Title required. HTTPS for URLs.
- **Code**: `js/services/videoNotePayload.js`:
  ```javascript
  if (!legacyFormData.title) errors.push(VIDEO_NOTE_ERROR_CODES.MISSING_TITLE);
  if (legacyFormData.url && !/^https:\/\//i.test(legacyFormData.url)) errors.push(VIDEO_NOTE_ERROR_CODES.INVALID_URL_PROTOCOL);
  ```
- **Status**: **Verified**.

## 4. CORS Policy
- **Claim**: JSON policy provided in docs.
- **Code**: `js/storage/s3-multipart.js` `ensureBucketCors` constructs the policy dynamically but matches the structure (AllowedOrigins, AllowedMethods, AllowedHeaders=["*"], ExposeHeaders=[ETag, ...]).
- **Status**: **Verified**.

## 5. Upload Lifecycle
- **Claim**: "The client handles the upload, generates a magnet link...".
- **Code**: `js/ui/components/UploadModal.js` `handleVideoSelection` uploads video, then calls `generateTorrentMetadata`, then uploads `.torrent` file if successful.
- **Gap**: Docs do not explicitly mention that a `.torrent` file is also uploaded to the bucket.
- **Recommendation**: Update docs to mention `.torrent` file generation and upload.

## 6. S3/R2 Configuration
- **Claim**: Supports S3 and R2.
- **Code**: `js/services/s3Service.js` and `js/services/storageService.js` handle these providers.
- **Status**: **Verified**.
