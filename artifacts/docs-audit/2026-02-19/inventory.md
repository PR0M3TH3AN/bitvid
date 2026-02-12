# Documentation Inventory - Upload & Contribution
Date: 2026-02-19
Source: `content/docs/guides/upload-content.md`

| Claim ID | Claim Description | Source Section | Code Location |
|----------|-------------------|----------------|---------------|
| C1 | Accepted video file types: `.mp4` (`video/mp4`), `.webm` (`video/webm`), `.mov` (`video/quicktime`), `.mkv` (`video/x-matroska`), `.ts` (`video/mp2t`), `.m3u8` (`application/x-mpegurl`), `.mpg` (`video/mpeg`), `.mpeg` (`video/mpeg`). | Supported Media & Limits | `components/upload-modal.html` (`input accept`), `js/storage/s3-multipart.js` (regex) |
| C2 | Accepted thumbnail types: `image/*`. | Supported Media & Limits | `components/upload-modal.html` (`input accept`) |
| C3 | Recommended file size up to 2GB (client-side limit). | File Size | `js/ui/components/UploadModal.js` (no hard limit found), `js/utils/torrentHash.js` (implicit memory constraint) |
| C4 | Metadata fields: Title (Required), Description, Thumbnail, Tags, Enable Comments, NSFW, For Kids. | Metadata & Options | `js/ui/components/UploadModal.js` (`handleSubmit`) |
| C5 | Advanced Options: Content Warning, Duration, Summary, IMETA, Web Seed (ws), Torrent File (xs). | Advanced Options (NIP-71) | `js/ui/components/UploadModal.js`, `js/ui/components/nip71FormManager.js` |
| C6 | CORS Configuration: AllowedMethods ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"]. | Step 2: Configure CORS | `js/storage/s3-multipart.js` (`ensureBucketCors`) |
| C7 | CORS Configuration: ExposeHeaders ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"]. | Step 2: Configure CORS | `js/storage/s3-multipart.js` (`ensureBucketCors`) |
| C8 | CORS Configuration: Automatic configuration attempts to configure CORS if `s3:PutBucketCORS` permission exists. | Step 2: Configure CORS | `js/services/s3Service.js` (`prepareS3Connection`), `js/storage/s3-multipart.js` (`ensureBucketCors`) |
