// config/instance-config.js
// -----------------------------------------------------------------------------
// BitVid instance configuration
// -----------------------------------------------------------------------------
//
// This file consolidates the values that operators usually customize when they
// deploy their own BitVid instance. Update the exports below to match your
// environment, commit the changes, and redeploy. Leaving this file in the repo
// (instead of hidden in environment variables) makes it easy for future
// maintainers to understand how your instance is configured.
//
// Each setting includes guidance about how BitVid uses the value and what
// adjustments are safe. When in doubt, mirror the structure shown here so other
// contributors can follow along.

/**
 * The primary administrator for this BitVid instance.
 *
 * BitVid treats this Nostr public key (npub) as the "Super Admin". This user
 * cannot be removed from moderator lists, and only they can promote new
 * moderators or toggle whitelist-only mode. Replace the string below with the
 * npub of the account you want to act as the ultimate authority for your
 * deployment.
 */
export const ADMIN_SUPER_NPUB =
  "npub15jnttpymeytm80hatjqcvhhqhzrhx6gxp8pq0wn93rhnu8s9h9dsha32lx";

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
 * Super Admin profile publishing a `lud16` so BitVid still knows where to route
 * fees when they are enabled.
 */
export const PLATFORM_LUD16_OVERRIDE = adammalin@strike.me;

/**
 * Optional list of relays to seed new sessions with instead of the defaults.
 *
 * Provide WSS URLs (e.g., `"wss://relay.example.com"`). Leave the array empty
 * to keep BitVid’s bundled defaults. Operators that need a custom bootstrap set
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
 * Set this to `true` if you want BitVid to start with whitelist-only access and
 * require an explicit opt-out. Set to `false` to allow all creators by default.
 * Operators can still toggle the mode at runtime; this value only controls the
 * default state when no preference has been stored in localStorage yet.
 */
export const DEFAULT_WHITELIST_MODE_ENABLED = true;

/**
 * Nostr kind used when persisting watch history events.
 *
 * BitVid’s roadmap standardizes on kind 30079 so that watch events, view logs,
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
 * BitVid deployments that share relays, but keep it stable once clients begin
 * syncing history.
 */
export const WATCH_HISTORY_LIST_IDENTIFIER = "watch-history";

/**
 * Legacy identifiers that BitVid clients should continue honoring when
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
 * flag stays off, BitVid still emits legacy view events and will honor
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
 * When enabled, BitVid fetches video metadata in grouped queries instead of
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
 * BitVid splits large histories across multiple events to stay within relay
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
 * BitVid de-duplicates view events that occur within this rolling window so
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
