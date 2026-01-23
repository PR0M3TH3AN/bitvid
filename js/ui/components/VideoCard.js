import {
  normalizeDesignSystemContext,
  BREAKPOINT_LG,
} from "../../designSystem.js";
import { updateVideoCardSourceVisibility } from "../../utils/cardSourceVisibility.js";
import { sanitizeProfileMediaUrl } from "../../utils/profileMedia.js";
import { userLogger } from "../../utils/logger.js";
import { deriveTorrentPlaybackConfig } from "../../playbackUtils.js";
import {
  applyModerationContextDatasets,
  getModerationOverrideActionLabels,
  normalizeVideoModerationContext,
} from "../moderationUiHelpers.js";
import { buildModerationBadgeText } from "../moderationCopy.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DEFAULT_PROFILE_AVATAR = "assets/svg/default-profile.svg";
const HEX64_REGEX = /^[0-9a-f]{64}$/i;

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
    variant = "default",
    identity = null,
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
    this.identity = this.normalizeIdentity(identity);

    const normalizedVariant =
      typeof variant === "string" && variant.trim().toLowerCase() === "compact"
        ? "compact"
        : "default";
    this.variant = normalizedVariant;

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
      onModerationBlock: null,
      onModerationHide: null,
    };

    this.moderationBadgeEl = null;
    this.moderationBadgeLabelEl = null;
    this.moderationBadgeTextEl = null;
    this.moderationBadgeIconWrapper = null;
    this.moderationBadgeIconSvg = null;
    this.moderationActionButton = null;
    this.moderationBlockButton = null;
    this.moderationActionsContainer = null;
    this.moderationActionButtonMode = "";
    this.moderationBadgeId = "";
    this.badgesContainerEl = null;
    this.moderationBadgeSlot = null;
    this.hiddenSummaryEl = null;
    this.boundShowAnywayHandler = (event) => this.handleShowAnywayClick(event);
    this.boundModerationBlockHandler = (event) =>
      this.handleModerationBlockClick(event);
    this.boundModerationHideHandler = (event) =>
      this.handleModerationHideClick(event);

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
    const rawMagnet =
      typeof video.magnet === "string" ? video.magnet.trim() : "";
    const rawInfoHash =
      typeof video.infoHash === "string" ? video.infoHash.trim() : "";
    const playbackConfig = deriveTorrentPlaybackConfig({
      magnet: rawMagnet,
      infoHash: rawInfoHash,
      url: this.playbackUrl,
    });
    this.playbackMagnet = playbackConfig.magnet;
    this.originalMagnetInput =
      playbackConfig.originalInput || rawMagnet || rawInfoHash;
    this.magnetProvided = playbackConfig.provided;
    this.magnetSupported = this.helpers.isMagnetSupported
      ? this.helpers.isMagnetSupported(this.playbackMagnet)
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

  set onModerationBlock(fn) {
    this.callbacks.onModerationBlock =
      typeof fn === "function" ? fn : null;
  }

  set onModerationHide(fn) {
    this.callbacks.onModerationHide =
      typeof fn === "function" ? fn : null;
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

    const isCompact = this.variant === "compact";
    const cardClassNames = ["card"];
    if (isCompact) {
      cardClassNames.push("card--compact");
    }

    const root = this.createElement("div", {
      classNames: cardClassNames,
    });

    this.root = root;

    VideoCard.observeViewport(this.root);

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

    const anchorClassNames = [
      "block",
      "cursor-pointer",
      "relative",
      "group",
      "overflow-hidden",
      "video-card__media",
    ];
    if (isCompact) {
      anchorClassNames.push("rounded-lg", "flex-shrink-0");
    } else {
      anchorClassNames.push("rounded-t-lg");
    }

    const anchor = this.createElement("a", {
      classNames: anchorClassNames,
      attrs: {
        href: this.shareUrl
      }
    });
    anchor.dataset.videoId = this.video.id;
    this.anchorEl = anchor;

    const ratio = this.createElement("div", {
      classNames: ["ratio-16-9", "video-card__media-ratio"],
    });
    const thumbnail = this.buildThumbnail();
    ratio.appendChild(thumbnail);
    anchor.appendChild(ratio);

    const contentClassNames = [
      "video-card__content",
      "p-md",
      "bv-stack",
      "bv-stack--tight",
      "min-w-0",
    ];
    if (isCompact) {
      contentClassNames.push("flex-1");
    }

    const content = this.createElement("div", {
      classNames: contentClassNames,
    });
    this.contentEl = content;

    const titleClassNames = [
      "video-card__title",
      isCompact ? "text-base" : "text-lg",
      isCompact ? "font-semibold" : "font-bold",
      "text-text",
      "cursor-pointer",
    ];
    if (isCompact) {
      titleClassNames.push("leading-snug");
    }

    const title = this.buildMarqueeStructure(
      "h3",
      titleClassNames,
      this.video.title
    );
    title.dataset.videoId = this.video.id;
    this.titleEl = title;

    const header = this.createElement("div", {
      classNames: ["flex", "items-center", "justify-between"],
    });

    const authorSection = this.buildAuthorSection();
    const controls = this.buildControls();

    header.appendChild(authorSection);
    if (controls) {
      header.appendChild(controls);
    }

    this.applyIdentityToAuthorElements();

    content.appendChild(title);
    content.appendChild(header);

    const badgesContainer = this.buildBadgesContainer();
    if (badgesContainer) {
      content.appendChild(badgesContainer);
    }

    const engagement = this.buildEngagementSection();
    if (engagement) {
      content.appendChild(engagement);
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

    const moderationBadgeSlot = this.createElement("div", {
      classNames: [
        "video-card__moderation-overlay",
        "absolute",
        "inset-0",
        "flex",
        "items-center",
        "justify-center",
        "p-4",
        "z-10",
        "pointer-events-none",
      ],
    });
    moderationBadgeSlot.hidden = true;
    moderationBadgeSlot.setAttribute("aria-hidden", "true");
    this.moderationBadgeSlot = moderationBadgeSlot;

    // Append slot to anchor (media wrapper) instead of root to overlay thumbnail
    if (this.anchorEl) {
      this.anchorEl.appendChild(moderationBadgeSlot);
    }

    root.appendChild(anchor);
    root.appendChild(content);

    this.applyPlaybackDatasets();
    this.bindEvents();
    this.refreshModerationUi();
  }

  normalizeIdentity(nextIdentity = {}, fallback = null) {
    const baseline = fallback && typeof fallback === "object" ? fallback : {};
    const candidate =
      nextIdentity && typeof nextIdentity === "object" ? nextIdentity : {};
    const video = this.video && typeof this.video === "object" ? this.video : {};

    const pickFirstString = (
      entries = [],
      { allowHex = true, sanitizer = (value) => value } = {},
    ) => {
      for (const entry of entries) {
        if (typeof entry !== "string") {
          continue;
        }
        const trimmed = entry.trim();
        if (!trimmed) {
          continue;
        }
        if (!allowHex && HEX64_REGEX.test(trimmed)) {
          continue;
        }
        const sanitized = sanitizer(trimmed);
        if (!sanitized) {
          continue;
        }
        return sanitized;
      }
      return "";
    };

    const pubkey = pickFirstString([
      candidate.pubkey,
      baseline.pubkey,
      video.pubkey,
      video.author?.pubkey,
      video.creator?.pubkey,
      video.profile?.pubkey,
    ]);

    const npub = pickFirstString([
      candidate.npub,
      baseline.npub,
      video.npub,
      video.authorNpub,
      video.profile?.npub,
    ]);

    const shortNpub = pickFirstString([
      candidate.shortNpub,
      baseline.shortNpub,
      video.shortNpub,
      video.creatorNpub,
    ]);

    const name = pickFirstString(
      [
        candidate.name,
        candidate.display_name,
        candidate.displayName,
        candidate.username,
        baseline.name,
        baseline.display_name,
        baseline.displayName,
        baseline.username,
        video.creatorName,
        video.authorName,
        video.creator?.name,
        video.author?.name,
        video.profile?.display_name,
        video.profile?.name,
        video.profile?.username,
      ],
      { allowHex: false },
    );

    const picture = pickFirstString(
      [
        candidate.picture,
        candidate.image,
        candidate.photo,
        baseline.picture,
        baseline.image,
        baseline.photo,
        video.creatorPicture,
        video.authorPicture,
        video.creator?.picture,
        video.author?.picture,
        video.profile?.picture,
        video.profile?.image,
        video.profile?.photo,
      ],
      { sanitizer: (value) => sanitizeProfileMediaUrl(value) },
    );

    const resolvedName = name || shortNpub || npub || pubkey || "";
    const resolvedPicture = picture || DEFAULT_PROFILE_AVATAR;

    return {
      name: resolvedName,
      npub,
      shortNpub,
      pubkey,
      picture: resolvedPicture,
    };
  }

  updateIdentity(nextIdentity = {}) {
    this.identity = this.normalizeIdentity(nextIdentity, this.identity);
    this.applyIdentityToAuthorElements();
  }

  applyIdentityToAuthorElements() {
    const nameLabel = this.identity?.name || "Unknown";
    if (this.authorNameEl) {
      this.updateMarqueeText(this.authorNameEl, nameLabel || "Unknown");
    }

    if (this.authorPicEl) {
      const picture = this.identity?.picture || DEFAULT_PROFILE_AVATAR;
      if (this.authorPicEl.getAttribute("src") !== picture) {
        this.authorPicEl.src = picture;
      }

      const altFallback =
        nameLabel || this.identity?.shortNpub || this.identity?.npub || "Channel";
      this.authorPicEl.alt = `${altFallback}'s avatar`;
    }
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
    const isCompact = this.variant === "compact";
    const wrapper = this.createElement("div", {
      classNames: [
        "flex",
        "items-center",
        isCompact ? "space-x-2" : "space-x-3",
      ],
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
    avatar.classList.add(
      "author-pic",
      "cursor-pointer",
      "block",
      "h-full",
      "w-full",
      "rounded-full",
      "object-cover"
    );
    if (this.video.pubkey) {
      avatar.dataset.pubkey = this.video.pubkey;
    }

    avatarWrapper.appendChild(avatar);

    const authorMeta = this.createElement("div", { classNames: ["min-w-0"] });

    const authorName = this.buildMarqueeStructure(
      "p",
      [
        isCompact ? "text-xs" : "text-sm",
        "text-muted",
        "author-name",
        "cursor-pointer",
        "video-card__author-name",
      ],
      "Loading name..."
    );
    if (this.video.pubkey) {
      authorName.dataset.pubkey = this.video.pubkey;
    }

    const metadata = this.createElement("div", {
      classNames: [
        "flex",
        "items-center",
        isCompact ? "gap-2" : "mt-1",
        isCompact ? "text-2xs" : "text-xs",
        "text-muted-strong",
        "video-card__meta",
      ],
    });

    const timeEl = this.createElement("span", {
      textContent: this.timeAgo
    });
    metadata.appendChild(timeEl);
    this.timestampEl = timeEl;

    // (View count moved to engagement section)

    if (
      this.postedAt !== null &&
      Number.isFinite(this.video?.created_at) &&
      this.video.created_at > this.postedAt + 60
    ) {
      const separator = this.createElement("span", {
        classNames: ["text-muted-strong", isCompact ? "" : "mx-1"],
        textContent: "•",
      });
      separator.setAttribute("aria-hidden", "true");
      metadata.appendChild(separator);

      const edited = this.createElement("span", {
        textContent: "Edited",
      });
      metadata.appendChild(edited);
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
          "icon-button",
          "accent-action-button",
          "ml-2",
        ],
        attrs: {
          type: "button",
          "aria-haspopup": "true",
          "aria-expanded": "false",
          "aria-label": "Video settings",
        },
      });

      const icon = this.createSettingsIcon(["icon-image", "w-5", "h-5"]);
      button.appendChild(icon);

      this.settingsButton = button;
      container.appendChild(button);
    }

    return container;
  }

  buildMoreMenu() {
    const button = this.createElement("button", {
      classNames: [
        "icon-button",
        "accent-action-button",
        "ml-1",
      ],
      attrs: {
        type: "button",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        "aria-label": "More options",
      },
    });

    const icon = this.createEllipsisIcon(["icon-image", "w-5", "h-5"]);
    button.appendChild(icon);

    this.moreMenuButton = button;

    return button;
  }

  buildBadgesContainer() {
    const isCompact = this.variant === "compact";
    const pieces = [];

    if (!isCompact && this.playbackUrl) {
      const badge = this.createElement("span", {
        classNames: ["badge", "url-health-badge"]
      });
      badge.setAttribute("aria-live", "polite");
      badge.setAttribute("role", "status");
      this.applyUrlBadgeVisualState(badge, this.getCachedUrlHealthEntry());
      this.urlHealthBadgeEl = badge;
      pieces.push(badge);
    }

    if (!isCompact && this.magnetSupported && this.magnetProvided) {
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
    return normalizeVideoModerationContext(this.video?.moderation);
  }

  createModerationOverrideButton() {
    const { text: label, ariaLabel } = getModerationOverrideActionLabels({
      overrideActive: false,
    });
    const button = this.createElement("button", {
      classNames: ["moderation-badge__action", "flex-shrink-0"],
      attrs: {
        type: "button",
        "data-moderation-action": "override",
        "aria-pressed": "false",
        "aria-describedby": this.getModerationBadgeId(),
        "aria-label": ariaLabel,
      },
      textContent: label,
    });
    button.addEventListener("click", this.boundShowAnywayHandler);
    return button;
  }

  createModerationHideButton() {
    const { text: label, ariaLabel } = getModerationOverrideActionLabels({
      overrideActive: true,
    });
    const button = this.createElement("button", {
      classNames: ["moderation-badge__action", "flex-shrink-0"],
      attrs: {
        type: "button",
        "data-moderation-action": "hide",
        "aria-describedby": this.getModerationBadgeId(),
        "aria-label": ariaLabel,
      },
      textContent: label,
    });
    button.addEventListener("click", this.boundModerationHideHandler);
    return button;
  }

  createModerationBlockButton() {
    const button = this.createElement("button", {
      classNames: ["moderation-badge__action", "flex-shrink-0"],
      attrs: {
        type: "button",
        "data-moderation-action": "block",
        "aria-describedby": this.getModerationBadgeId(),
      },
      textContent: "Block",
    });
    button.addEventListener("click", this.boundModerationBlockHandler);
    return button;
  }

  handleModerationBlockClick(event) {
    if (event) {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (typeof event.stopPropagation === "function") {
        event.stopPropagation();
      }
    }

    const button = this.moderationBlockButton;
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }

    if (!this.callbacks.onModerationBlock) {
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      return;
    }

    let result;
    try {
      result = this.callbacks.onModerationBlock({
        event,
        video: this.video,
        card: this,
      });
    } catch (error) {
      userLogger.warn("[VideoCard] onModerationBlock callback threw", error);
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
        userLogger.warn("[VideoCard] Moderation block failed", error);
        if (button) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        }
      });
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

  handleModerationHideClick(event) {
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

    if (!this.callbacks.onModerationHide) {
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      return;
    }

    let result;
    try {
      result = this.callbacks.onModerationHide({
        event,
        video: this.video,
        card: this,
      });
    } catch (error) {
      userLogger.warn("[VideoCard] onModerationHide callback threw", error);
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
        userLogger.warn("[VideoCard] Moderation hide failed", error);
        if (button) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        }
      });
  }

  getModerationBadgeIconShape(state) {
    if (state === "override") {
      return {
        d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L9 11.94l-1.72-1.72a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l3.25-3.25z",
        fillRule: "evenodd",
        clipRule: "evenodd",
      };
    }

    return {
      d: "M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.75a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 8.5a1 1 0 100-2 1 1 0 000 2z",
      fillRule: "evenodd",
      clipRule: "evenodd",
    };
  }

  updateModerationBadgeIcon(state) {
    if (!this.moderationBadgeIconSvg) {
      return;
    }

    this.moderationBadgeIconSvg.dataset.iconState = state;
    const path = this.moderationBadgeIconSvg.firstElementChild;
    if (!path) {
      return;
    }

    const { d, fillRule, clipRule } = this.getModerationBadgeIconShape(state);
    path.setAttribute("d", d);
    if (fillRule) {
      path.setAttribute("fill-rule", fillRule);
    } else {
      path.removeAttribute("fill-rule");
    }
    if (clipRule) {
      path.setAttribute("clip-rule", clipRule);
    } else {
      path.removeAttribute("clip-rule");
    }
  }

  createModerationBadgeIcon(state) {
    const wrapper = this.createElement("span", {
      classNames: ["moderation-badge__icon"],
      attrs: { "aria-hidden": "true" },
    });

    const svg = this.document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("moderation-badge__icon-mark");

    const path = this.document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    wrapper.appendChild(svg);

    this.moderationBadgeIconWrapper = wrapper;
    this.moderationBadgeIconSvg = svg;
    this.updateModerationBadgeIcon(state);

    return wrapper;
  }

  shouldShowModerationBlockButton(context = this.getModerationContext()) {
    if (!context || !context.trustedMuted) {
      return false;
    }
    if (context.activeHidden && !context.overrideActive) {
      return false;
    }
    return true;
  }

  buildModerationBadge(context = this.getModerationContext()) {
    if (!context.shouldShow) {
      this.moderationBadgeEl = null;
      this.moderationBadgeLabelEl = null;
      this.moderationBadgeTextEl = null;
      this.moderationBadgeIconWrapper = null;
      this.moderationBadgeIconSvg = null;
      if (this.moderationActionButton) {
        if (this.moderationActionButtonMode === "override") {
          this.moderationActionButton.removeEventListener(
            "click",
            this.boundShowAnywayHandler,
          );
        } else if (this.moderationActionButtonMode === "hide") {
          this.moderationActionButton.removeEventListener(
            "click",
            this.boundModerationHideHandler,
          );
        }
        this.moderationActionButton.remove();
      }
      this.moderationActionButton = null;
      this.moderationActionButtonMode = "";
      if (this.moderationBlockButton) {
        this.moderationBlockButton.removeEventListener(
          "click",
          this.boundModerationBlockHandler,
        );
      }
      this.moderationBlockButton = null;
      if (this.moderationActionsContainer) {
        this.moderationActionsContainer.remove();
        this.moderationActionsContainer = null;
      }
      return null;
    }

    const badge = this.createElement("div", {
      classNames: ["moderation-badge"],
    });
    badge.dataset.variant = context.overrideActive ? "neutral" : "warning";
    badge.dataset.moderationBadge = "true";
    const hiddenActive = context.activeHidden && !context.overrideActive;
    const state = context.overrideActive
      ? "override"
      : hiddenActive
        ? "hidden"
        : context.trustedMuted
          ? "trusted-mute"
          : "blocked";
    badge.dataset.moderationState = state;
    this.updateModerationBadgeIcon(state);
    if (hiddenActive && context.effectiveHideReason) {
      badge.dataset.moderationHideReason = context.effectiveHideReason;
    }

    const badgeId = this.getModerationBadgeId();
    badge.id = badgeId;
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-live", "polite");
    badge.setAttribute("aria-atomic", "true");

    const label = this.createElement("span", {
      classNames: [
        "moderation-badge__label",
        "inline-flex",
        "items-center",
        "gap-xs",
      ],
    });

    const icon = this.createModerationBadgeIcon(state);
    if (icon) {
      label.appendChild(icon);
    }

    const text = this.createElement("span", {
      classNames: ["moderation-badge__text"],
      textContent: buildModerationBadgeText(context, { variant: "card" }),
    });
    label.appendChild(text);
    badge.appendChild(label);

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
    this.moderationBadgeLabelEl = label;
    this.moderationBadgeTextEl = text;

    const actions = this.createElement("div", {
      classNames: ["moderation-badge__actions"],
    });
    let hasActions = false;

    if (context.allowOverride) {
      if (context.overrideActive) {
        const hideButton = this.createModerationHideButton();
        actions.appendChild(hideButton);
        this.moderationActionButton = hideButton;
        this.moderationActionButtonMode = "hide";
      } else {
        const showButton = this.createModerationOverrideButton();
        actions.appendChild(showButton);
        this.moderationActionButton = showButton;
        this.moderationActionButtonMode = "override";
      }
      hasActions = true;
    } else {
      if (this.moderationActionButton) {
        if (this.moderationActionButtonMode === "override") {
          this.moderationActionButton.removeEventListener(
            "click",
            this.boundShowAnywayHandler,
          );
        } else if (this.moderationActionButtonMode === "hide") {
          this.moderationActionButton.removeEventListener(
            "click",
            this.boundModerationHideHandler,
          );
        }
        this.moderationActionButton.remove();
      }
      this.moderationActionButton = null;
      this.moderationActionButtonMode = "";
    }

    if (this.shouldShowModerationBlockButton(context)) {
      const blockButton = this.createModerationBlockButton();
      actions.appendChild(blockButton);
      this.moderationBlockButton = blockButton;
      this.moderationBlockButton.disabled = false;
      this.moderationBlockButton.removeAttribute("aria-busy");
      hasActions = true;
    } else {
      if (this.moderationBlockButton) {
        this.moderationBlockButton.removeEventListener(
          "click",
          this.boundModerationBlockHandler,
        );
        this.moderationBlockButton.remove();
      }
      this.moderationBlockButton = null;
    }

    if (hasActions) {
      badge.appendChild(actions);
      this.moderationActionsContainer = actions;
    } else {
      this.moderationActionsContainer = null;
    }

    return badge;
  }

  updateModerationBadge(context = this.getModerationContext()) {
    const badge = this.moderationBadgeEl;
    let slot = this.moderationBadgeSlot;
    const hiddenActive = context.activeHidden && !context.overrideActive;

    if (!slot && this.anchorEl) {
      slot = this.createElement("div", {
        classNames: [
          "video-card__moderation-overlay",
          "absolute",
          "inset-0",
          "flex",
          "items-center",
          "justify-center",
          "p-4",
          "z-10",
          "pointer-events-none",
        ],
      });
      slot.hidden = true;
      slot.setAttribute("aria-hidden", "true");
      this.moderationBadgeSlot = slot;
      this.anchorEl.appendChild(slot);
    }

    if (badge) {
      if (!this.moderationBadgeLabelEl) {
        const label = badge.querySelector(".moderation-badge__label");
        if (label) {
          this.moderationBadgeLabelEl = label;
        }
      }
      if (!this.moderationBadgeIconWrapper) {
        const iconWrapper = badge.querySelector(".moderation-badge__icon");
        if (iconWrapper) {
          this.moderationBadgeIconWrapper = iconWrapper;
        }
      }
      if (!this.moderationBadgeIconSvg) {
        const iconSvg = badge.querySelector(".moderation-badge__icon svg");
        if (iconSvg) {
          this.moderationBadgeIconSvg = iconSvg;
        }
      }
      if (!this.moderationBadgeTextEl) {
        const textEl = badge.querySelector(".moderation-badge__text");
        if (textEl) {
          this.moderationBadgeTextEl = textEl;
        }
      }
    }

    if (!context.shouldShow) {
      if (badge && badge.parentElement) {
        badge.parentElement.removeChild(badge);
      }
      if (slot) {
        slot.hidden = true;
        slot.setAttribute("aria-hidden", "true");
      }
      if (this.moderationActionButton) {
        if (this.moderationActionButtonMode === "override") {
          this.moderationActionButton.removeEventListener(
            "click",
            this.boundShowAnywayHandler,
          );
        } else if (this.moderationActionButtonMode === "hide") {
          this.moderationActionButton.removeEventListener(
            "click",
            this.boundModerationHideHandler,
          );
        }
        this.moderationActionButton.remove();
      }
      if (this.moderationBlockButton) {
        this.moderationBlockButton.removeEventListener(
          "click",
          this.boundModerationBlockHandler,
        );
        this.moderationBlockButton.remove();
        this.moderationBlockButton = null;
      }
      this.moderationBadgeEl = null;
      this.moderationBadgeLabelEl = null;
      this.moderationBadgeTextEl = null;
      this.moderationBadgeIconWrapper = null;
      this.moderationBadgeIconSvg = null;
      this.moderationActionButton = null;
      this.moderationActionButtonMode = "";
      if (this.moderationActionsContainer) {
        this.moderationActionsContainer.remove();
        this.moderationActionsContainer = null;
      }
      if (this.hiddenSummaryEl && this.hiddenSummaryEl.parentElement === this.root) {
        this.hiddenSummaryEl.remove();
      }
      this.updateModerationAria();
      return;
    }

    if (!badge) {
      const nextBadge = this.buildModerationBadge(context);
      if (nextBadge && slot) {
        nextBadge.style.pointerEvents = "auto"; // Enable interaction on badge itself
        nextBadge.classList.add("opacity-95"); // Slight transparency
        slot.appendChild(nextBadge);
        slot.hidden = false;
        slot.removeAttribute("aria-hidden");
      }
      this.updateModerationAria();
      return;
    }

    badge.style.pointerEvents = "auto";
    badge.classList.add("opacity-95");
    badge.dataset.variant = context.overrideActive ? "neutral" : "warning";
    const state = context.overrideActive
      ? "override"
      : hiddenActive
        ? "hidden"
        : context.trustedMuted
          ? "trusted-mute"
          : "blocked";
    badge.dataset.moderationState = state;
    this.updateModerationBadgeIcon(state);
    if (hiddenActive && context.effectiveHideReason) {
      badge.dataset.moderationHideReason = context.effectiveHideReason;
    } else if (badge.dataset.moderationHideReason) {
      delete badge.dataset.moderationHideReason;
    }

    const textContent = buildModerationBadgeText(context, { variant: "card" });
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

    if (slot) {
      slot.hidden = false;
      slot.removeAttribute("aria-hidden");
      if (badge.parentElement !== slot) {
        if (badge.parentElement) {
          badge.parentElement.removeChild(badge);
        }
        slot.appendChild(badge);
      }
    }

    let actions = this.moderationActionsContainer;
    if ((!actions || !actions.isConnected) && badge) {
      const existing = badge.querySelector(".moderation-badge__actions");
      actions = existing || this.createElement("div", {
        classNames: ["moderation-badge__actions"],
      });
      this.moderationActionsContainer = actions;
    }

    const badgeId = this.getModerationBadgeId();
    let actionsAttached = false;

    if (context.allowOverride) {
      const desiredMode = context.overrideActive ? "hide" : "override";

      if (!this.moderationActionButton) {
        this.moderationActionButton =
          desiredMode === "hide"
            ? this.createModerationHideButton()
            : this.createModerationOverrideButton();
        this.moderationActionButtonMode = desiredMode;
      } else if (this.moderationActionButtonMode !== desiredMode) {
        if (this.moderationActionButtonMode === "override") {
          this.moderationActionButton.removeEventListener(
            "click",
            this.boundShowAnywayHandler,
          );
        } else if (this.moderationActionButtonMode === "hide") {
          this.moderationActionButton.removeEventListener(
            "click",
            this.boundModerationHideHandler,
          );
        }

        if (desiredMode === "hide") {
          const { text: label, ariaLabel } = getModerationOverrideActionLabels({
            overrideActive: true,
          });
          this.moderationActionButton.textContent = label;
          this.moderationActionButton.dataset.moderationAction = "hide";
          this.moderationActionButton.removeAttribute("aria-pressed");
          this.moderationActionButton.setAttribute("aria-label", ariaLabel);
          this.moderationActionButton.addEventListener(
            "click",
            this.boundModerationHideHandler,
          );
        } else {
          const { text: label, ariaLabel } = getModerationOverrideActionLabels({
            overrideActive: false,
          });
          this.moderationActionButton.textContent = label;
          this.moderationActionButton.dataset.moderationAction = "override";
          this.moderationActionButton.setAttribute("aria-pressed", "false");
          this.moderationActionButton.setAttribute("aria-label", ariaLabel);
          this.moderationActionButton.addEventListener(
            "click",
            this.boundShowAnywayHandler,
          );
        }

        this.moderationActionButtonMode = desiredMode;
      }

      if (this.moderationActionButton) {
        this.moderationActionButton.disabled = false;
        this.moderationActionButton.removeAttribute("aria-busy");
        if (badgeId) {
          this.moderationActionButton.setAttribute("aria-describedby", badgeId);
        } else {
          this.moderationActionButton.removeAttribute("aria-describedby");
        }
        if (actions && this.moderationActionButton.parentElement !== actions) {
          actions.appendChild(this.moderationActionButton);
        }
        actionsAttached = true;
      }
    } else if (this.moderationActionButton) {
      if (this.moderationActionButtonMode === "override") {
        this.moderationActionButton.removeEventListener(
          "click",
          this.boundShowAnywayHandler,
        );
      } else if (this.moderationActionButtonMode === "hide") {
        this.moderationActionButton.removeEventListener(
          "click",
          this.boundModerationHideHandler,
        );
      }
      this.moderationActionButton.remove();
      this.moderationActionButton = null;
      this.moderationActionButtonMode = "";
    }

    if (this.shouldShowModerationBlockButton(context)) {
      if (!this.moderationBlockButton) {
        this.moderationBlockButton = this.createModerationBlockButton();
      }
      this.moderationBlockButton.disabled = false;
      this.moderationBlockButton.removeAttribute("aria-busy");
      if (badgeId) {
        this.moderationBlockButton.setAttribute("aria-describedby", badgeId);
      } else {
        this.moderationBlockButton.removeAttribute("aria-describedby");
      }
      if (actions && this.moderationBlockButton.parentElement !== actions) {
        actions.appendChild(this.moderationBlockButton);
      }
      actionsAttached = true;
    } else if (this.moderationBlockButton) {
      this.moderationBlockButton.removeEventListener(
        "click",
        this.boundModerationBlockHandler,
      );
      this.moderationBlockButton.remove();
      this.moderationBlockButton = null;
    }

    if (actions) {
      if (actionsAttached) {
        if (badge && actions.parentElement !== badge) {
          badge.appendChild(actions);
        }
      } else if (actions.parentElement) {
        actions.parentElement.removeChild(actions);
        this.moderationActionsContainer = null;
      } else {
        this.moderationActionsContainer = null;
      }
    }
  }

  ensureHiddenSummaryContainer() {
    if (!this.root) {
      return null;
    }

    if (!this.hiddenSummaryEl) {
      this.hiddenSummaryEl = this.createElement("div", {
        classNames: ["p-md", "bv-stack", "bv-stack--tight"],
      });
      this.hiddenSummaryEl.dataset.moderationHiddenContainer = "true";
      this.hiddenSummaryEl.setAttribute("role", "group");
      this.hiddenSummaryEl.setAttribute("aria-live", "polite");
    }

    const container = this.hiddenSummaryEl;
    container.hidden = false;
    container.removeAttribute("aria-hidden");

    const referenceNode = this.anchorEl && this.anchorEl.parentElement === this.root ? this.anchorEl : this.root.firstChild;
    if (referenceNode && referenceNode.parentElement === this.root) {
      if (container.parentElement !== this.root || container.nextSibling !== referenceNode) {
        this.root.insertBefore(container, referenceNode);
      }
    } else if (container.parentElement !== this.root) {
      this.root.appendChild(container);
    }

    const badgeId = this.getModerationBadgeId();
    if (badgeId) {
      container.setAttribute("aria-labelledby", badgeId);
    } else {
      container.removeAttribute("aria-labelledby");
    }

    return container;
  }

  updateHiddenState(context = this.getModerationContext()) {
    const hiddenActive = context.activeHidden && !context.overrideActive;
    const container = this.hiddenSummaryEl;
    const badgeSlot = this.moderationBadgeSlot;

    if (hiddenActive) {
      if (this.anchorEl) {
        this.anchorEl.setAttribute("hidden", "");
        this.anchorEl.setAttribute("aria-hidden", "true");
      }
      if (this.contentEl) {
        this.contentEl.setAttribute("hidden", "");
        this.contentEl.setAttribute("aria-hidden", "true");
      }

      // In hidden state (blocked), the anchor/thumbnail is hidden, so overlay slot
      // won't be visible. We rely on the summary container below.
      // We hide the badge slot here because we don't want it floating if anchor is hidden
      // (though usually anchor hidden means children hidden too).
      // However, if we move badgeSlot to be a child of anchorEl, it will be hidden automatically.

      if (badgeSlot) {
        // If it's a child of anchorEl, it's hidden by parent.
        // We can force it hidden to be safe.
        badgeSlot.hidden = true;
        badgeSlot.setAttribute("aria-hidden", "true");
      }

      const summaryContainer = this.ensureHiddenSummaryContainer();
      if (summaryContainer) {
        const description = buildModerationBadgeText(context, { variant: "card" });
        if (description) {
          summaryContainer.setAttribute("aria-label", description);
        } else {
          summaryContainer.removeAttribute("aria-label");
        }
      }
    } else {
      if (this.anchorEl) {
        this.anchorEl.removeAttribute("hidden");
        this.anchorEl.removeAttribute("aria-hidden");
      }
      if (this.contentEl) {
        this.contentEl.removeAttribute("hidden");
        this.contentEl.removeAttribute("aria-hidden");
      }
      // Restore badge slot visibility if badge exists and we are not hidden
      if (badgeSlot && this.moderationBadgeEl) {
        badgeSlot.hidden = false;
        badgeSlot.removeAttribute("aria-hidden");
      } else if (badgeSlot) {
        badgeSlot.hidden = true;
        badgeSlot.setAttribute("aria-hidden", "true");
      }
      if (container) {
        container.hidden = true;
        container.setAttribute("aria-hidden", "true");
        container.removeAttribute("aria-labelledby");
        container.removeAttribute("aria-label");
        if (container.parentElement === this.root) {
          this.root.removeChild(container);
        }
      }
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
    const context = this.getModerationContext();
    this.applyModerationDatasets(context);
    this.updateModerationBadge(context);
    this.updateHiddenState(context);
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

  buildTorrentTooltip({
    peers = null,
    checkedAt = null,
    reason = null,
    webseedOnly = false,
  } = {}) {
    const parts = [];
    if (webseedOnly) {
      parts.push("Webseed only");
    } else if (Number.isFinite(peers)) {
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
    const webseedOnly = Boolean(entry?.webseedOnly);
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
    const iconPrefix = descriptor.icon ? `${descriptor.icon} ` : "";
    const computedText = `${iconPrefix}WebTorrent`;
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
            reason,
            webseedOnly,
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

  createEyeIcon(classNames = []) {
    const svg = this.document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    classNames.forEach((className) => {
      if (className) {
        svg.classList.add(className);
      }
    });

    const path = this.document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z");
    svg.appendChild(path);

    const circle = this.document.createElementNS(SVG_NAMESPACE, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "3");
    svg.appendChild(circle);

    return svg;
  }

  createMessageIcon(classNames = []) {
    const svg = this.document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    classNames.forEach((className) => {
      if (className) {
        svg.classList.add(className);
      }
    });

    const path = this.document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute(
      "d",
      "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
    );
    svg.appendChild(path);

    return svg;
  }

  buildEngagementSection() {
    // Check availability
    const hasPointer = this.pointerInfo && this.pointerInfo.key;
    const hasDiscussion =
      this.variant !== "compact" &&
      this.video.enableComments !== false &&
      (typeof this.video.discussionCount === "number" ||
        (typeof this.video.discussionCount === "string" &&
          this.video.discussionCount.trim()));

    if (!hasPointer && !hasDiscussion) {
      return null;
    }

    const container = this.createElement("div", {
      classNames: [
        "flex",
        "items-center",
        "gap-4",
        "text-xs",
        "text-muted-strong",
        "mt-3",
        "video-card__engagement",
      ],
    });

    // Views
    if (hasPointer) {
      const wrapper = this.createElement("div", {
        classNames: ["flex", "items-center", "gap-1.5"],
      });
      wrapper.setAttribute("title", "Views");

      const icon = this.createEyeIcon(["w-4", "h-4"]);
      wrapper.appendChild(icon);

      const view = this.createElement("span", {
        classNames: ["view-count-text"],
        textContent: "–",
      });
      view.dataset.viewCount = "";
      view.dataset.viewPointer = this.pointerInfo.key;

      wrapper.appendChild(view);
      container.appendChild(wrapper);

      this.viewCountEl = view;
    }

    // Discussion
    if (hasDiscussion) {
      let initialCount = 0;
      if (typeof this.video.discussionCount === "number") {
        initialCount = this.video.discussionCount;
      } else if (typeof this.video.discussionCount === "string") {
        const parsed = Number.parseInt(this.video.discussionCount.trim(), 10);
        if (Number.isFinite(parsed)) {
          initialCount = parsed;
        }
      }

      if (Number.isFinite(initialCount) && initialCount >= 0) {
        const wrapper = this.createElement("div", {
          classNames: ["flex", "items-center", "gap-1.5"],
        });
        wrapper.dataset.discussionCount = this.video.id;
        wrapper.dataset.countState = "ready";
        wrapper.setAttribute("title", "Comments");

        const icon = this.createMessageIcon(["w-4", "h-4"]);
        wrapper.appendChild(icon);

        const safeCount = Math.floor(initialCount);
        const displayValue = this.helpers.toLocaleString
          ? this.helpers.toLocaleString(safeCount)
          : safeCount.toLocaleString();

        const valueEl = this.createElement("span", {
          textContent: displayValue,
        });
        valueEl.dataset.discussionCountValue = "";

        wrapper.appendChild(valueEl);
        container.appendChild(wrapper);

        this.discussionCountEl = wrapper;
      }
    }

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

  applyModerationDatasets(context = this.getModerationContext()) {
    applyModerationContextDatasets(context, {
      root: this.root,
      thumbnail: this.thumbnailEl,
      avatar: this.authorPicEl,
      shouldMaskNsfwForOwner: this.shouldMaskNsfwForOwner,
    });
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

  buildMarqueeStructure(tagName, classNames, textContent, attrs = {}) {
    const host = this.createElement(tagName, {
      classNames: [...classNames, "marquee-host"],
      attrs,
    });

    // Use span instead of div to ensure valid HTML when nested in h3/p
    const staticEl = this.createElement("span", {
      classNames: ["marquee-static", "block"],
      textContent,
    });

    const animEl = this.createElement("span", {
      classNames: ["marquee-anim"],
      attrs: { "aria-hidden": "true" },
    });
    const track = this.createElement("span", { classNames: ["marquee-track"] });

    const item1 = this.createElement("span", {
      classNames: ["marquee-item"],
      textContent,
    });
    const item2 = this.createElement("span", {
      classNames: ["marquee-item"],
      textContent,
    });

    track.appendChild(item1);
    track.appendChild(item2);
    animEl.appendChild(track);

    host.appendChild(staticEl);
    host.appendChild(animEl);

    host._marqueeRefs = { staticEl, item1, item2, track };

    VideoCard.observeMarquee(host);

    return host;
  }

  updateMarqueeText(host, text) {
    if (!host) return;
    if (!host._marqueeRefs) {
      host.textContent = text;
      return;
    }
    const { staticEl, item1, item2 } = host._marqueeRefs;
    if (staticEl) staticEl.textContent = text;
    if (item1) item1.textContent = text;
    if (item2) item2.textContent = text;
    // Trigger check immediately if possible, or wait for observer
    VideoCard.checkMarqueeOverflow(host);
  }

  // Moved checkMarqueeOverflow to static to be shared by observer
  static checkMarqueeOverflow(host) {
    if (!host || !host._marqueeRefs) return;
    const { staticEl, track, item1 } = host._marqueeRefs;

    // Use item1 width (full content width) vs host width
    const contentWidth = item1 ? item1.offsetWidth : staticEl.scrollWidth;
    const availableWidth = host.clientWidth;

    const isOverflowing = contentWidth > availableWidth;

    if (isOverflowing) {
      host.classList.add("can-marquee");
      // Speed: 50 pixels per second
      // Distance is contentWidth (one item width including padding)
      const distance = contentWidth;
      const duration = distance / 50;
      const safeDuration = Math.max(duration, 2);
      track.style.setProperty("--marquee-duration", `${safeDuration}s`);
    } else {
      host.classList.remove("can-marquee");
    }
  }

  static observeMarquee(element) {
    if (!VideoCard.marqueeResizeObserver) {
      VideoCard.marqueeResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          VideoCard.checkMarqueeOverflow(entry.target);
        }
      });
    }
    VideoCard.marqueeResizeObserver.observe(element);
  }

  static observeViewport(element) {
    if (!VideoCard.viewportObserver) {
      VideoCard.viewportObserver = new IntersectionObserver(
        (entries) => {
          // Prevent active state on desktop to avoid conflicting with hover
          const isDesktop =
            typeof window !== "undefined" &&
            window.matchMedia(`(min-width: ${BREAKPOINT_LG}px)`).matches;

          for (const entry of entries) {
            if (isDesktop) {
              if (entry.target.hasAttribute("data-mobile-active")) {
                entry.target.removeAttribute("data-mobile-active");
              }
              continue;
            }

            if (entry.isIntersecting) {
              entry.target.setAttribute("data-mobile-active", "true");
            } else {
              entry.target.removeAttribute("data-mobile-active");
            }
          }
        },
        { rootMargin: "-35% 0px -35% 0px", threshold: 0 }
      );
    }
    VideoCard.viewportObserver.observe(element);
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
