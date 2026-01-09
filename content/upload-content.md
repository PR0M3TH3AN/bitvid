# How to Upload Content

bitvid is a decentralized platform, but for larger video files, we currently support **Cloudflare R2** as a storage backend. This allows you to upload files directly from your browser to a high-performance, affordable storage bucket.

## Prerequisites

- A **Cloudflare Account** (free to create).
- An activated **R2 Plan** (there is a generous free tier, but you may need to add a payment method).

## Step-by-Step Guide

### 1. Create an API Token

To let bitvid upload files to your bucket, you need an API Token with permission to edit R2 storage.

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **R2** in the sidebar.
3. On the right side of the R2 Overview page, look for **"Manage R2 API Tokens"** and click it.
4. Click the **"Create API Token"** button.
5. **Configure the token:**
   - **Token name**: Enter something recognizable, e.g., "bitvid-upload".
   - **Permissions**: Select **"Admin Read & Write"** (easiest) or select the specific **"Workers R2 Storage"** permission with **"Edit"** access.
   - **Specific Bucket(s)**: You can grant access to "All buckets" or a specific one if you already created it.
   - **TTL**: Set this to "Forever" or a duration of your choice.
6. Click **"Create API Token"**.

### 2. Copy Your Credentials

Once created, you will see your credentials. **Do not close this page yet!** You cannot see the Secret Access Key again.

Copy the following values:

- **Access Key ID**: Usually starts with a random string.
- **Secret Access Key**: A long string of characters (this is your password).
- **Account ID**: This is found in the URL of your dashboard or on the R2 Overview page (e.g., `https://dash.cloudflare.com/<ACCOUNT_ID>/r2`).

### 3. Configure bitvid

1. Return to the **Upload Video** modal in bitvid.
2. Click **"Configure R2 Storage"**.
3. Enter your **Account ID**, **Access Key ID**, and **Secret Access Key**.
4. Click **"Save Credentials"**.

bitvid will automatically attempt to create a private bucket for your videos if one doesn't exist, or you can use the "Advanced Options" to specify a custom bucket or domain.
