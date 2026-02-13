# Documentation Inventory

| Page | Claim | Code Location | Verified? |
|------|-------|---------------|-----------|
| `content/docs/guides/upload-content.md` | Accepted Video Types: `.mp4`, `.webm`, `.mov`, `.mkv`, `.ts`, `.m3u8`, `.mpg`, `.mpeg` | `components/upload-modal.html` (input accept attribute) | Yes |
| `content/docs/guides/upload-content.md` | Accepted Thumbnail Types: `image/*` | `components/upload-modal.html` (input accept attribute) | Yes |
| `content/docs/guides/upload-content.md` | File Size Recommended: Up to 2GB (Client-side hashing limit) | `js/utils/torrentHash.js` (in-memory buffer usage impl) | Yes |
| `content/docs/guides/upload-content.md` | Required Metadata: Title | `js/services/videoNotePayload.js` (`VIDEO_NOTE_ERROR_CODES.MISSING_TITLE`) | Yes |
| `content/docs/guides/upload-content.md` | Required Source: URL, Magnet, or IMETA | `js/services/videoNotePayload.js` (`VIDEO_NOTE_ERROR_CODES.MISSING_SOURCE`) | Yes |
| `content/docs/guides/upload-content.md` | HTTPS required for External URLs | `js/services/videoNotePayload.js` (`VIDEO_NOTE_ERROR_CODES.INVALID_URL_PROTOCOL`) | Yes |
| `content/docs/guides/upload-content.md` | CORS Policy JSON | `js/storage/s3-multipart.js` (`ensureBucketCors`) | Yes |
| `content/docs/guides/upload-content.md` | Automatic CORS Configuration | `js/services/s3Service.js` (`prepareS3Connection` calls `ensureBucketCors`) | Yes |
| `content/docs/guides/upload-content.md` | Upload Methods: R2, S3, External, Magnet | `js/ui/components/UploadModal.js`, `js/services/s3UploadService.js` | Yes |
