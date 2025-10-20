Ready to jump in? Here's everything you need to know to start watching and sharing videos on bitvid.

## Watching Videos

1. Just visit [bitvid.network](https://bitvid.network) or one of our alternate sites like [bitvid.btc.us](https://bitvid.btc.us) and [bitvid.eth.limo](https://bitvid.eth.limo). We also have other instances via [IPNS](ipns.html) gateways you can try.
2. Browse the videos on the homepage
3. Click any video to start watching
   That's it! No account needed to watch.

## Sharing Your Videos

### Step 1: Set Up Your Account

> ⚠️ **Note:** We are currently invite-only. [Submit an application](https://bitvid.network/?modal=application) to request approval for posting content.

1. Install a [Nostr extension](https://nostrapps.com/#signers#all) (like Alby or Nos2x) in your browser
2. The extension creates your secure login key automatically
3. Click "Login" on bitvid to connect

### Step 2: Prepare Your Video

1. Host your video at an HTTPS URL that browsers can stream directly (MP4/WebM/HLS/DASH all work). You can use your own CDN, Cloudflare Stream, an R2 bucket, or any static site host—as long as the link begins with `https://`.
2. (Optional but recommended) Generate a WebTorrent magnet so viewers can fall back to peer-to-peer delivery. Desktop apps like [WebTorrent Desktop](https://webtorrent.io/desktop/) or command-line tools can create the magnet for you.
3. Double-check that either the hosted URL or the magnet (or both) is ready before you open the Upload modal.

### Step 3: Share on bitvid

1. Click "Share a Video" on bitvid to open the upload modal.
2. In **Custom** mode, enter your title, paste the hosted HTTPS URL, and (optionally) add the magnet plus any `ws`/`xs` hints. Switch to the experimental **Cloudflare** quick upload mode if you want bitvid to push the file straight to your Cloudflare R2 bucket—have your Account ID, S3 Access Key ID, and Secret Access Key ready (the advanced toggle also accepts an API token, Zone ID, and base domain if you use them).
3. Review the rest of the form: add a description and thumbnail, decide whether to allow comments, and set the NSFW or "For Kids" toggles to match your content. Explore the metadata section to fill in captions, duration, publish time, hashtags, participants, and other fields so first-time viewers have all the context they need.
4. Click "Post" to publish once everything looks right.

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
