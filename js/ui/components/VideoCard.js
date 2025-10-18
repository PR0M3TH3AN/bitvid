import { normalizeDesignSystemContext } from "../../designSystem.js";
import { updateVideoCardSourceVisibility } from "../../utils/cardSourceVisibility.js";
import { userLogger } from "../../utils/logger.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export class VideoCard {
  constructor({
    document: doc,
    video,
    index = 0,
    shareUrl = "#",
    timeAgo = "",
    postedAt = null,
    pointerInfo = null,
    cardState = "",
    motionState = "",
    capabilities = {},
    formatters = {},
    helpers = {},
    assets = {},
    state = {},
    ensureGlobalMoreMenuHandlers,
    onRequestCloseAllMenus,
    nsfwContext = null,
    designSystem = null,
  } = {}) {
    if (!doc) {
      throw new Error("VideoCard requires a document reference.");
    }
    if (!video || !video.id || !video.title) {
      throw new Error("VideoCard requires a video with id and title.");
    }

    this.document = doc;
    this.window = doc.defaultView || globalThis;
    this.video = video;
    this.index = index;
    this.shareUrl = shareUrl;
    this.cardState =
      typeof cardState === "string" ? cardState.trim() : "";
    this.motionState =
      typeof motionState === "string" ? motionState.trim() : "";
    this.pointerInfo = pointerInfo;
    this.capabilities = {
      canEdit: false,
      canDelete: false,
      canRevert: false,
      canManageBlacklist: false,
      ...capabilities
    };
    this.formatters = {
      formatTimeAgo: formatters.formatTimeAgo,
      formatNumber: formatters.formatNumber
    };
    this.helpers = {
      escapeHtml: helpers.escapeHtml,
      isMagnetSupported: helpers.isMagnetSupported,
      toLocaleString: helpers.toLocaleString
    };
    this.assets = {
      fallbackThumbnailSrc: assets.fallbackThumbnailSrc || "",
      unsupportedBtihMessage: assets.unsupportedBtihMessage || ""
    };
    this.state = {
      loadedThumbnails:
        state.loadedThumbnails instanceof Map ? state.loadedThumbnails : null,
      urlHealthByVideoId:
        state.urlHealthByVideoId instanceof Map
          ? state.urlHealthByVideoId
          : null,
      streamHealthByVideoId:
        state.streamHealthByVideoId instanceof Map
          ? state.streamHealthByVideoId
          : null
    };
    this.ensureGlobalMoreMenuHandlers =
      typeof ensureGlobalMoreMenuHandlers === "function"
        ? ensureGlobalMoreMenuHandlers
        : null;
    this.onRequestCloseAllMenus =
      typeof onRequestCloseAllMenus === "function"
        ? onRequestCloseAllMenus
        : null;

    this.designSystem = normalizeDesignSystemContext(designSystem);

    this.nsfwContext = {
      isNsfw: Boolean(nsfwContext?.isNsfw),
      allowNsfw: nsfwContext?.allowNsfw !== false,
      viewerIsOwner: nsfwContext?.viewerIsOwner === true
    };
    this.shouldMaskNsfwForOwner =
      this.nsfwContext.isNsfw &&
      !this.nsfwContext.allowNsfw &&
      this.nsfwContext.viewerIsOwner;

    this.callbacks = {
      onPlay: null,
      onEdit: null,
      onRevert: null,
      onDelete: null,
      onMoreAction: null,
      onAuthorNavigate: null,
      onRequestMoreMenu: null,
      onCloseMoreMenu: null,
      onRequestSettingsMenu: null,
      onCloseSettingsMenu: null,
      onModerationOverride: null,
    };

    this.moderationBadgeEl = null;
    this.moderationBadgeTextEl = null;
    this.moderationActionButton = null;
    this.moderationBadgeId = "";
    this.badgesContainerEl = null;
    this.boundShowAnywayHandler = (event) => this.handleShowAnywayClick(event);

    this.root = null;
    this.anchorEl = null;
    this.titleEl = null;
    this.thumbnailEl = null;
    this.settingsButton = null;
    this.moreMenuButton = null;
    this.urlHealthBadgeEl = null;
    this.torrentHealthBadgeEl = null;
    this.viewCountEl = null;
    this.discussionCountEl = null;
    this.authorPicEl = null;
    this.authorNameEl = null;
    this.timestampEl = null;

    this.playbackUrl = typeof video.url === "string" ? video.url.trim() : "";
    const magnet =
      (typeof video.magnet === "string" ? video.magnet.trim() : "") ||
      (typeof video.infoHash === "string" ? video.infoHash.trim() : "");
    this.playbackMagnet = magnet;
    this.magnetProvided = magnet.length > 0;
    this.magnetSupported = this.helpers.isMagnetSupported
      ? this.helpers.isMagnetSupported(magnet)
      : false;
    this.showUnsupportedTorrentBadge =
      !this.playbackUrl && this.magnetProvided && !this.magnetSupported;

    const normalizedPostedAt = Number.isFinite(postedAt)
      ? Math.floor(postedAt)
      : null;
    this.postedAt = normalizedPostedAt;

    if (
      this.postedAt !== null &&
      this.video &&
      typeof this.video === "object"
    ) {
      this.video.rootCreatedAt = this.postedAt;
    }

    const fallbackTimestamp =
      this.postedAt !== null
        ? this.postedAt
        : Number.isFinite(video?.created_at)
          ? Math.floor(video.created_at)
          : null;

    this.timeAgo =
      typeof timeAgo === "string" && timeAgo
        ? timeAgo
        : this.formatTimestampForLabel(fallbackTimestamp);

    this.build();
  }

  set onPlay(fn) {
    this.callbacks.onPlay = typeof fn === "function" ? fn : null;
  }

  set onEdit(fn) {
    this.callbacks.onEdit = typeof fn === "function" ? fn : null;
  }

  set onRevert(fn) {
    this.callbacks.onRevert = typeof fn === "function" ? fn : null;
  }

  set onDelete(fn) {
    this.callbacks.onDelete = typeof fn === "function" ? fn : null;
  }

  set onModerationOverride(fn) {
    this.callbacks.onModerationOverride = typeof fn === "function" ? fn : null;
  }

  set onMoreAction(fn) {
    this.callbacks.onMoreAction = typeof fn === "function" ? fn : null;
  }

  set onAuthorNavigate(fn) {
    this.callbacks.onAuthorNavigate = typeof fn === "function" ? fn : null;
  }

  set onRequestMoreMenu(fn) {
    this.callbacks.onRequestMoreMenu = typeof fn === "function" ? fn : null;
  }

  set onCloseMoreMenu(fn) {
    this.callbacks.onCloseMoreMenu = typeof fn === "function" ? fn : null;
  }

  set onRequestSettingsMenu(fn) {
    this.callbacks.onRequestSettingsMenu =
      typeof fn === "function" ? fn : null;
  }

  set onCloseSettingsMenu(fn) {
    this.callbacks.onCloseSettingsMenu =
      typeof fn === "function" ? fn : null;
  }

  getRoot() {
    return this.root;
  }

  getUrlHealthBadgeElement() {
    return this.urlHealthBadgeEl;
  }

  getTorrentHealthBadgeElement() {
    return this.torrentHealthBadgeEl;
  }

  getViewCountElement() {
    return this.viewCountEl;
  }

  getDiscussionCountElement() {
    return this.discussionCountEl;
  }

  closeMoreMenu(options = {}) {
    const restoreFocus = options?.restoreFocus !== false;
    const trigger = this.moreMenuButton;
    const wasExpanded =
      typeof trigger?.getAttribute === "function" &&
      trigger.getAttribute("aria-expanded") === "true";

    const detail = {
      trigger,
      video: this.video,
      card: this,
      restoreFocus,
    };

    let handled = false;
    if (this.callbacks.onCloseMoreMenu) {
      try {
        handled = this.callbacks.onCloseMoreMenu(detail) === true;
      } catch (error) {
        if (this.window?.userLogger?.warn) {
          this.window.userLogger.warn(
            "[VideoCard] onCloseMoreMenu callback failed",
            error,
          );
        }
      }
    }

    if (
      !handled &&
      restoreFocus &&
      wasExpanded &&
      typeof trigger?.focus === "function"
    ) {
      try {
        trigger.focus();
      } catch (error) {
        /* noop */
      }
    }
  }

  closeSettingsMenu(options = {}) {
    const restoreFocus = options?.restoreFocus !== false;
    const trigger = this.settingsButton;
    const wasExpanded =
      typeof trigger?.getAttribute === "function" &&
      trigger.getAttribute("aria-expanded") === "true";

    const detail = {
      trigger,
      video: this.video,
      card: this,
      restoreFocus,
    };

    let handled = false;
    if (this.callbacks.onCloseSettingsMenu) {
      try {
        handled = this.callbacks.onCloseSettingsMenu(detail) === true;
      } catch (error) {
        if (this.window?.userLogger?.warn) {
          this.window.userLogger.warn(
            "[VideoCard] onCloseSettingsMenu callback failed",
            error,
          );
        }
      }
    }

    if (
      !handled &&
      restoreFocus &&
      wasExpanded &&
      typeof trigger?.focus === "function"
    ) {
      try {
        trigger.focus();
      } catch (error) {
        /* noop */
      }
    }
  }

  build() {
    const doc = this.document;

    const root = this.createElement("div", {
      classNames: ["card"]
    });

    this.root = root;

    this.root.dataset.component = "video-card";
    this.syncCardState();
    this.syncMotionState();
    if (this.video?.id) {
      root.dataset.videoId = this.video.id;
    }

    this.applyNsfwContext();
    this.applyPointerDataset();
    this.applyOwnerDataset();
    this.applySourceDatasets();
    this.applyModerationDatasets();

    const anchor = this.createElement("a", {
      classNames: [
        "block",
        "cursor-pointer",
        "relative",
        "group",
        "rounded-t-lg",
        "overflow-hidden"
      ],
      attrs: {
        href: this.shareUrl
      }
    });
    anchor.dataset.videoId = this.video.id;
    this.anchorEl = anchor;

    const ratio = this.createElement("div", {
      classNames: ["ratio-16-9"]
    });
    const thumbnail = this.buildThumbnail();
    ratio.appendChild(thumbnail);
    anchor.appendChild(ratio);

    const content = this.createElement("div", {
      classNames: ["p-md", "bv-stack", "bv-stack--tight"]
    });
    this.contentEl = content;

    const title = this.createElement("h3", {
      classNames: [
        "text-lg",
        "font-bold",
        "text-text",
        "line-clamp-2",
        "hover:text-info-strong",
        "cursor-pointer"
      ],
      textContent: this.video.title
    });
    title.dataset.videoId = this.video.id;
    this.titleEl = title;

    const header = this.createElement("div", {
      classNames: ["flex", "items-center", "justify-between"]
    });

    const authorSection = this.buildAuthorSection();
    const controls = this.buildControls();

    header.appendChild(authorSection);
    if (controls) {
      header.appendChild(controls);
    }

    content.appendChild(title);
    content.appendChild(header);

    const badgesContainer = this.buildBadgesContainer();
    if (badgesContainer) {
      content.appendChild(badgesContainer);
    }

    const discussion = this.buildDiscussionCount();
    if (discussion) {
      content.appendChild(discussion);
    }

    if (this.showUnsupportedTorrentBadge) {
      const warning = this.createElement("p", {
        classNames: ["mt-3", "text-xs", "text-status-warning-on"],
        attrs: { title: this.assets.unsupportedBtihMessage || "" },
        textContent:
          "WebTorrent fallback unavailable (magnet missing btih info hash)"
      });
      warning.dataset.torrentStatus = "unsupported";
      content.appendChild(warning);
    }

    root.appendChild(anchor);
    root.appendChild(content);

    this.applyPlaybackDatasets();
    this.bindEvents();
  }

  setCardBackdropImage(src) {
    if (!this.root || !this.root.style) {
      return;
    }

    const style = this.root.style;

    const normalizeSource = (raw) => {
      if (typeof raw !== "string") {
        return "";
      }

      const trimmed = raw.trim();
      if (!trimmed) {
        return "";
      }

      if (/^javascript:/i.test(trimmed) || /^vbscript:/i.test(trimmed)) {
        return "";
      }

      if (/^(?:https?:|data:|blob:)/i.test(trimmed)) {
        return trimmed;
      }

      if (
        trimmed.startsWith("/") ||
        trimmed.startsWith("./") ||
        trimmed.startsWith("../") ||
        trimmed.startsWith("assets/")
      ) {
        return trimmed;
      }

      try {
        const base =
          typeof this.document?.baseURI === "string" && this.document.baseURI
            ? this.document.baseURI
            : this.window?.location?.href || "";
        if (!base) {
          return "";
        }

        const resolved = new URL(trimmed, base);
        if (/^(?:https?:|data:|blob:)/i.test(resolved.protocol)) {
          return resolved.href;
        }
      } catch {
        return "";
      }

      return "";
    };

    const sanitized = normalizeSource(src);

    if (sanitized) {
      const escaped = sanitized.replace(/(["\\])/g, "\\$1");
      style.setProperty("--video-card-thumb-url", `url("${escaped}")`);
    } else {
      style.removeProperty("--video-card-thumb-url");
    }
  }

  buildThumbnail() {
    const img = this.createElement("img");
    img.dataset.videoThumbnail = "true";

    const fallbackSrc = this.assets.fallbackThumbnailSrc || "";
    const thumbnailUrl =
      typeof this.video.thumbnail === "string"
        ? this.video.thumbnail.trim()
        : "";

    const cachedValue = this.state.loadedThumbnails?.get(this.video.id) || "";
    const shouldLazyLoad = !!thumbnailUrl && cachedValue !== thumbnailUrl;
    const shouldAnimate = !!thumbnailUrl && cachedValue !== thumbnailUrl;

    if (shouldLazyLoad) {
      if (fallbackSrc) {
        img.src = fallbackSrc;
        img.dataset.fallbackSrc = fallbackSrc;
        this.setCardBackdropImage(fallbackSrc);
      }
      img.dataset.lazy = thumbnailUrl;
    } else {
      img.src = thumbnailUrl || fallbackSrc;
      if (fallbackSrc) {
        img.dataset.fallbackSrc = fallbackSrc;
      }
      if (!thumbnailUrl && fallbackSrc) {
        this.setCardBackdropImage(fallbackSrc);
      } else if (thumbnailUrl) {
        this.setCardBackdropImage(thumbnailUrl);
      }
    }

    img.loading = "lazy";
    img.decoding = "async";
    img.alt = this.video.title || "";

    this.thumbnailEl = img;

    const shouldBlurForModeration = this.video?.moderation?.blurThumbnail === true;

    if (this.shouldMaskNsfwForOwner || shouldBlurForModeration) {
      img.dataset.thumbnailState = "blurred";
    }

    const markThumbnailAsLoaded = () => {
      if (!thumbnailUrl) {
        return;
      }

      if (shouldAnimate) {
        if (img.dataset.thumbnailLoaded !== "true") {
          img.dataset.thumbnailLoaded = "true";
        }
      } else if (img.dataset.thumbnailLoaded) {
        delete img.dataset.thumbnailLoaded;
      }

      if (this.state.loadedThumbnails) {
        this.state.loadedThumbnails.set(this.video.id, thumbnailUrl);
      }
    };

    const handleLoad = () => {
      if (img.dataset.thumbnailLoaded === "true") {
        return;
      }

      const hasPendingLazySrc =
        typeof img.dataset.lazy === "string" && img.dataset.lazy.trim().length;

      if (hasPendingLazySrc) {
        return;
      }

      const fallbackAttr =
        (typeof img.dataset.fallbackSrc === "string"
          ? img.dataset.fallbackSrc.trim()
          : "") ||
        fallbackSrc ||
        "";

      const currentSrc = img.currentSrc || img.src || "";
      const isFallback =
        !!fallbackAttr &&
        !!currentSrc &&
        (currentSrc === fallbackAttr || currentSrc.endsWith(fallbackAttr));

      if (isFallback) {
        this.setCardBackdropImage(fallbackAttr || currentSrc);
      } else {
        this.setCardBackdropImage(currentSrc);
      }

      if (img.dataset.thumbnailFailed || !thumbnailUrl) {
        return;
      }

      if ((img.naturalWidth === 0 && img.naturalHeight === 0) || !currentSrc) {
        return;
      }

      if (isFallback) {
        return;
      }

      markThumbnailAsLoaded();
      img.removeEventListener("load", handleLoad);
    };

    const handleError = () => {
      if (thumbnailUrl && this.state.loadedThumbnails) {
        const cached = this.state.loadedThumbnails.get(this.video.id);
        if (cached === thumbnailUrl) {
          this.state.loadedThumbnails.delete(this.video.id);
        }
      }

      if (img.dataset.thumbnailLoaded) {
        delete img.dataset.thumbnailLoaded;
      }

      const fallbackAttr =
        (typeof img.dataset.fallbackSrc === "string"
          ? img.dataset.fallbackSrc.trim()
          : "") ||
        fallbackSrc ||
        "";

      if (fallbackAttr) {
        this.setCardBackdropImage(fallbackAttr);
      } else {
        this.setCardBackdropImage("");
      }

      img.removeEventListener("load", handleLoad);
    };

    img.addEventListener("load", handleLoad);
    img.addEventListener("error", handleError, { once: true });

    if (img.complete) {
      handleLoad();
    }

    return img;
  }

  buildAuthorSection() {
    const wrapper = this.createElement("div", {
      classNames: ["flex", "items-center", "space-x-3"]
    });

    const avatarWrapper = this.createElement("div", {
      classNames: [
        "w-8",
        "h-8",
        "rounded-full",
        "bg-panel",
        "overflow-hidden",
        "flex",
        "items-center",
        "justify-center"
      ]
    });

    const avatar = this.createElement("img", {
      attrs: {
        src: "assets/svg/default-profile.svg",
        alt: "Placeholder"
      }
    });
    avatar.classList.add("author-pic", "cursor-pointer");
    if (this.video.pubkey) {
      avatar.dataset.pubkey = this.video.pubkey;
    }

    avatarWrapper.appendChild(avatar);

    const authorMeta = this.createElement("div", { classNames: ["min-w-0"] });

    const authorName = this.createElement("p", {
      classNames: ["text-sm", "text-muted", "author-name", "cursor-pointer"],
      textContent: "Loading name..."
    });
    if (this.video.pubkey) {
      authorName.dataset.pubkey = this.video.pubkey;
    }

    const metadata = this.createElement("div", {
      classNames: [
        "flex",
        "items-center",
        "text-xs",
        "text-muted-strong",
        "mt-1"
      ]
    });

    const timeEl = this.createElement("span", {
      textContent: this.timeAgo
    });
    metadata.appendChild(timeEl);
    this.timestampEl = timeEl;

    if (this.pointerInfo && this.pointerInfo.key) {
      const dot = this.createElement("span", {
        classNames: ["mx-1", "text-muted-strong"],
        textContent: "•"
      });
      dot.setAttribute("aria-hidden", "true");

      const view = this.createElement("span", {
        classNames: ["view-count-text"],
        textContent: "– views"
      });
      view.dataset.viewCount = "";
      view.dataset.viewPointer = this.pointerInfo.key;

      metadata.appendChild(dot);
      metadata.appendChild(view);

      this.viewCountEl = view;
    }

    authorMeta.appendChild(authorName);
    authorMeta.appendChild(metadata);

    wrapper.appendChild(avatarWrapper);
    wrapper.appendChild(authorMeta);

    this.authorPicEl = avatar;
    this.authorNameEl = authorName;

    return wrapper;
  }

  createEllipsisIcon(classNames = []) {
    const svg = this.document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    classNames.forEach((className) => {
      if (className) {
        svg.classList.add(className);
      }
    });

    const addCircle = (cx) => {
      const circle = this.document.createElementNS(SVG_NAMESPACE, "circle");
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", "12");
      circle.setAttribute("r", "2");
      circle.setAttribute("fill", "currentColor");
      svg.appendChild(circle);
    };

    addCircle(5);
    addCircle(12);
    addCircle(19);

    return svg;
  }

  createSettingsIcon(classNames = []) {
    const svg = this.document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    classNames.forEach((className) => {
      if (className) {
        svg.classList.add(className);
      }
    });

    const path = this.document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute(
      "d",
      "M24,13.616L24,10.384C22.349,9.797 21.306,9.632 20.781,8.365L20.781,8.364C20.254,7.093 20.881,6.23 21.628,4.657L19.343,2.372C17.782,3.114 16.91,3.747 15.636,3.219L15.635,3.219C14.366,2.693 14.2,1.643 13.616,0L10.384,0C9.802,1.635 9.635,2.692 8.365,3.219L8.364,3.219C7.093,3.747 6.232,3.121 4.657,2.372L2.372,4.657C3.117,6.225 3.747,7.091 3.219,8.364C2.692,9.635 1.635,9.802 0,10.384L0,13.616C1.632,14.196 2.692,14.365 3.219,15.635C3.749,16.917 3.105,17.801 2.372,19.342L4.657,21.628C6.219,20.885 7.091,20.253 8.364,20.781L8.365,20.781C9.635,21.307 9.801,22.36 10.384,24L13.616,24C14.198,22.364 14.366,21.31 15.643,20.778L15.644,20.778C16.906,20.254 17.764,20.879 19.342,21.629L21.627,19.343C20.883,17.78 20.252,16.91 20.779,15.637C21.306,14.366 22.367,14.197 24,13.616ZM12,16C9.791,16 8,14.209 8,12C8,9.791 9.791,8 12,8C14.209,8 16,9.791 16,12C16,14.209 14.209,16 12,16Z"
    );
    path.setAttribute("fill", "currentColor");
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("clip-rule", "evenodd");

    svg.appendChild(path);

    return svg;
  }

  buildControls() {
    const container = this.createElement("div", {
      classNames: ["flex", "items-center"]
    });

    const moreMenu = this.buildMoreMenu();
    if (moreMenu) {
      container.appendChild(moreMenu);
    }

    if (this.capabilities.canEdit) {
      const button = this.createElement("button", {
        classNames: [
          "btn-ghost",
          "h-10",
          "w-10",
          "rounded-full",
          "p-0",
          "text-muted",
          "ml-2",
        ],
        attrs: {
          type: "button",
          "aria-haspopup": "true",
          "aria-expanded": "false",
          "aria-label": "Video settings",
        },
      });

      const icon = this.createSettingsIcon(["h-5", "w-5"]);
      button.appendChild(icon);

      this.settingsButton = button;
      container.appendChild(button);
    }

    return container;
  }

  buildMoreMenu() {
    const button = this.createElement("button", {
      classNames: [
        "btn-ghost",
        "h-10",
        "w-10",
        "rounded-full",
        "p-0",
        "text-muted",
        "ml-1",
      ],
      attrs: {
        type: "button",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        "aria-label": "More options",
      },
    });

    const icon = this.createEllipsisIcon(["w-5", "h-5", "object-contain"]);
    button.appendChild(icon);

    this.moreMenuButton = button;

    return button;
  }

  buildBadgesContainer() {
    const pieces = [];

    if (this.playbackUrl) {
      const badge = this.createElement("span", {
        classNames: ["badge", "url-health-badge"]
      });
      badge.setAttribute("aria-live", "polite");
      badge.setAttribute("role", "status");
      this.applyUrlBadgeVisualState(badge, this.getCachedUrlHealthEntry());
      this.urlHealthBadgeEl = badge;
      pieces.push(badge);
    }

    if (this.magnetSupported && this.magnetProvided) {
      const badge = this.createElement("span", {
        classNames: ["badge", "torrent-health-badge"]
      });
      badge.setAttribute("aria-live", "polite");
      badge.setAttribute("role", "status");
      this.applyStreamBadgeVisualState(
        badge,
        this.getCachedStreamHealthEntry()
      );
      this.torrentHealthBadgeEl = badge;
      pieces.push(badge);
    }

    const moderationBadge = this.buildModerationBadge();
    if (moderationBadge) {
      pieces.push(moderationBadge);
    }

    if (!pieces.length) {
      return null;
    }

    const container = this.createElement("div", {
      classNames: ["flex", "flex-wrap", "items-center", "gap-sm"]
    });
    pieces.forEach((el) => container.appendChild(el));
    this.badgesContainerEl = container;
    this.updateModerationAria();
    return container;
  }

  getModerationBadgeId() {
    if (this.moderationBadgeId) {
      return this.moderationBadgeId;
    }

    const baseId =
      typeof this.video?.id === "string" && this.video.id
        ? this.video.id
        : `index-${this.index}`;
    const sanitized = baseId.replace(/[^a-zA-Z0-9_-]/g, "");
    const id = `video-card-${sanitized}-moderation`;
    this.moderationBadgeId = id;
    return id;
  }

  getModerationContext() {
    const moderation =
      this.video?.moderation && typeof this.video.moderation === "object"
        ? this.video.moderation
        : null;

    const summary =
      moderation?.summary && typeof moderation.summary === "object"
        ? moderation.summary
        : null;

    let reportType = "";
    if (typeof moderation?.reportType === "string" && moderation.reportType.trim()) {
      reportType = moderation.reportType.trim().toLowerCase();
    }

    if (!reportType && summary && summary.types && typeof summary.types === "object") {
      for (const [type, stats] of Object.entries(summary.types)) {
        if (stats && Number.isFinite(stats.trusted) && Math.floor(stats.trusted) > 0) {
          reportType = String(type).toLowerCase();
          break;
        }
      }
    }

    let trustedCount = Number.isFinite(moderation?.trustedCount)
      ? Math.max(0, Math.floor(moderation.trustedCount))
      : 0;

    if (!trustedCount && summary && summary.types && typeof summary.types === "object") {
      for (const stats of Object.values(summary.types)) {
        if (stats && Number.isFinite(stats.trusted)) {
          trustedCount = Math.max(trustedCount, Math.floor(stats.trusted));
        }
      }
    }

    const reporterDisplayNames = Array.isArray(moderation?.reporterDisplayNames)
      ? moderation.reporterDisplayNames
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter(Boolean)
      : [];

    const trustedMuted = moderation?.trustedMuted === true;
    let trustedMuteCount = Number.isFinite(moderation?.trustedMuteCount)
      ? Math.max(0, Math.floor(moderation.trustedMuteCount))
      : 0;

    if (!trustedMuteCount && Array.isArray(moderation?.trustedMuters)) {
      const muters = moderation.trustedMuters
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);
      trustedMuteCount = muters.length;
    }

    const trustedMuteDisplayNames = Array.isArray(moderation?.trustedMuterDisplayNames)
      ? moderation.trustedMuterDisplayNames
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter(Boolean)
      : [];

    const original =
      moderation?.original && typeof moderation.original === "object"
        ? moderation.original
        : {};

    const context = {
      reportType,
      friendlyType: reportType ? reportType.replace(/[_-]+/g, " ").trim() : "",
      trustedCount,
      reporterDisplayNames,
      trustedMuted,
      trustedMuteCount,
      trustedMuteDisplayNames,
      originalBlur: original.blurThumbnail === true,
      originalBlockAutoplay: original.blockAutoplay === true,
      activeBlur: moderation?.blurThumbnail === true,
      activeBlockAutoplay: moderation?.blockAutoplay === true,
      overrideActive: moderation?.viewerOverride?.showAnyway === true,
    };

    context.shouldShow =
      context.originalBlur ||
      context.originalBlockAutoplay ||
      context.trustedCount > 0 ||
      context.trustedMuted ||
      context.overrideActive;

    context.allowOverride = context.originalBlur || context.originalBlockAutoplay;

    return context;
  }

  buildModerationReasonText(context) {
    if (!context) {
      return "";
    }

    const reasons = [];

    if (context.trustedMuted) {
      const muteCount = Math.max(1, Number(context.trustedMuteCount) || 0);
      const muteLabel = muteCount === 1 ? "trusted contact" : "trusted contacts";
      reasons.push(`muted by ${muteCount === 1 ? "a" : muteCount} ${muteLabel}`);
    }

    const typeLabel = context.friendlyType || "this video";
    const reportCount = Math.max(0, Number(context.trustedCount) || 0);
    if (reportCount > 0) {
      const friendLabel = reportCount === 1 ? "friend" : "friends";
      reasons.push(`${reportCount} ${friendLabel} reported ${typeLabel}`);
    } else if (!context.trustedMuted) {
      reasons.push(context.friendlyType ? `reports of ${typeLabel}` : "reports");
    }

    if (!reasons.length) {
      return "";
    }

    const combined = reasons.join(" · ");
    return combined.charAt(0).toUpperCase() + combined.slice(1);
  }

  buildModerationBadgeText(context) {
    if (!context) {
      return "";
    }

    const reason = this.buildModerationReasonText(context);
    if (context.overrideActive) {
      if (reason) {
        return `Showing despite ${reason}`;
      }
      return "Showing despite reports";
    }

    const parts = [];
    if (context.originalBlur) {
      parts.push("Blurred");
    }
    if (context.originalBlockAutoplay) {
      parts.push("Autoplay blocked");
    }
    if (context.trustedMuted && !context.originalBlur && !context.originalBlockAutoplay) {
      parts.push(reason || "Muted by trusted contacts");
    } else if (reason) {
      parts.push(reason);
    }

    return parts.join(" · ");
  }

  createModerationOverrideButton() {
    const button = this.createElement("button", {
      classNames: [
        "inline-flex",
        "items-center",
        "rounded-full",
        "border",
        "border-status-warning-border",
        "px-3",
        "py-1",
        "text-2xs",
        "font-semibold",
        "uppercase",
        "tracking-extra-wide",
        "text-status-warning-on",
        "bg-transparent",
        "hover:bg-status-warning-surface",
        "transition",
        "duration-150",
        "focus-visible:outline",
        "focus-visible:outline-2",
        "focus-visible:outline-offset-2",
        "focus-visible:outline-status-warning-border",
      ],
      attrs: {
        type: "button",
        "data-moderation-action": "override",
        "aria-pressed": "false",
        "aria-describedby": this.getModerationBadgeId(),
      },
      textContent: "Show anyway",
    });
    button.addEventListener("click", this.boundShowAnywayHandler);
    return button;
  }

  handleShowAnywayClick(event) {
    if (event) {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (typeof event.stopPropagation === "function") {
        event.stopPropagation();
      }
    }

    const button = this.moderationActionButton;
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }

    if (!this.callbacks.onModerationOverride) {
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      return;
    }

    let result;
    try {
      result = this.callbacks.onModerationOverride({
        event,
        video: this.video,
        card: this,
      });
    } catch (error) {
      userLogger.warn("[VideoCard] onModerationOverride callback threw", error);
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      return;
    }

    Promise.resolve(result)
      .then((handled) => {
        if (handled === false) {
          if (button) {
            button.disabled = false;
            button.removeAttribute("aria-busy");
          }
          return;
        }
        this.refreshModerationUi();
      })
      .catch((error) => {
        userLogger.warn("[VideoCard] Moderation override failed", error);
        if (button) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        }
      });
  }

  buildModerationBadge() {
    const context = this.getModerationContext();
    if (!context.shouldShow) {
      this.moderationBadgeEl = null;
      this.moderationBadgeTextEl = null;
      if (this.moderationActionButton) {
        this.moderationActionButton.removeEventListener(
          "click",
          this.boundShowAnywayHandler,
        );
      }
      this.moderationActionButton = null;
      return null;
    }

    const badge = this.createElement("div", {
      classNames: ["badge", "flex", "flex-wrap", "items-center", "gap-sm"],
    });
    badge.dataset.variant = context.overrideActive ? "neutral" : "warning";
    badge.dataset.moderationBadge = "true";
    const state = context.overrideActive
      ? "override"
      : context.trustedMuted
        ? "trusted-mute"
        : "blocked";
    badge.dataset.moderationState = state;

    const badgeId = this.getModerationBadgeId();
    badge.id = badgeId;
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-live", "polite");
    badge.setAttribute("aria-atomic", "true");

    const text = this.createElement("span", {
      classNames: ["whitespace-nowrap"],
      textContent: this.buildModerationBadgeText(context),
    });
    badge.appendChild(text);

    const muteNames = Array.isArray(context.trustedMuteDisplayNames)
      ? context.trustedMuteDisplayNames
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter(Boolean)
      : [];
    const reporterNames = Array.isArray(context.reporterDisplayNames)
      ? context.reporterDisplayNames
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter(Boolean)
      : [];

    const allNames = [...muteNames, ...reporterNames];
    const uniqueNames = [];
    const seenNameKeys = new Set();
    for (const name of allNames) {
      if (typeof name !== "string" || !name.trim()) {
        continue;
      }
      const key = name.trim().toLowerCase();
      if (seenNameKeys.has(key)) {
        continue;
      }
      seenNameKeys.add(key);
      uniqueNames.push(name.trim());
    }

    if (uniqueNames.length) {
      const joined = uniqueNames.join(", ");
      const hasMutedNames = muteNames.length > 0;
      const hasReporterNames = reporterNames.length > 0;
      const prefix = hasMutedNames && hasReporterNames ? "Muted/Reported by" : hasMutedNames ? "Muted by" : "Reported by";
      badge.title = `${prefix} ${joined}`;
      badge.setAttribute("aria-label", `${text.textContent}. ${prefix} ${joined}.`);
    } else {
      badge.removeAttribute("title");
      badge.setAttribute("aria-label", `${text.textContent}.`);
    }

    this.moderationBadgeEl = badge;
    this.moderationBadgeTextEl = text;

    if (!context.overrideActive && context.allowOverride) {
      const button = this.createModerationOverrideButton();
      badge.appendChild(button);
      this.moderationActionButton = button;
    } else {
      this.moderationActionButton = null;
    }

    return badge;
  }

  updateModerationBadge() {
    const context = this.getModerationContext();
    const badge = this.moderationBadgeEl;

    if (!context.shouldShow) {
      if (badge && badge.parentElement) {
        badge.parentElement.removeChild(badge);
      }
      if (this.moderationActionButton) {
        this.moderationActionButton.removeEventListener(
          "click",
          this.boundShowAnywayHandler,
        );
      }
      this.moderationBadgeEl = null;
      this.moderationBadgeTextEl = null;
      this.moderationActionButton = null;
      this.updateModerationAria();
      return;
    }

    if (!badge) {
      const nextBadge = this.buildModerationBadge();
      if (nextBadge) {
        if (!this.badgesContainerEl) {
          this.badgesContainerEl = this.createElement("div", {
            classNames: ["flex", "flex-wrap", "items-center", "gap-sm"],
          });
          if (this.contentEl) {
            if (
              this.discussionCountEl &&
              this.discussionCountEl.parentElement === this.contentEl
            ) {
              this.contentEl.insertBefore(
                this.badgesContainerEl,
                this.discussionCountEl,
              );
            } else {
              this.contentEl.appendChild(this.badgesContainerEl);
            }
          }
        }
        this.badgesContainerEl.appendChild(nextBadge);
      }
      this.updateModerationAria();
      return;
    }

    badge.dataset.variant = context.overrideActive ? "neutral" : "warning";
    const state = context.overrideActive
      ? "override"
      : context.trustedMuted
        ? "trusted-mute"
        : "blocked";
    badge.dataset.moderationState = state;

    const textContent = this.buildModerationBadgeText(context);
    if (this.moderationBadgeTextEl) {
      this.moderationBadgeTextEl.textContent = textContent;
    }

    const muteNames = Array.isArray(context.trustedMuteDisplayNames)
      ? context.trustedMuteDisplayNames
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter(Boolean)
      : [];
    const reporterNames = Array.isArray(context.reporterDisplayNames)
      ? context.reporterDisplayNames
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter(Boolean)
      : [];

    const allNames = [...muteNames, ...reporterNames];
    const uniqueNames = [];
    const seenNameKeys = new Set();
    for (const name of allNames) {
      if (typeof name !== "string" || !name.trim()) {
        continue;
      }
      const key = name.trim().toLowerCase();
      if (seenNameKeys.has(key)) {
        continue;
      }
      seenNameKeys.add(key);
      uniqueNames.push(name.trim());
    }

    if (uniqueNames.length) {
      const joined = uniqueNames.join(", ");
      const hasMutedNames = muteNames.length > 0;
      const hasReporterNames = reporterNames.length > 0;
      const prefix = hasMutedNames && hasReporterNames ? "Muted/Reported by" : hasMutedNames ? "Muted by" : "Reported by";
      badge.title = `${prefix} ${joined}`;
      badge.setAttribute("aria-label", `${textContent}. ${prefix} ${joined}.`);
    } else {
      badge.removeAttribute("title");
      badge.setAttribute("aria-label", `${textContent}.`);
    }

    if (context.overrideActive || !context.allowOverride) {
      if (this.moderationActionButton) {
        this.moderationActionButton.removeEventListener(
          "click",
          this.boundShowAnywayHandler,
        );
        this.moderationActionButton.remove();
      }
      this.moderationActionButton = null;
    } else if (!this.moderationActionButton) {
      const button = this.createModerationOverrideButton();
      badge.appendChild(button);
      this.moderationActionButton = button;
    } else {
      this.moderationActionButton.disabled = false;
      this.moderationActionButton.removeAttribute("aria-busy");
    }
  }

  updateModerationAria() {
    const badgeId = this.moderationBadgeEl ? this.getModerationBadgeId() : "";
    const elements = [this.anchorEl, this.titleEl].filter(Boolean);
    elements.forEach((el) => {
      if (!el || typeof el.getAttribute !== "function") {
        return;
      }
      const attr = el.getAttribute("aria-describedby") || "";
      const tokens = attr.split(/\s+/).filter(Boolean);
      const filtered = tokens.filter((token) => token !== this.moderationBadgeId);
      if (badgeId) {
        filtered.push(badgeId);
      }
      if (filtered.length) {
        el.setAttribute("aria-describedby", Array.from(new Set(filtered)).join(" "));
      } else {
        el.removeAttribute("aria-describedby");
      }
    });
  }

  refreshModerationUi() {
    this.applyModerationDatasets();
    this.updateModerationBadge();
    this.updateModerationAria();
  }

  getCachedUrlHealthEntry() {
    if (!this.video?.id || !(this.state.urlHealthByVideoId instanceof Map)) {
      return null;
    }

    const entry = this.state.urlHealthByVideoId.get(this.video.id);
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const normalized = {};
    if (typeof entry.status === "string" && entry.status) {
      normalized.status = entry.status;
    }
    if (typeof entry.message === "string" && entry.message) {
      normalized.message = entry.message;
    }
    if (Number.isFinite(entry.lastCheckedAt)) {
      normalized.lastCheckedAt = Math.floor(entry.lastCheckedAt);
    }

    return Object.keys(normalized).length ? normalized : null;
  }

  getCachedStreamHealthEntry() {
    if (!this.video?.id || !(this.state.streamHealthByVideoId instanceof Map)) {
      return null;
    }

    const entry = this.state.streamHealthByVideoId.get(this.video.id);
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const normalized = {};
    if (typeof entry.state === "string" && entry.state) {
      normalized.state = entry.state;
    }
    if (Number.isFinite(entry.peers)) {
      normalized.peers = Math.max(0, Number(entry.peers));
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

    return Object.keys(normalized).length ? normalized : null;
  }

  formatTorrentCheckedTime(timestamp) {
    if (!Number.isFinite(timestamp)) {
      return "";
    }

    try {
      return new Date(timestamp).toLocaleTimeString([], { hour12: false });
    } catch (error) {
      try {
        return new Date(timestamp).toLocaleTimeString();
      } catch (err) {
        return "";
      }
    }
  }

  buildTorrentTooltip({ peers = null, checkedAt = null, reason = null } = {}) {
    const parts = [];
    if (Number.isFinite(peers)) {
      parts.push(`Peers: ${Math.max(0, Number(peers))}`);
    }
    if (Number.isFinite(checkedAt)) {
      const formatted = this.formatTorrentCheckedTime(checkedAt);
      if (formatted) {
        parts.push(`Checked ${formatted}`);
      }
    }
    if (typeof reason === "string" && reason && reason !== "peer") {
      let normalizedReason;
      if (reason === "timeout") {
        normalizedReason = "Timed out";
      } else if (reason === "no-trackers") {
        normalizedReason = "No WSS trackers";
      } else if (reason === "invalid") {
        normalizedReason = "Invalid magnet";
      } else {
        normalizedReason = reason.charAt(0).toUpperCase() + reason.slice(1);
      }
      parts.push(normalizedReason);
    }
    if (!parts.length) {
      return "WebTorrent status unknown";
    }
    return `WebTorrent • ${parts.join(" • ")}`;
  }

  applyUrlBadgeVisualState(badge, entry) {
    if (!(badge instanceof HTMLElement)) {
      return;
    }

    const status =
      typeof entry?.status === "string" && entry.status
        ? entry.status
        : "checking";
    const fallbackMessages = {
      healthy: "✅ CDN",
      offline: "❌ CDN",
      unknown: "⚠️ CDN",
      timeout: "⚠️ CDN timed out",
      checking: "⏳ CDN"
    };
    const message =
      typeof entry?.message === "string" && entry.message
        ? entry.message
        : fallbackMessages[status] || fallbackMessages.checking;

    badge.className = ["badge", "url-health-badge"].join(" ");

    const variantMap = {
      healthy: "success",
      offline: "critical",
      unknown: "neutral",
      timeout: "neutral",
      checking: "neutral"
    };
    const variant = variantMap[status];
    if (variant) {
      badge.dataset.variant = variant;
    } else if (badge.dataset.variant) {
      delete badge.dataset.variant;
    }

    badge.dataset.urlHealthState = status;
    badge.textContent = message;
    badge.setAttribute("aria-live", "polite");
    badge.setAttribute("role", status === "offline" ? "alert" : "status");
  }

  applyStreamBadgeVisualState(badge, entry) {
    if (!(badge instanceof HTMLElement)) {
      return;
    }

    const state =
      typeof entry?.state === "string" && entry.state
        ? entry.state
        : "checking";
    const peersValue = Number.isFinite(entry?.peers)
      ? Math.max(0, Number(entry.peers))
      : null;
    const reason =
      typeof entry?.reason === "string" && entry.reason ? entry.reason : null;
    const text =
      typeof entry?.text === "string" && entry.text ? entry.text : null;
    const tooltip =
      typeof entry?.tooltip === "string" && entry.tooltip
        ? entry.tooltip
        : null;
    const role =
      entry?.role === "alert" || entry?.role === "status" ? entry.role : null;
    const ariaLive =
      entry?.ariaLive === "assertive" || entry?.ariaLive === "polite"
        ? entry.ariaLive
        : role === "alert"
          ? "assertive"
          : "polite";

    badge.className = ["badge", "torrent-health-badge"].join(" ");

    const map = {
      healthy: {
        icon: "🟢",
        aria: "WebTorrent peers available",
        variant: "success",
        role: "status"
      },
      unhealthy: {
        icon: "🔴",
        aria: "WebTorrent peers unavailable",
        variant: "critical",
        role: "alert"
      },
      checking: {
        icon: "⏳",
        aria: "Checking WebTorrent peers",
        variant: "neutral",
        role: "status"
      },
      unknown: {
        icon: "⚪",
        aria: "WebTorrent status unknown",
        variant: "neutral",
        role: "status"
      }
    };

    const descriptor = map[state] || map.unknown;
    if (descriptor.variant) {
      badge.dataset.variant = descriptor.variant;
    } else if (badge.dataset.variant) {
      delete badge.dataset.variant;
    }
    const peersText =
      state === "healthy" && peersValue > 0 ? ` (${peersValue})` : "";
    const iconPrefix = descriptor.icon ? `${descriptor.icon} ` : "";
    const computedText = `${iconPrefix}WebTorrent${peersText}`;
    badge.textContent = text || computedText;

    const tooltipValue =
      tooltip ||
      (state === "checking" || state === "unknown"
        ? descriptor.aria
        : this.buildTorrentTooltip({
            peers: peersValue,
            checkedAt: Number.isFinite(entry?.checkedAt)
              ? entry.checkedAt
              : null,
            reason
          }));

    badge.setAttribute("aria-label", tooltipValue);
    badge.setAttribute("title", tooltipValue);
    badge.setAttribute("aria-live", ariaLive);
    badge.setAttribute(
      "role",
      role || (state === "unhealthy" ? "alert" : "status")
    );

    badge.dataset.streamHealthState = state;
    if (reason) {
      badge.dataset.streamHealthReason = reason;
    } else if (badge.dataset.streamHealthReason) {
      delete badge.dataset.streamHealthReason;
    }

    if (Number.isFinite(peersValue) && peersValue !== null) {
      badge.dataset.streamHealthPeers = String(peersValue);
    } else if (badge.dataset.streamHealthPeers) {
      delete badge.dataset.streamHealthPeers;
    }
  }

  buildDiscussionCount() {
    if (this.video.enableComments === false) {
      return null;
    }

    let initialCount = null;
    if (typeof this.video.discussionCount === "number") {
      initialCount = this.video.discussionCount;
    } else if (typeof this.video.discussionCount === "string") {
      const trimmed = this.video.discussionCount.trim();
      if (trimmed) {
        const parsed = Number.parseInt(trimmed, 10);
        if (Number.isFinite(parsed)) {
          initialCount = parsed;
        }
      }
    }

    if (
      initialCount === null ||
      !Number.isFinite(initialCount) ||
      initialCount < 0
    ) {
      return null;
    }

    const safeCount = Math.floor(initialCount);
    const displayValue = this.helpers.toLocaleString
      ? this.helpers.toLocaleString(safeCount)
      : safeCount.toLocaleString();

    const container = this.createElement("div", {
      classNames: ["flex", "items-center", "text-xs", "text-muted-strong"]
    });
    container.dataset.discussionCount = this.video.id;
    container.dataset.countState = "ready";

    const valueEl = this.createElement("span", {
      textContent: displayValue
    });
    valueEl.dataset.discussionCountValue = "";

    const labelEl = this.createElement("span", {
      classNames: ["ml-1"],
      textContent: "notes"
    });

    container.appendChild(valueEl);
    container.appendChild(labelEl);

    this.discussionCountEl = container;

    return container;
  }

  applyNsfwContext() {
    if (!this.root) {
      return;
    }

    if (!this.nsfwContext?.isNsfw) {
      if (this.root.dataset.nsfwVisibility) {
        delete this.root.dataset.nsfwVisibility;
      }
      if (this.root.dataset.alert) {
        delete this.root.dataset.alert;
      }
      this.syncCardState();
      return;
    }

    if (this.shouldMaskNsfwForOwner) {
      this.root.dataset.nsfwVisibility = "owner-only";
      this.root.dataset.alert = "nsfw-owner";
      this.root.dataset.state = "critical";
      return;
    }

    this.root.dataset.nsfwVisibility = this.nsfwContext.allowNsfw
      ? "allowed"
      : "hidden";
    if (this.root.dataset.alert) {
      delete this.root.dataset.alert;
    }
    this.syncCardState();
  }

  applyPointerDataset() {
    if (!this.root) {
      return;
    }
    if (this.pointerInfo && this.pointerInfo.key) {
      this.root.dataset.pointerKey = this.pointerInfo.key;
      const pointer = Array.isArray(this.pointerInfo.pointer)
        ? this.pointerInfo.pointer
        : null;
      if (pointer && pointer.length) {
        const [type, value, relay] = pointer;
        if (type) {
          this.root.dataset.pointerType = type;
        }
        if (value) {
          this.root.dataset.pointerValue = value;
        }
        if (relay) {
          this.root.dataset.pointerRelay = relay;
        }
      }
    }
  }

  applyOwnerDataset() {
    if (!this.root) {
      return;
    }
    this.root.dataset.ownerIsViewer = this.capabilities.canEdit
      ? "true"
      : "false";
    if (this.video.pubkey) {
      this.root.dataset.ownerPubkey = this.video.pubkey;
    }
  }

  applySourceDatasets() {
    if (!this.root) {
      return;
    }

    const cachedUrlHealth = this.getCachedUrlHealthEntry();
    if (this.playbackUrl) {
      const status =
        typeof cachedUrlHealth?.status === "string" && cachedUrlHealth.status
          ? cachedUrlHealth.status
          : "checking";
      this.root.dataset.urlHealthState = status;
      delete this.root.dataset.urlHealthReason;
      this.root.dataset.urlHealthEventId = this.video.id || "";
      this.root.dataset.urlHealthUrl = encodeURIComponent(this.playbackUrl);
    } else {
      this.root.dataset.urlHealthState = "offline";
      this.root.dataset.urlHealthReason = "missing-source";
      delete this.root.dataset.urlHealthEventId;
      delete this.root.dataset.urlHealthUrl;
    }

    const cachedStreamHealth = this.getCachedStreamHealthEntry();
    if (this.magnetProvided && this.magnetSupported) {
      const state =
        typeof cachedStreamHealth?.state === "string" &&
        cachedStreamHealth.state
          ? cachedStreamHealth.state
          : "checking";
      this.root.dataset.streamHealthState = state;
      if (cachedStreamHealth?.reason) {
        this.root.dataset.streamHealthReason = cachedStreamHealth.reason;
      } else if (this.root.dataset.streamHealthReason) {
        delete this.root.dataset.streamHealthReason;
      }
      if (Number.isFinite(cachedStreamHealth?.peers)) {
        this.root.dataset.streamHealthPeers = String(
          Math.max(0, Number(cachedStreamHealth.peers))
        );
      } else if (this.root.dataset.streamHealthPeers) {
        delete this.root.dataset.streamHealthPeers;
      }
    } else {
      this.root.dataset.streamHealthState = "unhealthy";
      this.root.dataset.streamHealthReason = this.magnetProvided
        ? "unsupported"
        : "missing-source";
      if (this.root.dataset.streamHealthPeers) {
        delete this.root.dataset.streamHealthPeers;
      }
    }

    if (this.magnetProvided) {
      this.root.dataset.magnet = this.playbackMagnet;
    } else {
      delete this.root.dataset.magnet;
    }

    if (this.showUnsupportedTorrentBadge) {
      this.root.dataset.torrentSupported = "false";
    } else if (this.magnetProvided && this.magnetSupported) {
      this.root.dataset.torrentSupported = "true";
    }

    updateVideoCardSourceVisibility(this.root);
  }

  applyModerationDatasets() {
    if (!this.root) {
      return;
    }

    const moderationContext = this.getModerationContext();

    if (moderationContext.originalBlockAutoplay && !moderationContext.overrideActive) {
      this.root.dataset.autoplayPolicy = "blocked";
    } else if (this.root.dataset.autoplayPolicy) {
      delete this.root.dataset.autoplayPolicy;
    }

    if (moderationContext.overrideActive) {
      this.root.dataset.moderationOverride = "show-anyway";
    } else if (this.root.dataset.moderationOverride) {
      delete this.root.dataset.moderationOverride;
    }

    if (this.thumbnailEl && !this.shouldMaskNsfwForOwner) {
      if (moderationContext.activeBlur) {
        this.thumbnailEl.dataset.thumbnailState = "blurred";
      } else if (this.thumbnailEl.dataset.thumbnailState === "blurred") {
        delete this.thumbnailEl.dataset.thumbnailState;
      }
    }

    const reportCount = Math.max(0, Number(moderationContext.trustedCount) || 0);
    if (reportCount > 0) {
      this.root.dataset.moderationReportCount = String(reportCount);
      if (moderationContext.reportType) {
        this.root.dataset.moderationReportType = moderationContext.reportType;
      } else if (this.root.dataset.moderationReportType) {
        delete this.root.dataset.moderationReportType;
      }
    } else {
      if (this.root.dataset.moderationReportType) {
        delete this.root.dataset.moderationReportType;
      }
      if (this.root.dataset.moderationReportCount) {
        delete this.root.dataset.moderationReportCount;
      }
    }

    if (moderationContext.trustedMuted) {
      this.root.dataset.moderationTrustedMute = "true";
      const muteCount = Math.max(0, Number(moderationContext.trustedMuteCount) || 0);
      if (muteCount > 0) {
        this.root.dataset.moderationTrustedMuteCount = String(muteCount);
      } else if (this.root.dataset.moderationTrustedMuteCount) {
        delete this.root.dataset.moderationTrustedMuteCount;
      }
    } else {
      if (this.root.dataset.moderationTrustedMute) {
        delete this.root.dataset.moderationTrustedMute;
      }
      if (this.root.dataset.moderationTrustedMuteCount) {
        delete this.root.dataset.moderationTrustedMuteCount;
      }
    }
  }

  applyPlaybackDatasets() {
    const elements = [this.anchorEl, this.titleEl].filter(Boolean);
    elements.forEach((el) => {
      if (!el) return;
      el.dataset.playUrl = encodeURIComponent(this.playbackUrl || "");
      el.dataset.playMagnet = this.playbackMagnet || "";
      if (this.magnetProvided) {
        el.dataset.torrentSupported = this.magnetSupported ? "true" : "false";
      } else if (el.dataset.torrentSupported) {
        delete el.dataset.torrentSupported;
      }
    });

    if (this.urlHealthBadgeEl && this.playbackUrl) {
      this.urlHealthBadgeEl.dataset.urlHealthEventId = this.video.id || "";
      this.urlHealthBadgeEl.dataset.urlHealthUrl = encodeURIComponent(
        this.playbackUrl
      );
    } else if (this.urlHealthBadgeEl) {
      delete this.urlHealthBadgeEl.dataset.urlHealthEventId;
      delete this.urlHealthBadgeEl.dataset.urlHealthUrl;
    }
  }

  formatTimestampForLabel(timestamp) {
    if (!Number.isFinite(timestamp)) {
      return "";
    }

    const normalized = Math.floor(timestamp);
    if (typeof this.formatters.formatTimeAgo === "function") {
      try {
        const formatted = this.formatters.formatTimeAgo(normalized);
        return typeof formatted === "string" ? formatted : "";
      } catch (error) {
        if (this.window?.userLogger?.warn) {
          this.window.userLogger.warn(
            "[VideoCard] formatTimeAgo formatter threw",
            error
          );
        }
      }
    }

    return "";
  }

  updatePostedAt(timestamp) {
    if (!Number.isFinite(timestamp)) {
      return;
    }

    const normalized = Math.floor(timestamp);
    this.postedAt = normalized;

    if (this.video && typeof this.video === "object") {
      this.video.rootCreatedAt = normalized;
    }

    const label = this.formatTimestampForLabel(normalized);
    this.timeAgo = label;

    if (this.timestampEl) {
      this.timestampEl.textContent = label;
    }
  }

  bindEvents() {
    if (this.ensureGlobalMoreMenuHandlers) {
      this.ensureGlobalMoreMenuHandlers();
    }

    const MouseEventCtor = this.window?.MouseEvent || globalThis.MouseEvent;

    [this.anchorEl, this.titleEl].forEach((el) => {
      if (!el) return;
      el.addEventListener("click", (event) => {
        if (!this.callbacks.onPlay) {
          return;
        }

        const isMouseEvent =
          typeof MouseEventCtor !== "undefined" &&
          event instanceof MouseEventCtor;
        if (isMouseEvent) {
          const isPrimaryClick =
            typeof event.button !== "number" || event.button === 0;
          const hasModifier =
            event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
          if (!isPrimaryClick || hasModifier) {
            return;
          }
        }

        if (typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        if (typeof event.stopPropagation === "function") {
          event.stopPropagation();
        }

        this.callbacks.onPlay({ event, video: this.video, card: this });
      });
    });

    if (this.settingsButton) {
      this.settingsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const trigger = this.settingsButton;
        const isExpanded =
          typeof trigger?.getAttribute === "function" &&
          trigger.getAttribute("aria-expanded") === "true";

        if (this.onRequestCloseAllMenus) {
          const options = { restoreFocus: false };
          if (isExpanded) {
            options.skipCard = this;
            options.skipTrigger = trigger;
          }
          this.onRequestCloseAllMenus(options);
        } else if (!isExpanded) {
          this.closeMoreMenu({ restoreFocus: false });
          this.closeSettingsMenu({ restoreFocus: false });
        }

        if (isExpanded) {
          this.closeMoreMenu({ restoreFocus: false });
          this.closeSettingsMenu({ restoreFocus: false });
          return;
        }

        this.closeMoreMenu({ restoreFocus: false });

        if (this.callbacks.onRequestSettingsMenu) {
          const detail = {
            event,
            trigger,
            video: this.video,
            card: this,
            index: this.index,
            capabilities: { ...this.capabilities },
            designSystem: this.designSystem,
          };
          this.callbacks.onRequestSettingsMenu(detail);
        }
      });
    }

    if (this.moreMenuButton) {
      this.moreMenuButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const trigger = this.moreMenuButton;
        const isExpanded =
          typeof trigger?.getAttribute === "function" &&
          trigger.getAttribute("aria-expanded") === "true";

        if (this.onRequestCloseAllMenus) {
          const options = { restoreFocus: false };
          if (isExpanded) {
            options.skipCard = this;
            options.skipTrigger = trigger;
          }
          this.onRequestCloseAllMenus(options);
        }

        if (isExpanded) {
          this.closeSettingsMenu({ restoreFocus: false });
          this.closeMoreMenu({ restoreFocus: false });
          return;
        }

        this.closeSettingsMenu({ restoreFocus: false });

        if (this.callbacks.onRequestMoreMenu) {
          const actionForwarder = this.callbacks.onMoreAction
            ? ({ action, dataset, event: actionEvent }) => {
                const payload = {
                  ...dataset,
                  action: action || dataset?.action || "",
                };
                this.callbacks.onMoreAction({
                  event: actionEvent,
                  video: this.video,
                  card: this,
                  dataset: payload,
                });
              }
            : null;

          this.callbacks.onRequestMoreMenu({
            event,
            trigger,
            video: this.video,
            card: this,
            pointerInfo: this.pointerInfo,
            playbackUrl: this.playbackUrl,
            playbackMagnet: this.playbackMagnet,
            capabilities: { ...this.capabilities },
            designSystem: this.designSystem,
            onAction: actionForwarder,
          });
        }
      });
    }

    [this.authorPicEl, this.authorNameEl].forEach((el) => {
      if (!el) return;
      el.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.callbacks.onAuthorNavigate) {
          this.callbacks.onAuthorNavigate({
            event,
            video: this.video,
            card: this,
            pubkey: this.video.pubkey || ""
          });
        }
      });
    });
  }

  syncCardState() {
    if (!this.root) {
      return;
    }
    if (this.cardState) {
      this.root.dataset.state = this.cardState;
      return;
    }
    if (this.root.dataset.state && !this.shouldMaskNsfwForOwner) {
      delete this.root.dataset.state;
    }
  }

  syncMotionState() {
    if (!this.root) {
      return;
    }
    if (this.motionState) {
      this.root.dataset.motion = this.motionState;
      return;
    }
    if (this.root.dataset.motion) {
      delete this.root.dataset.motion;
    }
  }

  handleSettingsMenuAction(action, { event = null } = {}) {
    const normalized = typeof action === "string" ? action.trim() : "";
    if (!normalized) {
      return false;
    }

    if (normalized === "edit" && this.callbacks.onEdit) {
      this.callbacks.onEdit({
        event,
        video: this.video,
        index: this.index,
        card: this,
      });
      return true;
    }

    if (normalized === "revert" && this.callbacks.onRevert) {
      this.callbacks.onRevert({
        event,
        video: this.video,
        index: this.index,
        card: this,
      });
      return true;
    }

    if (normalized === "delete" && this.callbacks.onDelete) {
      this.callbacks.onDelete({
        event,
        video: this.video,
        index: this.index,
        card: this,
      });
      return true;
    }

    return false;
  }

  createElement(tagName, { classNames = [], attrs = {}, textContent } = {}) {
    const el = this.document.createElement(tagName);
    classNames
      .filter((cls) => typeof cls === "string" && cls.trim())
      .forEach((cls) => el.classList.add(cls));
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      el.setAttribute(key, value);
    });
    if (typeof textContent === "string") {
      el.textContent = textContent;
    }
    return el;
  }
}
