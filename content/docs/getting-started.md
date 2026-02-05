Ready to jump in? Here's everything you need to know to start watching and sharing videos on bitvid.

## Watching Videos

1. Visit [bitvid.network](https://bitvid.network).
2. **(Optional) Install as an App:**
   - **Desktop:** On Chrome-based browsers, click the "Install" icon in the address bar to run bitvid as a standalone app.
   - **Mobile:** Tap "Share" (iOS) or the menu (Android) and select "Add to Home Screen".
3. Browse the videos on the homepage.
4. Click any video to start watching.
   That's it! No account needed to watch.

## Sharing Your Videos

### Step 1: Set Up Your Account

> ⚠️ **Note:** We are currently invite-only. [Submit an application](https://bitvid.network/?modal=application) to request approval for posting content.

1. Install a [Nostr extension](https://nostrapps.com/#signers#all) (like Alby or Nos2x) in your browser.
2. The extension creates your secure login key automatically.
3. Click "Login" on bitvid to connect.

### Step 2: Prepare Your Video

1. **Format:** We accept **.mp4, .webm, .mov, .mkv, .ts, .m3u8, .mpg, .mpeg** (Max 2GB recommended).
2. **Hosting:** You can upload directly via bitvid (requires your own Cloudflare R2 or S3 bucket) or host your video elsewhere (CDN, Cloudflare Stream, etc.) and provide the HTTPS URL. For external hosting, ensure the format is streamable (MP4/WebM/HLS/DASH).
3. **(Optional) WebTorrent:** If hosting externally, you can generate a WebTorrent magnet so viewers can fall back to peer-to-peer delivery.

### Step 3: Share on bitvid

1. Click "Share a Video" on bitvid to open the upload modal.
2. Choose your upload mode:
   - **Upload Video**: Select a file from your device to upload directly to your Cloudflare R2 or S3-compatible bucket. If you haven't configured storage yet, click **"Configure Storage"** to enter your credentials (Account ID/Endpoint, Access Keys, Bucket Name, Public URL) in your Profile settings.
   - **External URL**: If you already host your video elsewhere, paste the HTTPS URL and (optionally) a WebTorrent magnet link.
3. Review the rest of the form: add a description and thumbnail, decide whether to allow comments, and set the NSFW or "For Kids" toggles to match your content. Explore the metadata section to fill in captions, duration, hashtags, and other fields.
4. Click "Publish Video" to post your content.

## Tips for Success

- **Thumbnails:** Add eye-catching thumbnails to attract viewers.
- **Descriptions:** Write clear descriptions to help people find your content.
- **Visibility:** After posting, you can use the **More → Edit** action to toggle visibility or delete content.
- **Watch History:** Encrypted watch-history sync lives in the [Watch History view](history.html), where you can clear devices or pause tracking whenever you need.

## Need Help?

- Visit our [GitHub](https://github.com/PR0M3TH3AN/bitvid) page for technical support.
- Join our [community](https://primal.net/p/npub13yarr7j6vjqjjkahd63dmr27curypehx45ucue286ac7sft27y0srnpmpe) to connect with other users.
- Report bugs to help us improve.

Welcome to bitvid – let's start sharing!
