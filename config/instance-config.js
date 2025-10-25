// config/instance-config.js
// -----------------------------------------------------------------------------
// bitvid instance configuration
// -----------------------------------------------------------------------------
//
// This file consolidates the values that operators usually customize when they
// deploy their own bitvid instance. Update the exports below to match your
// environment, commit the changes, and redeploy. Leaving this file in the repo
// (instead of hidden in environment variables) makes it easy for future
// maintainers to understand how your instance is configured.
//
// Each setting includes guidance about how bitvid uses the value and what
// adjustments are safe. When in doubt, mirror the structure shown here so other
// contributors can follow along.

/**
 * Whether the current deployment should enable developer-centric behavior.
 *
 * When `true`, bitvid surfaces extra logging, debug helpers, and experimental
 * UI affordances intended for development environments. Set the value to
 * `false` before deploying to production so that end users receive the stable
 * experience. Downstream modules read this flag via `js/config.js`.
 */
export const IS_DEV_MODE = true;

/**
 * Whether the current deployment should operate in lockdown mode.
 *
 * When `true`, bitvid restricts access to operator-approved functionality and
 * enables defensive UI copy intended for incidents or maintenance windows.
 * Leave this `false` for normal operation so downstream modules (via
 * `js/config.js`) continue exposing the full experience.
 */
export const IS_LOCKDOWN_MODE = false;

/**
 * The primary administrator for this bitvid instance.
 *
 * bitvid treats this Nostr public key (npub) as the "Super Admin". This user
 * cannot be removed from moderator lists, and only they can promote new
 * moderators or toggle whitelist-only mode. Replace the string below with the
 * npub of the account you want to act as the ultimate authority for your
 * deployment.
 */
export const ADMIN_SUPER_NPUB =
  "npub15jnttpymeytm80hatjqcvhhqhzrhx6gxp8pq0wn93rhnu8s9h9dsha32lx";

/**
 * Canonical URL for the public bitvid site.
 *
 * Surfaces in admin outreach copy and moderation DMs so that recipients can
 * quickly jump back to the primary destination. Update this if your
 * deployment relies on a different canonical hostname.
 */
export const BITVID_WEBSITE_URL = "https://bitvid.network/";

/**
 * Optional external destination for the blog menu link.
 *
 * Sidebar navigation routes visitors to this URL when they select "Blog".
 * Update the value to point at the long-form publishing platform you
 * maintain for release notes or community updates. Leave empty (null or an
 * empty string) to hide the Blog link entirely.
 */
export const BLOG_URL =
  "https://habla.news/p/npub13yarr7j6vjqjjkahd63dmr27curypehx45ucue286ac7sft27y0srnpmpe";

/**
 * Optional external destination for the community menu link.
 *
 * Configure this with a URL to your preferred community hub (e.g., Discord,
 * Telegram, Flotilla). When unset (null or an empty string) the Community link
 * is omitted from the sidebar dropup menu.
 */
export const COMMUNITY_URL = "https://groups.nip29.com/?relay=wss://relay.groups.nip29.com&groupId=d92ef5";

/**
 * Optional external destination for the Nostr menu link.
 *
 * Point this at the profile or relay hub you want visitors to land on when
 * they tap "Nostr" in the sidebar dropup. Leave empty (null or an empty
 * string) to hide the link entirely.
 */
export const NOSTR_URL =
  "https://primal.net/p/npub13yarr7j6vjqjjkahd63dmr27curypehx45ucue286ac7sft27y0srnpmpe";

/**
 * Optional external destination for the GitHub menu link.
 *
 * Set this to the repository you want surfaced to operators and contributors.
 * Leave empty (null or an empty string) to remove the GitHub entry from the
 * sidebar dropup menu.
 */
export const GITHUB_URL = "https://github.com/PR0M3TH3AN/bitvid";

/**
 * Optional external destination for the Beta menu link.
 *
 * Deployments that maintain a staging or beta environment can direct users to
 * that surface here. Leave empty (null or an empty string) if there is no
 * public beta to advertise.
 */
export const BETA_URL = "https://beta.bitvid.network/";

/**
 * Optional external destination for the DNS menu link.
 *
 * Operators can expose their canonical DNS landing page here. Leave empty
 * (null or an empty string) to hide the DNS entry from the sidebar.
 */
export const DNS_URL = "https://bitvid.network/";

/**
 * Default image included in automated moderation DMs.
 *
 * bitvid embeds this media asset at the top of notification messages so the
 * payload renders with a recognizable preview. Provide a fully qualified URL
 * that points to a hosted image accessible by the intended recipients.
 */
export const ADMIN_DM_IMAGE_URL =
  "https://beta.bitvid.network/assets/jpg/video-thumbnail-fallback.jpg";

/**
 * Maximum satoshi value allowed when storing the default zap amount.
 *
 * Wallet settings clamp user input to this value before persistence to guard
 * against accidental overpayment. Tune the ceiling to match your instance's
 * risk tolerance.
 */
export const MAX_WALLET_DEFAULT_ZAP = 100000000;

/**
 * Percentage of every Lightning payment the platform retains as a fee.
 *
 * Accepts numbers between 0 and 100 (inclusive). Decimals are supported when
 * you want to keep a fractional cut—e.g., `2.5` represents a 2.5% fee. The
 * default of `0` disables the fee so creators receive the full payment.
 */
export const PLATFORM_FEE_PERCENT = 30;

/**
 * Lightning address to fall back to when authors omit their own `lud16`.
 *
 * Supply a string like `"tips@example.com"` to force a deployment-wide
 * fallback Lightning address. When `PLATFORM_FEE_PERCENT` is greater than 0,
 * this override also acts as the Lightning target for the platform’s split.
 * Leave the value as `null` to respect the creator’s metadata and rely on the
 * Super Admin profile publishing a `lud16` so bitvid still knows where to route
 * fees when they are enabled.
 */
export const PLATFORM_LUD16_OVERRIDE = "adammalin@strike.me";

/**
 * Optional list of relays to seed new sessions with instead of the defaults.
 *
 * Provide WSS URLs (e.g., `"wss://relay.example.com"`). Leave the array empty
 * to keep bitvid’s bundled defaults. Operators that need a custom bootstrap set
 * should list the relays in priority order; entries later in the list are used
 * as fallbacks when earlier relays fail.
 */
export const DEFAULT_RELAY_URLS_OVERRIDE = Object.freeze([
  // "wss://relay.example.com",
]);

/**
 * Storage key used to persist whitelist-only mode in the browser.
 *
 * You usually do not need to change this, but the export lives here so that all
 * whitelist-related knobs are grouped together. If you do change the key, make
 * sure to migrate any previously stored values in localStorage.
 */
export const ADMIN_WHITELIST_MODE_STORAGE_KEY = "bitvid_admin_whitelist_mode";

/**
 * Whether whitelist-only mode should be enabled the first time an operator
 * loads the admin dashboard.
 *
 * Set this to `true` if you want bitvid to start with whitelist-only access and
 * require an explicit opt-out. Set to `false` to allow all creators by default.
 * Operators can still toggle the mode at runtime; this value only controls the
 * default state when no preference has been stored in localStorage yet.
 */
export const DEFAULT_WHITELIST_MODE_ENABLED = true;

/**
 * Whether the public client should display content flagged as NSFW.
 *
 * When set to `false`, bitvid filters out any video notes marked with the
 * `isNsfw` flag so they never appear in feeds or video lists. Toggle to `true`
 * only if your deployment allows NSFW media to surface publicly.
 */
export const ALLOW_NSFW_CONTENT = false;

/**
 * Baseline trusted accounts used to seed the moderation graph.
 *
 * Provide Nostr npubs for the operators and moderators you trust by default.
 * Downstream modules treat these accounts as the starting point for the F1
 * network that powers trusted reports and mutes. Operators should feel free to
 * edit the list to match their deployment; bitvid will freeze and sanitize the
 * values at runtime when reading from `js/config.js`.
 */
export const DEFAULT_TRUST_SEED_NPUBS = [
  "npub15jnttpymeytm80hatjqcvhhqhzrhx6gxp8pq0wn93rhnu8s9h9dsha32lx",
  "npub13yarr7j6vjqjjkahd63dmr27curypehx45ucue286ac7sft27y0srnpmpe",
];

/**
 * Baseline trusted-report count that triggers thumbnail blurring.
 *
 * When a video receives at least this many trusted reports for the active
 * category (for example, `nudity`), thumbnails render with the blurred preview
 * by default. Align this value with your moderation policy — the upstream
 * deployment targets 3 trusted reports before blurring.
 */
export const DEFAULT_BLUR_THRESHOLD = 1;

/**
 * Baseline trusted-report count that blocks autoplay during browsing.
 *
 * Videos that meet or exceed this count will not autoplay in feeds unless the
 * viewer explicitly opts in. Increase the number for a more permissive stance
 * or decrease it if you want autoplay to stop sooner. The upstream deployment
 * targets 2 trusted reports before blocking autoplay.
 */
export const DEFAULT_AUTOPLAY_BLOCK_THRESHOLD = 1;

/**
 * Trusted mute threshold that hides creators globally.
 *
 * Once this many trusted accounts mute a creator, their videos disappear from
 * feeds until an operator intervenes. Keep the value low (1–2) to rapidly
 * enforce community standards or raise it to tolerate more reports before
 * hiding.
 */
export const DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD = 1;

/**
 * Trusted spam/report threshold that hides videos globally.
 *
 * When a video's trusted report count reaches this number, bitvid treats it as
 * spam or policy violating content and removes it from default feeds. Align
 * the value with your moderation policy — 3 trusted reports is the upstream
 * baseline.
 */
export const DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD = 1;

/**
 * Optional theme accent overrides for light and dark mode.
 *
 * Operators can provide hex color strings (e.g., `"#2563eb"`) to customize the
 * accent tokens without editing the generated CSS bundle. Leave values as
 * `null` to keep the upstream defaults defined in `css/tokens.css`. Each theme
 * accepts overrides for the base accent color as well as the stronger and
 * pressed states used for hover/active presentations.
 */
export const THEME_ACCENT_OVERRIDES = Object.freeze({
  light: Object.freeze({
    accent: "#540011",
    accentStrong: "#fe0032",
    accentPressed: "#a90021",
  }),
  dark: Object.freeze({
    accent: "#540011",
    accentStrong: "#fe0032",
    accentPressed: "#a90021",
  }),
});

/**
 * Nostr kind used when persisting watch history events.
 *
 * bitvid’s roadmap standardizes on kind 30079 so that watch events, view logs,
 * and media metadata stay in the same family of documents. During the rollout
 * from the legacy 30078 payloads, clients query both kinds so historical data
 * keeps syncing; remove the compatibility fetch once all writers emit the new
 * kind. Operators that want to experiment with a separate list kind (for
 * example, a NIP-51 collection) can flip this number so long as their relays
 * accept the chosen kind.
 */
export const WATCH_HISTORY_KIND = 30079;

/**
 * Identifier applied to the watch-history list when storing it on relays.
 *
 * This becomes the value of the `d` tag so clients can find the correct list
 * without guessing. Customize the slug if you need isolation between multiple
 * bitvid deployments that share relays, but keep it stable once clients begin
 * syncing history.
 */
export const WATCH_HISTORY_LIST_IDENTIFIER = "watch-history";

/**
 * Legacy identifiers that bitvid clients should continue honoring when
 * fetching historical watch-history snapshots.
 */
export const WATCH_HISTORY_LEGACY_LIST_IDENTIFIERS = Object.freeze([
  "watch-history:v2:index",
]);

/**
 * Whether to enable the V2 encrypted watch-history service.
 *
 * The runtime flag that controls this feature defaults to `false` so that new
 * deployments stick with the analytics-only view flow until operators opt in.
 * To enable V2, set `window.__BITVID_RUNTIME_FLAGS__.FEATURE_WATCH_HISTORY_V2 = true`
 * in a bootstrap script (or override the value before the app loads). When the
 * flag stays off, bitvid still emits legacy view events and will honor
 * existing watch-history reads per plan §12, but the sync UI will surface a
 * disabled banner instead of querying relays.
 */
/**
 * Maximum number of watch-history entries to retain per user.
 *
 * The roadmap targets a rolling window of 1,500 items so the UI can highlight
 * recently played videos without ballooning relay storage. Adjust this cap up
 * or down depending on your retention and privacy policies; smaller values
 * reduce storage pressure while larger ones surface a deeper backlog.
 */
export const WATCH_HISTORY_MAX_ITEMS = 1500;

/**
 * Whether clients should resolve watch-history entries in batches.
 *
 * When enabled, bitvid fetches video metadata in grouped queries instead of
 * issuing one request per entry. Operators with relays that struggle under
 * bursty loads can disable batching at the cost of additional round trips.
 */
export const WATCH_HISTORY_BATCH_RESOLVE = true;

/**
 * Maximum number of canonical items each batched watch-history response should
 * include.
 *
 * Leave this as `null` (the default) to return the full
 * `WATCH_HISTORY_MAX_ITEMS` window, even when batching is enabled. Deployments
 * that page through histories in smaller slices can set a positive integer to
 * cap the resolver output so pagination and API responses stay aligned.
 */
export const WATCH_HISTORY_BATCH_PAGE_SIZE = 10;

/**
 * Maximum size of the JSON payload for each watch-history chunk, measured
 * before encryption.
 *
 * bitvid splits large histories across multiple events to stay within relay
 * limits. This cap keeps individual chunks under roughly 60 KB so that
 * encrypted payloads remain relay-friendly even after base64 expansion.
 * Lower the number if your relays enforce tighter limits.
 */
export const WATCH_HISTORY_PAYLOAD_MAX_BYTES = 60000;

/**
 * Number of watch-history events to request when syncing from relays.
 *
 * Chunked histories can span several events. This fetch limit should exceed
 * the maximum number of chunks you expect a client to publish in one snapshot
 * so the UI can stitch the full list back together.
 */
export const WATCH_HISTORY_FETCH_EVENT_LIMIT = 64;

/**
 * How long clients should cache watch-history snapshots in localStorage.
 *
 * A 24-hour window keeps recently played videos available across reloads
 * without requiring a fresh relay sync on every visit. Increase the value for
 * longer-lived caches or decrease it if your deployment needs tighter
 * retention guarantees.
 */
export const WATCH_HISTORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * How long the view counter should treat repeat plays as duplicates.
 *
 * bitvid de-duplicates view events that occur within this rolling window so
 * quick refreshes or stalled replays do not inflate the totals. The default of
 * 24 hours mirrors common analytics tooling, but you can tighten or relax the
 * window depending on how aggressively you want to filter repeat traffic.
 */
export const VIEW_COUNT_DEDUPE_WINDOW_SECONDS = 86_400;

/**
 * How far back the view counter should hydrate historical events during
 * backfills.
 *
 * When a new analytics worker starts up, it can walk older Nostr events to
 * reconstruct totals. Limiting the backfill horizon keeps catch-up jobs
 * bounded—90 days covers recent trends without hammering relays for year-old
 * history. Increase the number if you need deeper analytics or shrink it for
 * lighter start-up workloads.
 */
export const VIEW_COUNT_BACKFILL_MAX_DAYS = 90;

/**
 * How long clients can trust cached view totals before re-fetching.
 *
 * Cached results smooth out traffic spikes and reduce relay load. Five minutes
 * strikes a balance between responsiveness and efficiency; lower the TTL for
 * fresher dashboards or raise it if your analytics traffic is heavy.
 */
export const VIEW_COUNT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Cooldown window (in seconds) between manual "Rebroadcast" attempts.
 *
 * Rebroadcasting is an escape hatch for creators to nudge stale relays. A
 * short cooldown keeps this safeguard from turning into an accidental DDoS.
 * Five minutes provides enough breathing room for relays to catch up while
 * still letting operators retry if a publish genuinely failed.
 */
export const ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS = 5 * 60;
