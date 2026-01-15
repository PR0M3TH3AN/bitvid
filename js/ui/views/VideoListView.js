import { VideoCard } from "../components/VideoCard.js";
import {
  renderTagPillStrip,
  applyTagPreferenceState,
  trimTagPillStripToFit,
} from "../components/tagPillList.js";
import {
  subscribeToVideoViewCount,
  unsubscribeFromVideoViewCount,
} from "../../viewCounter.js";
import { normalizeDesignSystemContext } from "../../designSystem.js";
import { userLogger } from "../../utils/logger.js";
import { collectVideoTags } from "../../utils/videoTags.js";

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
      allowNsfw = true,
      designSystem = null,
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
      urlHealthByVideoId:
        state.urlHealthByVideoId instanceof Map
          ? state.urlHealthByVideoId
          : new Map(),
      streamHealthByVideoId:
        state.streamHealthByVideoId instanceof Map
          ? state.streamHealthByVideoId
          : new Map(),
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
      getKnownVideoPostedAt:
        typeof utils.getKnownVideoPostedAt === "function"
          ? utils.getKnownVideoPostedAt
          : () => null,
      resolveVideoPostedAt:
        typeof utils.resolveVideoPostedAt === "function"
          ? utils.resolveVideoPostedAt
          : null,
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
      requestMoreMenu:
        typeof utils.requestMoreMenu === "function"
          ? utils.requestMoreMenu
          : () => {},
      closeMoreMenu:
        typeof utils.closeMoreMenu === "function"
          ? utils.closeMoreMenu
          : () => false,
      requestSettingsMenu:
        typeof utils.requestSettingsMenu === "function"
          ? utils.requestSettingsMenu
          : () => {},
      closeSettingsMenu:
        typeof utils.closeSettingsMenu === "function"
          ? utils.closeSettingsMenu
          : () => false,
    };

    this.renderedVideoIds = new Set();
    this.videoCardInstances = [];
    this.viewCountSubscriptions = new Map();
    this.currentVideos = [];
    this.lastRenderedVideoSignature = null;
    this._lastRenderedVideoListElement = null;
    this.popularTagsRoot = null;
    this._popularTagStrip = null;
    this._popularTagsSortedList = [];
    this._popularTagResizeObserver = null;
    this._popularTagResizeHandler = null;
    this._popularTagResizeCancel = null;
    this._popularTagResizeScheduled = false;
    this._isApplyingPopularTagTrim = false;
    this._handlePopularTagResize = () => {
      if (this._isApplyingPopularTagTrim) {
        return;
      }
      this.renderPopularTagStrip();
    };

    this.handlers = {
      playback: null,
      edit: null,
      revert: null,
      delete: null,
      blacklist: null,
      moderationOverride: null,
      moderationBlock: null,
      moderationHide: null,
      tagActivate: null,
    };

    this.tagPreferenceStateResolver = null;

    this.allowNsfw = allowNsfw !== false;
    this.designSystem = normalizeDesignSystemContext(designSystem);

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
    this._teardownPopularTagResizeObserver();
    if (this.popularTagsRoot) {
      this.popularTagsRoot.textContent = "";
      this.popularTagsRoot.hidden = true;
    }
    this.popularTagsRoot = null;
    this._popularTagStrip = null;
    this._popularTagsSortedList = [];
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

  setModerationOverrideHandler(handler) {
    this.handlers.moderationOverride = typeof handler === "function" ? handler : null;
  }

  setModerationBlockHandler(handler) {
    this.handlers.moderationBlock =
      typeof handler === "function" ? handler : null;
  }

  setModerationHideHandler(handler) {
    this.handlers.moderationHide =
      typeof handler === "function" ? handler : null;
  }

  setTagActivationHandler(handler) {
    this.handlers.tagActivate = typeof handler === "function" ? handler : null;
  }

  setTagPreferenceStateResolver(resolver) {
    this.tagPreferenceStateResolver =
      typeof resolver === "function" ? resolver : null;
  }

  setPopularTagsContainer(container) {
    this._teardownPopularTagResizeObserver();
    if (this.popularTagsRoot && this.popularTagsRoot !== container) {
      this.popularTagsRoot.textContent = "";
      this.popularTagsRoot.hidden = true;
    }

    this.popularTagsRoot = container || null;
    this._popularTagStrip = null;

    if (this.popularTagsRoot) {
      this.popularTagsRoot.textContent = "";
      this.popularTagsRoot.hidden = true;
      if (this._popularTagsSortedList.length) {
        this.renderPopularTagStrip();
        this._ensurePopularTagResizeObserver();
      }
    }
  }

  updatePopularTags(videos) {
    const root = this.popularTagsRoot;
    if (!root) {
      return;
    }

    if (!Array.isArray(videos) || videos.length === 0) {
      this._popularTagsSortedList = [];
      this.renderPopularTagStrip();
      this._teardownPopularTagResizeObserver();
      return;
    }

    const counts = new Map();
    const displayNames = new Map();

    videos.forEach((video) => {
      const tags = collectVideoTags(video);
      tags.forEach((tag) => {
        if (typeof tag !== "string" || !tag) {
          return;
        }
        const lower = tag.toLowerCase();
        counts.set(lower, (counts.get(lower) || 0) + 1);
        if (!displayNames.has(lower)) {
          displayNames.set(lower, tag);
        }
      });
    });

    if (!counts.size) {
      this._popularTagsSortedList = [];
      this.renderPopularTagStrip();
      this._teardownPopularTagResizeObserver();
      return;
    }

    const tagEntries = Array.from(counts.entries()).map(([lower, count]) => ({
      count,
      tag: displayNames.get(lower) || lower,
    }));

    tagEntries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      const lowerA = a.tag.toLowerCase();
      const lowerB = b.tag.toLowerCase();
      if (lowerA === lowerB) {
        return a.tag.localeCompare(b.tag);
      }
      return lowerA.localeCompare(lowerB);
    });

    this._popularTagsSortedList = tagEntries.map((entry) => entry.tag);
    this.renderPopularTagStrip();
    if (this._popularTagsSortedList.length) {
      this._ensurePopularTagResizeObserver();
    } else {
      this._teardownPopularTagResizeObserver();
    }
  }

  renderPopularTagStrip() {
    const root = this.popularTagsRoot;
    if (!root) {
      return;
    }

    const tags = Array.isArray(this._popularTagsSortedList)
      ? [...this._popularTagsSortedList]
      : [];

    this._isApplyingPopularTagTrim = true;

      try {
        root.textContent = "";
        this._popularTagStrip = null;

        if (!tags.length) {
          root.hidden = true;
          return;
        }

        const doc = this.document || root.ownerDocument || null;
        if (!doc) {
          root.hidden = true;
          this._teardownPopularTagResizeObserver();
          return;
        }

      const { root: strip } = renderTagPillStrip({
        document: doc,
        tags,
        onTagActivate: (tag, detail = {}) =>
          this.handlePopularTagActivate(tag, detail),
        getTagState: (tag) => this.resolveTagPreferenceState(tag),
      });

      root.appendChild(strip);
      this._popularTagStrip = strip;
      trimTagPillStripToFit({ strip, container: root });
      root.hidden = strip.childElementCount === 0;
    } finally {
      this._isApplyingPopularTagTrim = false;
    }
  }

  _ensurePopularTagResizeObserver() {
    const root = this.popularTagsRoot;
    if (!root || this._popularTagResizeObserver || this._popularTagResizeHandler) {
      return;
    }

    const resizeObserverCtor =
      (this.window && this.window.ResizeObserver) ||
      (typeof globalThis !== "undefined" ? globalThis.ResizeObserver : null);

    if (typeof resizeObserverCtor === "function") {
      this._popularTagResizeObserver = new resizeObserverCtor(() => {
        this._handlePopularTagResize();
      });
      this._popularTagResizeObserver.observe(root);
      return;
    }

    if (!this.window) {
      return;
    }

    const schedule = (callback) => {
      if (this._popularTagResizeScheduled) {
        return;
      }
      this._popularTagResizeScheduled = true;

      if (typeof this.window.requestAnimationFrame === "function") {
        const frameId = this.window.requestAnimationFrame(() => {
          this._popularTagResizeScheduled = false;
          this._popularTagResizeCancel = null;
          callback();
        });
        this._popularTagResizeCancel = () => {
          this.window.cancelAnimationFrame(frameId);
          this._popularTagResizeCancel = null;
          this._popularTagResizeScheduled = false;
        };
      } else {
        const timeoutId = this.window.setTimeout(() => {
          this._popularTagResizeScheduled = false;
          this._popularTagResizeCancel = null;
          callback();
        }, 50);
        this._popularTagResizeCancel = () => {
          this.window.clearTimeout(timeoutId);
          this._popularTagResizeCancel = null;
          this._popularTagResizeScheduled = false;
        };
      }
    };

    const handler = () => {
      schedule(() => {
        if (!this.popularTagsRoot) {
          return;
        }
        this._handlePopularTagResize();
      });
    };

    this.window.addEventListener("resize", handler);
    this._popularTagResizeHandler = handler;
  }

  _teardownPopularTagResizeObserver() {
    if (this._popularTagResizeObserver) {
      try {
        this._popularTagResizeObserver.disconnect();
      } catch (error) {
        // Ignore disconnect errors.
      }
    }
    this._popularTagResizeObserver = null;

    if (this._popularTagResizeHandler && this.window) {
      this.window.removeEventListener("resize", this._popularTagResizeHandler);
    }
    this._popularTagResizeHandler = null;

    if (typeof this._popularTagResizeCancel === "function") {
      try {
        this._popularTagResizeCancel();
      } catch (error) {
        // Ignore cancellation errors.
      }
    }
    this._popularTagResizeCancel = null;
    this._popularTagResizeScheduled = false;
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
    const displayVideos = dedupedVideos.filter((video) => {
      const canEdit = this.utils.canEditVideo(video);
      const isPrivate = video?.isPrivate === true;
      if (!this.allowNsfw && video?.isNsfw === true && !canEdit) {
        return false;
      }
      return canEdit || !isPrivate;
    });

    this.updatePopularTags(displayVideos);

    this.syncViewCountSubscriptions(displayVideos);
    this.cleanupThumbnailCache(displayVideos);
    this.cleanupHealthCache(displayVideos);

    if (!displayVideos.length) {
      this.renderedVideoIds.clear();
      this.videoCardInstances = [];
      if (this.lastRenderedVideoSignature === EMPTY_VIDEO_LIST_SIGNATURE) {
        return displayVideos;
      }
      this.lastRenderedVideoSignature = EMPTY_VIDEO_LIST_SIGNATURE;
      this.container.innerHTML = `
        <p class="flex justify-center items-center h-full w-full text-center text-subtle">
          No public videos available yet. Be the first to upload one!
        </p>`;
      return displayVideos;
    }

    displayVideos.sort(
      (a, b) =>
        this.getVideoPostedAtForSort(b) - this.getVideoPostedAtForSort(a),
    );
    this.currentVideos = displayVideos.slice();

    const signaturePayload = displayVideos.map((video) => ({
      id: typeof video?.id === "string" ? video.id : "",
      createdAt: Number.isFinite(video?.created_at)
        ? video.created_at
        : Number(video?.created_at) || 0,
      postedAt: (() => {
        const timestamp = this.getVideoPostedAtForSort(video);
        return Number.isFinite(timestamp) ? timestamp : 0;
      })(),
      deleted: Boolean(video?.deleted),
      isPrivate: Boolean(video?.isPrivate),
      isNsfw: Boolean(video?.isNsfw),
      isForKids: Boolean(video?.isForKids),
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

      const reporterPubkeys = Array.isArray(video?.moderation?.reporterPubkeys)
        ? video.moderation.reporterPubkeys
        : [];
      reporterPubkeys.forEach((pubkey) => {
        if (typeof pubkey === "string" && pubkey.trim()) {
          authorSet.add(pubkey.trim());
        }
      });

      const shareUrl = this.buildShareUrl(video, shareBase);
      const canEdit = this.utils.canEditVideo(video);
      const canDelete = this.utils.canDeleteVideo(video);
      let cardState = "";
      if (canEdit && video.isPrivate) {
        cardState = "private";
      }
      const viewerSeesBlockedNsfw =
        !this.allowNsfw && video?.isNsfw === true && canEdit;
      if (viewerSeesBlockedNsfw) {
        cardState = "critical";
      }
      const isNewlyRendered = !previouslyRenderedIds.has(video.id);
      const motionState = isNewlyRendered ? "enter" : "";
      const knownPostedAt = this.utils.getKnownVideoPostedAt(video);
      const normalizedPostedAt = Number.isFinite(knownPostedAt)
        ? Math.floor(knownPostedAt)
        : null;
      const fallbackTimestamp =
        normalizedPostedAt !== null
          ? normalizedPostedAt
          : (() => {
              const sortTimestamp = this.getVideoPostedAtForSort(video);
              return Number.isFinite(sortTimestamp) ? sortTimestamp : null;
            })();
      const timeAgo =
        fallbackTimestamp !== null
          ? this.formatters.formatTimeAgo(fallbackTimestamp)
          : "";

      let hasOlder = false;
      if (canEdit && video.videoRootId) {
        hasOlder = this.utils.hasOlderVersion(video, allEvents);
      }

      const pointerInfo = this.utils.derivePointerInfo(video);
      if (pointerInfo) {
        this.utils.persistWatchHistoryMetadata(video, pointerInfo);
      }

      const identity = {
        name:
          typeof video.creatorName === "string" && video.creatorName
            ? video.creatorName
            : typeof video.authorName === "string"
              ? video.authorName
              : "",
        picture:
          typeof video.creatorPicture === "string" && video.creatorPicture
            ? video.creatorPicture
            : typeof video.authorPicture === "string"
              ? video.authorPicture
              : "",
        pubkey: typeof video.pubkey === "string" ? video.pubkey : "",
        npub:
          typeof video.npub === "string" && video.npub
            ? video.npub
            : typeof video.authorNpub === "string"
              ? video.authorNpub
              : "",
        shortNpub:
          typeof video.shortNpub === "string" && video.shortNpub
            ? video.shortNpub
            : typeof video.creatorNpub === "string"
              ? video.creatorNpub
              : "",
      };

      const videoCard = new VideoCard({
        document: this.document,
        video,
        index,
        shareUrl,
        pointerInfo,
        timeAgo,
        postedAt: normalizedPostedAt,
        cardState,
        motionState,
        identity,
        nsfwContext: {
          isNsfw: video?.isNsfw === true,
          allowNsfw: this.allowNsfw,
          viewerIsOwner: canEdit,
        },
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
        state: {
          loadedThumbnails: this.state.loadedThumbnails,
          urlHealthByVideoId: this.state.urlHealthByVideoId,
          streamHealthByVideoId: this.state.streamHealthByVideoId,
        },
        ensureGlobalMoreMenuHandlers: () =>
          this.utils.ensureGlobalMoreMenuHandlers(),
        onRequestCloseAllMenus: (detail = {}) =>
          this.closeAllMenus({ restoreFocus: false, ...detail }),
        formatters: {
          formatTimeAgo: this.formatters.formatTimeAgo,
        },
        designSystem: this.designSystem,
      });

      videoCard.onPlay = ({ event: domEvent, video: cardVideo }) => {
        const trigger = domEvent?.currentTarget || domEvent?.target;
        const detail = this.extractPlaybackDetail(trigger, cardVideo || video);
        this.emitSelected(detail);
      };

      videoCard.onModerationOverride = ({ event: overrideEvent }) => {
        if (!this.handlers.moderationOverride) {
          return false;
        }
        const trigger =
          overrideEvent?.currentTarget || overrideEvent?.target || null;
        return this.handlers.moderationOverride({
          event: overrideEvent,
          video,
          card: videoCard,
          trigger,
        });
      };

      videoCard.onModerationBlock = ({ event: blockEvent }) => {
        if (!this.handlers.moderationBlock) {
          return false;
        }
        const trigger =
          blockEvent?.currentTarget || blockEvent?.target || null;
        return this.handlers.moderationBlock({
          event: blockEvent,
          video,
          card: videoCard,
          trigger,
        });
      };

      videoCard.onModerationHide = ({ event: hideEvent }) => {
        if (!this.handlers.moderationHide) {
          return false;
        }
        const trigger =
          hideEvent?.currentTarget || hideEvent?.target || null;
        return this.handlers.moderationHide({
          event: hideEvent,
          video,
          card: videoCard,
          trigger,
        });
      };

      videoCard.onEdit = ({ event: editEvent, video: editVideo, index: editIndex }) => {
        if (this.handlers.edit) {
          const trigger = editEvent?.currentTarget || editEvent?.target || null;
          this.handlers.edit({
            video: editVideo,
            index: editIndex,
            trigger,
          });
        }
      };

      videoCard.onRevert = ({
        event: revertEvent,
        video: revertVideo,
        index: revertIndex,
      }) => {
        if (this.handlers.revert) {
          const trigger = revertEvent?.currentTarget || revertEvent?.target || null;
          this.handlers.revert({
            video: revertVideo,
            index: revertIndex,
            trigger,
          });
        }
      };

      videoCard.onDelete = ({
        event: deleteEvent,
        video: deleteVideo,
        index: deleteIndex,
      }) => {
        if (this.handlers.delete) {
          const trigger = deleteEvent?.currentTarget || deleteEvent?.target || null;
          this.handlers.delete({
            video: deleteVideo,
            index: deleteIndex,
            trigger,
          });
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

      videoCard.onRequestMoreMenu = (detail = {}) => {
        if (typeof this.utils.requestMoreMenu !== "function") {
          return;
        }
        const payload = {
          ...detail,
          video: detail.video || video,
          pointerInfo: detail.pointerInfo || pointerInfo,
        };
        this.utils.requestMoreMenu(payload);
      };

      videoCard.onCloseMoreMenu = (detail = {}) => {
        if (typeof this.utils.closeMoreMenu === "function") {
          return this.utils.closeMoreMenu(detail);
        }
        return false;
      };

      videoCard.onRequestSettingsMenu = (detail = {}) => {
        if (typeof this.utils.requestSettingsMenu === "function") {
          this.utils.requestSettingsMenu(detail);
        }
      };

      videoCard.onCloseSettingsMenu = (detail = {}) => {
        if (typeof this.utils.closeSettingsMenu === "function") {
          return this.utils.closeSettingsMenu(detail);
        }
        return false;
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

      const shouldResolvePostedAt =
        normalizedPostedAt === null &&
        typeof this.utils.resolveVideoPostedAt === "function";

      if (shouldResolvePostedAt) {
        Promise.resolve(this.utils.resolveVideoPostedAt(video))
          .then((resolvedPostedAt) => {
            if (!Number.isFinite(resolvedPostedAt)) {
              return;
            }
            if (!this.videoCardInstances.includes(videoCard)) {
              return;
            }
            if (videoCard.video?.id !== video.id) {
              return;
            }
            videoCard.updatePostedAt(Math.floor(resolvedPostedAt));
          })
          .catch((error) => {
            if (this.window?.userLogger?.warn) {
              this.window.userLogger.warn(
                "[VideoListView] Failed to resolve posted timestamp:",
                error
              );
            }
          });
      }
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
    this.utils.refreshDiscussionCounts(displayVideos, {
      container: this.container,
    });
    this.pruneDetachedViewCountElements();

    return displayVideos;
  }

  cacheUrlHealth(videoId, entry) {
    if (!videoId || !(this.state.urlHealthByVideoId instanceof Map)) {
      return;
    }

    if (!entry || typeof entry !== "object") {
      this.state.urlHealthByVideoId.delete(videoId);
      return;
    }

    const normalized = {
      status:
        typeof entry.status === "string" && entry.status ? entry.status : "checking",
      message:
        typeof entry.message === "string" && entry.message
          ? entry.message
          : "⏳ CDN",
    };

    if (Number.isFinite(entry.lastCheckedAt)) {
      normalized.lastCheckedAt = Math.floor(entry.lastCheckedAt);
    }

    this.state.urlHealthByVideoId.set(videoId, normalized);
  }

  cacheStreamHealth(videoId, entry) {
    if (!videoId || !(this.state.streamHealthByVideoId instanceof Map)) {
      return;
    }

    if (!entry || typeof entry !== "object") {
      this.state.streamHealthByVideoId.delete(videoId);
      return;
    }

    const normalized = {
      state:
        typeof entry.state === "string" && entry.state ? entry.state : "unknown",
    };

    if (Number.isFinite(entry.peers)) {
      normalized.peers = Math.max(0, Number(entry.peers));
    }
    if (typeof entry.webseedReachable === "boolean") {
      normalized.webseedReachable = entry.webseedReachable;
    }
    if (typeof entry.webseedOnly === "boolean") {
      normalized.webseedOnly = entry.webseedOnly;
    }
    if (typeof entry.reason === "string" && entry.reason) {
      normalized.reason = entry.reason;
    }
    if (Number.isFinite(entry.checkedAt)) {
      normalized.checkedAt = Math.floor(entry.checkedAt);
    }
    if (typeof entry.text === "string" && entry.text) {
      normalized.text = entry.text;
    }
    if (typeof entry.tooltip === "string" && entry.tooltip) {
      normalized.tooltip = entry.tooltip;
    }
    if (entry.role === "alert" || entry.role === "status") {
      normalized.role = entry.role;
    }
    if (entry.ariaLive === "assertive" || entry.ariaLive === "polite") {
      normalized.ariaLive = entry.ariaLive;
    }

    this.state.streamHealthByVideoId.set(videoId, normalized);
  }

  cleanupHealthCache(videos) {
    const activeIds = new Set();
    if (Array.isArray(videos)) {
      videos.forEach((video) => {
        if (video && typeof video.id === "string" && video.id) {
          activeIds.add(video.id);
        }
      });
    }

    if (this.state.urlHealthByVideoId instanceof Map) {
      Array.from(this.state.urlHealthByVideoId.keys()).forEach((videoId) => {
        if (!activeIds.has(videoId)) {
          this.state.urlHealthByVideoId.delete(videoId);
        }
      });
    }

    if (this.state.streamHealthByVideoId instanceof Map) {
      Array.from(this.state.streamHealthByVideoId.keys()).forEach((videoId) => {
        if (!activeIds.has(videoId)) {
          this.state.streamHealthByVideoId.delete(videoId);
        }
      });
    }
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

  getVideoPostedAtForSort(video) {
    if (!video || typeof video !== "object") {
      return Number.NEGATIVE_INFINITY;
    }

    const known = this.utils.getKnownVideoPostedAt(video);
    if (Number.isFinite(known)) {
      return Math.floor(known);
    }

    if (Number.isFinite(video?.rootCreatedAt)) {
      return Math.floor(video.rootCreatedAt);
    }

    if (Number.isFinite(video?.nip71Source?.created_at)) {
      return Math.floor(video.nip71Source.created_at);
    }

    if (Number.isFinite(video?.created_at)) {
      return Math.floor(video.created_at);
    }

    return Number.NEGATIVE_INFINITY;
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
          userLogger.warn(
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

    return { videoId, url, magnet, video, trigger: element };
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
      userLogger.warn("[viewCount] Failed to subscribe to view counter:", error);
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
          userLogger.warn(
            `[viewCount] Failed to unsubscribe from pointer ${key}:`,
            error
          );
        }
      }
      this.viewCountSubscriptions.delete(key);
    });
  }

  closeAllMenus(options = {}) {
    const restoreFocus = options?.restoreFocus !== false;
    const skipCard = options?.skipCard || null;
    const skipTrigger = options?.skipTrigger || null;

    if (Array.isArray(this.videoCardInstances) && this.videoCardInstances.length) {
      this.videoCardInstances.forEach((card) => {
        if (!card) {
          return;
        }

        if (skipCard && card === skipCard) {
          if (typeof card.closeSettingsMenu === "function") {
            card.closeSettingsMenu({ restoreFocus });
          }
          return;
        }

        if (typeof card.closeMoreMenu === "function") {
          card.closeMoreMenu({ restoreFocus });
        }
        if (typeof card.closeSettingsMenu === "function") {
          card.closeSettingsMenu({ restoreFocus });
        }
      });
    }

    if (options?.skipController) {
      return;
    }

    if (typeof this.utils.closeAllMenus === "function") {
      const payload = { skipView: true, restoreFocus };
      if (skipTrigger) {
        payload.skipTrigger = skipTrigger;
      }
      this.utils.closeAllMenus(payload);
    }
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

  resolveTagPreferenceState(tag) {
    const resolver = this.tagPreferenceStateResolver;
    if (typeof resolver !== "function") {
      return "neutral";
    }

    try {
      return resolver(tag);
    } catch (error) {
      userLogger.warn(
        "[VideoListView] Failed to resolve tag preference state:",
        error,
      );
      return "neutral";
    }
  }

  refreshTagPreferenceStates() {
    if (!this._popularTagStrip) {
      return;
    }

    const buttons = this._popularTagStrip.querySelectorAll("button[data-tag]");
    buttons.forEach((button) => {
      const tag = button.dataset.tag || "";
      const state = this.resolveTagPreferenceState(tag);
      applyTagPreferenceState(button, state);
    });
  }

  handlePopularTagActivate(tag, { event = null, button = null } = {}) {
    const normalizedTag =
      typeof tag === "string" && tag.trim() ? tag.trim() : String(tag ?? "");
    if (!normalizedTag) {
      return;
    }

    const detail = {
      tag: normalizedTag,
      event,
      trigger: button,
      context: "popular-tags",
    };

    if (typeof this.handlers.tagActivate === "function") {
      try {
        this.handlers.tagActivate(detail);
      } catch (error) {
        userLogger.warn(
          "[VideoListView] Tag activation handler threw an error:",
          error,
        );
      }
    }

    this.emit("tag:activate", detail);
  }
}
