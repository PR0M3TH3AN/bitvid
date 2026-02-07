# How to Upload Content

bitvid is a decentralized platform, but for larger video files, we support **Cloudflare R2** and **S3-compatible** storage backends. This allows you to upload files directly from your browser to a high-performance storage bucket.

## Prerequisites

- A **Cloudflare Account** (free to create) or an **S3-compatible provider**.
- An activated **R2 Plan** (if using Cloudflare).

## Supported Media & Limits

Before you start, ensure your content meets the following requirements:

### Accepted File Types
- **Video:** `.mp4`, `.webm`, `.mov`, `.mkv`, `.ts`, `.m3u8`, `.mpg`, `.mpeg`
- **Thumbnail:** Any standard image format (`image/*`)

### File Size
- **Recommended:** Up to **2GB** per file.
- **Why?** Browser-based uploads rely on your device's memory for hashing and chunk management. Files larger than 2GB may cause browser instability or crashes.

### Metadata
- **Title:** **Required**.
- **Description:** Optional.
- **Thumbnail:** Optional.
- **Tags (Hashtags):** Optional but highly recommended for discoverability. Use the dedicated "Hashtags" section in the upload form.

## Step-by-Step Guide

### 1. Create a Bucket & Enable Public Access

1. Log in to your provider's dashboard (e.g., Cloudflare).
2. Create a new bucket (e.g., `my-bitvid-videos`).
3. **Enable Public Access**:
   - **Cloudflare R2**: Go to **Settings** > **Public Access** and enable "R2.dev subdomain" or connect a custom domain.
   - **S3 Compatible**: Ensure the bucket policy allows public read access for objects.
4. **Copy the Public Bucket URL** (e.g., `https://pub-xxxxxx.r2.dev`). You will need this later.

### 2. Configure CORS

To allow your browser to upload files directly to the storage bucket, you must allow Cross-Origin Resource Sharing (CORS).

**Cloudflare R2 (Manual Configuration Required):**
bitvid will attempt to configure CORS automatically if your API keys have "Admin Read & Write" permissions. However, standard "Object Read & Write" tokens (recommended) cannot modify bucket settings, so you must configure this manually:

1. In your bucket's **Settings** tab, scroll down to **"CORS Policy"**.
2. Click **"Add CORS Policy"** (or Edit).
3. Paste the following JSON configuration. You **must** allow headers used by the AWS SDK (`amz-sdk-*`).

```json
[
  {
    "AllowedOrigins": ["http://localhost:5500", "https://bitvid.network"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD", "OPTIONS"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```
> **Note:** Replace `AllowedOrigins` with your actual origins. If you are using the official site, keep `https://bitvid.network`. If you are running a local instance, use `http://localhost:5500`.

**S3 Compatible Providers:**
bitvid will attempt to configure CORS automatically for generic S3 providers if your credentials have sufficient permissions. However, if uploads fail with CORS errors, apply a similar policy manually in your provider's console.

### 3. Create API Credentials

1. Create an API Token or Access Key pair.
2. **Permissions**: Ensure **"Object Read & Write"** access (or `s3:PutObject`, `s3:DeleteObject`).
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
     - **Endpoint**: The S3 API endpoint (e.g., `https://s3.us-east-1.amazonaws.com`).
     - **Region**: (e.g., `us-east-1` or `auto`).
     - **Access Key ID & Secret Access Key**: From Step 3.
     - **Bucket Name**: The exact name of your bucket.
     - **Public Access URL**: The base URL for public file access (e.g., `https://my-bucket.s3.amazonaws.com` or a CDN URL).
5. Click **"Save Connection"**.

bitvid will verify your credentials by attempting to list or upload a test file. Once verified, return to the Upload Modal to start sharing!

## Upload Lifecycle & Moderation

### How Uploads Work
1. **Direct Upload**: Your browser uploads the file directly to your storage bucket. No video data passes through a bitvid server.
2. **Client-Side Hashing**: Your browser calculates a cryptographic hash (info hash) of the file to enable WebTorrent support.
3. **Publication**: The video metadata (title, URL, hash, tags) is signed by your Nostr key and published to relays.

### Moderation & Visibility
While publication is decentralized and permissionless, the bitvid.network instance may enforce moderation policies:
- **Whitelists**: If the instance is in "whitelist mode", you may need approval before your videos appear in public feeds.
- **Blacklists**: Violating community guidelines may result in your account being hidden from this instance.
- **User Blocks**: Viewers can mute or block your content individually.

Check the [Community Guidelines](../community/community-guidelines.md) for more details.
