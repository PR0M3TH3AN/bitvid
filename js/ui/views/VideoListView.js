import { VideoCard } from "../components/VideoCard.js";
import {
  subscribeToVideoViewCount,
  unsubscribeFromVideoViewCount,
} from "../../viewCounter.js";

const EMPTY_VIDEO_LIST_SIGNATURE = "__EMPTY__";

export class VideoListView {
  constructor(options = {}) {
    const {
      document: doc = typeof document !== "undefined" ? document : null,
      container = null,
      mediaLoader = null,
      badgeHelpers = {},
      formatters = {},
      helpers = {},
      assets = {},
      state = {},
      utils = {},
      renderers = {},
    } = options;

    this.document = doc;
    this.window = this.document?.defaultView ||
      (typeof window !== "undefined" ? window : null);
    this.container = null;
    this.mediaLoader = mediaLoader;

    this.badgeHelpers = {
      attachHealthBadges: badgeHelpers.attachHealthBadges || (() => {}),
      attachUrlHealthBadges:
        badgeHelpers.attachUrlHealthBadges || (() => {}),
    };

    this.formatters = {
      formatTimeAgo: formatters.formatTimeAgo || ((timestamp) => timestamp),
      formatViewCountLabel:
        formatters.formatViewCountLabel || ((total) => `${total}`),
    };

    this.helpers = {
      escapeHtml: helpers.escapeHtml || ((value) => value),
      isMagnetSupported: helpers.isMagnetSupported || (() => false),
      toLocaleString: helpers.toLocaleString || ((value) => value),
    };

    this.assets = {
      fallbackThumbnailSrc: assets.fallbackThumbnailSrc || "",
      unsupportedBtihMessage: assets.unsupportedBtihMessage || "",
    };

    this.state = {
      loadedThumbnails:
        state.loadedThumbnails instanceof Map ? state.loadedThumbnails : new Map(),
      videosMap: state.videosMap instanceof Map ? state.videosMap : new Map(),
      feedMetadata:
        state.feedMetadata && typeof state.feedMetadata === "object"
          ? { ...state.feedMetadata }
          : null,
    };

    this.renderers = {
      getLoadingMarkup:
        typeof renderers.getLoadingMarkup === "function"
          ? renderers.getLoadingMarkup
          : () => "",
    };

    this.utils = {
      dedupeVideos:
        typeof utils.dedupeVideos === "function"
          ? utils.dedupeVideos
          : (videos) => (Array.isArray(videos) ? [...videos] : []),
      getAllEvents:
        typeof utils.getAllEvents === "function" ? utils.getAllEvents : () => [],
      hasOlderVersion:
        typeof utils.hasOlderVersion === "function"
          ? utils.hasOlderVersion
          : () => false,
      derivePointerInfo:
        typeof utils.derivePointerInfo === "function"
          ? utils.derivePointerInfo
          : () => null,
      persistWatchHistoryMetadata:
        typeof utils.persistWatchHistoryMetadata === "function"
          ? utils.persistWatchHistoryMetadata
          : () => {},
      getShareUrlBase:
        typeof utils.getShareUrlBase === "function"
          ? utils.getShareUrlBase
          : () => "",
      buildShareUrlFromNevent:
        typeof utils.buildShareUrlFromNevent === "function"
          ? utils.buildShareUrlFromNevent
          : () => "",
      buildShareUrlFromEventId:
        typeof utils.buildShareUrlFromEventId === "function"
          ? utils.buildShareUrlFromEventId
          : () => "",
      canManageBlacklist:
        typeof utils.canManageBlacklist === "function"
          ? utils.canManageBlacklist
          : () => false,
      canEditVideo:
        typeof utils.canEditVideo === "function" ? utils.canEditVideo : () => false,
      canDeleteVideo:
        typeof utils.canDeleteVideo === "function"
          ? utils.canDeleteVideo
          : (video) => this.utils.canEditVideo(video),
      batchFetchProfiles:
        typeof utils.batchFetchProfiles === "function"
          ? utils.batchFetchProfiles
          : () => {},
      bindThumbnailFallbacks:
        typeof utils.bindThumbnailFallbacks === "function"
          ? utils.bindThumbnailFallbacks
          : () => {},
      handleUrlHealthBadge:
        typeof utils.handleUrlHealthBadge === "function"
          ? utils.handleUrlHealthBadge
          : () => {},
      refreshDiscussionCounts:
        typeof utils.refreshDiscussionCounts === "function"
          ? utils.refreshDiscussionCounts
          : () => {},
      ensureGlobalMoreMenuHandlers:
        typeof utils.ensureGlobalMoreMenuHandlers === "function"
          ? utils.ensureGlobalMoreMenuHandlers
          : () => {},
      closeAllMenus:
        typeof utils.closeAllMenus === "function" ? utils.closeAllMenus : () => {},
    };

    this.renderedVideoIds = new Set();
    this.videoCardInstances = [];
    this.viewCountSubscriptions = new Map();
    this.currentVideos = [];
    this.lastRenderedVideoSignature = null;
    this._lastRenderedVideoListElement = null;

    this.handlers = {
      playback: null,
      edit: null,
      revert: null,
      delete: null,
      blacklist: null,
    };

    this.emitter = typeof EventTarget !== "undefined" ? new EventTarget() : null;
    this._boundClickHandler = this.handleContainerClick.bind(this);

    if (container) {
      this.setContainer(container);
    }
  }

  addEventListener(type, listener, options) {
    if (!this.emitter) return;
    this.emitter.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    if (!this.emitter) return;
    this.emitter.removeEventListener(type, listener, options);
  }

  dispatchEvent(event) {
    if (!this.emitter) {
      return false;
    }
    return this.emitter.dispatchEvent(event);
  }

  setContainer(container) {
    if (container === this.container) {
      return;
    }

    if (this.container) {
      this.container.removeEventListener("click", this._boundClickHandler);
    }

    this.container = container || null;

    if (this.container) {
      this.container.addEventListener("click", this._boundClickHandler);
    }
  }

  mount(container) {
    this.setContainer(container);
    return this.container;
  }

  unmount() {
    this.setContainer(null);
  }

  showLoading(message = "") {
    if (!this.container) {
      return;
    }

    const markup = this.renderers.getLoadingMarkup(message);
    if (typeof markup === "string") {
      this.container.innerHTML = markup;
    }
  }

  destroy() {
    this.unmount();
    this.teardownAllViewCountSubscriptions();
    this.renderedVideoIds.clear();
    this.videoCardInstances = [];
    this.currentVideos = [];
    this.lastRenderedVideoSignature = null;
    this._lastRenderedVideoListElement = null;
  }

  setPlaybackHandler(handler) {
    this.handlers.playback = typeof handler === "function" ? handler : null;
  }

  setEditHandler(handler) {
    this.handlers.edit = typeof handler === "function" ? handler : null;
  }

  setRevertHandler(handler) {
    this.handlers.revert = typeof handler === "function" ? handler : null;
  }

  setDeleteHandler(handler) {
    this.handlers.delete = typeof handler === "function" ? handler : null;
  }

  setBlacklistHandler(handler) {
    this.handlers.blacklist = typeof handler === "function" ? handler : null;
  }

  render(videos, metadata = null) {
    if (!this.container) {
      return [];
    }

    if (this._lastRenderedVideoListElement !== this.container) {
      this.lastRenderedVideoSignature = null;
      this._lastRenderedVideoListElement = this.container;
    }

    const normalizedMetadata =
      metadata && typeof metadata === "object" ? { ...metadata } : null;
    this.state.feedMetadata = normalizedMetadata;

    const source = Array.isArray(videos) ? videos : [];
    const dedupedVideos = this.utils.dedupeVideos(source);
    const displayVideos = dedupedVideos.filter(
      (video) => this.utils.canEditVideo(video) || !video?.isPrivate
    );

    this.syncViewCountSubscriptions(displayVideos);
    this.cleanupThumbnailCache(displayVideos);

    if (!displayVideos.length) {
      this.renderedVideoIds.clear();
      this.videoCardInstances = [];
      if (this.lastRenderedVideoSignature === EMPTY_VIDEO_LIST_SIGNATURE) {
        return displayVideos;
      }
      this.lastRenderedVideoSignature = EMPTY_VIDEO_LIST_SIGNATURE;
      this.container.innerHTML = `
        <p class="flex justify-center items-center h-full w-full text-center text-gray-500">
          No public videos available yet. Be the first to upload one!
        </p>`;
      return displayVideos;
    }

    displayVideos.sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));
    this.currentVideos = displayVideos.slice();

    const signaturePayload = displayVideos.map((video) => ({
      id: typeof video?.id === "string" ? video.id : "",
      createdAt: Number.isFinite(video?.created_at)
        ? video.created_at
        : Number(video?.created_at) || 0,
      deleted: Boolean(video?.deleted),
      isPrivate: Boolean(video?.isPrivate),
      thumbnail: typeof video?.thumbnail === "string" ? video.thumbnail : "",
      url: typeof video?.url === "string" ? video.url : "",
      magnet: typeof video?.magnet === "string" ? video.magnet : "",
      enableComments: video?.enableComments === false ? false : true,
    }));
    const signature = JSON.stringify(signaturePayload);

    if (signature === this.lastRenderedVideoSignature) {
      return displayVideos;
    }
    this.lastRenderedVideoSignature = signature;

    const previouslyRenderedIds = new Set(this.renderedVideoIds);
    this.renderedVideoIds.clear();

    const allEvents = this.utils.getAllEvents();
    const fragment = this.document?.createDocumentFragment?.();
    if (!fragment) {
      return displayVideos;
    }

    const authorSet = new Set();
    const shareBase = this.computeShareBase();
    const canManageBlacklist = this.utils.canManageBlacklist();
    this.videoCardInstances = [];

    displayVideos.forEach((video, index) => {
      if (!video || !video.id || !video.title) {
        return;
      }

      authorSet.add(video.pubkey);

      const shareUrl = this.buildShareUrl(video, shareBase);
      const canEdit = this.utils.canEditVideo(video);
      const canDelete = this.utils.canDeleteVideo(video);
      const highlightClass =
        canEdit && video.isPrivate ? "video-card--owner-private" : "";
      const isNewlyRendered = !previouslyRenderedIds.has(video.id);
      const animationClass = isNewlyRendered ? "video-card--enter" : "";
      const timeAgo = this.formatters.formatTimeAgo(video.created_at);

      let hasOlder = false;
      if (canEdit && video.videoRootId) {
        hasOlder = this.utils.hasOlderVersion(video, allEvents);
      }

      const pointerInfo = this.utils.derivePointerInfo(video);
      if (pointerInfo) {
        this.utils.persistWatchHistoryMetadata(video, pointerInfo);
      }

      const videoCard = new VideoCard({
        document: this.document,
        video,
        index,
        shareUrl,
        pointerInfo,
        timeAgo,
        highlightClass,
        animationClass,
        capabilities: {
          canEdit,
          canDelete,
          canRevert: hasOlder,
          canManageBlacklist,
        },
        helpers: {
          escapeHtml: this.helpers.escapeHtml,
          isMagnetSupported: this.helpers.isMagnetSupported,
          toLocaleString: this.helpers.toLocaleString,
        },
        assets: {
          fallbackThumbnailSrc: this.assets.fallbackThumbnailSrc,
          unsupportedBtihMessage: this.assets.unsupportedBtihMessage,
        },
        state: { loadedThumbnails: this.state.loadedThumbnails },
        ensureGlobalMoreMenuHandlers: () =>
          this.utils.ensureGlobalMoreMenuHandlers(),
        onRequestCloseAllMenus: () => this.closeAllMenus(),
        formatters: {
          formatTimeAgo: this.formatters.formatTimeAgo,
        },
      });

      videoCard.onPlay = ({ event: domEvent, video: cardVideo }) => {
        const trigger = domEvent?.currentTarget || domEvent?.target;
        const detail = this.extractPlaybackDetail(trigger, cardVideo || video);
        this.emitSelected(detail);
      };

      videoCard.onEdit = ({ video: editVideo, index: editIndex }) => {
        if (this.handlers.edit) {
          this.handlers.edit({ video: editVideo, index: editIndex });
        }
      };

      videoCard.onRevert = ({ video: revertVideo, index: revertIndex }) => {
        if (this.handlers.revert) {
          this.handlers.revert({ video: revertVideo, index: revertIndex });
        }
      };

      videoCard.onDelete = ({ video: deleteVideo, index: deleteIndex }) => {
        if (this.handlers.delete) {
          this.handlers.delete({ video: deleteVideo, index: deleteIndex });
        }
      };

      videoCard.onMoreAction = ({ dataset }) => {
        const action = dataset?.action || "";
        if (action === "blacklist-author") {
          if (this.handlers.blacklist) {
            this.handlers.blacklist({ video, dataset });
          }
          return;
        }

        if (action === "copy-link") {
          const shareDetail = this.buildShareDetail(video, dataset);
          this.emitShare(shareDetail);
          return;
        }

        this.emitContextAction(action, { video, dataset });
      };

      videoCard.onAuthorNavigate = ({ pubkey }) => {
        this.emitContextAction("open-channel", {
          video,
          dataset: { author: pubkey || video.pubkey || "", context: "card" },
        });
      };

      const cardEl = videoCard.getRoot();
      if (!cardEl) {
        return;
      }

      if (pointerInfo) {
        this.registerVideoViewCountElement(cardEl, pointerInfo);
      }

      if (video && video.id) {
        this.state.videosMap.set(video.id, video);
      }

      fragment.appendChild(cardEl);
      this.renderedVideoIds.add(video.id);
      this.videoCardInstances.push(videoCard);
    });

    this.container.innerHTML = "";
    this.container.appendChild(fragment);

    this.badgeHelpers.attachHealthBadges(this.container);
    this.badgeHelpers.attachUrlHealthBadges(this.container, ({ badgeEl, url, eventId }) => {
      this.utils.handleUrlHealthBadge({
        video: this.state.videosMap.get(eventId) || { id: eventId },
        url,
        badgeEl,
      });
    });

    this.utils.bindThumbnailFallbacks(this.container);

    if (this.mediaLoader && typeof this.mediaLoader.observe === "function") {
      const lazyEls = this.container.querySelectorAll("[data-lazy]");
      lazyEls.forEach((el) => this.mediaLoader.observe(el));
    }

    if (authorSet.size) {
      this.utils.batchFetchProfiles(authorSet);
    }
    this.utils.refreshDiscussionCounts(displayVideos);
    this.pruneDetachedViewCountElements();

    return displayVideos;
  }

  updateVideo(videoId, patch) {
    if (!videoId) {
      return null;
    }

    const index = this.currentVideos.findIndex((video) => video?.id === videoId);
    if (index === -1) {
      return null;
    }

    const current = this.currentVideos[index] || {};
    const next =
      typeof patch === "function" ? patch({ ...current }) : { ...current, ...patch };

    this.currentVideos[index] = next;
    this.state.videosMap.set(videoId, next);
    this.render(this.currentVideos.slice(), this.state.feedMetadata);
    return next;
  }

  computeShareBase() {
    const explicit = this.utils.getShareUrlBase();
    if (explicit) {
      return explicit;
    }

    const win = this.window;
    if (win?.location) {
      const origin = win.location.origin || "";
      const pathname = win.location.pathname || "";
      if (origin || pathname) {
        return `${origin}${pathname}`;
      }
      if (win.location.href) {
        return win.location.href.split(/[?#]/)[0];
      }
    }
    return "";
  }

  buildShareUrl(video, shareBase) {
    if (!video?.id) {
      return "#";
    }

    const win = this.window;
    try {
      const nevent = win?.NostrTools?.nip19?.neventEncode({ id: video.id });
      if (nevent) {
        const explicit = this.utils.buildShareUrlFromNevent(nevent);
        if (explicit) {
          return explicit;
        }
        if (shareBase) {
          return `${shareBase}?v=${encodeURIComponent(nevent)}`;
        }
      }
    } catch (error) {
      // ignore and fall back below
    }

    if (shareBase) {
      return `${shareBase}?v=${encodeURIComponent(video.id)}`;
    }

    return "#";
  }

  syncViewCountSubscriptions(videos) {
    const activePointerKeys = new Set();
    videos.forEach((video) => {
      const pointerInfo = this.utils.derivePointerInfo(video);
      if (pointerInfo?.key) {
        activePointerKeys.add(pointerInfo.key);
      }
    });

    const keysToRemove = [];
    for (const [key, entry] of this.viewCountSubscriptions.entries()) {
      if (!activePointerKeys.has(key)) {
        keysToRemove.push(key);
        continue;
      }
      if (entry && entry.elements instanceof Set) {
        entry.elements.clear();
      }
    }

    keysToRemove.forEach((key) => {
      const entry = this.viewCountSubscriptions.get(key);
      if (entry && entry.pointer && entry.token) {
        try {
          unsubscribeFromVideoViewCount(entry.pointer, entry.token);
        } catch (error) {
          console.warn(
            `[viewCount] Failed to unsubscribe from stale pointer ${key}:`,
            error
          );
        }
      }
      this.viewCountSubscriptions.delete(key);
    });
  }

  cleanupThumbnailCache(videos) {
    const cache = this.state.loadedThumbnails;
    if (!cache || !cache.size) {
      return;
    }

    const activeIds = new Set();
    videos.forEach((video) => {
      if (video && typeof video.id === "string" && video.id) {
        activeIds.add(video.id);
      }
    });

    Array.from(cache.keys()).forEach((videoId) => {
      if (!activeIds.has(videoId)) {
        cache.delete(videoId);
      }
    });
  }

  extractPlaybackDetail(trigger, video) {
    const element = trigger instanceof HTMLElement ? trigger : null;
    const target = element?.closest("[data-play-url],[data-play-magnet]") || element;

    const rawUrlValue =
      (target?.dataset && typeof target.dataset.playUrl === "string"
        ? target.dataset.playUrl
        : null) ?? target?.getAttribute?.("data-play-url") ?? "";
    const rawMagnetValue =
      (target?.dataset && typeof target.dataset.playMagnet === "string"
        ? target.dataset.playMagnet
        : null) ?? target?.getAttribute?.("data-play-magnet") ?? "";

    let url = "";
    if (rawUrlValue) {
      try {
        url = decodeURIComponent(rawUrlValue);
      } catch (error) {
        url = rawUrlValue;
      }
    }

    const magnet = typeof rawMagnetValue === "string" ? rawMagnetValue : "";
    const videoId =
      target?.dataset?.videoId || target?.getAttribute?.("data-video-id") || video?.id || "";

    return { videoId, url, magnet, video };
  }

  emitSelected(detail) {
    const enriched = {
      ...detail,
      video: detail?.video || this.state.videosMap.get(detail?.videoId) || null,
    };

    if (this.handlers.playback) {
      this.handlers.playback(enriched);
    }

    this.emit("video:selected", enriched);
  }

  buildShareDetail(video, dataset = {}) {
    const eventId = dataset.eventId || video?.id || "";
    const shareUrl = this.utils.buildShareUrlFromEventId(eventId);
    return {
      action: "copy-link",
      video,
      eventId,
      shareUrl,
      dataset,
    };
  }

  emitShare(detail) {
    this.emit("video:share", detail);
  }

  emitContextAction(action, payload = {}) {
    if (!action) {
      return;
    }
    this.emit("video:context-action", { action, ...payload });
  }

  emit(type, detail) {
    if (this.emitter) {
      this.emitter.dispatchEvent(new CustomEvent(type, { detail }));
    }
    if (this.container) {
      this.container.dispatchEvent(
        new CustomEvent(type, { detail, bubbles: true, composed: true })
      );
    }
  }

  ensureViewCountSubscription(pointerInfo) {
    if (!pointerInfo || !pointerInfo.key || !pointerInfo.pointer) {
      return null;
    }

    const existing = this.viewCountSubscriptions.get(pointerInfo.key);
    if (existing) {
      return existing;
    }

    const entry = {
      pointer: pointerInfo.pointer,
      key: pointerInfo.key,
      token: null,
      elements: new Set(),
      lastTotal: null,
      lastStatus: "idle",
      lastText: "– views",
    };

    try {
      const token = subscribeToVideoViewCount(pointerInfo.pointer, ({ total, status }) => {
        let text;
        if (Number.isFinite(total)) {
          const numeric = Number(total);
          entry.lastTotal = numeric;
          text = this.formatters.formatViewCountLabel(numeric);
        } else if (status === "hydrating") {
          text = "Loading views…";
        } else {
          text = "– views";
        }

        entry.lastStatus = status;
        entry.lastText = text;

        for (const el of Array.from(entry.elements)) {
          if (!el || !el.isConnected) {
            entry.elements.delete(el);
            continue;
          }
          el.textContent = text;
        }
      });
      entry.token = token;
      this.viewCountSubscriptions.set(pointerInfo.key, entry);
      return entry;
    } catch (error) {
      console.warn("[viewCount] Failed to subscribe to view counter:", error);
      return null;
    }
  }

  registerVideoViewCountElement(cardEl, pointerInfo) {
    if (!cardEl || !pointerInfo) {
      return;
    }

    const viewCountEl = cardEl.querySelector("[data-view-count]");
    if (!viewCountEl) {
      return;
    }

    if (!viewCountEl.textContent || !viewCountEl.textContent.trim()) {
      viewCountEl.textContent = "– views";
    }

    const entry = this.ensureViewCountSubscription(pointerInfo);
    if (!entry) {
      return;
    }

    entry.elements.add(viewCountEl);
    if (typeof pointerInfo.key === "string") {
      viewCountEl.dataset.viewPointer = pointerInfo.key;
    }
    viewCountEl.textContent = entry.lastText;
  }

  pruneDetachedViewCountElements() {
    for (const entry of this.viewCountSubscriptions.values()) {
      if (!entry || !(entry.elements instanceof Set)) {
        continue;
      }
      for (const el of Array.from(entry.elements)) {
        if (!el || !el.isConnected) {
          entry.elements.delete(el);
        }
      }
    }
  }

  teardownAllViewCountSubscriptions() {
    const keys = Array.from(this.viewCountSubscriptions.keys());
    keys.forEach((key) => {
      const entry = this.viewCountSubscriptions.get(key);
      if (entry && entry.token && entry.pointer) {
        try {
          unsubscribeFromVideoViewCount(entry.pointer, entry.token);
        } catch (error) {
          console.warn(
            `[viewCount] Failed to unsubscribe from pointer ${key}:`,
            error
          );
        }
      }
      this.viewCountSubscriptions.delete(key);
    });
  }

  closeAllMenus() {
    if (Array.isArray(this.videoCardInstances) && this.videoCardInstances.length) {
      this.videoCardInstances.forEach((card) => {
        if (!card) {
          return;
        }
        if (typeof card.closeMoreMenu === "function") {
          card.closeMoreMenu();
        }
        if (typeof card.closeSettingsMenu === "function") {
          card.closeSettingsMenu();
        }
      });
    }

    if (!this.document) {
      return;
    }

    const menus = this.document.querySelectorAll("[data-more-menu]");
    menus.forEach((menu) => {
      if (menu instanceof HTMLElement) {
        menu.classList.add("hidden");
      }
    });

    const buttons = this.document.querySelectorAll("[data-more-dropdown]");
    buttons.forEach((btn) => {
      if (btn instanceof HTMLElement) {
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  handleContainerClick(event) {
    if (!event || !this.container) {
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }

    const trigger = target.closest("[data-play-magnet],[data-play-url]");
    if (!trigger || !this.container.contains(trigger)) {
      return;
    }

    const isPrimaryClick =
      typeof event.button !== "number" || event.button === 0;
    if (!isPrimaryClick || event.ctrlKey || event.metaKey) {
      return;
    }

    event.preventDefault();

    const detail = this.extractPlaybackDetail(trigger, null);
    this.emitSelected(detail);
  }
}
