// js/subscriptions.js
import {
  nostrClient,
  convertEventToVideo as sharedConvertEventToVideo,
  requestDefaultExtensionPermissions,
} from "./nostr.js";
import {
  buildSubscriptionListEvent,
  SUBSCRIPTION_LIST_IDENTIFIER
} from "./nostrEventSchemas.js";
import { getSidebarLoadingMarkup } from "./sidebarLoading.js";
import {
  publishEventToRelays,
  assertAnyRelayAccepted
} from "./nostrPublish.js";
import { getApplication } from "./applicationContext.js";
import { VideoListView } from "./ui/views/VideoListView.js";
import { ALLOW_NSFW_CONTENT } from "./config.js";
import { devLogger, userLogger } from "./utils/logger.js";
import moderationService from "./services/moderationService.js";
import nostrService from "./services/nostrService.js";

function normalizeHexPubkey(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

const getApp = () => getApplication();

/**
 * Manages the user's subscription list (kind=30002) *privately*,
 * using NIP-04 encryption for the content field.
 * Also handles fetching and rendering subscribed channels' videos
 * in the same card style as your home page.
 */
class SubscriptionsManager {
  constructor() {
    this.subscribedPubkeys = new Set();
    this.subsEventId = null;
    this.loaded = false;
    this.subscriptionListView = null;
    this.lastRunOptions = null;
    this.lastResult = null;
    this.lastContainerId = null;
    this.unsubscribeFromNostrUpdates = null;
    this.pendingRefreshPromise = null;
    this.scheduledRefreshDetail = null;
    this.isRunningFeed = false;
    this.hasRenderedOnce = false;
    this.ensureNostrServiceListener();
  }

  /**
   * Decrypt the subscription list from kind=30002 (d="subscriptions").
   */
  async loadSubscriptions(userPubkey) {
    if (!userPubkey) {
      userLogger.warn("[SubscriptionsManager] No pubkey => cannot load subs.");
      return;
    }
    try {
      const filter = {
        kinds: [30002],
        authors: [userPubkey],
        "#d": [SUBSCRIPTION_LIST_IDENTIFIER],
        limit: 1
      };

      const relayPromises = [];
      for (const url of nostrClient.relays) {
        const listPromise = nostrClient.pool
          .list([url], [filter])
          .catch((err) => {
            userLogger.error(`[SubscriptionsManager] Relay error at ${url}`, err);
            throw err;
          });
        relayPromises.push(listPromise);
      }

      const settledResults = await Promise.allSettled(relayPromises);
      const events = [];
      for (const outcome of settledResults) {
        if (outcome.status === "fulfilled" && Array.isArray(outcome.value) && outcome.value.length) {
          events.push(...outcome.value);
        }
      }

      if (!events.length) {
        this.subscribedPubkeys.clear();
        this.subsEventId = null;
        this.loaded = true;
        return;
      }

      // Sort by created_at desc, pick newest
      events.sort((a, b) => b.created_at - a.created_at);
      const newest = events[0];
      this.subsEventId = newest.id;

      const permissionResult = await requestDefaultExtensionPermissions();
      if (!permissionResult.ok) {
        userLogger.warn(
          "[SubscriptionsManager] Extension permissions denied while loading subscriptions; treating list as empty.",
          permissionResult.error,
        );
        this.subscribedPubkeys.clear();
        this.subsEventId = null;
        this.loaded = true;
        return;
      }

      let decryptedStr = "";
      try {
        decryptedStr = await window.nostr.nip04.decrypt(
          userPubkey,
          newest.content
        );
      } catch (errDecrypt) {
        userLogger.error("[SubscriptionsManager] Decryption failed:", errDecrypt);
        this.subscribedPubkeys.clear();
        this.subsEventId = null;
        this.loaded = true;
        return;
      }

      const parsed = JSON.parse(decryptedStr);
      const subArray = Array.isArray(parsed.subPubkeys)
        ? parsed.subPubkeys
        : [];
      const normalized = subArray
        .map((value) => normalizeHexPubkey(value))
        .filter((value) => Boolean(value));
      this.subscribedPubkeys = new Set(normalized);

      this.loaded = true;
    } catch (err) {
      userLogger.error("[SubscriptionsManager] Failed to load subs:", err);
    }
  }

  isSubscribed(channelHex) {
    const normalized = normalizeHexPubkey(channelHex);
    if (!normalized) {
      return false;
    }
    return this.subscribedPubkeys.has(normalized);
  }

  getSubscribedAuthors() {
    return Array.from(this.subscribedPubkeys);
  }

  async addChannel(channelHex, userPubkey) {
    const normalizedChannel = normalizeHexPubkey(channelHex);
    if (!userPubkey) {
      throw new Error("No user pubkey => cannot addChannel.");
    }
    if (!normalizedChannel) {
      devLogger.warn("Attempted to subscribe to invalid pubkey", channelHex);
      return;
    }
    if (this.subscribedPubkeys.has(normalizedChannel)) {
      devLogger.log("Already subscribed to", channelHex);
      return;
    }
    this.subscribedPubkeys.add(normalizedChannel);
    await this.publishSubscriptionList(userPubkey);
    this.refreshActiveFeed({ reason: "subscription-update" }).catch((error) => {
      userLogger.warn(
        "[SubscriptionsManager] Failed to refresh after adding subscription:",
        error
      );
    });
  }

  async removeChannel(channelHex, userPubkey) {
    const normalizedChannel = normalizeHexPubkey(channelHex);
    if (!userPubkey) {
      throw new Error("No user pubkey => cannot removeChannel.");
    }
    if (!normalizedChannel) {
      devLogger.warn("Attempted to remove invalid pubkey from subscriptions", channelHex);
      return;
    }
    if (!this.subscribedPubkeys.has(normalizedChannel)) {
      devLogger.log("Channel not found in subscription list:", channelHex);
      return;
    }
    this.subscribedPubkeys.delete(normalizedChannel);
    await this.publishSubscriptionList(userPubkey);
    this.refreshActiveFeed({ reason: "subscription-update" }).catch((error) => {
      userLogger.warn(
        "[SubscriptionsManager] Failed to refresh after removing subscription:",
        error
      );
    });
  }

  /**
   * Encrypt (NIP-04) + publish the updated subscription set
   * as kind=30002 with ["d", "subscriptions"] to be replaceable.
   */
  async publishSubscriptionList(userPubkey) {
    if (!userPubkey) {
      throw new Error("No pubkey => cannot publish subscription list.");
    }

    const permissionResult = await requestDefaultExtensionPermissions();
    if (!permissionResult.ok) {
      userLogger.warn(
        "[SubscriptionsManager] Extension permissions denied while updating subscriptions.",
        permissionResult.error,
      );
      const error = new Error(
        "The NIP-07 extension must allow encryption and signing before updating subscriptions.",
      );
      error.code = "extension-permission-denied";
      error.cause = permissionResult.error;
      throw error;
    }

    const plainObj = { subPubkeys: Array.from(this.subscribedPubkeys) };
    const plainStr = JSON.stringify(plainObj);

    /*
     * The subscription list is stored as a NIP-04 message to self, so both
     * encryption and decryption intentionally use the user's own pubkey.
     * Extensions are expected to support this encrypt-to-self flow; altering
     * the target would break loadSubscriptions, which decrypts with the same
     * pubkey. Any future sharing model (e.g., sharing with another user) will
     * need a parallel read path and should not overwrite this behavior.
     */
    let cipherText = "";
    try {
      cipherText = await window.nostr.nip04.encrypt(userPubkey, plainStr);
    } catch (err) {
      userLogger.error("Encryption failed:", err);
      throw err;
    }

    const evt = buildSubscriptionListEvent({
      pubkey: userPubkey,
      created_at: Math.floor(Date.now() / 1000),
      content: cipherText
    });

    let signedEvent;
    try {
      signedEvent = await window.nostr.signEvent(evt);
    } catch (signErr) {
      userLogger.error("Failed to sign subscription list:", signErr);
      throw signErr;
    }

    const publishResults = await publishEventToRelays(
      nostrClient.pool,
      nostrClient.relays,
      signedEvent
    );

    let publishSummary;
    try {
      publishSummary = assertAnyRelayAccepted(publishResults, {
        context: "subscription list"
      });
    } catch (publishError) {
      if (publishError?.relayFailures?.length) {
        publishError.relayFailures.forEach(
          ({ url, error: relayError, reason }) => {
            userLogger.error(
              `[SubscriptionsManager] Subscription list rejected by ${url}: ${reason}`,
              relayError || reason
            );
          }
        );
      }
      throw publishError;
    }

    if (publishSummary.failed.length) {
      publishSummary.failed.forEach(({ url, error: relayError }) => {
        const reason =
          relayError instanceof Error
            ? relayError.message
            : relayError
              ? String(relayError)
              : "publish failed";
        userLogger.warn(
          `[SubscriptionsManager] Subscription list not accepted by ${url}: ${reason}`,
          relayError
        );
      });
    }

    this.subsEventId = signedEvent.id;
    const acceptedUrls = publishSummary.accepted.map(({ url }) => url);
    devLogger.log(
      "Subscription list published, event id:",
      signedEvent.id,
      "accepted relays:",
      acceptedUrls
    );
  }

  /**
   * If not loaded, load subs, then fetch + render videos
   * in #subscriptionsVideoList with the same style as app.renderVideoList.
   */
  async showSubscriptionVideos(
    userPubkey,
    containerId = "subscriptionsVideoList",
    options = {}
  ) {
    const limitCandidate = Number(options?.limit);
    const limit =
      Number.isFinite(limitCandidate) && limitCandidate > 0
        ? Math.floor(limitCandidate)
        : null;
    const reason =
      typeof options?.reason === "string" && options.reason.trim()
        ? options.reason.trim()
        : undefined;

    this.lastContainerId = containerId;

    const container = document.getElementById(containerId);
    if (!userPubkey) {
      if (container) {
        container.innerHTML =
          "<p class='text-muted-strong'>Please log in first.</p>";
      }
      this.lastRunOptions = null;
      this.lastResult = null;
      this.hasRenderedOnce = Boolean(container);
      return null;
    }

    if (!this.loaded) {
      try {
        await this.loadSubscriptions(userPubkey);
      } catch (error) {
        userLogger.error(
          "[SubscriptionsManager] Failed to load subscriptions while rendering feed:",
          error,
        );
      }
    }

    const channelHexes = this.getSubscribedAuthors();
    if (!container) {
      this.lastRunOptions = {
        actorPubkey: userPubkey,
        limit,
        containerId
      };
      this.hasRenderedOnce = false;
      return null;
    }

    if (!channelHexes.length) {
      container.innerHTML =
        "<p class='text-muted-strong'>No subscriptions found.</p>";
      this.lastRunOptions = {
        actorPubkey: userPubkey,
        limit,
        containerId
      };
      this.lastResult = { items: [], metadata: { reason: "no-subscriptions" } };
      this.hasRenderedOnce = true;
      return this.lastResult;
    }

    container.innerHTML = getSidebarLoadingMarkup("Fetching subscriptions…");

    this.lastRunOptions = {
      actorPubkey: userPubkey,
      limit,
      containerId,
      reason
    };

    this.ensureFeedRegistered();
    this.ensureNostrServiceListener();

    if (typeof nostrService?.awaitInitialLoad === "function") {
      try {
        await nostrService.awaitInitialLoad();
      } catch (error) {
        devLogger.warn(
          "[SubscriptionsManager] Failed to await nostrService initial load:",
          error
        );
      }
    }

    const engine = this.getFeedEngine();
    if (!engine || typeof engine.run !== "function") {
      container.innerHTML =
        "<p class='text-muted-strong'>Subscriptions are unavailable right now.</p>";
      this.hasRenderedOnce = true;
      return null;
    }

    const app = getApp();
    const runtime = this.buildFeedRuntime({
      app,
      authors: channelHexes,
      limit,
    });
    const runOptions = {
      actorPubkey: userPubkey,
      limit,
      runtime,
      hooks: {
        subscriptions: {
          resolveAuthors: () => this.getSubscribedAuthors()
        }
      }
    };

    try {
      this.isRunningFeed = true;
      const result = await engine.run("subscriptions", runOptions);

      const videos = Array.isArray(result?.items)
        ? result.items.map((item) => item?.video).filter(Boolean)
        : [];

      const metadata = result && typeof result.metadata === "object"
        ? { ...result.metadata }
        : {};

      if (!metadata.feed) {
        metadata.feed = "subscriptions";
      }
      if (limit) {
        metadata.limit = limit;
      }
      if (reason) {
        metadata.reason = reason;
      }

      const enrichedResult = { ...result, metadata };

      if (app?.videosMap instanceof Map) {
        videos.forEach((video) => {
          if (video && typeof video.id === "string" && video.id) {
            app.videosMap.set(video.id, video);
          }
        });
      }

      this.lastResult = enrichedResult;
      this.renderSameGridStyle(enrichedResult, containerId, {
        limit,
        reason,
        emptyMessage:
          "No playable subscription videos found yet. We'll keep watching for new posts.",
      });
      this.hasRenderedOnce = true;
      return enrichedResult;
    } catch (error) {
      userLogger.error(
        "[SubscriptionsManager] Failed to run subscriptions feed:",
        error
      );
      if (container && this.lastResult) {
        const fallbackReason = reason
          ? `${reason}:cached`
          : "cached-result";
        this.renderSameGridStyle(this.lastResult, containerId, {
          limit,
          reason: fallbackReason,
        });
      } else if (container) {
        container.innerHTML =
          "<p class='text-muted-strong'>Unable to load subscriptions right now.</p>";
      }
      this.hasRenderedOnce = Boolean(container);
      return this.lastResult;
    } finally {
      this.isRunningFeed = false;
      this.processScheduledRefresh();
    }
  }

  ensureNostrServiceListener() {
    if (this.unsubscribeFromNostrUpdates || typeof nostrService?.on !== "function") {
      return;
    }

    this.unsubscribeFromNostrUpdates = nostrService.on(
      "videos:updated",
      (detail) => {
        this.handleNostrVideosUpdated(detail);
      }
    );
  }

  handleNostrVideosUpdated(detail) {
    if (!detail || !Array.isArray(detail.videos) || !detail.videos.length) {
      return;
    }

    this.scheduledRefreshDetail = detail;
    this.processScheduledRefresh();
  }

  processScheduledRefresh() {
    if (!this.lastRunOptions || !this.hasRenderedOnce) {
      return null;
    }

    if (!this.scheduledRefreshDetail) {
      return null;
    }

    if (this.isRunningFeed || this.pendingRefreshPromise) {
      return null;
    }

    const detail = this.scheduledRefreshDetail;
    this.scheduledRefreshDetail = null;

    const refreshReason =
      typeof detail?.reason === "string" && detail.reason
        ? `nostr:${detail.reason}`
        : "nostr:update";

    this.pendingRefreshPromise = this.refreshActiveFeed({ reason: refreshReason })
      .catch((error) => {
        devLogger.warn(
          "[SubscriptionsManager] Failed to refresh after nostrService update:",
          error
        );
      })
      .finally(() => {
        this.pendingRefreshPromise = null;
        if (this.scheduledRefreshDetail) {
          this.processScheduledRefresh();
        }
      });

    return this.pendingRefreshPromise;
  }

  ensureFeedRegistered() {
    const app = getApp();
    if (typeof app?.registerSubscriptionsFeed === "function") {
      try {
        app.registerSubscriptionsFeed();
      } catch (error) {
        userLogger.warn(
          "[SubscriptionsManager] Failed to register subscriptions feed:",
          error
        );
      }
    }
  }

  getFeedEngine() {
    const app = getApp();
    return app?.feedEngine || null;
  }

  buildFeedRuntime({ app, authors = [], limit = null } = {}) {
    const normalizedAuthors = Array.isArray(authors)
      ? authors
          .map((author) => normalizeHexPubkey(author))
          .filter((author) => Boolean(author))
      : [];

    const blacklist =
      app?.blacklistedEventIds instanceof Set
        ? new Set(app.blacklistedEventIds)
        : new Set();

    const isAuthorBlocked =
      typeof app?.isAuthorBlocked === "function"
        ? (pubkey) => app.isAuthorBlocked(pubkey)
        : () => false;

    const limitCandidate = Number(limit);
    const normalizedLimit =
      Number.isFinite(limitCandidate) && limitCandidate > 0
        ? Math.floor(limitCandidate)
        : null;

    return {
      subscriptionAuthors: normalizedAuthors,
      authors: normalizedAuthors,
      blacklistedEventIds: blacklist,
      isAuthorBlocked,
      limit: normalizedLimit
    };
  }

  /**
   * Renders the feed in the same style as home.
   * This includes gear menu, time-ago, lazy load, clickable authors, etc.
   */
  renderSameGridStyle(result, containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    const app = getApp();
    const items = Array.isArray(result?.items) ? result.items : [];
    const metadata =
      result && typeof result.metadata === "object"
        ? { ...result.metadata }
        : {};

    if (!metadata.feed) {
      metadata.feed = "subscriptions";
    }

    const limitCandidate = Number(options?.limit);
    const limit =
      Number.isFinite(limitCandidate) && limitCandidate > 0
        ? Math.floor(limitCandidate)
        : null;

    const limitedItems = limit ? items.slice(0, limit) : items;
    const videos = limitedItems
      .map((item) => (item && typeof item === "object" ? item.video : null))
      .filter((video) => video && typeof video === "object");

    if (!videos.length) {
      const reasonDetail =
        typeof metadata.reason === "string" && metadata.reason
          ? metadata.reason
          : "empty";
      this.renderEmptyState(container, {
        message: options?.emptyMessage,
        reason: reasonDetail,
        metadata,
      });
      return;
    }

    const listView = this.getListView(container, app);
    if (!listView) {
      container.innerHTML = `
        <p class="flex justify-center items-center h-full w-full text-center text-muted-strong">
          Unable to render subscriptions feed.
        </p>`;
      return;
    }

    listView.mount(container);

    if (app?.videosMap instanceof Map) {
      listView.state.videosMap = app.videosMap;
    }

    const enrichedMetadata = {
      ...metadata,
      feed: "subscriptions"
    };
    if (limit) {
      enrichedMetadata.limit = limit;
    }
    if (typeof options?.reason === "string" && options.reason) {
      enrichedMetadata.reason = options.reason;
    }

    listView.state.feedMetadata = enrichedMetadata;
    listView.render(videos, enrichedMetadata);
  }

  renderEmptyState(container, { message, reason, metadata } = {}) {
    if (!container) {
      return;
    }

    const copy =
      typeof message === "string" && message.trim()
        ? message.trim()
        : "No playable subscription videos found yet. We'll keep watching for new posts.";

    container.innerHTML = getSidebarLoadingMarkup(copy, { showSpinner: false });

    if (this.subscriptionListView && this.subscriptionListView.state) {
      const currentMetadata =
        this.subscriptionListView.state.feedMetadata &&
        typeof this.subscriptionListView.state.feedMetadata === "object"
          ? { ...this.subscriptionListView.state.feedMetadata }
          : {};

      if (metadata && typeof metadata === "object") {
        Object.assign(currentMetadata, metadata);
      }

      if (reason && typeof reason === "string") {
        currentMetadata.reason = reason;
      } else if (!currentMetadata.reason) {
        currentMetadata.reason = "empty";
      }

      this.subscriptionListView.state.feedMetadata = currentMetadata;
    }
  }

  getListView(container, app) {
    if (this.subscriptionListView) {
      return this.subscriptionListView;
    }

    if (!container) {
      return null;
    }

    const doc = container.ownerDocument || document;
    const baseView = app?.videoListView || null;

    const badgeHelpers = baseView?.badgeHelpers || {
      attachHealthBadges: () => {},
      attachUrlHealthBadges: () => {}
    };

    const formatTimeAgo = (timestamp) => {
      if (typeof app?.formatTimeAgo === "function") {
        return app.formatTimeAgo(timestamp);
      }
      if (typeof baseView?.formatters?.formatTimeAgo === "function") {
        return baseView.formatters.formatTimeAgo(timestamp);
      }
      return timestamp;
    };

    const formatViewCountLabel = (total) => {
      if (typeof baseView?.formatters?.formatViewCountLabel === "function") {
        return baseView.formatters.formatViewCountLabel(total);
      }
      return typeof total === "number" ? total.toLocaleString() : `${total}`;
    };

    const assets = baseView?.assets || {
      fallbackThumbnailSrc: "assets/jpg/video-thumbnail-fallback.jpg",
      unsupportedBtihMessage:
        "This magnet link is missing a compatible BitTorrent v1 info hash."
    };

    const loadedThumbnails =
      app?.loadedThumbnails instanceof Map
        ? app.loadedThumbnails
        : baseView?.state?.loadedThumbnails instanceof Map
          ? baseView.state.loadedThumbnails
          : new Map();

    const videosMap =
      app?.videosMap instanceof Map
        ? app.videosMap
        : baseView?.state?.videosMap instanceof Map
          ? baseView.state.videosMap
          : new Map();

    const urlHealthCache =
      app?.urlHealthSnapshots instanceof Map
        ? app.urlHealthSnapshots
        : baseView?.state?.urlHealthByVideoId instanceof Map
          ? baseView.state.urlHealthByVideoId
          : new Map();

    const streamHealthCache =
      app?.streamHealthSnapshots instanceof Map
        ? app.streamHealthSnapshots
        : baseView?.state?.streamHealthByVideoId instanceof Map
          ? baseView.state.streamHealthByVideoId
          : new Map();

    const listViewConfig = {
      document: doc,
      container,
      mediaLoader: app?.mediaLoader || baseView?.mediaLoader || null,
      badgeHelpers,
      formatters: {
        formatTimeAgo,
        formatViewCountLabel
      },
      helpers: {
        escapeHtml: (value) => app?.escapeHTML?.(value) ?? value,
        isMagnetSupported: (magnet) =>
          app?.isMagnetUriSupported?.(magnet) ?? false,
        toLocaleString: (value) =>
          typeof value === "number" ? value.toLocaleString() : value
      },
      assets,
      state: {
        loadedThumbnails,
        videosMap,
        urlHealthByVideoId: urlHealthCache,
        streamHealthByVideoId: streamHealthCache
      },
      utils: {
        dedupeVideos: (videos) => (Array.isArray(videos) ? [...videos] : []),
        getAllEvents: () => Array.from(nostrClient.allEvents.values()),
        hasOlderVersion: (video, events) =>
          app?.hasOlderVersion?.(video, events) ?? false,
        derivePointerInfo: (video) =>
          app?.deriveVideoPointerInfo?.(video) ?? null,
        persistWatchHistoryMetadata: (video, pointerInfo) =>
          app?.persistWatchHistoryMetadataForVideo?.(video, pointerInfo),
        getShareUrlBase: () => app?.getShareUrlBase?.() ?? "",
        buildShareUrlFromNevent: (nevent) =>
          app?.buildShareUrlFromNevent?.(nevent) ?? "",
        buildShareUrlFromEventId: (eventId) =>
          app?.buildShareUrlFromEventId?.(eventId) ?? "",
        canManageBlacklist: () =>
          app?.canCurrentUserManageBlacklist?.() ?? false,
        canEditVideo: (video) => video?.pubkey === app?.pubkey,
        canDeleteVideo: (video) => video?.pubkey === app?.pubkey,
        batchFetchProfiles: (authorSet) => app?.batchFetchProfiles?.(authorSet),
        bindThumbnailFallbacks: (target) =>
          app?.bindThumbnailFallbacks?.(target),
        handleUrlHealthBadge: (payload) => app?.handleUrlHealthBadge?.(payload),
        refreshDiscussionCounts: (videosList, { container: root } = {}) =>
          app?.refreshVideoDiscussionCounts?.(videosList, {
            videoListRoot: root || container || null
          }),
        ensureGlobalMoreMenuHandlers: () =>
          app?.ensureGlobalMoreMenuHandlers?.(),
        closeAllMenus: (options) => app?.closeAllMoreMenus?.(options)
      },
      renderers: {
        getLoadingMarkup: (message) => getSidebarLoadingMarkup(message)
      },
      allowNsfw: ALLOW_NSFW_CONTENT === true
    };

    const listView = new VideoListView(listViewConfig);

    listView.setPlaybackHandler((detail) => {
      if (!detail) {
        return;
      }
      if (detail.videoId) {
        Promise.resolve(
          app?.playVideoByEventId?.(detail.videoId, {
            url: detail.url,
            magnet: detail.magnet
          })
        ).catch((error) => {
          userLogger.error(
            "[SubscriptionsManager] Failed to play by event id:",
            error
          );
        });
        return;
      }
      Promise.resolve(
        app?.playVideoWithFallback?.({ url: detail.url, magnet: detail.magnet })
      ).catch((error) => {
        userLogger.error(
          "[SubscriptionsManager] Failed to start playback:",
          error
        );
      });
    });

    listView.setEditHandler(({ video, index }) => {
      if (!video?.id) {
        return;
      }
      app?.handleEditVideo?.({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null
      });
    });

    listView.setRevertHandler(({ video, index }) => {
      if (!video?.id) {
        return;
      }
      app?.handleRevertVideo?.({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null
      });
    });

    listView.setDeleteHandler(({ video, index }) => {
      if (!video?.id) {
        return;
      }
      app?.handleFullDeleteVideo?.({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null
      });
    });

    listView.setBlacklistHandler(({ video, dataset }) => {
      const detail = {
        ...(dataset || {}),
        author: dataset?.author || video?.pubkey || "",
        context: dataset?.context || "subscriptions"
      };
      app?.handleMoreMenuAction?.("blacklist-author", detail);
    });

    listView.addEventListener("video:share", (event) => {
      const detail = event?.detail || {};
      const dataset = {
        ...(detail.dataset || {}),
        eventId:
          detail.eventId || detail.dataset?.eventId || detail.video?.id || "",
        context: detail.dataset?.context || "subscriptions"
      };
      app?.handleMoreMenuAction?.(detail.action || "copy-link", dataset);
    });

    listView.addEventListener("video:context-action", (event) => {
      const detail = event?.detail || {};
      const dataset = {
        ...(detail.dataset || {}),
        eventId: detail.dataset?.eventId || detail.video?.id || "",
        context: detail.dataset?.context || "subscriptions"
      };
      app?.handleMoreMenuAction?.(detail.action, dataset);
    });

    this.subscriptionListView = listView;
    return this.subscriptionListView;
  }

  async refreshActiveFeed(options = {}) {
    if (!this.lastRunOptions) {
      return null;
    }

    const { actorPubkey, containerId, limit } = this.lastRunOptions;
    if (!actorPubkey || !containerId) {
      return null;
    }

    const reason =
      typeof options?.reason === "string" && options.reason.trim()
        ? options.reason.trim()
        : this.lastRunOptions.reason;

    if (typeof moderationService?.awaitUserBlockRefresh === "function") {
      try {
        await moderationService.awaitUserBlockRefresh();
      } catch (error) {
        devLogger.warn(
          "[SubscriptionsManager] Failed to sync moderation before refreshing feed:",
          error,
        );
      }
    }

    return this.showSubscriptionVideos(actorPubkey, containerId, {
      limit,
      reason
    });
  }

  convertEventToVideo(evt) {
    return sharedConvertEventToVideo(evt);
  }
}

export const subscriptions = new SubscriptionsManager();
