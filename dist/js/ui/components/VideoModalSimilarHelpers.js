
import {
  subscribeToVideoViewCount,
  formatViewCount,
} from "../../viewCounter.js";
import { sanitizeProfileMediaUrl } from "../../utils/profileMedia.js";
import { HEX64_REGEX } from "../../utils/hex.js";

/**
 * Derives a pointer key from input which can be an array, object, or string.
 * @param {string|object|Array} pointer - The pointer to derive from.
 * @returns {string} The derived pointer key.
 */
export function derivePointerKeyFromInput(pointer) {
  if (!pointer) {
    return "";
  }
  if (Array.isArray(pointer)) {
    const [type, value] = pointer;
    if (typeof value === "string" && value.trim()) {
      const normalizedType = type === "a" ? "a" : "e";
      return `${normalizedType}:${value.trim()}`;
    }
    return "";
  }
  if (typeof pointer === "object") {
    if (typeof pointer.key === "string" && pointer.key.trim()) {
      return pointer.key.trim();
    }
    if (
      typeof pointer.pointerKey === "string" &&
      pointer.pointerKey.trim()
    ) {
      return pointer.pointerKey.trim();
    }
    if (
      typeof pointer.type === "string" &&
      typeof pointer.value === "string" &&
      pointer.value.trim()
    ) {
      const normalizedType = pointer.type === "a" ? "a" : "e";
      return `${normalizedType}:${pointer.value.trim()}`;
    }
    if (Array.isArray(pointer.tag)) {
      return derivePointerKeyFromInput(pointer.tag);
    }
    return "";
  }
  if (typeof pointer === "string") {
    const trimmed = pointer.trim();
    if (!trimmed) {
      return "";
    }
    if (/^(?:naddr|nevent)/i.test(trimmed)) {
      return "";
    }
    if (trimmed.includes(":")) {
      return trimmed;
    }
    return `e:${trimmed}`;
  }
  return "";
}

export function formatViewCountLabel(total) {
  const numeric = Number.isFinite(total) ? Math.max(0, Number(total)) : 0;
  return formatViewCount(numeric);
}

export function getViewCountLabel(total, status, partial) {
  if (Number.isFinite(total)) {
    const label = formatViewCountLabel(Number(total));
    return partial ? `${label} (partial)` : label;
  }
  if (status === "hydrating") {
    return "Loading…";
  }
  return "–";
}

/**
 * Builds identity information for a similar video card.
 * @param {object} video - The video object.
 * @param {object} overrides - Overrides for identity properties.
 * @param {object} options - Options including helpers and default avatar.
 * @param {object} options.helpers - Helper methods (safeEncodeNpub, formatShortNpub).
 * @param {string} options.defaultAvatar - Path to default avatar.
 * @returns {object} Identity object {name, npub, shortNpub, pubkey, picture}.
 */
export function buildSimilarCardIdentity(video, overrides, { helpers, defaultAvatar } = {}) {
  const override = overrides && typeof overrides === "object" ? overrides : {};

  const pubkeyCandidates = [
    override.pubkey,
    video?.pubkey,
    video?.author?.pubkey,
    video?.creator?.pubkey,
  ];
  let pubkey = "";
  for (const candidate of pubkeyCandidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed) {
      pubkey = trimmed;
      break;
    }
  }

  const npubCandidates = [
    override.npub,
    video?.npub,
    video?.authorNpub,
    video?.creatorNpub,
    video?.profile?.npub,
  ];
  let npub = "";
  for (const candidate of npubCandidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed) {
      npub = trimmed;
      break;
    }
  }

  if (!npub && pubkey && helpers) {
    try {
      const encoded = helpers.safeEncodeNpub(pubkey);
      if (typeof encoded === "string" && encoded.trim()) {
        npub = encoded.trim();
      }
    } catch {
      /* noop */
    }
  }

  const shortNpubCandidates = [override.shortNpub, video?.shortNpub];
  let shortNpub = "";
  for (const candidate of shortNpubCandidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed) {
      shortNpub = trimmed;
      break;
    }
  }

  if (!shortNpub && npub && helpers) {
    shortNpub = helpers.formatShortNpub(npub) || npub;
  }

  const nameCandidates = [
    override.name,
    override.displayName,
    override.username,
    video?.authorName,
    video?.creatorName,
    video?.creator?.name,
    video?.author?.name,
    video?.profile?.display_name,
    video?.profile?.name,
    video?.profile?.username,
  ];

  let name = "";
  for (const candidate of nameCandidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    if (HEX64_REGEX.test(trimmed)) {
      continue;
    }
    name = trimmed;
    break;
  }

  if (!name && shortNpub) {
    name = shortNpub;
  }
  if (!name && npub) {
    name = npub;
  }

  const pictureCandidates = [
    override.picture,
    override.image,
    override.photo,
    video?.picture,
    video?.authorPicture,
    video?.creatorPicture,
    video?.author?.picture,
    video?.creator?.picture,
    video?.profile?.picture,
  ];

  let picture = "";
  for (const candidate of pictureCandidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    const sanitized = sanitizeProfileMediaUrl(trimmed);
    if (sanitized) {
      picture = sanitized;
      break;
    }
  }

  if (!picture && pubkey) {
    const robohash = `https://robohash.org/${pubkey}`;
    picture = sanitizeProfileMediaUrl(robohash) || robohash;
  }

  if (!picture) {
    const fallbackAvatar =
      typeof defaultAvatar === "string" &&
      defaultAvatar.trim()
        ? defaultAvatar.trim()
        : "assets/svg/default-profile.svg";
    picture = sanitizeProfileMediaUrl(fallbackAvatar) || fallbackAvatar;
  }

  return {
    name,
    npub,
    shortNpub,
    pubkey,
    picture,
  };
}

/**
 * Prepares a similar video card with event listeners and menu adjustments.
 * @param {HTMLElement} card - The card element.
 * @param {object} meta - Metadata including pointerInfo, shareUrl, video.
 * @param {number} index - Index in the list.
 * @param {object} options - Dependencies.
 * @param {function} options.dispatchCallback - Callback to dispatch events (type, detail).
 */
export function prepareSimilarVideoCard(card, meta, index, { dispatchCallback }) {
  if (!card) {
    return;
  }

  const pointerInfo = meta?.pointerInfo || null;
  const shareUrl = typeof meta?.shareUrl === "string" ? meta.shareUrl : "#";
  const fallbackVideo = meta?.video || null;

  card.onPlay = ({ event, video: selectedVideo, card: sourceCard }) => {
    if (dispatchCallback) {
      dispatchCallback("similar:select", {
        event,
        video: selectedVideo || fallbackVideo,
        card: sourceCard || card,
        index,
        pointerInfo: pointerInfo,
        shareUrl,
      });
    }
  };

  if (card.moreMenuButton) {
    const button = card.moreMenuButton;
    const parent = button.parentElement;
    if (parent) {
      parent.removeChild(button);
      if (!parent.childElementCount) {
        parent.remove();
      }
    } else {
      button.remove();
    }
    card.moreMenuButton = null;
  }
}

/**
 * Attaches a view counter to a similar video card.
 * @param {HTMLElement} card - The card element.
 * @param {object} pointerInfo - Pointer info.
 * @param {object} options - Dependencies.
 * @param {object} options.logger - Logger object (with .log or .warn).
 * @returns {object|null} The subscription token or null.
 */
export function attachSimilarCardViewCounter(card, pointerInfo, { logger } = {}) {
  if (!card || typeof card.getViewCountElement !== "function") {
    return null;
  }

  const viewEl = card.getViewCountElement();
  if (!viewEl) {
    return null;
  }

  if (pointerInfo?.key) {
    viewEl.dataset.viewPointer = pointerInfo.key;
  } else if (viewEl.dataset?.viewPointer) {
    delete viewEl.dataset.viewPointer;
  }

  if (!pointerInfo || !pointerInfo.pointer) {
    viewEl.textContent = "– views";
    return null;
  }

  viewEl.textContent = "Loading views…";

  try {
    const token = subscribeToVideoViewCount(
      pointerInfo.pointer,
      ({ total, status, partial }) => {
        if (!viewEl || !viewEl.isConnected) {
          return;
        }
        viewEl.textContent = getViewCountLabel(total, status, partial);
        if (partial) {
          viewEl.dataset.viewCountState = "partial";
        } else {
          viewEl.dataset.viewCountState = status;
        }
      }
    );
    return { pointer: pointerInfo.pointer, token };
  } catch (error) {
    if (logger && typeof logger.log === "function") {
      logger.log("[VideoModal] Failed to subscribe similar view counter", error);
    }
    viewEl.textContent = "– views";
    return null;
  }
}
