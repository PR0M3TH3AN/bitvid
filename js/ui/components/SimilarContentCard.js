import { normalizeDesignSystemContext } from "../../designSystem.js";

export class SimilarContentCard {
  constructor({
    document: doc,
    video,
    index = 0,
    shareUrl = "#",
    pointerInfo = null,
    timeAgo = "",
    postedAt = null,
    identity = null,
    nsfwContext = null,
    designSystem = null,
    thumbnailCache = null,
    fallbackThumbnailSrc = "",
  } = {}) {
    if (!doc) {
      throw new Error("SimilarContentCard requires a document reference.");
    }
    if (!video || typeof video !== "object" || !video.id || !video.title) {
      throw new Error("SimilarContentCard requires a video with id and title.");
    }

    this.document = doc;
    this.window = doc.defaultView || globalThis;
    this.video = video;
    this.index = Number.isFinite(index) ? Number(index) : 0;
    this.shareUrl =
      typeof shareUrl === "string" && shareUrl.trim() ? shareUrl.trim() : "#";
    this.pointerInfo = this.normalizePointerInfo(pointerInfo);
    this.timeAgo = typeof timeAgo === "string" ? timeAgo : "";
    this.postedAt = this.normalizeTimestamp(postedAt);
    this.identity = this.normalizeIdentity(identity);
    this.nsfwContext = {
      isNsfw: Boolean(nsfwContext?.isNsfw),
      allowNsfw: nsfwContext?.allowNsfw !== false,
      viewerIsOwner: nsfwContext?.viewerIsOwner === true,
    };
    this.shouldMaskNsfwForOwner =
      this.nsfwContext.isNsfw &&
      !this.nsfwContext.allowNsfw &&
      this.nsfwContext.viewerIsOwner;

    this.designSystem = normalizeDesignSystemContext(designSystem);
    this.thumbnailCache =
      thumbnailCache instanceof Map ? thumbnailCache : null;
    this.fallbackThumbnailSrc =
      typeof fallbackThumbnailSrc === "string"
        ? fallbackThumbnailSrc.trim()
        : "";

    this.callbacks = { onPlay: null };

    this.root = null;
    this.mediaLinkEl = null;
    this.thumbnailEl = null;
    this.contentEl = null;
    this.titleEl = null;
    this.authorNameEl = null;
    this.authorNpubEl = null;
    this.timeEl = null;
    this.viewCountEl = null;

    this.build();
  }

  set onPlay(fn) {
    this.callbacks.onPlay = typeof fn === "function" ? fn : null;
  }

  getRoot() {
    return this.root;
  }

  getViewCountElement() {
    return this.viewCountEl;
  }

  closeMoreMenu() {}

  closeSettingsMenu() {}

  updateIdentity(nextIdentity = {}) {
    this.identity = this.normalizeIdentity(nextIdentity, this.identity);

    if (this.authorNameEl) {
      this.authorNameEl.textContent =
        this.identity.name || this.identity.shortNpub || this.identity.npub || "";
      if (this.identity.pubkey) {
        this.authorNameEl.dataset.pubkey = this.identity.pubkey;
      } else if (this.authorNameEl.dataset?.pubkey) {
        delete this.authorNameEl.dataset.pubkey;
      }
    }

    if (this.authorNpubEl) {
      const label = this.identity.shortNpub || this.identity.npub || "";
      this.authorNpubEl.textContent = label;
      if (!label) {
        this.authorNpubEl.setAttribute("aria-hidden", "true");
      } else {
        this.authorNpubEl.setAttribute("aria-hidden", "false");
      }
      if (this.identity.pubkey) {
        this.authorNpubEl.dataset.pubkey = this.identity.pubkey;
      } else if (this.authorNpubEl.dataset?.pubkey) {
        delete this.authorNpubEl.dataset.pubkey;
      }
    }
  }

  normalizePointerInfo(info) {
    if (!info || typeof info !== "object") {
      return null;
    }

    const key =
      typeof info.key === "string" && info.key.trim() ? info.key.trim() : "";
    const pointer = Array.isArray(info.pointer) ? info.pointer.slice(0, 3) : null;

    if (!key && !pointer) {
      return null;
    }

    return { key, pointer };
  }

  normalizeTimestamp(candidate) {
    if (!Number.isFinite(candidate)) {
      return null;
    }
    const value = Number(candidate);
    const seconds = value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
    return seconds;
  }

  normalizeIdentity(nextIdentity = {}, fallback = null) {
    const baseline = fallback && typeof fallback === "object" ? fallback : {};

    const candidate =
      nextIdentity && typeof nextIdentity === "object" ? nextIdentity : {};

    const pubkey = (() => {
      if (typeof candidate.pubkey === "string" && candidate.pubkey.trim()) {
        return candidate.pubkey.trim();
      }
      if (typeof baseline.pubkey === "string" && baseline.pubkey.trim()) {
        return baseline.pubkey.trim();
      }
      if (typeof this.video?.pubkey === "string" && this.video.pubkey.trim()) {
        return this.video.pubkey.trim();
      }
      return "";
    })();

    const nameCandidates = [
      candidate.name,
      candidate.displayName,
      candidate.username,
      baseline.name,
      baseline.displayName,
      baseline.username,
    ];
    let name = "";
    for (const entry of nameCandidates) {
      if (typeof entry !== "string") {
        continue;
      }
      const trimmed = entry.trim();
      if (trimmed) {
        name = trimmed;
        break;
      }
    }

    const npub = (() => {
      const entries = [candidate.npub, baseline.npub];
      for (const entry of entries) {
        if (typeof entry === "string" && entry.trim()) {
          return entry.trim();
        }
      }
      return "";
    })();

    const shortNpub = (() => {
      const entries = [candidate.shortNpub, baseline.shortNpub, npub];
      for (const entry of entries) {
        if (typeof entry === "string" && entry.trim()) {
          return entry.trim();
        }
      }
      return "";
    })();

    if (!name) {
      name = shortNpub || npub || "";
    }

    return { name, npub, shortNpub, pubkey };
  }

  build() {
    const root = this.document.createElement("article");
    root.classList.add("player-modal__similar-card", "card");
    root.dataset.component = "similar-content-card";
    root.dataset.index = String(this.index);
    if (this.video.id) {
      root.dataset.videoId = this.video.id;
    }
    const dsMode = this.designSystem?.getMode?.();
    if (dsMode) {
      root.setAttribute("data-ds", dsMode);
    }

    this.root = root;

    const media = this.buildMediaSection();
    const content = this.buildContentSection();

    if (media) {
      root.appendChild(media);
    }
    if (content) {
      root.appendChild(content);
    }

    this.applyPointerDatasets();
    this.bindEvents();
  }

  buildMediaSection() {
    const anchor = this.document.createElement("a");
    anchor.classList.add("player-modal__similar-card-media");
    anchor.href = this.shareUrl;
    anchor.setAttribute("data-primary-action", "play");

    const thumbnail = this.buildThumbnail();
    if (thumbnail) {
      anchor.appendChild(thumbnail);
    }

    this.mediaLinkEl = anchor;
    return anchor;
  }

  buildThumbnail() {
    const img = this.document.createElement("img");
    img.decoding = "async";
    img.loading = "lazy";
    img.alt = this.video.title || "";
    img.dataset.videoThumbnail = "true";

    const rawThumbnail =
      typeof this.video.thumbnail === "string"
        ? this.video.thumbnail.trim()
        : "";
    const thumbnailUrl = rawThumbnail;
    const fallbackSrc = this.fallbackThumbnailSrc;
    const cachedValue = this.thumbnailCache?.get(this.video.id) || "";
    const shouldLazyLoad = !!thumbnailUrl && cachedValue !== thumbnailUrl;

    if (shouldLazyLoad) {
      if (fallbackSrc) {
        img.src = fallbackSrc;
        img.dataset.fallbackSrc = fallbackSrc;
        this.setCardBackdropImage(fallbackSrc);
      } else {
        this.setCardBackdropImage("");
      }
      img.dataset.lazy = thumbnailUrl;
    } else {
      const initialSrc = thumbnailUrl || fallbackSrc;
      if (initialSrc) {
        img.src = initialSrc;
        if (fallbackSrc) {
          img.dataset.fallbackSrc = fallbackSrc;
        }
        this.setCardBackdropImage(initialSrc);
      } else {
        this.setCardBackdropImage("");
      }
    }

    if (this.shouldMaskNsfwForOwner || this.video?.moderation?.blurThumbnail) {
      img.dataset.thumbnailState = "blurred";
    }

    const handleLoad = () => {
      const currentSrc = img.currentSrc || img.src || "";
      if (!currentSrc) {
        return;
      }

      const fallbackAttr =
        (typeof img.dataset.fallbackSrc === "string"
          ? img.dataset.fallbackSrc.trim()
          : "") || fallbackSrc || "";
      const isFallback =
        !!fallbackAttr &&
        (currentSrc === fallbackAttr || currentSrc.endsWith(fallbackAttr));

      if (!isFallback) {
        this.setCardBackdropImage(currentSrc);
      } else if (fallbackAttr) {
        this.setCardBackdropImage(fallbackAttr);
      }

      if (thumbnailUrl && !isFallback && this.thumbnailCache) {
        this.thumbnailCache.set(this.video.id, thumbnailUrl);
      }
    };

    const handleError = () => {
      const fallbackAttr =
        (typeof img.dataset.fallbackSrc === "string"
          ? img.dataset.fallbackSrc.trim()
          : "") || fallbackSrc || "";
      if (fallbackAttr) {
        this.setCardBackdropImage(fallbackAttr);
        if (!img.src || img.src === thumbnailUrl) {
          img.src = fallbackAttr;
        }
      } else {
        this.setCardBackdropImage("");
      }
      if (thumbnailUrl && this.thumbnailCache) {
        const cached = this.thumbnailCache.get(this.video.id);
        if (cached === thumbnailUrl) {
          this.thumbnailCache.delete(this.video.id);
        }
      }
    };

    img.addEventListener("load", handleLoad);
    img.addEventListener("error", handleError, { once: true });

    if (img.complete) {
      handleLoad();
    }

    this.thumbnailEl = img;
    return img;
  }

  buildContentSection() {
    const content = this.document.createElement("div");
    content.classList.add("player-modal__similar-card-content");
    content.style.minWidth = "0";

    const titleLink = this.document.createElement("a");
    titleLink.classList.add("player-modal__similar-card-title");
    titleLink.href = this.shareUrl;
    titleLink.textContent = this.video.title || "Untitled";
    titleLink.title = this.video.title || "Untitled";
    titleLink.style.minWidth = "0";

    const authorStack = this.buildAuthorStack();
    const metaRow = this.buildMetaRow();

    content.appendChild(titleLink);
    if (authorStack) {
      content.appendChild(authorStack);
    }
    if (metaRow) {
      content.appendChild(metaRow);
    }

    this.contentEl = content;
    this.titleEl = titleLink;
    return content;
  }

  buildAuthorStack() {
    const wrapper = this.document.createElement("div");
    wrapper.classList.add("player-modal__similar-card-author");
    wrapper.style.minWidth = "0";

    const nameEl = this.document.createElement("span");
    nameEl.classList.add("author-name", "player-modal__similar-card-author-name");
    nameEl.textContent =
      this.identity.name || this.identity.shortNpub || this.identity.npub || "";
    if (this.identity.pubkey) {
      nameEl.dataset.pubkey = this.identity.pubkey;
    }

    const npubEl = this.document.createElement("span");
    npubEl.classList.add("author-npub", "player-modal__similar-card-author-npub");
    const npubLabel = this.identity.shortNpub || this.identity.npub || "";
    npubEl.textContent = npubLabel;
    if (npubLabel) {
      npubEl.setAttribute("aria-hidden", "false");
    } else {
      npubEl.setAttribute("aria-hidden", "true");
    }
    if (this.identity.pubkey) {
      npubEl.dataset.pubkey = this.identity.pubkey;
    }

    wrapper.appendChild(nameEl);
    wrapper.appendChild(npubEl);

    this.authorNameEl = nameEl;
    this.authorNpubEl = npubEl;

    return wrapper;
  }

  buildMetaRow() {
    const row = this.document.createElement("div");
    row.classList.add("player-modal__similar-card-meta");
    row.style.minWidth = "0";

    const timeEl = this.document.createElement("time");
    timeEl.classList.add("player-modal__similar-card-timestamp");
    if (this.postedAt !== null) {
      try {
        const iso = new Date(this.postedAt * 1000).toISOString();
        timeEl.setAttribute("datetime", iso);
        timeEl.title = new Date(this.postedAt * 1000).toLocaleString();
      } catch {
        /* noop */
      }
    }
    timeEl.textContent = this.timeAgo || "";
    row.appendChild(timeEl);
    this.timeEl = timeEl;

    const shouldShowViews = Boolean(this.pointerInfo?.key);
    if (shouldShowViews) {
      const separator = this.document.createElement("span");
      separator.classList.add("player-modal__similar-card-separator");
      separator.setAttribute("aria-hidden", "true");
      separator.textContent = "•";
      row.appendChild(separator);
    }

    const viewEl = this.document.createElement("span");
    viewEl.classList.add("player-modal__similar-card-views", "view-count-text");
    viewEl.dataset.viewCount = "";
    viewEl.textContent = "– views";
    if (this.pointerInfo?.key) {
      viewEl.dataset.viewPointer = this.pointerInfo.key;
    }
    row.appendChild(viewEl);
    this.viewCountEl = viewEl;

    return row;
  }

  applyPointerDatasets() {
    if (!this.root || !this.pointerInfo) {
      return;
    }

    const { key, pointer } = this.pointerInfo;
    if (key) {
      this.root.dataset.pointerKey = key;
    }
    if (Array.isArray(pointer)) {
      const [type, value, relay] = pointer;
      if (typeof type === "string" && type) {
        this.root.dataset.pointerType = type;
      }
      if (typeof value === "string" && value) {
        this.root.dataset.pointerValue = value;
      }
      if (typeof relay === "string" && relay) {
        this.root.dataset.pointerRelay = relay;
      }
    }
  }

  bindEvents() {
    const MouseEventCtor = this.window?.MouseEvent || globalThis.MouseEvent;
    const handler = (event) => {
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

      event.preventDefault?.();
      event.stopPropagation?.();

      this.callbacks.onPlay({ event, video: this.video, card: this });
    };

    [this.mediaLinkEl, this.titleEl].forEach((el) => {
      if (!el) {
        return;
      }
      el.addEventListener("click", handler);
    });
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
      style.setProperty(
        "--similar-card-thumb-url",
        `url("${escaped}")`
      );
    } else {
      style.removeProperty("--similar-card-thumb-url");
    }
  }
}
