// Inbound NIP-71 ingest: subscribes to video events published by *other* Nostr
// apps (kinds 21/22/34235/34236), converts them to bitvid video objects, and
// injects them into the active-video store so they flow through the existing
// feed pipeline (whitelist, blacklist, NSFW gate, trust/mute/blur, rendering).
//
// Design — ingest mirrors the whitelist model: bitvid's whitelist is "authors
// allowed to publish/render here," so ingest pulls those same authors' NIP-71
// content from the wider ecosystem. When whitelist mode is ON, the relay
// subscription is scoped to whitelisted pubkeys (bounded, no firehose); when a
// deployer disables whitelist mode, ingest opens to all authors (capped).
//
// All gating is reused, not re-implemented: injected videos carry
// source:"nip71-ingest" + isNsfw (mapped from content-warning), and the
// render-time filter (nostrService.shouldIncludeVideo -> accessControl.canAccess)
// remains the authority. Gated by FEATURE_NIP71_INGEST so a single admin switch
// disables it entirely.

import { FEATURE_NIP71_INGEST } from "../constants.js";
import {
  buildVideoFromNip71Event,
  NIP71_KINDS,
} from "../nostr/nip71IngestAdapter.js";
import { devLogger, userLogger } from "../utils/logger.js";

const FLUSH_DEBOUNCE_MS = 200;
// Coalesce ingest-driven feed refreshes so a burst of incoming events can't
// trigger a re-render/re-subscription storm. The injected videos are already in
// the active store; this only controls how often we *signal* the feed.
const REFRESH_THROTTLE_MS = 8000;
const DEFAULT_LIMIT = 200;
const SUBSCRIPTION_KEY = "nip71-ingest";
// The admin whitelist hydrates asynchronously (remote fetch, then a second hex
// rebuild once NostrTools loads) and does not always emit a change we can hook
// (e.g. loaded-from-cache unchanged). So if the author scope isn't ready at
// start, poll a bounded number of times until it is, instead of silently never
// subscribing.
const OPEN_RETRY_DELAY_MS = 2000;
const MAX_OPEN_ATTEMPTS = 30; // ~60s of retries
// Defer the first subscription until the native feed has rendered (signalled by
// the first videos:updated). Injecting foreign authors hydrates their WoT graph
// (kind 30000), which during cold-start competes with the initial feed load; a
// fallback covers the empty-feed case where no videos:updated ever fires.
const FEED_READY_FALLBACK_MS = 12000;

export function createNip71IngestService({
  nostrClient,
  nostrService,
  accessControl,
  featureEnabled = FEATURE_NIP71_INGEST,
  logger = devLogger,
  flushDelayMs = FLUSH_DEBOUNCE_MS,
  limit = DEFAULT_LIMIT,
  openRetryDelayMs = OPEN_RETRY_DELAY_MS,
  maxOpenAttempts = MAX_OPEN_ATTEMPTS,
  refreshThrottleMs = REFRESH_THROTTLE_MS,
  feedReadyFallbackMs = FEED_READY_FALLBACK_MS,
} = {}) {
  let subscription = null;
  let buffer = [];
  let flushTimer = null;
  let retryTimer = null;
  let attemptsLeft = maxOpenAttempts;
  let offWhitelistChange = null;
  let started = false;
  let lastRefreshAt = 0;
  let pendingRefreshTimer = null;
  let deferArmed = false;
  let deferTimer = null;
  let offFeedReady = null;

  function isAvailable() {
    return (
      featureEnabled === true &&
      !!nostrClient &&
      typeof nostrClient.getSubscriptionManager === "function"
    );
  }

  // Build the relay filter set. Returns null when there is nothing to ingest
  // (whitelist mode on but no whitelisted authors yet).
  function resolveFilters() {
    const kinds = Array.from(NIP71_KINDS);
    const whitelistOn = accessControl?.whitelistMode?.() === true;
    if (whitelistOn) {
      const authors =
        typeof accessControl?.getWhitelistPubkeys === "function"
          ? accessControl.getWhitelistPubkeys().filter(Boolean)
          : [];
      if (!authors.length) {
        return null;
      }
      return [{ kinds, authors, limit }];
    }
    return [{ kinds, limit }];
  }

  function scheduleFlush() {
    if (flushTimer) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, flushDelayMs);
  }

  // Inject a converted foreign video into the active store. Native bitvid videos
  // always win for a given root; among ingested videos, newest wins.
  function injectVideo(video) {
    if (!video || video.invalid) {
      return false;
    }
    const activeMap = nostrClient?.activeMap;
    const allEvents = nostrClient?.allEvents;
    if (!(activeMap instanceof Map) || !(allEvents instanceof Map)) {
      return false;
    }
    const key =
      typeof nostrClient.getActiveKey === "function"
        ? nostrClient.getActiveKey(video)
        : "";
    if (!key) {
      return false;
    }
    const existing = activeMap.get(key);
    if (existing) {
      const existingForeign = existing.source === "nip71-ingest";
      if (!existingForeign) {
        return false; // native bitvid video wins
      }
      if (Number(existing.created_at) >= Number(video.created_at)) {
        return false; // older or equal ingest
      }
    }
    activeMap.set(key, video);
    allEvents.set(video.id, video);
    return true;
  }

  function flush() {
    if (!buffer.length) {
      return 0;
    }
    const events = buffer;
    buffer = [];

    // Collapse to newest-per-root within the batch before injecting.
    const newestByRoot = new Map();
    for (const event of events) {
      const video = buildVideoFromNip71Event(event);
      if (video.invalid || !video.videoRootId) {
        continue;
      }
      const prev = newestByRoot.get(video.videoRootId);
      if (!prev || Number(video.created_at) > Number(prev.created_at)) {
        newestByRoot.set(video.videoRootId, video);
      }
    }

    let injected = 0;
    for (const video of newestByRoot.values()) {
      if (injectVideo(video)) {
        injected += 1;
      }
    }

    // Visible (not dev-gated) so ingest is observable in any build while we
    // stabilize the feature.
    userLogger.info(
      `[nip71Ingest] flush: ${events.length} event(s) in, ${injected} injected`,
    );

    if (injected > 0) {
      requestRefresh();
    }

    return injected;
  }

  // Signal the feed to re-render, throttled so a burst of ingested events can't
  // drive a re-render/re-subscription storm. The injected videos already live in
  // the active store; the feed re-reads getFilteredActiveVideos itself, so this
  // is purely a "refresh now" nudge.
  function requestRefresh() {
    if (pendingRefreshTimer) {
      return;
    }
    const now = Date.now();
    const elapsed = now - lastRefreshAt;
    if (elapsed >= refreshThrottleMs) {
      emitRefresh();
      return;
    }
    pendingRefreshTimer = setTimeout(() => {
      pendingRefreshTimer = null;
      emitRefresh();
    }, refreshThrottleMs - elapsed);
  }

  function emitRefresh() {
    lastRefreshAt = Date.now();
    let videos = [];
    try {
      videos =
        typeof nostrService?.getFilteredActiveVideos === "function"
          ? nostrService.getFilteredActiveVideos()
          : [];
    } catch (error) {
      logger?.warn?.("[nip71Ingest] getFilteredActiveVideos failed", error);
    }
    // Confirm ingested videos survive the feed filter (whitelist/NSFW/etc.).
    const foreignCount = Array.isArray(videos)
      ? videos.filter((v) => v?.source === "nip71-ingest").length
      : 0;
    userLogger.info(
      `[nip71Ingest] refresh: ${foreignCount} ingested of ${videos.length} in filtered feed`,
    );
    if (typeof nostrService?.emit === "function") {
      nostrService.emit("videos:updated", {
        videos,
        deleted: [],
        reason: "nip71-ingest",
      });
    }
  }

  // Defer the first start until the native feed has rendered (first
  // videos:updated), with a fallback timer for the empty-feed case. Keeps ingest
  // off the cold-start critical path.
  function startWhenFeedReady() {
    if (started || deferArmed || !isAvailable()) {
      return false;
    }
    deferArmed = true;

    const begin = () => {
      if (typeof offFeedReady === "function") {
        offFeedReady();
        offFeedReady = null;
      }
      if (deferTimer) {
        clearTimeout(deferTimer);
        deferTimer = null;
      }
      deferArmed = false;
      start();
    };

    if (typeof nostrService?.on === "function") {
      offFeedReady = nostrService.on("videos:updated", begin);
    }
    deferTimer = setTimeout(begin, feedReadyFallbackMs);
    return true;
  }

  function start() {
    if (started || !isAvailable()) {
      return false;
    }
    started = true;
    attemptsLeft = maxOpenAttempts;

    // Re-subscribe when the whitelist changes so the author scope stays current.
    if (typeof accessControl?.onWhitelistChange === "function") {
      offWhitelistChange = accessControl.onWhitelistChange(() => {
        restart();
      });
    }

    return attemptOpen();
  }

  // Open the subscription; if the author scope isn't ready yet (whitelist still
  // hydrating), retry on a timer rather than giving up silently.
  function attemptOpen() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (subscription) {
      return true;
    }
    const opened = openSubscription();
    if (opened) {
      return true;
    }
    if (started && attemptsLeft > 0) {
      attemptsLeft -= 1;
      retryTimer = setTimeout(attemptOpen, openRetryDelayMs);
    }
    return false;
  }

  function openSubscription() {
    const filters = resolveFilters();
    if (!filters) {
      return false; // nothing to ingest yet (e.g. whitelist not hydrated) — retry
    }
    try {
      const manager = nostrClient.getSubscriptionManager();
      subscription = manager.subscribe({
        key: SUBSCRIPTION_KEY,
        filters,
        label: "nip71-ingest",
        onEvent: (event) => {
          if (event && NIP71_KINDS.has(Number(event.kind))) {
            buffer.push(event);
            scheduleFlush();
          }
        },
      });
      const authorCount = Array.isArray(filters[0]?.authors)
        ? filters[0].authors.length
        : "all";
      userLogger.info(
        `[nip71Ingest] subscribed (authors: ${authorCount}, kinds: ${filters[0]?.kinds?.join(",")})`,
      );
      return true;
    } catch (error) {
      logger?.warn?.("[nip71Ingest] subscribe failed", error);
      subscription = null;
      return false;
    }
  }

  function closeSubscription() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (pendingRefreshTimer) {
      clearTimeout(pendingRefreshTimer);
      pendingRefreshTimer = null;
    }
    buffer = [];
    if (subscription && typeof subscription.close === "function") {
      try {
        subscription.close();
      } catch (error) {
        logger?.warn?.("[nip71Ingest] close failed", error);
      }
    }
    subscription = null;
  }

  function restart() {
    if (!started) {
      return false;
    }
    closeSubscription();
    attemptsLeft = maxOpenAttempts;
    return attemptOpen();
  }

  function stop() {
    closeSubscription();
    if (typeof offFeedReady === "function") {
      try {
        offFeedReady();
      } catch (error) {
        // best-effort
      }
      offFeedReady = null;
    }
    if (deferTimer) {
      clearTimeout(deferTimer);
      deferTimer = null;
    }
    deferArmed = false;
    if (typeof offWhitelistChange === "function") {
      try {
        offWhitelistChange();
      } catch (error) {
        // best-effort
      }
      offWhitelistChange = null;
    }
    started = false;
  }

  return {
    isAvailable,
    startWhenFeedReady,
    start,
    stop,
    restart,
    // Exposed for tests: deterministic flush + single-video injection.
    flush,
    injectVideo,
    resolveFilters,
  };
}
