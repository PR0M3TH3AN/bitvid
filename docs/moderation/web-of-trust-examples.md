# Web-of-Trust: Detailed Flow + Examples

This document expands on `docs/moderation/web-of-trust.md` with a concrete view of
how trust seeds, admin lists, and F1 thresholds interact during moderation
scoring. It is intended for operators and developers who need to reason about
why a piece of content was blurred, autoplay-blocked, or hidden.

## Key concepts (quick recap)

- **Trusted seeds**: A baseline set of pubkeys used to bootstrap trust for
  anonymous/default visitors. Seeds come from the Super Admin and active editor
  lists; fallback seeds are used only if those lists cannot be hydrated.
- **Trusted contacts (F1)**: The viewer's follow list (plus seeds for
  anonymous/default visitors). Only F1 accounts count as trusted reporters.
- **Admin lists**: NIP-51 `30000` lists, specifically:
  - `bitvid:admin:blacklist` → hard-hide when subscribed.
  - `bitvid:admin:whitelist` → boosts Discovery ranking but never overrides
    moderation gates.
- **Thresholds**:
  - Blur thumbnail: `DEFAULT_BLUR_THRESHOLD` trusted `nudity` reports.
  - Block autoplay: `DEFAULT_AUTOPLAY_BLOCK_THRESHOLD` trusted `nudity` reports.
  - Hide author: `DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD` trusted mutes.
  - Hide video: `DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD` trusted spam reports.

## Precedence (what wins)

1. **Personal blocks first**: If a viewer blocks an author or reporter, the
   author is hidden and that reporter's reports are ignored.
2. **Admin blacklist second**: If the viewer is subscribed to
   `bitvid:admin:blacklist`, entries there are hard-hidden and their reports are
   suppressed before thresholds are evaluated.
3. **F1 thresholds last**: Only after the first two checks do we apply trusted
   report/mute thresholds for blur, autoplay block, and hide decisions.

## How trust seeds are selected (bootstrap)

For anonymous/default visitors (or when no follow graph is available), the
trusted seed set is built as follows:

1. Start with the Super Admin pubkey.
2. Add active editors from the access control list (if available).
3. If (1) and (2) produce no seeds, fall back to `DEFAULT_TRUST_SEED_NPUBS`.

This means Super Admins and editors are not automatically blocked; they are used
as trusted anchors when computing F1-based counts for viewers without a follow
list. Blocking still follows the precedence rules above.

## Example flows

### Example 1: Anonymous visitor, no live admin lists available

- Access control list fails to hydrate in time.
- `DEFAULT_TRUST_SEED_NPUBS` is used as the seed set.
- A video has 3 `nudity` reports from those seed accounts.

Result:
- Thumbnail is blurred if `DEFAULT_BLUR_THRESHOLD` is 3.
- Autoplay is blocked if `DEFAULT_AUTOPLAY_BLOCK_THRESHOLD` is 2.
- No hard hide unless trusted mute/spam thresholds are met.

### Example 2: Logged-in viewer with personal blocks

- Viewer follows 200 accounts (F1).
- Viewer has blocked `npub_author_x`.
- `npub_author_x` appears in a video card.

Result:
- The author is hidden immediately (personal block precedence).
- Reports from `npub_author_x` are ignored in trusted counts.

### Example 3: Admin blacklist + trusted reports

- Viewer is subscribed to `bitvid:admin:blacklist`.
- `npub_spammer` is listed there.
- A video from `npub_spammer` has 1 trusted spam report.

Result:
- The video is hard-hidden due to the admin blacklist.
- The spam report count does not matter because blacklist suppression runs
  before thresholds.

### Example 4: Trusted mute hide

- Viewer follows `npub_a`, `npub_b`, and `npub_c`.
- Both `npub_a` and `npub_b` have muted `npub_author_y`.
- `DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD` is 1.

Result:
- The author is hidden (trusted mute count ≥ 1).
- The badge reads: `Hidden · 2 trusted mutes` and a “Show anyway” override is
  available.

### Example 5: Mixed nudity + spam reports

- Viewer follows 50 accounts.
- A video has:
  - 2 trusted `nudity` reports
  - 3 trusted `spam` reports
- Thresholds are: blur=3, autoplay=2, spam hide=3.

Result:
- Autoplay is blocked (nudity reports meet autoplay threshold).
- Thumbnail is **not** blurred (nudity reports below blur threshold).
- Video is hidden (spam reports meet the spam hide threshold).

## Troubleshooting checklist

- Confirm the viewer’s follow list (F1) is populated and hydrated.
- Verify admin list subscriptions are active for the viewer.
- Check whether any personal blocks exist for the author or reporters.
- Compare trusted counts to the configured defaults in
  `config/instance-config.js`.

## See also

- `docs/moderation/web-of-trust.md`
- `docs/moderation/README.md`
- `docs/instance-config.md`
