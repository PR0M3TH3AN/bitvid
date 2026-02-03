# How to Upload Content

bitvid is a decentralized platform, but for larger video files, we currently support **Cloudflare R2** as a storage backend. This allows you to upload files directly from your browser to a high-performance, affordable storage bucket.

## Prerequisites

- A **Cloudflare Account** (free to create).
- An activated **R2 Plan** (there is a generous free tier, but you may need to add a payment method).

## Supported Media & Limits

Before you start, ensure your content meets the following requirements:

### Accepted File Types
- **Video:** `.mp4`, `.webm`, `.mov`, `.mkv`, `.ts`, `.m3u8`, `.mpg`, `.mpeg`
- **Thumbnail:** Any standard image format (`image/*`)

### File Size
- **Recommended:** Up to **2GB** per file.
- **Why?** Browser-based uploads rely on your device's memory for hashing and chunk management. Files larger than 2GB may cause browser instability or crashes.

### Metadata
- **Title:** Required.
- **Description, Thumbnail, Tags:** Optional but highly recommended for discoverability.

## Step-by-Step Guide

### 1. Create a Bucket & Enable Public Access

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **R2** in the sidebar.
3. Click **"Create Bucket"**.
4. Give it a name (e.g., `my-bitvid-videos`) and click **"Create Bucket"**.
5. Go to the **Settings** tab of your new bucket.
6. Scroll down to **"Public Access"** and click **"Enable"** under "R2.dev subdomain".
7. **Copy the Public Bucket URL** (it looks like `https://pub-xxxxxx.r2.dev`). You will need this later.

### 2. Configure CORS

To allow your browser to upload files directly to Cloudflare, you must allow Cross-Origin Resource Sharing (CORS).

1. Still in your bucket's **Settings** tab, scroll down to **"CORS Policy"**.
2. Click **"Add CORS Policy"** (or Edit).
3. **Important:** Browser uploads use the **AWS JavaScript SDK v3**, which automatically adds headers like `amz-sdk-invocation-id`, `amz-sdk-request`, and `x-amz-user-agent`. You **must** allow these headers. The simplest and most robust setup is to set `AllowedHeaders: ["*"]`.
4. Paste the following JSON configuration and **explicitly list every allowed app origin** (the scheme, host, and port must match exactly):

```json
[
  {
    "AllowedOrigins": ["http://127.0.0.1:5500", "https://bitvid.network"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD", "OPTIONS"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```
> **Note:** Replace the `AllowedOrigins` values with the exact origins you use in development and production. Uploads go through the **S3 API endpoint** (`<account>.r2.cloudflarestorage.com`), and browser-based uploads require `OPTIONS` for preflight requests. The `ExposeHeaders` list ensures the SDK can correctly track multipart upload progress.

5. Click **"Save"**.

### 3. Create an API Token (S3 Credentials)

1. Go back to the **R2 Overview** page.
2. Click **"Manage R2 API Tokens"** (right sidebar).
3. Click **"Create API Token"**.
4. **Configure the token:**
   - **Token name**: e.g., "bitvid-upload".
   - **Permissions**: Select **"Object Read & Write"**. This is the minimal permission needed to upload and delete files.
   - **Specific Bucket(s)**: Select the bucket you created in Step 1.
   - **TTL**: "Forever".
5. Click **"Create API Token"**.
6. **Copy the credentials**: You will need the **Access Key ID** and **Secret Access Key**.

### 4. Configure bitvid

1. Copy the **Access Key ID**, **Secret Access Key**, and your **Account ID** (found on the R2 Overview page).
2. In bitvid, open your **Profile** (click your avatar).
3. Navigate to the **Storage** tab (or click **"Configure R2 Storage"** in the Upload Modal to be redirected there).
4. Click **"Add Connection"** and select **Cloudflare R2**.
5. Enter your:
   - **Account ID**
   - **Access Key ID**
   - **Secret Access Key**
   - **Public Bucket URL** (from Step 1)
6. Click **"Save Connection"**.

bitvid will verify your credentials by uploading a small test file. Once verified, return to the Upload Modal to start sharing!
