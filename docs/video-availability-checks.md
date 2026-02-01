# Video availability checks

This document explains how bitvid probes URL and torrent availability, caches results, and uses those outcomes to decide whether video cards remain visible. For playback behavior that depends on these probes, see [Playback fallback](playback-fallback.md).

## URL health checks (hosted URL/CDN)

### Observation & trigger

`js/urlHealthObserver.js` wires a card observer that looks for cards containing a URL health badge (`[data-url-health-state]`). When a card intersects the viewport, the observer:

- Reads `data-url-health-url` and `data-url-health-event-id` from the card or badge.
- Skips checks if the current state is already resolved (anything other than `checking`).
- Calls the `onCheck` handler provided by the caller (currently `bitvidApp.handleUrlHealthBadge`).

### Orchestration

`js/app.js` owns the badge/probe orchestration:

- `handleUrlHealthBadge` trims the URL, checks cache, and sets the badge to `checking` if no cached entry exists.
- It deduplicates probes using the in-flight cache (via `getInFlightUrlProbe`/`setInFlightUrlProbe` in `js/state/cache.js`).
- `probeUrl(..., { confirmPlayable: true })` returns an outcome that is normalized into a badge state:
  - `ok` → `healthy`
  - `opaque`/`unknown` → `unknown`
  - `timeout` → `timeout`
  - `error` → `offline`
- `updateUrlHealthBadge` updates the badge UI and mirrors `data-url-health-state` on the card, then calls `updateVideoCardSourceVisibility` to reflect the state.

### Caching

`js/state/cache.js` stores URL health entries keyed by event ID with TTL support:

- `getCachedUrlHealth(eventId, url)` checks in-memory first, then local storage; mismatched URLs or expired entries are discarded.
- `storeUrlHealth(eventId, url, result, ttlMs)` writes `status`, `message`, `url`, `expiresAt`, and `lastCheckedAt`.
- Constants exported in `urlHealthConstants` control caching and retry:
  - `URL_HEALTH_TTL_MS` (default TTL)
  - `URL_HEALTH_TIMEOUT_RETRY_MS` (shorter TTL for `timeout`/`unknown`)
  - `URL_PROBE_TIMEOUT_RETRY_MS` (probe timeout fallback used by `probeUrl`)

## Torrent (stream) health checks

For a detailed architectural overview of the WebTorrent implementation, including webseed handling and Service Worker integration, see [WebTorrent Architecture & Strategy](webtorrent-architecture.md).

### Card-level probes (`js/gridHealth.js`)

The grid health module manages per-card WebTorrent probes and badge updates:

- Uses an `IntersectionObserver` to trigger checks as cards become visible (prioritized by viewport proximity).
- Builds a probe queue with concurrency limits, in-flight de-duping, and a short cache (`PROBE_CACHE_TTL_MS`).
- `torrentClient.probePeers` performs the actual peer lookup, bounded by `PROBE_TIMEOUT_MS` and `PROBE_POLL_COUNT`.
- Results are normalized via `normalizeResult`:
  - `healthy` is only true when peers > 0.
  - `peers` is clamped to ≥ 0 (and to ≥ 1 when healthy).
  - `reason` is normalized into known values such as `timeout`, `no-trackers`, `invalid`, etc.
- `setBadge` applies `data-stream-health-state`, `data-stream-health-peers`, and `data-stream-health-reason` on both the card and badge, then calls `updateVideoCardSourceVisibility`.

## Card visibility rules

`js/utils/cardSourceVisibility.js` centralizes hide/show behavior based on health datasets:

- If the viewer owns the card (`data-owner-is-viewer="true"`), the card always remains visible.
- Otherwise, the card is hidden only when **both** sources are known bad and **neither** is pending:
  - `data-url-health-state` is not `healthy` and not `checking`, **and**
  - `data-stream-health-state` is not `healthy` and not `checking`.
- Any pending status keeps the card visible until a definitive result arrives.

`js/ui/components/VideoCard.js` is responsible for setting the dataset values that drive this logic:

- URL datasets: `data-url-health-state`, `data-url-health-reason`, `data-url-health-event-id`, `data-url-health-url`.
- Stream datasets: `data-stream-health-state`, `data-stream-health-reason`, `data-stream-health-peers`.
- Magnet presence: `data-magnet` and `data-torrent-supported`.

## Probe timeline (typical flow)

1. **Card render** — `VideoCard` sets the initial dataset fields, usually `checking` when a source exists.
2. **Badge attachment** — `bitvidApp` renders badge markup and wires observers (`attachUrlHealthBadges` / `attachHealthBadges`).
3. **Scroll/observer trigger** — as cards enter the viewport, `urlHealthObserver` and `gridHealth` schedule probes.
4. **Cache reuse** — if cached results exist (URL cache in `js/state/cache.js`, torrent cache in `js/gridHealth.js` / `js/healthService.js`), the badges update immediately without re-probing.
5. **Probe completion** — results update badge text, dataset state, and card visibility (`updateVideoCardSourceVisibility`).

For how these checks interact with playback fallbacks, see [Playback fallback](playback-fallback.md).
