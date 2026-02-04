Ready to jump in? Here's everything you need to know to start watching and sharing videos on bitvid.

## Watching Videos

1. Visit [bitvid.network](https://bitvid.network).
2. **(Optional) Install as an App:**
   - **Desktop:** On Chrome-based browsers, click the "Install" icon in the address bar to run bitvid as a standalone app.
   - **Mobile:** Tap "Share" (iOS) or the menu (Android) and select "Add to Home Screen".
3. Browse the videos on the homepage
4. Click any video to start watching
   That's it! No account needed to watch.

## Sharing Your Videos

### Step 1: Set Up Your Account

> ⚠️ **Note:** We are currently invite-only. [Submit an application](https://bitvid.network/?modal=application) to request approval for posting content.

1. Install a [Nostr extension](https://nostrapps.com/#signers#all) (like Alby or Nos2x) in your browser
2. The extension creates your secure login key automatically
3. Click "Login" on bitvid to connect

### Step 2: Prepare Your Video

1. Host your video at an HTTPS URL that browsers can stream directly. If you are uploading a file directly via bitvid, we accept **MP4, WebM, MOV, MKV, TS, M3U8, MPG, and MPEG** (Max 2GB recommended). For external hosting, ensure the format is streamable (MP4/WebM/HLS/DASH). You can use your own CDN, Cloudflare Stream, an R2 bucket, or any static site host—as long as the link begins with `https://`.
2. (Optional but recommended) Generate a WebTorrent magnet so viewers can fall back to peer-to-peer delivery. Desktop apps like [WebTorrent Desktop](https://webtorrent.io/desktop/) or command-line tools can create the magnet for you.
3. Double-check that either the hosted URL or the magnet (or both) is ready before you open the Upload modal.

### Step 3: Share on bitvid

1. Click "Share a Video" on bitvid to open the upload modal.
2. Choose your upload mode:
   - **Upload Video**: Select a file from your device to upload directly to your Cloudflare R2 bucket. If you haven't configured storage yet, click **"Configure Storage"** to enter your R2 credentials (Account ID, Access Key ID, Secret Access Key, Bucket Name, Public Access URL) in your Profile settings.
   - **External URL**: If you already host your video elsewhere, paste the HTTPS URL and (optionally) a WebTorrent magnet link.
3. Review the rest of the form: add a description and thumbnail, decide whether to allow comments, and set the NSFW or "For Kids" toggles to match your content. Explore the metadata section to fill in captions, duration, publish time, hashtags, participants, and other fields so first-time viewers have all the context they need.
4. Click "Publish Video" to post your content.

## Tips for Success

- Keep WebTorrent Desktop running while sharing videos
- Add eye-catching thumbnails to attract viewers
- Write clear descriptions to help people find your content
- After posting, open a card’s **More → Edit** action and use the [visibility toggle in the Edit Video modal](../components/edit-video-modal.html) to keep it private until you’re ready to share
- Encrypted watch-history sync lives in the [Watch History view](history.html), where you can clear devices or pause tracking whenever you need.

## Need Help?

- Visit our [GitHub](https://github.com/PR0M3TH3AN/bitvid) page for technical support
- Join our [community](https://primal.net/p/npub13yarr7j6vjqjjkahd63dmr27curypehx45ucue286ac7sft27y0srnpmpe) to connect with other users
- Report bugs to help us improve

Welcome to bitvid – let's start sharing!
