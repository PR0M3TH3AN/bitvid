# How to Upload Content

bitvid is a decentralized platform, but for larger video files, we currently support **Cloudflare R2** as a storage backend. This allows you to upload files directly from your browser to a high-performance, affordable storage bucket.

## Prerequisites

- A **Cloudflare Account** (free to create).
- An activated **R2 Plan** (there is a generous free tier, but you may need to add a payment method).

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
3. **Important:** Browser uploads use the AWS JavaScript SDK, which sends the `amz-sdk-invocation-id`, `amz-sdk-request`, and `x-amz-user-agent` headers. The simplest working setup is to allow all headers by setting `AllowedHeaders: ["*"]`.
4. Paste the following JSON configuration and **explicitly list every allowed app origin** (the scheme, host, and port must match exactly):

```json
[
  {
    "AllowedOrigins": ["http://127.0.0.1:5500", "https://bitvid.network"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```
> **Note:** Replace the `AllowedOrigins` values with the exact origins you use in development and production (the scheme and port must match exactly). Apply this policy on the **bucket’s S3 API endpoint**, not just the public URL or custom domain. Uploads go through the **S3 API endpoint** (`<account>.r2.cloudflarestorage.com`), and Cloudflare’s UI does **not** require adding `OPTIONS` to `AllowedMethods`.

5. Click **"Save"**.

### 3. Create an API Token

1. Go back to the **R2 Overview** page.
2. Click **"Manage R2 API Tokens"** (right sidebar).
3. Click **"Create API Token"**.
4. **Configure the token:**
   - **Token name**: e.g., "bitvid-upload".
   - **Permissions**: Select **"Object Read & Write"**. This is the minimal permission needed to upload and delete files.
   - **Specific Bucket(s)**: Select the bucket you created in Step 1.
   - **TTL**: "Forever".
5. Click **"Create API Token"**.

### 4. Configure bitvid

1. Copy the **Access Key ID**, **Secret Access Key**, and your **Account ID** (found on the R2 Overview page).
2. Return to the **Upload Video** modal in bitvid.
3. Click **"Configure R2 Storage"**.
4. Enter your:
   - **Account ID**
   - **Access Key ID**
   - **Secret Access Key**
   - **Public Bucket URL** (from Step 1)
5. Click **"Verify & Save"**.

bitvid will verify your credentials by uploading a small test file. Once verified, you are ready to upload!
