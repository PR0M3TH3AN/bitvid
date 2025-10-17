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

      const events = [];
      for (const url of nostrClient.relays) {
        try {
          const result = await nostrClient.pool.list([url], [filter]);
          if (result && result.length) {
            events.push(...result);
          }
        } catch (err) {
          userLogger.error(`[SubscriptionsManager] Relay error at ${url}`, err);
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
      this.subscribedPubkeys = new Set(subArray);

      this.loaded = true;
    } catch (err) {
      userLogger.error("[SubscriptionsManager] Failed to load subs:", err);
    }
  }

  isSubscribed(channelHex) {
    return this.subscribedPubkeys.has(channelHex);
  }

  getSubscribedAuthors() {
    return Array.from(this.subscribedPubkeys);
  }

  async addChannel(channelHex, userPubkey) {
    if (!userPubkey) {
      throw new Error("No user pubkey => cannot addChannel.");
    }
    if (this.subscribedPubkeys.has(channelHex)) {
      devLogger.log("Already subscribed to", channelHex);
      return;
    }
    this.subscribedPubkeys.add(channelHex);
    await this.publishSubscriptionList(userPubkey);
    this.refreshActiveFeed({ reason: "subscription-update" }).catch((error) => {
      userLogger.warn(
        "[SubscriptionsManager] Failed to refresh after adding subscription:",
        error
      );
    });
  }

  async removeChannel(channelHex, userPubkey) {
    if (!userPubkey) {
      throw new Error("No user pubkey => cannot removeChannel.");
    }
    if (!this.subscribedPubkeys.has(channelHex)) {
      devLogger.log("Channel not found in subscription list:", channelHex);
      return;
    }
    this.subscribedPubkeys.delete(channelHex);
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
      return null;
    }

    if (!this.loaded) {
      await this.loadSubscriptions(userPubkey);
    }

    const channelHexes = this.getSubscribedAuthors();
    if (!container) {
      this.lastRunOptions = {
        actorPubkey: userPubkey,
        limit,
        containerId
      };
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
    const engine = this.getFeedEngine();
    if (!engine || typeof engine.run !== "function") {
      container.innerHTML =
        "<p class='text-muted-strong'>Subscriptions are unavailable right now.</p>";
      return null;
    }

    const app = getApp();
    const runtime = this.buildFeedRuntime({ app, authors: channelHexes });
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
      const result = await engine.run("subscriptions", runOptions);

      const videos = Array.isArray(result?.items)
        ? result.items.map((item) => item?.video).filter(Boolean)
        : [];

      if (app?.videosMap instanceof Map) {
        videos.forEach((video) => {
          if (video && typeof video.id === "string" && video.id) {
            app.videosMap.set(video.id, video);
          }
        });
      }

      this.lastResult = result;
      this.renderSameGridStyle(result, containerId, { limit, reason });
      return result;
    } catch (error) {
      userLogger.error(
        "[SubscriptionsManager] Failed to run subscriptions feed:",
        error
      );
      container.innerHTML =
        "<p class='text-muted-strong'>Unable to load subscriptions right now.</p>";
      this.lastResult = null;
      return null;
    }
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

  buildFeedRuntime({ app, authors = [] } = {}) {
    const normalizedAuthors = Array.isArray(authors)
      ? authors.filter((author) => typeof author === "string" && author)
      : [];

    const blacklist =
      app?.blacklistedEventIds instanceof Set
        ? new Set(app.blacklistedEventIds)
        : new Set();

    const isAuthorBlocked =
      typeof app?.isAuthorBlocked === "function"
        ? (pubkey) => app.isAuthorBlocked(pubkey)
        : () => false;

    return {
      subscriptionAuthors: normalizedAuthors,
      authors: normalizedAuthors,
      blacklistedEventIds: blacklist,
      isAuthorBlocked
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
      container.innerHTML = `
        <p class="flex justify-center items-center h-full w-full text-center text-muted-strong">
          No videos available yet.
        </p>`;
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
