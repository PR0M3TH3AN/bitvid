export class VideoCard {
  constructor({
    document: doc,
    video,
    index = 0,
    shareUrl = "#",
    timeAgo = "",
    pointerInfo = null,
    highlightClass = "",
    animationClass = "",
    capabilities = {},
    formatters = {},
    helpers = {},
    assets = {},
    state = {},
    ensureGlobalMoreMenuHandlers,
    onRequestCloseAllMenus,
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
    this.highlightClass =
      typeof highlightClass === "string" ? highlightClass : "";
    this.animationClass = animationClass || "";
    this.pointerInfo = pointerInfo;
    this.capabilities = {
      canEdit: false,
      canDelete: false,
      canRevert: false,
      canManageBlacklist: false,
      ...capabilities,
    };
    this.formatters = {
      formatTimeAgo: formatters.formatTimeAgo,
      formatNumber: formatters.formatNumber,
    };
    this.helpers = {
      escapeHtml: helpers.escapeHtml,
      isMagnetSupported: helpers.isMagnetSupported,
      toLocaleString: helpers.toLocaleString,
    };
    this.assets = {
      fallbackThumbnailSrc: assets.fallbackThumbnailSrc || "",
      unsupportedBtihMessage: assets.unsupportedBtihMessage || "",
    };
    this.state = {
      loadedThumbnails:
        state.loadedThumbnails instanceof Map ? state.loadedThumbnails : null,
    };
    this.ensureGlobalMoreMenuHandlers =
      typeof ensureGlobalMoreMenuHandlers === "function"
        ? ensureGlobalMoreMenuHandlers
        : null;
    this.onRequestCloseAllMenus =
      typeof onRequestCloseAllMenus === "function"
        ? onRequestCloseAllMenus
        : null;

    this.callbacks = {
      onPlay: null,
      onEdit: null,
      onRevert: null,
      onDelete: null,
      onMoreAction: null,
      onAuthorNavigate: null,
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
    this.urlHealthBadgeEl = null;
    this.torrentHealthBadgeEl = null;
    this.viewCountEl = null;
    this.discussionCountEl = null;
    this.authorPicEl = null;
    this.authorNameEl = null;

    this.playbackUrl =
      typeof video.url === "string" ? video.url.trim() : "";
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

    this.timeAgo =
      timeAgo ||
      (typeof this.formatters.formatTimeAgo === "function"
        ? this.formatters.formatTimeAgo(video.created_at)
        : "");

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
      this.moreMenu.classList.add("hidden");
    }
    if (this.moreMenuButton) {
      this.moreMenuButton.setAttribute("aria-expanded", "false");
    }
  }

  closeSettingsMenu() {
    if (this.settingsDropdown) {
      this.settingsDropdown.classList.add("hidden");
    }
  }

  build() {
    const doc = this.document;

    const root = this.createElement("div", {
      classNames: [
        "video-card",
        "bg-gray-900",
        "rounded-lg",
        "overflow-hidden",
        "shadow-lg",
        "hover:shadow-2xl",
        "transition-all",
        "duration-300",
      ],
    });

    this.applyClassListFromString(root, this.highlightClass);
    this.applyClassListFromString(root, this.animationClass);

    this.root = root;

    this.applyPointerDataset();
    this.applyOwnerDataset();
    this.applySourceDatasets();

    const anchor = this.createElement("a", {
      classNames: ["block", "cursor-pointer", "relative", "group"],
      attrs: {
        href: this.shareUrl,
      },
    });
    anchor.dataset.videoId = this.video.id;
    this.anchorEl = anchor;

    const ratio = this.createElement("div", {
      classNames: ["ratio-16-9"],
    });
    const thumbnail = this.buildThumbnail();
    ratio.appendChild(thumbnail);
    anchor.appendChild(ratio);

    const content = this.createElement("div", { classNames: ["p-4"] });

    const title = this.createElement("h3", {
      classNames: [
        "text-lg",
        "font-bold",
        "text-white",
        "line-clamp-2",
        "hover:text-blue-400",
        "cursor-pointer",
        "mb-3",
      ],
      textContent: this.video.title,
    });
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
        classNames: ["mt-3", "text-xs", "text-amber-300"],
        attrs: { title: this.assets.unsupportedBtihMessage || "" },
        textContent:
          "WebTorrent fallback unavailable (magnet missing btih info hash)",
      });
      warning.dataset.torrentStatus = "unsupported";
      content.appendChild(warning);
    }

    root.appendChild(anchor);
    root.appendChild(content);

    this.applyPlaybackDatasets();
    this.bindEvents();
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
      }
      img.dataset.lazy = thumbnailUrl;
    } else {
      img.src = thumbnailUrl || fallbackSrc;
      if (fallbackSrc) {
        img.dataset.fallbackSrc = fallbackSrc;
      }
    }

    img.loading = "lazy";
    img.decoding = "async";
    img.alt = this.video.title || "";

    this.thumbnailEl = img;

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

      if (img.dataset.thumbnailFailed || !thumbnailUrl) {
        return;
      }

      const fallbackAttr =
        (typeof img.dataset.fallbackSrc === "string"
          ? img.dataset.fallbackSrc.trim()
          : "") || fallbackSrc || "";

      const currentSrc = img.currentSrc || img.src || "";
      const isFallback =
        !!fallbackAttr &&
        !!currentSrc &&
        (currentSrc === fallbackAttr || currentSrc.endsWith(fallbackAttr));

      if (isFallback) {
        return;
      }

      if ((img.naturalWidth === 0 && img.naturalHeight === 0) || !currentSrc) {
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
      classNames: ["flex", "items-center", "space-x-3"],
    });

    const avatarWrapper = this.createElement("div", {
      classNames: [
        "w-8",
        "h-8",
        "rounded-full",
        "bg-gray-700",
        "overflow-hidden",
        "flex",
        "items-center",
        "justify-center",
      ],
    });

    const avatar = this.createElement("img", {
      attrs: {
        src: "assets/svg/default-profile.svg",
        alt: "Placeholder",
      },
    });
    avatar.classList.add("author-pic");
    if (this.video.pubkey) {
      avatar.dataset.pubkey = this.video.pubkey;
    }
    avatar.style.cursor = "pointer";

    avatarWrapper.appendChild(avatar);

    const authorMeta = this.createElement("div", { classNames: ["min-w-0"] });

    const authorName = this.createElement("p", {
      classNames: ["text-sm", "text-gray-400", "author-name"],
      textContent: "Loading name...",
    });
    if (this.video.pubkey) {
      authorName.dataset.pubkey = this.video.pubkey;
    }
    authorName.style.cursor = "pointer";

    const metadata = this.createElement("div", {
      classNames: ["flex", "items-center", "text-xs", "text-gray-500", "mt-1"],
    });

    const timeEl = this.createElement("span", {
      textContent: this.timeAgo,
    });
    metadata.appendChild(timeEl);

    if (this.pointerInfo && this.pointerInfo.key) {
      const dot = this.createElement("span", {
        classNames: ["mx-1", "text-gray-600"],
        textContent: "•",
      });
      dot.setAttribute("aria-hidden", "true");

      const view = this.createElement("span", {
        classNames: ["view-count-text"],
        textContent: "– views",
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

  buildControls() {
    const doc = this.document;
    const container = this.createElement("div", {
      classNames: ["flex", "items-center"],
    });

    const moreMenu = this.buildMoreMenu();
    if (moreMenu) {
      container.appendChild(moreMenu);
    }

    if (this.capabilities.canEdit) {
      const wrapper = this.createElement("div", {
        classNames: ["relative", "inline-block", "ml-3", "overflow-visible"],
      });
      const button = this.createElement("button", {
        classNames: [
          "inline-flex",
          "items-center",
          "p-2",
          "rounded-full",
          "text-gray-400",
          "hover:text-gray-200",
          "hover:bg-gray-800",
          "focus:outline-none",
          "focus:ring-2",
          "focus:ring-blue-500",
        ],
        attrs: {
          type: "button",
        },
      });
      button.dataset.settingsDropdown = String(this.index);

      const icon = doc.createElement("img");
      icon.src = "assets/svg/video-settings-gear.svg";
      icon.alt = "Settings";
      icon.classList.add("w-5", "h-5");
      button.appendChild(icon);

      const dropdown = this.createElement("div", {
        classNames: [
          "hidden",
          "absolute",
          "right-0",
          "bottom-full",
          "mb-2",
          "w-32",
          "rounded-md",
          "shadow-lg",
          "bg-gray-800",
          "ring-1",
          "ring-black",
          "ring-opacity-5",
          "z-50",
        ],
      });
      dropdown.id = `settingsDropdown-${this.index}`;

      const list = this.createElement("div", {
        classNames: ["py-1"],
      });

      const editButton = this.createElement("button", {
        classNames: [
          "block",
          "w-full",
          "text-left",
          "px-4",
          "py-2",
          "text-sm",
          "text-gray-100",
          "hover:bg-gray-700",
        ],
        textContent: "Edit",
      });
      editButton.dataset.editIndex = String(this.index);
      editButton.dataset.editEventId = this.video.id;
      list.appendChild(editButton);
      this.editButton = editButton;

      if (this.capabilities.canRevert) {
        const revertButton = this.createElement("button", {
          classNames: [
            "block",
            "w-full",
            "text-left",
            "px-4",
            "py-2",
            "text-sm",
            "text-red-400",
            "hover:bg-red-700",
            "hover:text-white",
          ],
          textContent: "Revert",
        });
        revertButton.dataset.revertIndex = String(this.index);
        revertButton.dataset.revertEventId = this.video.id;
        list.appendChild(revertButton);
        this.revertButton = revertButton;
      }

      if (this.capabilities.canDelete) {
        const deleteButton = this.createElement("button", {
          classNames: [
            "block",
            "w-full",
            "text-left",
            "px-4",
            "py-2",
            "text-sm",
            "text-red-400",
            "hover:bg-red-700",
            "hover:text-white",
          ],
          textContent: "Delete All",
        });
        deleteButton.dataset.deleteAllIndex = String(this.index);
        deleteButton.dataset.deleteAllEventId = this.video.id;
        list.appendChild(deleteButton);
        this.deleteButton = deleteButton;
      }

      dropdown.appendChild(list);
      wrapper.appendChild(button);
      wrapper.appendChild(dropdown);

      container.appendChild(wrapper);

      this.settingsButton = button;
      this.settingsDropdown = dropdown;
    }

    return container;
  }

  buildMoreMenu() {
    const wrapper = this.createElement("div", {
      classNames: ["relative", "inline-block", "ml-1", "overflow-visible"],
    });
    wrapper.dataset.moreMenuWrapper = "true";

    const button = this.createElement("button", {
      classNames: [
        "inline-flex",
        "items-center",
        "justify-center",
        "w-10",
        "h-10",
        "p-2",
        "rounded-full",
        "text-gray-400",
        "hover:text-gray-200",
        "hover:bg-gray-800",
        "focus:outline-none",
        "focus:ring-2",
        "focus:ring-blue-500",
      ],
      attrs: {
        type: "button",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        "aria-label": "More options",
      },
    });
    button.dataset.moreDropdown = String(this.index);
    button.dataset.moreMenuToggleBound = "true";

    const icon = this.document.createElement("img");
    icon.src = "assets/svg/ellipsis.svg";
    icon.alt = "More";
    icon.classList.add("w-5", "h-5", "object-contain");
    button.appendChild(icon);

    const dropdown = this.createElement("div", {
      classNames: [
        "hidden",
        "absolute",
        "right-0",
        "bottom-full",
        "mb-2",
        "w-40",
        "rounded-md",
        "shadow-lg",
        "bg-gray-800",
        "ring-1",
        "ring-black",
        "ring-opacity-5",
        "z-50",
      ],
    });
    dropdown.id = `moreDropdown-${this.index}`;
    dropdown.dataset.moreMenu = "true";
    dropdown.setAttribute("role", "menu");

    const list = this.createElement("div", {
      classNames: ["py-1"],
    });

    const addActionButton = (text, action, extraDataset = {}, classes = []) => {
      const btn = this.createElement("button", {
        classNames: [
          "block",
          "w-full",
          "text-left",
          "px-4",
          "py-2",
          "text-sm",
          ...classes,
        ],
        textContent: text,
      });
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
      author: this.video.pubkey || "",
    }, ["text-gray-100", "hover:bg-gray-700"]);

    addActionButton("Copy link", "copy-link", {
      eventId: this.video.id || "",
    }, ["text-gray-100", "hover:bg-gray-700"]);

    if (this.pointerInfo && this.pointerInfo.key && this.pointerInfo.pointer) {
      const [pointerType, pointerValue, pointerRelay] = this.pointerInfo.pointer;
      if (pointerType && pointerValue) {
        const removeButton = addActionButton(
          "Remove from history",
          "remove-history",
          {
            pointerKey: this.pointerInfo.key,
            pointerType,
            pointerValue,
            pointerRelay: pointerRelay || "",
            reason: "remove-item",
          },
          ["text-gray-100", "hover:bg-gray-700"]
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
        ["text-red-400", "hover:bg-red-700", "hover:text-white"]
      );
    }

    addActionButton(
      "Block creator",
      "block-author",
      { author: this.video.pubkey || "" },
      ["text-red-400", "hover:bg-red-700", "hover:text-white"]
    );

    addActionButton(
      "Report",
      "report",
      { eventId: this.video.id || "" },
      ["text-gray-100", "hover:bg-gray-700"]
    );

    dropdown.appendChild(list);
    wrapper.appendChild(button);
    wrapper.appendChild(dropdown);

    this.moreMenuButton = button;
    this.moreMenu = dropdown;

    return wrapper;
  }

  buildBadgesContainer() {
    const pieces = [];

    if (this.playbackUrl) {
      const badge = this.createElement("div", {
        classNames: [
          "url-health-badge",
          "text-xs",
          "font-semibold",
          "px-2",
          "py-1",
          "rounded",
          "inline-flex",
          "items-center",
          "gap-1",
          "bg-gray-800",
          "text-gray-300",
        ],
        textContent: "Checking hosted URL…",
      });
      badge.dataset.urlHealthState = "checking";
      badge.setAttribute("aria-live", "polite");
      badge.setAttribute("role", "status");
      this.urlHealthBadgeEl = badge;
      pieces.push(badge);
    }

    if (this.magnetSupported && this.magnetProvided) {
      const badge = this.createElement("div", {
        classNames: [
          "torrent-health-badge",
          "text-xs",
          "font-semibold",
          "px-2",
          "py-1",
          "rounded",
          "inline-flex",
          "items-center",
          "gap-1",
          "bg-gray-800",
          "text-gray-300",
          "transition-colors",
          "duration-200",
        ],
        textContent: "⏳ Torrent",
      });
      badge.dataset.streamHealthState = "checking";
      badge.setAttribute("aria-live", "polite");
      badge.setAttribute("role", "status");
      this.torrentHealthBadgeEl = badge;
      pieces.push(badge);
    }

    if (!pieces.length) {
      return null;
    }

    const container = this.createElement("div", {
      classNames: ["mt-3", "flex", "flex-wrap", "items-center", "gap-2"],
    });
    pieces.forEach((el) => container.appendChild(el));
    return container;
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
      classNames: ["flex", "items-center", "text-xs", "text-gray-500", "mt-3"],
    });
    container.dataset.discussionCount = this.video.id;
    container.dataset.countState = "ready";

    const valueEl = this.createElement("span", {
      textContent: displayValue,
    });
    valueEl.dataset.discussionCountValue = "";

    const labelEl = this.createElement("span", {
      classNames: ["ml-1"],
      textContent: "notes",
    });

    container.appendChild(valueEl);
    container.appendChild(labelEl);

    this.discussionCountEl = container;

    return container;
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
    this.root.dataset.ownerIsViewer = this.capabilities.canEdit ? "true" : "false";
    if (this.video.pubkey) {
      this.root.dataset.ownerPubkey = this.video.pubkey;
    }
  }

  applySourceDatasets() {
    if (!this.root) {
      return;
    }

    if (this.playbackUrl) {
      this.root.dataset.urlHealthState = "checking";
      delete this.root.dataset.urlHealthReason;
      this.root.dataset.urlHealthEventId = this.video.id || "";
      this.root.dataset.urlHealthUrl = encodeURIComponent(this.playbackUrl);
    } else {
      this.root.dataset.urlHealthState = "offline";
      this.root.dataset.urlHealthReason = "missing-source";
      delete this.root.dataset.urlHealthEventId;
      delete this.root.dataset.urlHealthUrl;
    }

    if (this.magnetProvided && this.magnetSupported) {
      this.root.dataset.streamHealthState = "checking";
      delete this.root.dataset.streamHealthReason;
    } else {
      this.root.dataset.streamHealthState = "unhealthy";
      this.root.dataset.streamHealthReason = this.magnetProvided
        ? "unsupported"
        : "missing-source";
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
          typeof MouseEventCtor !== "undefined" && event instanceof MouseEventCtor;
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
        const willOpen = this.settingsDropdown.classList.contains("hidden");
        if (this.onRequestCloseAllMenus) {
          this.onRequestCloseAllMenus(this);
        } else {
          this.closeSettingsMenu();
        }
        if (willOpen) {
          this.settingsDropdown.classList.remove("hidden");
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
            card: this,
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
            card: this,
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
            card: this,
          });
        }
      });
    }

    if (this.moreMenuButton && this.moreMenu) {
      this.moreMenuButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = this.moreMenu.classList.contains("hidden");
        if (this.onRequestCloseAllMenus) {
          this.onRequestCloseAllMenus(this);
        }
        if (willOpen) {
          this.moreMenu.classList.remove("hidden");
          this.moreMenuButton.setAttribute("aria-expanded", "true");
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
              dataset,
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
            pubkey: this.video.pubkey || "",
          });
        }
      });
    });
  }

  applyClassListFromString(el, classString) {
    if (!el || !classString) {
      return;
    }
    classString
      .split(/\s+/)
      .map((cls) => cls.trim())
      .filter(Boolean)
      .forEach((cls) => el.classList.add(cls));
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
