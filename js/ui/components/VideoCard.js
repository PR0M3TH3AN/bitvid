import { normalizeDesignSystemContext } from "../../designSystem.js";
import { updateVideoCardSourceVisibility } from "../../utils/cardSourceVisibility.js";
import positionFloatingPanel from "../utils/positionFloatingPanel.js";
import { createFloatingPanelStyles } from "../utils/floatingPanelStyles.js";
import {
  getPopupOffsetPx,
  getPopupViewportPaddingPx,
} from "../../designSystem/metrics.js";

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
      onAuthorNavigate: null
    };

    this.root = null;
    this.anchorEl = null;
    this.titleEl = null;
    this.thumbnailEl = null;
    this.settingsButton = null;
    this.settingsDropdown = null;
    this.editButton = null;
    this.revertButton = null;
    this.deleteButton = null;
    this.moreMenuButton = null;
    this.moreMenu = null;
    this.settingsDropdownPositioner = null;
    this.moreMenuPositioner = null;
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

  set onMoreAction(fn) {
    this.callbacks.onMoreAction = typeof fn === "function" ? fn : null;
  }

  set onAuthorNavigate(fn) {
    this.callbacks.onAuthorNavigate = typeof fn === "function" ? fn : null;
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

  closeMoreMenu() {
    if (this.moreMenu) {
      this.moreMenu.dataset.state = "closed";
      this.moreMenu.setAttribute("aria-hidden", "true");
      this.moreMenu.hidden = true;
    }
    if (this.moreMenuButton) {
      this.moreMenuButton.setAttribute("aria-expanded", "false");
    }
  }

  closeSettingsMenu() {
    if (this.settingsDropdown) {
      this.settingsDropdown.dataset.state = "closed";
      this.settingsDropdown.setAttribute("aria-hidden", "true");
      this.settingsDropdown.hidden = true;
    }
    if (this.settingsButton) {
      this.settingsButton.setAttribute("aria-expanded", "false");
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

    if (this.shouldMaskNsfwForOwner) {
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
      const wrapper = this.createElement("div", {
        classNames: ["popover", "ml-2"]
      });
      const button = this.createElement("button", {
        classNames: [
          "btn-ghost",
          "h-10",
          "w-10",
          "rounded-full",
          "p-0",
          "text-muted"
        ],
        attrs: {
          type: "button",
          "aria-haspopup": "true",
          "aria-expanded": "false",
          "aria-label": "Video settings"
        }
      });
      button.dataset.settingsDropdown = String(this.index);

      const icon = this.createSettingsIcon(["h-5", "w-5"]);
      button.appendChild(icon);

      const dropdown = this.createElement("div", {
        classNames: ["popover__panel", "w-44", "p-0"],
        attrs: {
          hidden: "",
          "data-state": "closed",
          "aria-hidden": "true"
        }
      });
      dropdown.id = `settingsDropdown-${this.index}`;
      dropdown.setAttribute("role", "menu");

      const list = this.createElement("div", {
        classNames: ["menu"],
        attrs: { role: "none" }
      });

      const addMenuItem = ({ text, variant = null, dataset = {} }) => {
        const item = this.createElement("button", {
          classNames: ["menu__item", "justify-start"],
          textContent: text,
          attrs: {
            type: "button",
            role: "menuitem"
          }
        });
        if (variant) {
          item.dataset.variant = variant;
        }
        Object.entries(dataset).forEach(([key, value]) => {
          if (value === undefined || value === null) {
            return;
          }
          item.dataset[key] = String(value);
        });
        list.appendChild(item);
        return item;
      };

      const editButton = addMenuItem({
        text: "Edit",
        dataset: {
          editIndex: String(this.index),
          editEventId: this.video.id
        }
      });
      this.editButton = editButton;

      if (this.capabilities.canRevert) {
        const revertButton = addMenuItem({
          text: "Revert",
          variant: "critical",
          dataset: {
            revertIndex: String(this.index),
            revertEventId: this.video.id
          }
        });
        this.revertButton = revertButton;
      }

      if (this.capabilities.canDelete) {
        const deleteButton = addMenuItem({
          text: "Delete All",
          variant: "critical",
          dataset: {
            deleteAllIndex: String(this.index),
            deleteAllEventId: this.video.id
          }
        });
        this.deleteButton = deleteButton;
      }

      dropdown.appendChild(list);
      wrapper.appendChild(button);
      wrapper.appendChild(dropdown);

      container.appendChild(wrapper);

      this.settingsButton = button;
      this.settingsDropdown = dropdown;
      this.settingsDropdownStyles = createFloatingPanelStyles(dropdown);
      const metricsDocument =
        dropdown?.ownerDocument ||
        button?.ownerDocument ||
        this.document ||
        (typeof document !== "undefined" ? document : null);
      const settingsOffset = getPopupOffsetPx({
        documentRef: metricsDocument,
      });
      const settingsViewportPadding = getPopupViewportPaddingPx({
        documentRef: metricsDocument,
      });
      this.settingsDropdownPositioner = positionFloatingPanel(
        button,
        dropdown,
        {
          placement: "bottom",
          alignment: "end",
          offset: settingsOffset,
          viewportPadding: settingsViewportPadding,
          styles: this.settingsDropdownStyles,
        },
      );
    }

    return container;
  }

  buildMoreMenu() {
    const wrapper = this.createElement("div", {
      classNames: ["popover", "ml-1"]
    });
    wrapper.dataset.moreMenuWrapper = "true";

    const button = this.createElement("button", {
      classNames: [
        "btn-ghost",
        "h-10",
        "w-10",
        "rounded-full",
        "p-0",
        "text-muted"
      ],
      attrs: {
        type: "button",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        "aria-label": "More options"
      }
    });
    button.dataset.moreDropdown = String(this.index);
    button.dataset.moreMenuToggleBound = "true";

    const icon = this.createEllipsisIcon(["w-5", "h-5", "object-contain"]);
    button.appendChild(icon);

    const dropdown = this.createElement("div", {
      classNames: ["popover__panel", "w-40", "p-0"],
      attrs: {
        hidden: "",
        "data-state": "closed",
        "aria-hidden": "true"
      }
    });
    dropdown.id = `moreDropdown-${this.index}`;
    dropdown.dataset.moreMenu = "true";
    dropdown.setAttribute("role", "menu");

    const list = this.createElement("div", {
      classNames: ["menu"],
      attrs: { role: "none" }
    });

    const addActionButton = (text, action, extraDataset = {}, options = {}) => {
      const { variant = null } = options || {};
      const btn = this.createElement("button", {
        classNames: ["menu__item", "justify-start"],
        textContent: text,
        attrs: {
          type: "button",
          role: "menuitem"
        }
      });
      if (variant) {
        btn.dataset.variant = variant;
      }
      btn.dataset.action = action;
      Object.entries(extraDataset || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          return;
        }
        btn.dataset[key] = String(value);
      });
      list.appendChild(btn);
      return btn;
    };

    addActionButton("Open channel", "open-channel", {
      author: this.video.pubkey || ""
    });

    addActionButton("Copy link", "copy-link", {
      eventId: this.video.id || ""
    });

    const pointer = Array.isArray(this.pointerInfo?.pointer)
      ? this.pointerInfo.pointer
      : null;
    const pointerType = pointer && pointer.length >= 2 ? pointer[0] : "";
    const pointerValue = pointer && pointer.length >= 2 ? pointer[1] : "";
    const pointerRelay = pointer && pointer.length >= 3 ? pointer[2] || "" : "";
    const numericKind =
      Number.isFinite(this.video.kind) && this.video.kind > 0
        ? Math.floor(this.video.kind)
        : null;

    const baseBoostDataset = {
      eventId: this.video.id || "",
      author: this.video.pubkey || ""
    };

    if (pointerType && pointerValue) {
      baseBoostDataset.pointerType = pointerType;
      baseBoostDataset.pointerValue = pointerValue;
    }
    if (pointerRelay) {
      baseBoostDataset.pointerRelay = pointerRelay;
    }
    if (Number.isFinite(numericKind)) {
      baseBoostDataset.kind = String(numericKind);
    }

    const boostLabel = this.createElement("div", {
      classNames: ["menu__heading"],
      textContent: "Boost on Nostr…"
    });
    list.appendChild(boostLabel);

    addActionButton("Repost (kind 6)", "repost-event", baseBoostDataset);

    if (this.playbackUrl && this.video.isPrivate !== true) {
      const mirrorDataset = {
        ...baseBoostDataset,
        url: this.playbackUrl,
        magnet: this.playbackMagnet || "",
        thumbnail:
          typeof this.video.thumbnail === "string" ? this.video.thumbnail : "",
        description:
          typeof this.video.description === "string"
            ? this.video.description
            : "",
        title: typeof this.video.title === "string" ? this.video.title : "",
        isPrivate: this.video.isPrivate === true ? "true" : "false"
      };

      addActionButton("Mirror (kind 1063)", "mirror-video", mirrorDataset);
    }

    const ensureDataset = {
      ...baseBoostDataset,
      pubkey: this.video.pubkey || ""
    };

    addActionButton("Rebroadcast", "ensure-presence", ensureDataset);

    list.appendChild(
      this.createElement("div", {
        classNames: ["menu__separator"],
        attrs: { role: "separator" }
      })
    );

    if (this.pointerInfo && this.pointerInfo.key && this.pointerInfo.pointer) {
      const [historyPointerType, historyPointerValue, historyPointerRelay] =
        this.pointerInfo.pointer;
      if (historyPointerType && historyPointerValue) {
        const removeButton = addActionButton(
          "Remove from history",
          "remove-history",
          {
            pointerKey: this.pointerInfo.key,
            pointerType: historyPointerType,
            pointerValue: historyPointerValue,
            pointerRelay: historyPointerRelay || "",
            reason: "remove-item"
          }
        );
        removeButton.setAttribute(
          "title",
          "Remove this entry from your encrypted history. Relay sync may take a moment."
        );
        removeButton.setAttribute(
          "aria-label",
          "Remove from history (updates encrypted history and may take a moment to sync to relays)"
        );
      }
    }

    if (this.capabilities.canManageBlacklist) {
      addActionButton(
        "Blacklist creator",
        "blacklist-author",
        { author: this.video.pubkey || "" },
        { variant: "critical" }
      );
    }

    addActionButton(
      "Block creator",
      "block-author",
      { author: this.video.pubkey || "" },
      { variant: "critical" }
    );

    addActionButton("Report", "report", { eventId: this.video.id || "" });

    dropdown.appendChild(list);
    wrapper.appendChild(button);
    wrapper.appendChild(dropdown);

    this.moreMenuButton = button;
    this.moreMenu = dropdown;
    this.moreMenuStyles = createFloatingPanelStyles(dropdown);
    const menuMetricsDocument =
      dropdown?.ownerDocument ||
      button?.ownerDocument ||
      this.document ||
      (typeof document !== "undefined" ? document : null);
    const menuOffset = getPopupOffsetPx({
      documentRef: menuMetricsDocument,
    });
    const menuViewportPadding = getPopupViewportPaddingPx({
      documentRef: menuMetricsDocument,
    });
    this.moreMenuPositioner = positionFloatingPanel(button, dropdown, {
      placement: "bottom",
      alignment: "end",
      offset: menuOffset,
      viewportPadding: menuViewportPadding,
      styles: this.moreMenuStyles,
    });

    return wrapper;
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

    if (!pieces.length) {
      return null;
    }

    const container = this.createElement("div", {
      classNames: ["flex", "flex-wrap", "items-center", "gap-sm"]
    });
    pieces.forEach((el) => container.appendChild(el));
    return container;
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
    const message =
      typeof entry?.message === "string" && entry.message
        ? entry.message
        : "Checking hosted URL…";

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
        variant: "info",
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
        if (this.window?.console?.warn) {
          this.window.console.warn(
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

    if (this.settingsButton && this.settingsDropdown) {
      this.settingsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = this.settingsDropdown.dataset.state !== "open";
        if (this.onRequestCloseAllMenus) {
          this.onRequestCloseAllMenus(this);
        } else {
          this.closeSettingsMenu();
        }
        if (willOpen) {
          this.settingsDropdown.hidden = false;
          this.settingsDropdown.dataset.state = "open";
          this.settingsDropdown.setAttribute("aria-hidden", "false");
          this.settingsButton.setAttribute("aria-expanded", "true");
          this.settingsDropdownPositioner?.update();
        }
      });
    }

    if (this.editButton) {
      this.editButton.addEventListener("click", (event) => {
        event.preventDefault();
        this.closeSettingsMenu();
        if (this.callbacks.onEdit) {
          this.callbacks.onEdit({
            event,
            video: this.video,
            index: this.index,
            card: this
          });
        }
      });
    }

    if (this.revertButton) {
      this.revertButton.addEventListener("click", (event) => {
        event.preventDefault();
        this.closeSettingsMenu();
        if (this.callbacks.onRevert) {
          this.callbacks.onRevert({
            event,
            video: this.video,
            index: this.index,
            card: this
          });
        }
      });
    }

    if (this.deleteButton) {
      this.deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        this.closeSettingsMenu();
        if (this.callbacks.onDelete) {
          this.callbacks.onDelete({
            event,
            video: this.video,
            index: this.index,
            card: this
          });
        }
      });
    }

    if (this.moreMenuButton && this.moreMenu) {
      this.moreMenuButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = this.moreMenu.dataset.state !== "open";
        if (this.onRequestCloseAllMenus) {
          this.onRequestCloseAllMenus(this);
        }
        if (willOpen) {
          this.moreMenu.hidden = false;
          this.moreMenu.dataset.state = "open";
          this.moreMenu.setAttribute("aria-hidden", "false");
          this.moreMenuButton.setAttribute("aria-expanded", "true");
          this.moreMenuPositioner?.update();
        }
      });

      const actionButtons = this.moreMenu.querySelectorAll(
        "button[data-action]"
      );
      actionButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (this.callbacks.onMoreAction) {
            const dataset = { ...button.dataset };
            this.callbacks.onMoreAction({
              event,
              video: this.video,
              card: this,
              dataset
            });
          }
          this.closeMoreMenu();
        });
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
