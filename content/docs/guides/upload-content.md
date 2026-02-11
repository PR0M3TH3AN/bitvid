# How to Upload Content

bitvid is a decentralized platform that supports multiple ways to share video content. For direct uploads, we support **Cloudflare R2** and **S3-compatible** storage backends (like MinIO, DigitalOcean Spaces, or AWS S3), allowing you to upload files directly from your browser to a high-performance storage bucket.

## Upload Methods

bitvid offers three ways to publish content:

1.  **Direct Upload:** Upload a video file from your device to your configured storage bucket (R2 or S3). The client handles the upload, generates a magnet link for WebTorrent, and publishes the metadata to Nostr.
2.  **External Link:** Provide a direct URL to a video file hosted elsewhere (e.g., on a personal server or another CDN). This URL serves as the primary playback source. **Note:** External URLs must use **HTTPS**.
3.  **Magnet Link:** Assist the network by providing a magnet link for an existing torrent. Note that magnet-only uploads require at least one active seeder to be playable.

## Supported Media & Limits

Before you start, ensure your content meets the following requirements:

### Accepted File Types

- **Video:** `.mp4` (`video/mp4`), `.webm` (`video/webm`), `.mov` (`video/quicktime`), `.mkv` (`video/x-matroska`), `.ts` (`video/mp2t`), `.m3u8` (`application/x-mpegurl`), `.mpg` (`video/mpeg`), `.mpeg` (`video/mpeg`).
- **Thumbnail:** Any standard image format (`image/*`) supported by your browser.

> **Note:** The file picker restricts selection to these formats, but the backend handles standard video MIME types (`video/*`). Ensure your container format is supported by modern browsers for playback.

### File Size

- **Recommended:** Up to **2GB** per file.
- **Why?** Browser-based uploads rely on your device's memory for hashing (to generate the WebTorrent info hash). Files larger than 2GB may cause browser instability or crashes depending on your available RAM.

## Metadata & Options

When publishing a video, you can configure the following:

### Basic Info

- **Title:** **Required**.
- **Description:** Optional.
- **Thumbnail:** Optional (URL or upload).
- **Tags (Hashtags):** Optional but highly recommended for discoverability.

### Audience & Engagement

- **Enable Comments:** Toggle to allow or disable comments on your video.
- **NSFW:** Mark content as "Not Safe For Work" (e.g., artistic nudity, sensitive topics).
- **For Kids:** Mark content as specifically made for children.

### Advanced Options (NIP-71)

For power users and technical configurations, toggle the "Advanced Options" section to access:

- **Content Warning:** A text label for sensitive content (automatically set to "NSFW" if the NSFW toggle is on).
- **Duration:** Manually specify the video duration in seconds.
- **Summary:** A short summary separate from the full description.
- **IMETA (Video Variants):** Define alternative video sources, resolutions, or MIME types.
  - **MIME:** (e.g., `video/mp4`)
  - **Dimensions:** (e.g., `1920x1080`)
  - **URL:** Direct link to the video file
  - **Magnet:** Info hash or magnet link
- **Web Seed (ws):** Manually provide a web seed URL for the torrent.
- **Torrent File (xs):** Manually provide a URL to a `.torrent` file.

## Step-by-Step Guide: Direct Upload

### 1. Create a Bucket & Enable Public Access

1. Log in to your provider's dashboard (e.g., Cloudflare).
2. Create a new bucket (e.g., `my-bitvid-videos`).
3. **Enable Public Access**:
   - **Cloudflare R2**: Go to **Settings** > **Public Access** and enable "R2.dev subdomain" or connect a custom domain.
   - **S3 Compatible**: Ensure the bucket policy allows public read access for objects.
4. **Copy the Public Bucket URL** (e.g., `https://pub-xxxxxx.r2.dev`). You will need this later.

### 2. Configure CORS

To allow your browser to upload files directly to the storage bucket, you must allow Cross-Origin Resource Sharing (CORS).

**Automatic Configuration:**
bitvid will attempt to configure CORS automatically for you when you initiate an upload, provided your API credentials have the `s3:PutBucketCORS` permission.

**Manual Configuration (Fallback):**
If your API token is restricted (e.g., "Object Read & Write" only) and lacks permission to modify bucket settings, you must configure CORS manually in your provider's console.

**JSON Policy for Cloudflare R2 / S3:**
In your bucket settings, add the following CORS policy. You **must** allow headers used by the AWS SDK (`amz-sdk-*`).

```json
[
  {
    "AllowedOrigins": ["http://localhost:5500", "https://bitvid.network"],
    "AllowedMethods": ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

> **Note:** Replace `AllowedOrigins` with your actual origins. If you are using the official site, keep `https://bitvid.network`. If you are running a local instance, use `http://localhost:5500` or your custom domain.

### 3. Create API Credentials

1. Create an API Token or Access Key pair.
2. **Permissions**: Ensure **"Object Read & Write"** access (specifically `s3:PutObject`, `s3:DeleteObject`).
   - _Optional:_ Add `s3:PutBucketCORS` if you want bitvid to configure CORS automatically.
3. **Copy the credentials**: You will need the **Access Key ID** and **Secret Access Key**.

### 4. Configure bitvid

1. In bitvid, open your **Profile** (click your avatar).
2. Navigate to the **Storage** tab in the sidebar menu (or click **"Configure Storage"** in the Upload Modal).
3. Select **Cloudflare R2** or **S3 Compatible** from the dropdown.
4. Enter your credentials:
   - **Cloudflare R2**:
     - **Account ID**: Found in your Cloudflare dashboard sidebar.
     - **Access Key ID & Secret Access Key**: From Step 3.
     - **Bucket Name**: The exact name of your bucket.
     - **Public Access URL**: The R2.dev or custom domain URL from Step 1 (e.g., `https://pub-xxx.r2.dev`).
   - **S3 Compatible**:
     - **Endpoint**: The S3 API endpoint (e.g., `https://s3.us-east-1.amazonaws.com` or `https://nyc3.digitaloceanspaces.com`).
     - **Region**: (e.g., `us-east-1`, `nyc3`, or `auto`).
     - **Access Key ID & Secret Access Key**: From Step 3.
     - **Bucket Name**: The exact name of your bucket.
     - **Public Access URL**: The base URL for public file access (e.g., `https://my-bucket.s3.amazonaws.com` or a CDN URL).
5. Click **"Save Connection"**.

bitvid will verify your credentials by attempting to list or upload a test file. Once verified, return to the Upload Modal to start sharing!

## Troubleshooting

### Common Issues

- **Missing Title:** "Title is required."
- **Missing Source:** "Provide a hosted URL, magnet link, or an imeta variant before publishing."
- **Invalid URL Protocol:** "Hosted video URLs must use HTTPS."
- **Storage Not Configured:** "Please configure storage before selecting a file."
- **CORS Errors ("Network Error"):** If uploads fail immediately or the console shows "CORS", verify your bucket's CORS policy matches the JSON above. Ensure `AllowedHeaders` includes `*`, `AllowedMethods` includes `PUT`, and `ExposeHeaders` lists `ETag`.
- **Permission Errors ("Access Denied"):** Check your API credentials. Ensure the token has `Object Read & Write` permissions (specifically `s3:PutObject` and `s3:DeleteObject`).
- **Browser Crashes / Slow Performance:** Large files (>2GB) can exhaust browser memory during the hashing process. Try using a smaller file or ensuring you have plenty of free RAM.
- **Playback Issues:** If the video uploads but doesn't play, ensure the "Public Access URL" is correct and publicly reachable. Test the URL directly in a browser.
- **Magnet-Only Uploads:** "Magnet-only uploads require active seeding." If you provide only a magnet link, ensure you or a peer are actively seeding the torrent, otherwise it will not play for others.

## Upload Lifecycle & Moderation

### How Uploads Work

1. **Direct Upload:** Your browser uploads the file directly to your storage bucket. No video data passes through a bitvid server.
2. **Client-Side Hashing:** Your browser calculates a cryptographic hash (info hash) of the file locally to enable WebTorrent support. This happens in memory, so large files require sufficient RAM.
3. **Publication:** The video metadata (title, URL, hash, tags) is signed by your Nostr key and published to relays.

### Moderation & Visibility

While publication is decentralized and permissionless, individual bitvid instances (clients) may enforce moderation policies:

- **Whitelists ("Invite-only"):** If the instance is in "whitelist mode", your videos will only appear in public feeds if your account has been approved by an admin. You can still share direct links, but discovery is restricted for users on strict instances.
- **Blacklists:** Violating community guidelines may result in your account being hidden from this instance.
- **User Blocks:** Viewers can mute or block your content individually.

Check the [Community Guidelines](../community/community-guidelines.md) for more details.
