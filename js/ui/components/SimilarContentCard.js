import { normalizeDesignSystemContext } from "../../designSystem.js";
import { formatShortNpub } from "../../utils/formatters.js";
import { sanitizeProfileMediaUrl } from "../../utils/profileMedia.js";
import {
  getModerationOverrideActionLabels,
  normalizeVideoModerationContext,
} from "../moderationUiHelpers.js";
import { buildModerationBadgeText } from "../moderationCopy.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DEFAULT_PROFILE_AVATAR = "assets/svg/default-profile.svg";
let similarCardIdCounter = 0;
const similarCardStyleRegistry = new WeakMap();

function getSimilarCardStyleState(doc) {
  if (!doc || typeof doc.createElement !== "function") {
    return null;
  }
  const existing = similarCardStyleRegistry.get(doc);
  if (existing) {
    return existing;
  }
  let styleNode = doc.getElementById?.("similarContentCardStyles") || null;
  if (!(styleNode instanceof HTMLStyleElement)) {
    styleNode = doc.createElement("style");
    styleNode.id = "similarContentCardStyles";
    doc.head?.appendChild(styleNode);
  }
  const state = {
    styleNode,
    rules: new Map(),
  };
  similarCardStyleRegistry.set(doc, state);
  return state;
}

function updateSimilarCardBackdrop(doc, cardId, url) {
  const state = getSimilarCardStyleState(doc);
  if (!state || !cardId) {
    return;
  }

  if (url) {
    state.rules.set(
      cardId,
      `[data-similar-card-id="${cardId}"] { --similar-card-thumb-url: url("${url}"); }`,
    );
  } else {
    state.rules.delete(cardId);
  }

  state.styleNode.textContent = [...state.rules.values()].join("\n");
}

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

    this.callbacks = {
      onPlay: null,
      onModerationOverride: null,
      onModerationBlock: null,
      onModerationHide: null,
    };

    this.root = null;
    this.cardStyleId = "";
    this.mediaLinkEl = null;
    this.thumbnailEl = null;
    this.contentEl = null;
    this.titleEl = null;
    this.avatarEl = null;
    this.authorNameEl = null;
    this.authorNpubEl = null;
    this.timeEl = null;
    this.viewCountEl = null;
    this.discussionCountEl = null;

    this.moderationBadgeEl = null;
    this.moderationBadgeLabelEl = null;
    this.moderationBadgeTextEl = null;
    this.moderationActionsContainer = null;
    this.moderationActionButton = null;
    this.moderationActionButtonMode = "";
    this.moderationBlockButton = null;
    this.boundShowAnywayHandler = (event) => this.handleShowAnywayClick(event);
    this.boundModerationHideHandler = (event) =>
      this.handleModerationHideClick(event);
    this.boundModerationBlockHandler = (event) =>
      this.handleModerationBlockClick(event);

    this.build();
  }

  set onPlay(fn) {
    this.callbacks.onPlay = typeof fn === "function" ? fn : null;
  }

  set onModerationOverride(fn) {
    this.callbacks.onModerationOverride = typeof fn === "function" ? fn : null;
  }

  set onModerationBlock(fn) {
    this.callbacks.onModerationBlock = typeof fn === "function" ? fn : null;
  }

  set onModerationHide(fn) {
    this.callbacks.onModerationHide = typeof fn === "function" ? fn : null;
  }

  getRoot() {
    return this.root;
  }

  getViewCountElement() {
    return this.viewCountEl;
  }

  getDiscussionCountElement() {
    return this.discussionCountEl;
  }

  closeMoreMenu() {}

  closeSettingsMenu() {}

  updateIdentity(nextIdentity = {}) {
    this.identity = this.normalizeIdentity(nextIdentity, this.identity);

    this.applyIdentityToElements();
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
      const entries = [candidate.shortNpub, baseline.shortNpub];
      let resolved = "";
      for (const entry of entries) {
        if (typeof entry !== "string") {
          continue;
        }
        const trimmed = entry.trim();
        if (trimmed) {
          resolved = trimmed;
          break;
        }
      }

      if (npub) {
        const formatted = formatShortNpub(npub);
        if (formatted) {
          resolved = formatted;
        }
      }

      return resolved;
    })();

    if (!name) {
      name = shortNpub || npub || "";
    }

    const picture = (() => {
      const entries = [
        candidate.picture,
        candidate.image,
        candidate.photo,
        baseline.picture,
        baseline.image,
        baseline.photo,
        this.video?.author?.picture,
        this.video?.creator?.picture,
        this.video?.profile?.picture,
        this.video?.authorPicture,
        this.video?.creatorPicture,
      ];

      for (const entry of entries) {
        if (typeof entry !== "string") {
          continue;
        }
        const trimmed = entry.trim();
        if (!trimmed) {
          continue;
        }
        const sanitized = sanitizeProfileMediaUrl(trimmed);
        if (sanitized) {
          return sanitized;
        }
      }

      const fallback =
        typeof baseline.picture === "string" && baseline.picture.trim()
          ? sanitizeProfileMediaUrl(baseline.picture) || baseline.picture.trim()
          : "";

      return fallback;
    })();

    const resolvedPicture = picture || DEFAULT_PROFILE_AVATAR;

    return { name, npub, shortNpub, pubkey, picture: resolvedPicture };
  }

  applyIdentityToElements() {
    const nameLabel =
      this.identity.name ||
      this.identity.shortNpub ||
      this.identity.npub ||
      "";
    const npubLabel = this.identity.shortNpub || this.identity.npub || "";

    if (this.authorNameEl) {
      this.authorNameEl.textContent = nameLabel;
      if (this.identity.pubkey) {
        this.authorNameEl.dataset.pubkey = this.identity.pubkey;
      } else if (this.authorNameEl.dataset?.pubkey) {
        delete this.authorNameEl.dataset.pubkey;
      }
    }

    if (this.authorNpubEl) {
      this.authorNpubEl.textContent = npubLabel;

      const hasNpub = Boolean(npubLabel);
      const normalizedName = nameLabel.trim().toLowerCase();
      const normalizedNpub = npubLabel.trim().toLowerCase();
      const isDuplicate =
        hasNpub && normalizedName && normalizedName === normalizedNpub;

      this.authorNpubEl.hidden = !hasNpub || isDuplicate;
      this.authorNpubEl.setAttribute(
        "aria-hidden",
        !hasNpub || isDuplicate ? "true" : "false",
      );

      if (this.identity.npub && !isDuplicate) {
        this.authorNpubEl.setAttribute("title", this.identity.npub);
      } else {
        this.authorNpubEl.removeAttribute("title");
      }

      if (this.identity.npub) {
        this.authorNpubEl.dataset.npub = this.identity.npub;
      } else if (this.authorNpubEl.dataset?.npub) {
        delete this.authorNpubEl.dataset.npub;
      }

      const resolvedPubkey =
        this.identity.pubkey ||
        (typeof this.video?.pubkey === "string" ? this.video.pubkey.trim() : "");

      if (resolvedPubkey) {
        this.authorNpubEl.dataset.pubkey = resolvedPubkey;
      } else if (this.authorNpubEl.dataset?.pubkey) {
        delete this.authorNpubEl.dataset.pubkey;
      }
    }

    if (this.avatarEl) {
      const picture = this.identity.picture || DEFAULT_PROFILE_AVATAR;
      if (this.avatarEl.getAttribute("src") !== picture) {
        this.avatarEl.src = picture;
      }

      const altLabel =
        nameLabel || this.identity.shortNpub || this.identity.npub || "Channel";
      this.avatarEl.alt = `${altLabel}'s avatar`;

      if (this.identity.pubkey) {
        this.avatarEl.dataset.pubkey = this.identity.pubkey;
      } else if (this.avatarEl.dataset?.pubkey) {
        delete this.avatarEl.dataset.pubkey;
      }
    }
  }

  build() {
    // Modified: Ensure 'group' class for hover effects
    const root = this.document.createElement("article");
    root.classList.add("player-modal__similar-card", "card", "group");
    root.dataset.component = "similar-content-card";
    root.dataset.index = String(this.index);
    if (this.video.id) {
      root.dataset.videoId = this.video.id;
    }
    similarCardIdCounter += 1;
    this.cardStyleId = `similar-card-${similarCardIdCounter}`;
    root.dataset.similarCardId = this.cardStyleId;
    const dsMode = this.designSystem?.getMode?.();
    if (dsMode) {
      root.setAttribute("data-ds", dsMode);
    }

    this.root = root;
    this.root.__bitvidSimilarContentCard = this;

    const media = this.buildMediaSection();
    const content = this.buildContentSection();

    if (media) {
      root.appendChild(media);
    }
    if (content) {
      root.appendChild(content);
    }

    this.refreshModerationUi();
    this.applyPointerDatasets();
    this.bindEvents();
  }

  buildMediaSection() {
    const anchor = this.document.createElement("a");
    anchor.classList.add(
      "player-modal__similar-card-media",
      "block",
      "relative",
      "overflow-hidden",
      "rounded"
    );
    anchor.href = this.shareUrl;
    anchor.setAttribute("data-primary-action", "play");

    const thumbnail = this.buildThumbnail();
    if (thumbnail) {
      anchor.appendChild(thumbnail);
    }

    this.mediaLinkEl = anchor;
    return anchor;
  }

  getModerationContext() {
    return normalizeVideoModerationContext(this.video?.moderation);
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

  createModerationOverrideButton() {
    const { text: label, ariaLabel } = getModerationOverrideActionLabels({
      overrideActive: false,
    });
    const button = this.document.createElement("button");
    button.classList.add(
      "moderation-badge__action",
      "flex-shrink-0",
      "text-xs",
      "py-1",
      "px-2"
    );
    button.type = "button";
    button.dataset.moderationAction = "override";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", ariaLabel);
    button.textContent = "Show";
    button.addEventListener("click", this.boundShowAnywayHandler);
    // Explicit pointer events since container is none
    button.style.pointerEvents = "auto";
    return button;
  }

  createModerationHideButton() {
    const { text: label, ariaLabel } = getModerationOverrideActionLabels({
      overrideActive: true,
    });
    const button = this.document.createElement("button");
    button.classList.add(
      "moderation-badge__action",
      "flex-shrink-0",
      "text-xs",
      "py-1",
      "px-2"
    );
    button.type = "button";
    button.dataset.moderationAction = "hide";
    button.setAttribute("aria-label", ariaLabel);
    button.textContent = "Hide";
    button.addEventListener("click", this.boundModerationHideHandler);
    button.style.pointerEvents = "auto";
    return button;
  }

  createModerationBlockButton() {
    const button = this.document.createElement("button");
    button.classList.add(
      "moderation-badge__action",
      "flex-shrink-0",
      "text-xs",
      "py-1",
      "px-2"
    );
    button.type = "button";
    button.dataset.moderationAction = "block";
    button.textContent = "Block";
    button.addEventListener("click", this.boundModerationBlockHandler);
    button.style.pointerEvents = "auto";
    return button;
  }

  handleShowAnywayClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (this.moderationActionButton) {
      this.moderationActionButton.disabled = true;
      this.moderationActionButton.setAttribute("aria-busy", "true");
    }

    if (!this.callbacks.onModerationOverride) {
      if (this.moderationActionButton) {
        this.moderationActionButton.disabled = false;
        this.moderationActionButton.removeAttribute("aria-busy");
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
      if (this.moderationActionButton) {
        this.moderationActionButton.disabled = false;
        this.moderationActionButton.removeAttribute("aria-busy");
      }
      return;
    }

    Promise.resolve(result).then((handled) => {
      if (handled !== false) {
        this.refreshModerationUi();
      } else if (this.moderationActionButton) {
        this.moderationActionButton.disabled = false;
        this.moderationActionButton.removeAttribute("aria-busy");
      }
    });
  }

  handleModerationHideClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (this.moderationActionButton) {
      this.moderationActionButton.disabled = true;
      this.moderationActionButton.setAttribute("aria-busy", "true");
    }

    if (!this.callbacks.onModerationHide) {
      if (this.moderationActionButton) {
        this.moderationActionButton.disabled = false;
        this.moderationActionButton.removeAttribute("aria-busy");
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
      if (this.moderationActionButton) {
        this.moderationActionButton.disabled = false;
        this.moderationActionButton.removeAttribute("aria-busy");
      }
      return;
    }

    Promise.resolve(result).then((handled) => {
      if (handled !== false) {
        this.refreshModerationUi();
      } else if (this.moderationActionButton) {
        this.moderationActionButton.disabled = false;
        this.moderationActionButton.removeAttribute("aria-busy");
      }
    });
  }

  handleModerationBlockClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (this.moderationBlockButton) {
      this.moderationBlockButton.disabled = true;
      this.moderationBlockButton.setAttribute("aria-busy", "true");
    }

    if (!this.callbacks.onModerationBlock) {
      if (this.moderationBlockButton) {
        this.moderationBlockButton.disabled = false;
        this.moderationBlockButton.removeAttribute("aria-busy");
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
      if (this.moderationBlockButton) {
        this.moderationBlockButton.disabled = false;
        this.moderationBlockButton.removeAttribute("aria-busy");
      }
      return;
    }

    Promise.resolve(result).then((handled) => {
      if (handled !== false) {
        this.refreshModerationUi();
      } else if (this.moderationBlockButton) {
        this.moderationBlockButton.disabled = false;
        this.moderationBlockButton.removeAttribute("aria-busy");
      }
    });
  }

  buildModerationBadge(context = this.getModerationContext()) {
    if (!context.shouldShow || !context.trustedMuted) {
      this.moderationBadgeEl = null;
      this.moderationActionsContainer = null;
      this.moderationActionButton = null;
      this.moderationActionButtonMode = "";
      this.moderationBlockButton = null;
      return null;
    }

    const badge = this.document.createElement("div");
    badge.className = "moderation-badge moderation-badge--interactive opacity-95";
    badge.dataset.variant = context.overrideActive ? "neutral" : "warning";
    badge.dataset.moderationBadge = "true";
    badge.dataset.moderationState = context.overrideActive
      ? "override"
      : "trusted-mute";

    // Allow interaction with children
    badge.style.pointerEvents = "auto";

    const label = this.document.createElement("span");
    label.className = "moderation-badge__label inline-flex items-center gap-xs";

    const iconWrapper = this.document.createElement("span");
    iconWrapper.className = "moderation-badge__icon";
    iconWrapper.setAttribute("aria-hidden", "true");

    const svg = this.document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("focusable", "false");
    svg.classList.add("moderation-badge__icon-mark");

    const path = this.document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("fill", "currentColor");

    if (context.overrideActive) {
      path.setAttribute("d", "M10 18a8 8 0 100-16 8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L9 11.94l-1.72-1.72a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l3.25-3.25z");
    } else {
      path.setAttribute("d", "M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.75a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 8.5a1 1 0 100-2 1 1 0 000 2z");
    }

    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("clip-rule", "evenodd");

    svg.appendChild(path);
    iconWrapper.appendChild(svg);
    label.appendChild(iconWrapper);

    const text = this.document.createElement("span");
    text.className = "moderation-badge__text text-xs";
    text.textContent = "Blocked by trusted";

    label.appendChild(text);
    badge.appendChild(label);

    const actions = this.document.createElement("div");
    actions.className = "moderation-badge__actions flex items-center gap-1 mt-1";

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
    }

    if (this.shouldShowModerationBlockButton(context)) {
      const blockButton = this.createModerationBlockButton();
      actions.appendChild(blockButton);
      this.moderationBlockButton = blockButton;
    }

    if (actions.childElementCount > 0) {
      badge.appendChild(actions);
      this.moderationActionsContainer = actions;
    }

    this.moderationBadgeEl = badge;
    return badge;
  }

  refreshModerationUi() {
    const context = this.getModerationContext();

    if (this.moderationBadgeEl) {
      this.moderationBadgeEl.remove();
      this.moderationBadgeEl = null;
    }
    this.moderationActionsContainer = null;
    this.moderationActionButton = null;
    this.moderationActionButtonMode = "";
    this.moderationBlockButton = null;

    // Apply blurring class if needed
    if (this.thumbnailEl) {
      const shouldBlur =
        (this.shouldMaskNsfwForOwner ||
          this.video?.moderation?.blurThumbnail) &&
        !context.overrideActive;

      if (shouldBlur) {
        this.thumbnailEl.dataset.thumbnailState = "blurred";
        this.thumbnailEl.classList.add("blur-xl");
        // Force blur style in case class utility is missing or overridden,
        // and clear the backdrop so the sharp background doesn't show through.
        // Scale up to hide feathered edges of the blur.
        this.thumbnailEl.style.filter = "blur(24px)";
        this.thumbnailEl.style.transform = "scale(1.2)";
        this.setCardBackdropImage("");
      } else {
        delete this.thumbnailEl.dataset.thumbnailState;
        this.thumbnailEl.classList.remove("blur-xl");
        this.thumbnailEl.style.filter = "";
        this.thumbnailEl.style.transform = "";
        // Restore backdrop if src is available
        if (this.thumbnailEl.src) {
          this.setCardBackdropImage(this.thumbnailEl.src);
        }
      }
    }

    // Check specifically for muted/blurred state where we want the overlay
    if (context.shouldShow && context.trustedMuted) {
      if (!this.mediaLinkEl) return;

      const badge = this.buildModerationBadge(context);
      if (badge) {
        const container = this.document.createElement("div");
        container.className =
          "absolute inset-0 flex flex-col items-center justify-center p-2 z-10 pointer-events-none";
        container.appendChild(badge);

        this.mediaLinkEl.appendChild(container);
        this.moderationBadgeEl = container;
      }
    }
  }

  buildThumbnail() {
    const img = this.document.createElement("img");
    img.decoding = "async";
    img.loading = "lazy";
    img.alt = this.video.title || "";
    img.dataset.videoThumbnail = "true";

    // Modified: Add transition classes for hover zoom
    img.classList.add(
      "transition-transform",
      "duration-300",
      "ease-out",
      "group-hover:scale-105"
    );

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
      img.classList.add("blur-xl");
      // Pre-apply style to avoid flash and crop edges
      img.style.filter = "blur(24px)";
      img.style.transform = "scale(1.2)";
    }

    const handleLoad = () => {
      const currentSrc = img.currentSrc || img.src || "";
      if (!currentSrc) {
        return;
      }

      // If currently blurred, do not restore the backdrop to avoid transparency bleed-through.
      const isBlurred = img.dataset.thumbnailState === "blurred";

      const fallbackAttr =
        (typeof img.dataset.fallbackSrc === "string"
          ? img.dataset.fallbackSrc.trim()
          : "") ||
        fallbackSrc ||
        "";
      const isFallback =
        !!fallbackAttr &&
        (currentSrc === fallbackAttr || currentSrc.endsWith(fallbackAttr));

      if (!isFallback) {
        if (isBlurred) {
          this.setCardBackdropImage("");
        } else {
          this.setCardBackdropImage(currentSrc);
        }
      } else if (fallbackAttr) {
        if (isBlurred) {
          this.setCardBackdropImage("");
        } else {
          this.setCardBackdropImage(fallbackAttr);
        }
      }

      if (thumbnailUrl && !isFallback && this.thumbnailCache) {
        this.thumbnailCache.set(this.video.id, thumbnailUrl);
      }
    };

    const handleError = () => {
      const fallbackAttr =
        (typeof img.dataset.fallbackSrc === "string"
          ? img.dataset.fallbackSrc.trim()
          : "") ||
        fallbackSrc ||
        "";

      // If currently blurred, do not set the backdrop.
      const isBlurred = img.dataset.thumbnailState === "blurred";

      if (fallbackAttr) {
        if (isBlurred) {
          this.setCardBackdropImage("");
        } else {
          this.setCardBackdropImage(fallbackAttr);
        }
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

    const titleLink = this.document.createElement("a");
    titleLink.classList.add("player-modal__similar-card-title");
    titleLink.href = this.shareUrl;
    titleLink.textContent = this.video.title || "Untitled";
    titleLink.title = this.video.title || "Untitled";

    const authorStack = this.buildAuthorStack();
    const metaRow = this.buildMetaRow();
    const engagement = this.buildEngagementSection();

    content.appendChild(titleLink);
    if (authorStack) {
      content.appendChild(authorStack);
    }
    if (metaRow) {
      content.appendChild(metaRow);
    }
    if (engagement) {
      content.appendChild(engagement);
    }

    this.contentEl = content;
    this.titleEl = titleLink;
    return content;
  }

  buildAuthorStack() {
    const wrapper = this.document.createElement("div");
    wrapper.classList.add("player-modal__similar-card-author");

    const textWrapper = this.document.createElement("span");
    textWrapper.classList.add("player-modal__similar-card-author-meta");

    const nameEl = this.document.createElement("span");
    nameEl.classList.add("author-name", "player-modal__similar-card-author-name");
    textWrapper.appendChild(nameEl);

    // Removed npubEl appending here to simplify visual noise in compact card
    // but keeping element reference if needed for logic
    const npubEl = this.document.createElement("span");
    npubEl.classList.add("author-npub", "player-modal__similar-card-author-npub");
    // textWrapper.appendChild(npubEl);

    // Reordered: Content -> Meta (Avatar logic removed from stack to clean up UI,
    // or kept minimal if desired. For now, we keep structure but can style via CSS order if needed)

    // Actually, keeping the avatar structure but CSS will handle sizing/layout
    const avatarWrapper = this.document.createElement("span");
    avatarWrapper.classList.add("player-modal__similar-card-avatar");

    const avatarImg = this.document.createElement("img");
    avatarImg.classList.add("player-modal__similar-card-avatar-img");
    avatarImg.decoding = "async";
    avatarImg.loading = "lazy";
    avatarImg.alt = "";
    avatarWrapper.appendChild(avatarImg);

    // Append avatar then text
    wrapper.appendChild(textWrapper);

    // Note: To match modern style, we might want text first or no avatar.
    // But let's keep avatar for now but maybe hide it via CSS if needed,
    // or just show name.
    // Let's re-append avatar if we want it visible
    // wrapper.appendChild(avatarWrapper);

    // Let's stick to the previous logical structure but rely on CSS flex order or just
    // simplified HTML order:
    // [Name]
    // [Meta]

    // Cleaning up: We want Title -> Name -> Meta
    // This wrapper is for the "Author" line.

    // Let's clear wrapper and re-append in clean order
    while (wrapper.firstChild) { wrapper.removeChild(wrapper.firstChild); }

    wrapper.appendChild(textWrapper);

    // We preserve refs
    this.avatarEl = avatarImg;
    this.authorNameEl = nameEl;
    this.authorNpubEl = npubEl;

    this.applyIdentityToElements();

    return wrapper;
  }

  buildMetaRow() {
    const row = this.document.createElement("div");
    row.classList.add("player-modal__similar-card-meta");

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

    return row;
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
    const hasPointer = this.pointerInfo && this.pointerInfo.key;
    const hasDiscussion =
      this.video.enableComments !== false &&
      (typeof this.video.discussionCount === "number" ||
        (typeof this.video.discussionCount === "string" &&
          this.video.discussionCount.trim()));

    if (!hasPointer && !hasDiscussion) {
      return null;
    }

    const container = this.document.createElement("div");
    container.classList.add(
      "flex",
      "items-center",
      "gap-4",
      "text-xs",
      "text-muted-strong",
      "mt-1.5",
      "video-card__engagement" // Reuse this class for consistent styling if global, otherwise it's just a marker
    );
    // Add specific class for scoping if needed, but Tailwind classes usually suffice.

    // Views
    if (hasPointer) {
      const wrapper = this.document.createElement("div");
      wrapper.classList.add("flex", "items-center", "gap-1.5");
      wrapper.setAttribute("title", "Views");

      const icon = this.createEyeIcon(["w-3.5", "h-3.5"]);
      wrapper.appendChild(icon);

      const view = this.document.createElement("span");
      view.classList.add("view-count-text");
      view.textContent = "–";
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
        const wrapper = this.document.createElement("div");
        wrapper.classList.add("flex", "items-center", "gap-1.5");
        wrapper.dataset.discussionCount = this.video.id;
        wrapper.dataset.countState = "ready";
        wrapper.setAttribute("title", "Comments");

        const icon = this.createMessageIcon(["w-3.5", "h-3.5"]);
        wrapper.appendChild(icon);

        const displayValue = initialCount.toLocaleString();

        const valueEl = this.document.createElement("span");
        valueEl.textContent = displayValue;
        valueEl.dataset.discussionCountValue = "";

        wrapper.appendChild(valueEl);
        container.appendChild(wrapper);

        this.discussionCountEl = wrapper;
      }
    }

    return container;
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
    if (!this.root || !this.cardStyleId) {
      return;
    }

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
      updateSimilarCardBackdrop(this.document, this.cardStyleId, escaped);
    } else {
      updateSimilarCardBackdrop(this.document, this.cardStyleId, "");
    }
  }
}
