# Instance configuration (`config/instance-config.js`)

`config/instance-config.js` is the operator-owned configuration file for a bitvid
instance. It is intended to be committed alongside your deployment so future
maintainers can see exactly how the instance is tuned (moderation defaults,
branding links, analytics knobs, etc.). The values in this file are imported by
`js/config.js` and then consumed by the rest of the application.

## How to use this file

1. Open `config/instance-config.js` and update the exported constants.
2. Commit the changes in your deployment repo.
3. Redeploy so the new values are baked into the build.

If you maintain multiple environments (production, staging, beta), you can keep
separate branches or deployment pipelines with different values. This keeps the
configuration explicit rather than hidden in environment variables.

## Configuration reference

The sections below explain every exported setting, how bitvid uses it, and why
an operator might change it.

### Development + runtime flags

- **`IS_DEV_MODE`**
  - **What it does:** Enables development behavior such as extra diagnostics and
    debug affordances. The value is re-exported as `isDevMode` in
    `js/config.js` and controls `window.__BITVID_DEV_MODE__` as well as
    logger routing.
  - **Why change it:** Set to `false` for production builds so only the stable
    UX and user-facing logging remain.

- **`IS_VERBOSE_DEV_MODE`**
  - **What it does:** Enables high-volume diagnostics inside dev mode (for
    example, repeated COUNT failures).
  - **Why change it:** Keep `true` while debugging noisy workflows and set to
    `false` when you want a quieter dev console without disabling dev mode.

- **`IS_LOCKDOWN_MODE`**
  - **What it does:** Toggles a lockdown posture that limits access and switches
    UI copy for incident/maintenance windows.
  - **Why change it:** Enable during an incident or maintenance to temporarily
    restrict behavior; keep `false` for normal operation.

### Instance identity + navigation links

- **`ADMIN_SUPER_NPUB`**
  - **What it does:** Sets the “Super Admin” Nostr public key. This account
    cannot be removed from moderator lists and is the authority for admin
    actions.
  - **Why change it:** Replace with the npub of the operator who should hold
    ultimate control over the instance.

- **`BITVID_WEBSITE_URL`**
  - **What it does:** Canonical URL referenced in admin outreach and moderation
    DMs.
  - **Why change it:** Point to the primary hostname for your deployment.

- **`BLOG_URL`**
  - **What it does:** Destination for the sidebar “Blog” link.
  - **Why change it:** Link to release notes or community posts. Set to `null`
    or an empty string to hide the link.

- **`COMMUNITY_URL`**
  - **What it does:** Destination for the sidebar “Community” link.
  - **Why change it:** Point to Discord, Telegram, NIP-29 groups, etc. Set to
    `null`/empty to remove the entry.

- **`NOSTR_URL`**
  - **What it does:** Destination for the sidebar “Nostr” link.
  - **Why change it:** Direct users to a profile or relay hub. Set to
    `null`/empty to hide it.

- **`GITHUB_URL`**
  - **What it does:** Destination for the sidebar “GitHub” link.
  - **Why change it:** Point to the repository you want operators to visit. Set
    to `null`/empty to remove it.

- **`BETA_URL`**
  - **What it does:** Destination for the sidebar “Beta” link.
  - **Why change it:** Use when you maintain a staging or beta environment;
    set to `null`/empty to hide it.

- **`DNS_URL`**
  - **What it does:** Destination for the sidebar “DNS” link.
  - **Why change it:** Point to your DNS landing page; set to `null`/empty to
    hide it.

- **`TIP_JAR_URL`**
  - **What it does:** Destination for the sidebar “Tip Jar” link.
  - **Why change it:** Surface a Lightning tipping page, or set to `null`/empty
    to remove the link.

### Moderation + admin messaging

- **`ADMIN_DM_IMAGE_URL`**
  - **What it does:** Image URL embedded in automated moderation DMs.
  - **Why change it:** Customize the visual header or point to your own hosted
    asset.

- **`DEFAULT_RELAY_URLS_OVERRIDE`**
  - **What it does:** Optional list of WSS relay URLs to seed new sessions.
  - **Why change it:** Replace the bundled default relays with a custom
    bootstrap list; leave empty to use the upstream defaults.

- **`ADMIN_WHITELIST_MODE_STORAGE_KEY`**
  - **What it does:** LocalStorage key for whitelist-only mode.
  - **Why change it:** Rarely needed; only update if you must migrate storage
    keys or segment multiple deployments in a shared browser profile.

- **`DEFAULT_WHITELIST_MODE_ENABLED`**
  - **What it does:** Initial default for whitelist-only mode when no local
    storage preference exists.
  - **Why change it:** Set to `true` to start in whitelist-only mode, or `false`
    to allow all creators by default.

- **`ALLOW_NSFW_CONTENT`**
  - **What it does:** Controls whether content marked `isNsfw` is visible in
    public feeds.
  - **Why change it:** Set to `true` only if your deployment explicitly allows
    NSFW content to surface.

- **`DEFAULT_TRUST_SEED_NPUBS`**
  - **What it does:** Fallback list of npubs used to seed moderation trust if
    live moderator lists cannot be loaded.
  - **Why change it:** Populate with trusted operator keys for bootstrap
    scenarios; in normal operation these values are ignored.

- **`DEFAULT_BLUR_THRESHOLD`**
  - **What it does:** Trusted report count required to blur thumbnails.
  - **Why change it:** Lower values blur content more aggressively; higher
    values require more reports before blurring.

- **`DEFAULT_AUTOPLAY_BLOCK_THRESHOLD`**
  - **What it does:** Trusted report count required to block autoplay in feeds.
  - **Why change it:** Increase for a more permissive stance, decrease to stop
    autoplay sooner.

- **`DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD`**
  - **What it does:** Trusted mute count required to hide a creator globally.
  - **Why change it:** Lower for stricter enforcement, higher for more leniency. The upstream default is 20, allowing most content to blur before hiding.

- **`DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD`**
  - **What it does:** Trusted spam/report count required to hide a video
    globally.
  - **Why change it:** Align with your moderation policy for spam handling.

### Lightning + monetization

- **`MAX_WALLET_DEFAULT_ZAP`**
  - **What it does:** Caps the default zap amount saved in wallet settings.
  - **Why change it:** Lower to reduce overpayment risk, higher if you expect
    larger standard tips.

- **`PLATFORM_FEE_PERCENT`**
  - **What it does:** Percentage of each Lightning payment retained by the
    platform.
  - **Why change it:** Set to `0` for no fee, or a positive percentage to fund
    platform operations.

- **`PLATFORM_LUD16_OVERRIDE`**
  - **What it does:** Lightning address used when creators omit their `lud16`,
    and the destination for the platform split when a fee is enabled.
  - **Why change it:** Provide the Lightning address that should receive
    platform fees or default tips. Leave `null` to rely on the Super Admin’s
    profile `lud16`.

### Theme overrides

- **`THEME_ACCENT_OVERRIDES`**
  - **What it does:** Optional overrides for light/dark accent tokens. Each
    theme supports `accent`, `accentStrong`, and `accentPressed`.
  - **Why change it:** Customize the brand accent colors without rebuilding
    CSS. Set each value to `null` to keep the upstream defaults.

### Watch history storage

- **`WATCH_HISTORY_KIND`**
  - **What it does:** Nostr kind used when writing watch-history events.
  - **Why change it:** Use a different kind if you need to segment lists or
    experiment with alternate kinds accepted by your relays.

- **`WATCH_HISTORY_LIST_IDENTIFIER`**
  - **What it does:** Value used in the `d` tag for the watch-history list.
  - **Why change it:** Keep stable once clients rely on it; update only if you
    must isolate histories across deployments.

- **`WATCH_HISTORY_MAX_ITEMS`**
  - **What it does:** Maximum number of watch-history entries per user.
  - **Why change it:** Lower for privacy/storage constraints, raise to keep a
    longer playback backlog.

- **`WATCH_HISTORY_BATCH_RESOLVE`**
  - **What it does:** Enables batched fetching of watch-history metadata.
  - **Why change it:** Disable if your relays struggle with batched queries,
    acknowledging the additional round trips.

- **`WATCH_HISTORY_BATCH_PAGE_SIZE`**
  - **What it does:** Maximum number of canonical items per batched response.
  - **Why change it:** Set a smaller page size to align pagination or API
    limits; leave `null` for full-window responses.

- **`WATCH_HISTORY_PAYLOAD_MAX_BYTES`**
  - **What it does:** Size cap for each watch-history payload before
    encryption.
  - **Why change it:** Lower if relays enforce stricter size limits; higher if
    your relays tolerate larger events.

- **`WATCH_HISTORY_FETCH_EVENT_LIMIT`**
  - **What it does:** Number of watch-history events fetched during sync.
  - **Why change it:** Increase if you expect many chunks; decrease to reduce
    relay load.

- **`WATCH_HISTORY_CACHE_TTL_MS`**
  - **What it does:** How long watch-history snapshots are cached in
    localStorage.
  - **Why change it:** Increase for longer-lived caches, decrease to keep
    histories fresh or tighter retention.

### Analytics + view counts

- **`VIEW_COUNT_DEDUPE_WINDOW_SECONDS`**
  - **What it does:** Window for de-duplicating repeat view events.
  - **Why change it:** Shorten to count repeat views sooner; lengthen to be
    stricter about duplicate plays.

- **`VIEW_COUNT_BACKFILL_MAX_DAYS`**
  - **What it does:** Backfill horizon for view count hydration jobs.
  - **Why change it:** Increase to reconstruct deeper history, decrease to
    reduce relay load on startup.

- **`VIEW_COUNT_CACHE_TTL_MS`**
  - **What it does:** TTL for cached view totals.
  - **Why change it:** Lower for fresher analytics, higher to reduce traffic.

### Publishing reliability

- **`ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS`**
  - **What it does:** Cooldown between manual “Rebroadcast” attempts.
  - **Why change it:** Lengthen if relays are sensitive to repeated publishes;
    shorten if operators need a quicker retry loop.
