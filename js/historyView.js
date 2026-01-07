// js/historyView.js

import watchHistoryService from "./watchHistoryService.js";
import { nostrClient } from "./nostrClientFacade.js";
import {
  updateWatchHistoryListWithDefaultClient as updateWatchHistoryList,
} from "./nostrWatchHistoryFacade.js";
import { pointerKey, normalizePointerInput } from "./nostr/watchHistory.js";
import {
  WATCH_HISTORY_BATCH_RESOLVE,
  WATCH_HISTORY_BATCH_PAGE_SIZE
} from "./config.js";
import { getApplication } from "./applicationContext.js";
import { userLogger } from "./utils/logger.js";
import {
  normalizeVideoModerationContext,
  applyModerationContextDatasets,
  getModerationOverrideActionLabels,
} from "./ui/moderationUiHelpers.js";
import { buildModerationBadgeText } from "./ui/moderationCopy.js";
import { formatShortNpub } from "./utils/formatters.js";

export const WATCH_HISTORY_EMPTY_COPY =
  "Your watch history is empty. Watch some videos to populate this list.";

export const WATCH_HISTORY_DISABLED_COPY =
  "Watch history sync is unavailable. Connect a NIP-07 extension or log in to enable syncing.";

const WATCH_HISTORY_PRIVACY_DISMISSED_KEY =
  "bitvid:watch-history:privacy-banner-dismissed";
const DEFAULT_WATCH_HISTORY_BATCH_SIZE = 12;
const WATCH_HISTORY_BATCH_SIZE = (() => {
  const raw = Number(WATCH_HISTORY_BATCH_PAGE_SIZE);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_WATCH_HISTORY_BATCH_SIZE;
  }
  return Math.floor(raw);
})();
const FALLBACK_THUMBNAIL = "assets/svg/default-thumbnail.svg";
const FALLBACK_AVATAR = "assets/svg/default-profile.svg";
const isDevEnv =
  typeof process !== "undefined" && process?.env?.NODE_ENV !== "production";

function escapeSelector(value) {
  if (typeof value !== "string") {
    return "";
  }
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function resolveElement(selector) {
  if (!selector || typeof selector !== "string") {
    return null;
  }
  try {
    return document.querySelector(selector);
  } catch (error) {
    userLogger.warn("[historyView] Failed to query selector:", selector, error);
    return null;
  }
}

function setHidden(element, hidden) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.classList.toggle("hidden", hidden);
  if (hidden) {
    element.setAttribute("aria-hidden", "true");
  } else {
    element.removeAttribute("aria-hidden");
  }
}

function setTextContent(element, text) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.textContent = text;
}

function getAppInstance() {
  return getApplication();
}

function buildWatchHistoryFeedRuntime({
  actor,
  cursor = 0,
  forceRefresh = false,
} = {}) {
  const app = getAppInstance();
  const normalizedActor =
    typeof actor === "string" && actor.trim() ? actor.trim() : "";

  const blacklist =
    app?.blacklistedEventIds instanceof Set
      ? new Set(app.blacklistedEventIds)
      : new Set();

  const runtime = {
    blacklistedEventIds: blacklist,
    isAuthorBlocked: (pubkey) =>
      (typeof app?.isAuthorBlocked === "function" &&
        app.isAuthorBlocked(pubkey)) ||
      false,
    watchHistory: {
      actor: normalizedActor,
      cursor: Number.isFinite(cursor) ? cursor : 0,
      forceRefresh: forceRefresh === true,
    },
  };

  const preferenceSource =
    typeof app?.getHashtagPreferences === "function"
      ? app.getHashtagPreferences()
      : {};
  runtime.tagPreferences = {
    interests: Array.isArray(preferenceSource?.interests)
      ? [...preferenceSource.interests]
      : [],
    disinterests: Array.isArray(preferenceSource?.disinterests)
      ? [...preferenceSource.disinterests]
      : []
  };

  if (normalizedActor) {
    runtime.actor = normalizedActor;
  }

  return runtime;
}

function safeLocaleDate(date) {
  try {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric"
    });
  } catch (error) {
    return date.toDateString();
  }
}

function formatDayLabel(timestampSeconds) {
  if (!Number.isFinite(timestampSeconds)) {
    return "Unknown day";
  }
  const eventDate = new Date(timestampSeconds * 1000);
  if (Number.isNaN(eventDate.getTime())) {
    return "Unknown day";
  }
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const targetDay = eventDate.toDateString();
  if (targetDay === today.toDateString()) {
    return "Today";
  }
  if (targetDay === yesterday.toDateString()) {
    return "Yesterday";
  }
  return safeLocaleDate(eventDate);
}

function formatRelativeTime(timestampSeconds) {
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
    return "Unknown time";
  }
  const app = getAppInstance();
  if (app && typeof app.formatTimeAgo === "function") {
    return app.formatTimeAgo(timestampSeconds);
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const delta = Math.max(0, nowSeconds - Math.floor(timestampSeconds));
  const units = [
    { label: "year", seconds: 31536000 },
    { label: "month", seconds: 2592000 },
    { label: "week", seconds: 604800 },
    { label: "day", seconds: 86400 },
    { label: "hour", seconds: 3600 },
    { label: "minute", seconds: 60 }
  ];
  for (const unit of units) {
    const count = Math.floor(delta / unit.seconds);
    if (count >= 1) {
      return `${count} ${unit.label}${count > 1 ? "s" : ""} ago`;
    }
  }
  return "just now";
}

function computeFingerprint(items) {
  if (!Array.isArray(items) || !items.length) {
    return "";
  }
  const pieces = [];
  for (const entry of items) {
    const pointer = normalizePointerInput(entry);
    if (!pointer) {
      continue;
    }
    const key = pointerKey(pointer);
    if (!key) {
      continue;
    }
    const watchedAt = Number.isFinite(entry?.watchedAt) ? entry.watchedAt : 0;
    pieces.push(`${key}:${watchedAt}`);
  }
  return pieces.join("|");
}

function normalizeHistoryItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  const normalized = [];
  for (const candidate of rawItems) {
    const pointer = normalizePointerInput(candidate);
    if (!pointer) {
      continue;
    }
    const key = pointerKey(pointer);
    if (!key) {
      continue;
    }
    const watchedAtRaw = Number.isFinite(candidate?.watchedAt)
      ? candidate.watchedAt
      : Number.isFinite(candidate?.timestamp)
        ? candidate.timestamp
        : null;
    const watchedAt =
      watchedAtRaw !== null ? Math.max(0, Math.floor(watchedAtRaw)) : 0;
    normalized.push({
      pointer,
      pointerKey: key,
      watchedAt,
      raw: candidate
    });
  }
  normalized.sort((a, b) => {
    if (a.watchedAt !== b.watchedAt) {
      return b.watchedAt - a.watchedAt;
    }
    const createdA = Number.isFinite(a?.video?.created_at)
      ? a.video.created_at
      : 0;
    const createdB = Number.isFinite(b?.video?.created_at)
      ? b.video.created_at
      : 0;
    if (createdA !== createdB) {
      return createdB - createdA;
    }
    return a.pointerKey.localeCompare(b.pointerKey);
  });
  return normalized;
}

async function defaultRemoveHandler({
  actor,
  items,
  snapshot,
  reason = "remove-item"
} = {}) {
  const sanitized = Array.isArray(items)
    ? items
        .map((entry) => {
          const pointer = normalizePointerInput(entry?.pointer || entry);
          if (!pointer) {
            return null;
          }
          if (Number.isFinite(entry?.watchedAt)) {
            pointer.watchedAt = entry.watchedAt;
          }
          if (entry?.pointer?.session === true || entry?.session === true) {
            pointer.session = true;
          }
          return pointer;
        })
        .filter(Boolean)
    : [];
  if (typeof snapshot === "function") {
    await snapshot(sanitized, { actor, reason });
  }
  try {
    if (typeof updateWatchHistoryList === "function") {
      await updateWatchHistoryList(sanitized, {
        actorPubkey: actor,
        replace: true,
        source: reason
      });
    }
  } catch (error) {
    if (isDevEnv) {
      userLogger.warn("[historyView] Failed to update watch history list:", error);
    }
    throw error;
  }
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage || null;
  } catch (error) {
    return null;
  }
}

function readPreference(key, fallback) {
  const storage = getStorage();
  if (!storage) {
    return fallback;
  }
  try {
    const stored = storage.getItem(key);
    return stored === null ? fallback : stored;
  } catch (error) {
    return fallback;
  }
}

function writePreference(key, value) {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    if (value === null || typeof value === "undefined") {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, value);
  } catch (error) {
    if (isDevEnv) {
      userLogger.warn("[historyView] Failed to persist preference:", error);
    }
  }
}

function removeEmptyDayContainers(grid) {
  if (!(grid instanceof HTMLElement)) {
    return;
  }
  const daySections = grid.querySelectorAll("[data-history-day]");
  daySections.forEach((section) => {
    if (!(section instanceof HTMLElement)) {
      return;
    }
    const list = section.querySelector("[data-history-day-list]");
    if (list instanceof HTMLElement && list.childElementCount === 0) {
      section.remove();
    }
  });
}

function getPointerVideoId(video, pointer) {
  if (video && typeof video.id === "string" && video.id) {
    return video.id;
  }
  if (pointer?.type === "e" && typeof pointer.value === "string") {
    return pointer.value;
  }
  return "";
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const historyCardRegistry = new Map();

function sanitizeIdToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  const token = value.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return token;
}

function getHistoryCardModerationId(pointerKey) {
  const token = sanitizeIdToken(pointerKey);
  return token ? `watch-history-${token}-moderation` : "";
}

function getHistoryCardModerationState(context) {
  if (!context) {
    return "";
  }
  if (context.overrideActive) {
    return "override";
  }
  if (context.activeHidden && !context.overrideActive) {
    return "hidden";
  }
  if (context.trustedMuted) {
    return "trusted-mute";
  }
  return "blocked";
}

function shouldShowHistoryCardBlockButton(context) {
  if (!context || !context.trustedMuted) {
    return false;
  }
  if (context.activeHidden && !context.overrideActive) {
    return false;
  }
  return true;
}

function getModerationBadgeIconShape(state) {
  if (state === "override") {
    return {
      d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L9 11.94l-1.72-1.72a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l3.25-3.25z",
      fillRule: "evenodd",
      clipRule: "evenodd"
    };
  }

  return {
    d: "M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.75a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 8.5a1 1 0 100-2 1 1 0 000 2z",
    fillRule: "evenodd",
    clipRule: "evenodd"
  };
}

function updateHistoryCardBadgeIcon(svg, state) {
  if (!svg) {
    return;
  }
  svg.dataset.iconState = state;
  const path = svg.firstElementChild;
  if (!path) {
    return;
  }
  const { d, fillRule, clipRule } = getModerationBadgeIconShape(state);
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

function createHistoryCardBadgeIcon(doc, state) {
  const wrapper = doc.createElement("span");
  wrapper.className = "moderation-badge__icon";
  wrapper.setAttribute("aria-hidden", "true");
  const svg = doc.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("moderation-badge__icon-mark");
  const path = doc.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  wrapper.appendChild(svg);
  updateHistoryCardBadgeIcon(svg, state);
  return { wrapper, svg };
}

function cleanupHistoryCard(pointerKey) {
  if (!pointerKey || !historyCardRegistry.has(pointerKey)) {
    return;
  }
  const ref = historyCardRegistry.get(pointerKey);
  historyCardRegistry.delete(pointerKey);
  if (!ref || typeof ref !== "object") {
    return;
  }
  if (ref.overrideButton && typeof ref.overrideButton.removeEventListener === "function" && typeof ref.boundOverride === "function") {
    ref.overrideButton.removeEventListener("click", ref.boundOverride);
  }
  if (ref.blockButton && typeof ref.blockButton.removeEventListener === "function" && typeof ref.boundBlock === "function") {
    ref.blockButton.removeEventListener("click", ref.boundBlock);
  }
  if (ref.badgeEl && ref.badgeEl.parentNode) {
    ref.badgeEl.parentNode.removeChild(ref.badgeEl);
  }
  if (ref.hiddenContainer && ref.hiddenContainer.parentNode) {
    ref.hiddenContainer.parentNode.removeChild(ref.hiddenContainer);
  }
}

function registerHistoryCard(pointerKey, ref) {
  if (!pointerKey || !ref) {
    return;
  }
  cleanupHistoryCard(pointerKey);
  historyCardRegistry.set(pointerKey, ref);
}

function clearHistoryCardRegistry() {
  const keys = Array.from(historyCardRegistry.keys());
  keys.forEach((key) => {
    cleanupHistoryCard(key);
  });
  historyCardRegistry.clear();
}

function ensureHiddenSummaryContainer(ref) {
  const article = ref?.article;
  if (!article || typeof article.insertBefore !== "function") {
    return null;
  }
  let container = ref.hiddenContainer;
  const doc = article.ownerDocument || document;
  if (!container) {
    container = doc.createElement("div");
    container.className = "watch-history-card__hidden bv-stack bv-stack--tight p-md";
    container.dataset.moderationHiddenContainer = "true";
    container.setAttribute("role", "group");
    container.setAttribute("aria-live", "polite");
    ref.hiddenContainer = container;
  }
  container.hidden = false;
  container.removeAttribute("aria-hidden");
  if (container.parentNode !== article) {
    article.insertBefore(container, article.firstChild || null);
  }
  return container;
}

function updateHistoryCardHiddenState(ref, context) {
  const hiddenActive = Boolean(context?.activeHidden && !context?.overrideActive);
  const primary = ref.primary;
  const meta = ref.meta;

  if (hiddenActive) {
    if (primary && typeof primary.setAttribute === "function") {
      primary.setAttribute("hidden", "");
      primary.setAttribute("aria-hidden", "true");
    }
    if (meta && typeof meta.setAttribute === "function") {
      meta.setAttribute("hidden", "");
      meta.setAttribute("aria-hidden", "true");
    }
    const container = ensureHiddenSummaryContainer(ref);
    if (container) {
      const description = buildModerationBadgeText(context, { variant: "card" });
      if (description) {
        container.setAttribute("aria-label", description);
      } else {
        container.removeAttribute("aria-label");
      }
    }
  } else {
    if (primary && typeof primary.removeAttribute === "function") {
      primary.removeAttribute("hidden");
      primary.removeAttribute("aria-hidden");
    }
    if (meta && typeof meta.removeAttribute === "function") {
      meta.removeAttribute("hidden");
      meta.removeAttribute("aria-hidden");
    }
    const container = ref.hiddenContainer;
    if (container) {
      container.hidden = true;
      container.setAttribute("aria-hidden", "true");
      container.removeAttribute("aria-label");
      container.removeAttribute("aria-labelledby");
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      ref.hiddenContainer = null;
    }
  }
}

function createHistoryCardBadge(ref, context) {
  const article = ref?.article;
  const doc = (article && article.ownerDocument) || (typeof document !== "undefined" ? document : null);
  if (!doc) {
    return null;
  }
  const badge = doc.createElement("div");
  badge.className = "moderation-badge";
  badge.dataset.moderationBadge = "true";
  const label = doc.createElement("span");
  label.className = "moderation-badge__label inline-flex items-center gap-xs";
  const { wrapper, svg } = createHistoryCardBadgeIcon(doc, getHistoryCardModerationState(context));
  label.appendChild(wrapper);
  const text = doc.createElement("span");
  text.className = "moderation-badge__text";
  label.appendChild(text);
  badge.appendChild(label);
  ref.badgeEl = badge;
  ref.badgeLabelEl = label;
  ref.badgeTextEl = text;
  ref.badgeIconSvg = svg;
  ref.badgeIconWrapper = wrapper;
  if (typeof ref.boundOverride !== "function") {
    ref.boundOverride = (event) => handleHistoryCardModerationOverride(event, ref);
  }
  if (typeof ref.boundHide !== "function") {
    ref.boundHide = (event) => handleHistoryCardModerationHide(event, ref);
  }
  if (typeof ref.boundBlock !== "function") {
    ref.boundBlock = (event) => handleHistoryCardModerationBlock(event, ref);
  }
  if (!ref.overrideButton) {
    const { text: overrideLabel, ariaLabel: overrideAria } =
      getModerationOverrideActionLabels({ overrideActive: false });
    const overrideButton = doc.createElement("button");
    overrideButton.type = "button";
    overrideButton.className = "moderation-badge__action flex-shrink-0";
    overrideButton.dataset.moderationAction = "override";
    overrideButton.textContent = overrideLabel;
    overrideButton.setAttribute("aria-label", overrideAria);
    overrideButton.addEventListener("click", ref.boundOverride);
    ref.overrideButton = overrideButton;
  }
  if (!ref.hideButton) {
    const { text: restoreLabel, ariaLabel: restoreAria } =
      getModerationOverrideActionLabels({ overrideActive: true });
    const hideButton = doc.createElement("button");
    hideButton.type = "button";
    hideButton.className = "moderation-badge__action flex-shrink-0";
    hideButton.dataset.moderationAction = "hide";
    hideButton.textContent = restoreLabel;
    hideButton.setAttribute("aria-label", restoreAria);
    hideButton.addEventListener("click", ref.boundHide);
    ref.hideButton = hideButton;
  }
  if (!ref.blockButton) {
    const blockButton = doc.createElement("button");
    blockButton.type = "button";
    blockButton.className = "moderation-badge__action flex-shrink-0";
    blockButton.dataset.moderationAction = "block";
    blockButton.textContent = "Block";
    blockButton.addEventListener("click", ref.boundBlock);
    ref.blockButton = blockButton;
  }
  return badge;
}

function updateHistoryCardBadge(ref, context) {
  const hiddenActive = Boolean(context?.activeHidden && !context?.overrideActive);
  if (!context?.shouldShow) {
    if (ref.overrideButton && typeof ref.overrideButton.removeEventListener === "function" && typeof ref.boundOverride === "function") {
      ref.overrideButton.removeEventListener("click", ref.boundOverride);
    }
    if (ref.hideButton && typeof ref.hideButton.removeEventListener === "function" && typeof ref.boundHide === "function") {
      ref.hideButton.removeEventListener("click", ref.boundHide);
    }
    if (ref.blockButton && typeof ref.blockButton.removeEventListener === "function" && typeof ref.boundBlock === "function") {
      ref.blockButton.removeEventListener("click", ref.boundBlock);
    }
    if (ref.badgeEl && ref.badgeEl.parentNode) {
      ref.badgeEl.parentNode.removeChild(ref.badgeEl);
    }
    ref.badgeEl = null;
    ref.badgeLabelEl = null;
    ref.badgeTextEl = null;
    ref.badgeIconSvg = null;
    ref.badgeIconWrapper = null;
    ref.overrideButton = null;
    ref.hideButton = null;
    ref.blockButton = null;
    return;
  }

  if (!ref.badgeEl) {
    createHistoryCardBadge(ref, context);
  }

  const badge = ref.badgeEl;
  if (!badge) {
    return;
  }

  badge.dataset.variant = context.overrideActive ? "neutral" : "warning";
  const state = context.overrideActive ? "override" : getHistoryCardModerationState(context);
  badge.dataset.moderationState = state;
  if (hiddenActive && context.effectiveHideReason) {
    badge.dataset.moderationHideReason = context.effectiveHideReason;
  } else if (badge.dataset.moderationHideReason) {
    delete badge.dataset.moderationHideReason;
  }

  if (ref.badgeIconSvg) {
    updateHistoryCardBadgeIcon(ref.badgeIconSvg, state);
  }

  const textContent = buildModerationBadgeText(context, { variant: "card" });
  if (ref.badgeTextEl) {
    ref.badgeTextEl.textContent = textContent;
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
  const seen = new Set();
  for (const name of allNames) {
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueNames.push(name);
  }

  if (uniqueNames.length) {
    const hasMuted = muteNames.length > 0;
    const hasReporters = reporterNames.length > 0;
    const prefix = hasMuted && hasReporters
      ? "Muted/Reported by"
      : hasMuted
        ? "Muted by"
        : "Reported by";
    const joined = uniqueNames.join(", ");
    badge.title = `${prefix} ${joined}`;
    badge.setAttribute("aria-label", `${textContent}. ${prefix} ${joined}.`);
  } else if (textContent) {
    badge.removeAttribute("title");
    badge.setAttribute("aria-label", `${textContent}.`);
  } else {
    badge.removeAttribute("title");
    badge.removeAttribute("aria-label");
  }

  const parent = hiddenActive ? ensureHiddenSummaryContainer(ref) : ref.badgeMount;
  if (parent && badge.parentNode !== parent) {
    if (badge.parentNode) {
      badge.parentNode.removeChild(badge);
    }
    parent.appendChild(badge);
  }

  if (!context.overrideActive && context.allowOverride && ref.overrideButton) {
    const { text: overrideLabel, ariaLabel: overrideAria } =
      getModerationOverrideActionLabels({ overrideActive: false });
    ref.overrideButton.textContent = overrideLabel;
    ref.overrideButton.setAttribute("aria-label", overrideAria);
    if (ref.overrideButton.parentNode !== badge) {
      badge.appendChild(ref.overrideButton);
    }
    ref.overrideButton.disabled = false;
    ref.overrideButton.removeAttribute("aria-busy");
  } else if (ref.overrideButton && ref.overrideButton.parentNode === badge) {
    badge.removeChild(ref.overrideButton);
  }

  if (context.overrideActive && ref.hideButton) {
    const { text: restoreLabel, ariaLabel: restoreAria } =
      getModerationOverrideActionLabels({ overrideActive: true });
    ref.hideButton.textContent = restoreLabel;
    ref.hideButton.setAttribute("aria-label", restoreAria);
    if (ref.hideButton.parentNode !== badge) {
      badge.appendChild(ref.hideButton);
    }
    ref.hideButton.disabled = false;
    ref.hideButton.removeAttribute("aria-busy");
  } else if (ref.hideButton && ref.hideButton.parentNode === badge) {
    badge.removeChild(ref.hideButton);
  }

  if (shouldShowHistoryCardBlockButton(context) && ref.blockButton) {
    if (ref.blockButton.parentNode !== badge) {
      badge.appendChild(ref.blockButton);
    }
    ref.blockButton.disabled = false;
    ref.blockButton.removeAttribute("aria-busy");
  } else if (ref.blockButton && ref.blockButton.parentNode === badge) {
    badge.removeChild(ref.blockButton);
  }
}

function updateHistoryCardAria(ref) {
  const badge = ref.badgeEl;
  const badgeId = badge ? getHistoryCardModerationId(ref.pointerKey) : "";
  if (badge) {
    if (badgeId) {
      badge.id = badgeId;
    } else {
      badge.removeAttribute("id");
    }
  }

  const targets = [
    ref.thumbnailLink,
    ref.titleLink,
    ref.playButton,
    ref.channelButton,
    ref.creatorNameButton,
    ref.avatarButton
  ].filter((el) => el && typeof el.getAttribute === "function");

  targets.forEach((el) => {
    const existing = el.getAttribute("aria-describedby") || "";
    const tokens = existing.split(/\s+/).filter(Boolean);
    if (ref.badgeId) {
      for (let index = tokens.length - 1; index >= 0; index -= 1) {
        if (tokens[index] === ref.badgeId) {
          tokens.splice(index, 1);
        }
      }
    }
    if (badgeId) {
      tokens.push(badgeId);
    }
    if (tokens.length) {
      el.setAttribute("aria-describedby", Array.from(new Set(tokens)).join(" "));
    } else {
      el.removeAttribute("aria-describedby");
    }
  });

  if (ref.overrideButton) {
    if (badgeId) {
      ref.overrideButton.setAttribute("aria-describedby", badgeId);
    } else {
      ref.overrideButton.removeAttribute("aria-describedby");
    }
  }

  if (ref.hideButton) {
    if (badgeId) {
      ref.hideButton.setAttribute("aria-describedby", badgeId);
    } else {
      ref.hideButton.removeAttribute("aria-describedby");
    }
  }

  if (ref.blockButton) {
    if (badgeId) {
      ref.blockButton.setAttribute("aria-describedby", badgeId);
    } else {
      ref.blockButton.removeAttribute("aria-describedby");
    }
  }

  if (ref.hiddenContainer) {
    if (badgeId) {
      ref.hiddenContainer.setAttribute("aria-labelledby", badgeId);
    } else {
      ref.hiddenContainer.removeAttribute("aria-labelledby");
    }
  }

  ref.badgeId = badgeId;
}

function applyHistoryCardModeration(ref, context) {
  if (!ref) {
    return;
  }
  const normalizedContext = context || normalizeVideoModerationContext(ref.video?.moderation);
  applyModerationContextDatasets(normalizedContext, {
    root: ref.article,
    thumbnail: ref.thumbnailInner || ref.thumbnailLink,
    avatar: ref.avatarButton
  });
  updateHistoryCardHiddenState(ref, normalizedContext);
  updateHistoryCardBadge(ref, normalizedContext);
  updateHistoryCardAria(ref);
}

function handleHistoryCardModerationOverride(event, ref) {
  if (event) {
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    if (typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
  }

  const button = ref.overrideButton;
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }

  const video = ref.video;
  if (!video || typeof video !== "object" || !video.id) {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
    return;
  }

  const app = getAppInstance();
  let result;
  try {
    if (typeof app?.handleModerationOverride === "function") {
      result = app.handleModerationOverride({ video });
    } else {
      const doc = (ref.article && ref.article.ownerDocument) || (typeof document !== "undefined" ? document : null);
      if (doc && typeof doc.dispatchEvent === "function") {
        doc.dispatchEvent(
          new CustomEvent("video:moderation-override", { detail: { video } })
        );
      }
      result = true;
    }
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
    if (isDevEnv) {
      userLogger.warn("[historyView] Moderation override handler threw:", error);
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
      const context = normalizeVideoModerationContext(ref.video?.moderation);
      applyHistoryCardModeration(ref, context);
    })
    .catch((error) => {
      if (isDevEnv) {
        userLogger.warn("[historyView] Moderation override failed:", error);
      }
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    });
}

function handleHistoryCardModerationHide(event, ref) {
  if (event) {
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    if (typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
  }

  const button = ref.hideButton;
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }

  const video = ref.video;
  if (!video || typeof video !== "object" || !video.id) {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
    return;
  }

  const app = getAppInstance();
  let result;
  try {
    if (typeof app?.handleModerationHide === "function") {
      result = app.handleModerationHide({ video });
    } else {
      const doc =
        (ref.article && ref.article.ownerDocument) ||
        (typeof document !== "undefined" ? document : null);
      if (doc && typeof doc.dispatchEvent === "function") {
        doc.dispatchEvent(new CustomEvent("video:moderation-hide", { detail: { video } }));
      }
      result = true;
    }
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
    if (isDevEnv) {
      userLogger.warn("[historyView] Moderation hide handler threw:", error);
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
      const context = normalizeVideoModerationContext(ref.video?.moderation);
      applyHistoryCardModeration(ref, context);
    })
    .catch((error) => {
      if (isDevEnv) {
        userLogger.warn("[historyView] Moderation hide failed:", error);
      }
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    });
}

function handleHistoryCardModerationBlock(event, ref) {
  if (event) {
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    if (typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
  }

  const button = ref.blockButton;
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }

  const video = ref.video;
  if (!video || typeof video !== "object" || !video.id) {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
    return;
  }

  const app = getAppInstance();
  let result;
  try {
    if (typeof app?.handleModerationBlock === "function") {
      result = app.handleModerationBlock({ video });
    } else {
      const doc = (ref.article && ref.article.ownerDocument) || (typeof document !== "undefined" ? document : null);
      if (doc && typeof doc.dispatchEvent === "function") {
        doc.dispatchEvent(
          new CustomEvent("video:moderation-block", { detail: { video } })
        );
        document.dispatchEvent(
          new CustomEvent("video:moderation-hide", { detail: { video } })
        );
      }
      result = true;
    }
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
    if (isDevEnv) {
      userLogger.warn("[historyView] Moderation block handler threw:", error);
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
      const context = normalizeVideoModerationContext(ref.video?.moderation);
      applyHistoryCardModeration(ref, context);
    })
    .catch((error) => {
      if (isDevEnv) {
        userLogger.warn("[historyView] Moderation block failed:", error);
      }
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    });
}

function refreshRegisteredHistoryCards(video, context, pointerKeys = null) {
  const filterSet = Array.isArray(pointerKeys) && pointerKeys.length ? new Set(pointerKeys) : null;
  const videoId = video && typeof video.id === "string" ? video.id : "";
  historyCardRegistry.forEach((ref, pointerKey) => {
    if (!ref) {
      return;
    }
    if (filterSet && !filterSet.has(pointerKey)) {
      return;
    }
    if (videoId) {
      ref.video = video;
    }
    applyHistoryCardModeration(ref, context);
  });
}

export function buildHistoryCard({ item, video, profile }) {
  const article = document.createElement("article");
  article.className = "watch-history-card";
  article.dataset.pointerKey = item.pointerKey;
  article.dataset.historyCard = "true";
  if (video?.isPrivate) {
    article.classList.add("watch-history-card--private");
  }

  const primary = document.createElement("div");
  primary.className = "watch-history-card__primary";

  const playbackData = (() => {
    if (!video) {
      return { url: "", magnet: "" };
    }
    const url = typeof video.url === "string" ? video.url.trim() : "";
    const magnetRaw =
      typeof video.magnet === "string"
        ? video.magnet.trim()
        : typeof video.infoHash === "string"
          ? video.infoHash.trim()
          : "";
    return { url, magnet: magnetRaw };
  })();

  const pointerVideoId = getPointerVideoId(video, item.pointer);

  const thumbnailLink = document.createElement("a");
  thumbnailLink.className = "watch-history-card__thumbnail";
  thumbnailLink.href = "#";
  thumbnailLink.dataset.historyAction = "play";
  thumbnailLink.dataset.pointerKey = item.pointerKey;
  if (pointerVideoId) {
    thumbnailLink.dataset.videoId = pointerVideoId;
  }
  if (playbackData.url) {
    thumbnailLink.dataset.playUrl = encodeURIComponent(playbackData.url);
  }
  if (playbackData.magnet) {
    thumbnailLink.dataset.playMagnet = playbackData.magnet;
  }

  const thumbnailInner = document.createElement("div");
  thumbnailInner.className = "watch-history-card__thumbnailInner";
  const thumbnailImg = document.createElement("img");
  thumbnailImg.alt = video?.title || "Video thumbnail";
  const thumbnailSrc =
    video && typeof video.thumbnail === "string" && video.thumbnail.trim()
      ? video.thumbnail.trim()
      : FALLBACK_THUMBNAIL;
  thumbnailImg.src = thumbnailSrc;
  thumbnailImg.loading = "lazy";
  thumbnailImg.decoding = "async";
  thumbnailInner.appendChild(thumbnailImg);
  thumbnailLink.appendChild(thumbnailInner);

  const details = document.createElement("div");
  details.className = "watch-history-card__details";

  const titleLink = document.createElement("a");
  titleLink.className = "watch-history-card__title";
  titleLink.href = "#";
  titleLink.dataset.historyAction = "play";
  titleLink.dataset.pointerKey = item.pointerKey;
  if (pointerVideoId) {
    titleLink.dataset.videoId = pointerVideoId;
  }
  if (playbackData.url) {
    titleLink.dataset.playUrl = encodeURIComponent(playbackData.url);
  }
  if (playbackData.magnet) {
    titleLink.dataset.playMagnet = playbackData.magnet;
  }
  titleLink.textContent = video?.title || "Untitled video";

  const created = document.createElement("p");
  created.className = "watch-history-card__created";
  const createdAt = Number.isFinite(video?.created_at)
    ? video.created_at
    : null;
  created.textContent = createdAt
    ? `Published ${formatRelativeTime(createdAt)}`
    : "Published date unavailable";

  details.appendChild(titleLink);
  details.appendChild(created);
  const moderationMount = document.createElement("div");
  moderationMount.className = "watch-history-card__moderation flex flex-wrap items-center gap-sm";
  details.appendChild(moderationMount);

  primary.appendChild(thumbnailLink);
  primary.appendChild(details);

  const meta = document.createElement("div");
  meta.className = "watch-history-card__meta";

  const watched = document.createElement("p");
  watched.className = "watch-history-card__watched";
  watched.textContent = item.watchedAt
    ? `Watched ${formatRelativeTime(item.watchedAt)}`
    : "Watched time unavailable";
  meta.appendChild(watched);

  const creator = document.createElement("div");
  creator.className = "watch-history-card__creator";

  const creatorAvatarButton = document.createElement("button");
  creatorAvatarButton.type = "button";
  creatorAvatarButton.className = "watch-history-card__creatorAvatar";
  creatorAvatarButton.dataset.historyAction = "channel";
  creatorAvatarButton.dataset.pointerKey = item.pointerKey;
  if (video?.pubkey) {
    creatorAvatarButton.dataset.author = video.pubkey;
  }
  const avatarImg = document.createElement("img");
  const avatarSrc =
    profile && typeof profile.picture === "string" && profile.picture.trim()
      ? profile.picture.trim()
      : FALLBACK_AVATAR;
  avatarImg.src = avatarSrc;
  avatarImg.alt = profile?.name || profile?.display_name || "Creator avatar";
  creatorAvatarButton.appendChild(avatarImg);

  const creatorNameButton = document.createElement("button");
  creatorNameButton.type = "button";
  creatorNameButton.className = "watch-history-card__creatorName";
  creatorNameButton.dataset.historyAction = "channel";
  creatorNameButton.dataset.pointerKey = item.pointerKey;
  if (video?.pubkey) {
    creatorNameButton.dataset.author = video.pubkey;
  }
  const app = getAppInstance();
  let creatorLabel =
    profile?.display_name || profile?.name || profile?.username || "Unknown";
  if ((!creatorLabel || creatorLabel === "Unknown") && video?.pubkey) {
    const encoded = app?.safeEncodeNpub?.(video.pubkey) || "";
    creatorLabel = formatShortNpub(encoded) || encoded || video.pubkey.slice(0, 8).concat("…");
  }
  creatorNameButton.textContent = creatorLabel;

  creator.appendChild(creatorAvatarButton);
  creator.appendChild(creatorNameButton);
  meta.appendChild(creator);

  const actions = document.createElement("div");
  actions.className = "watch-history-card__actions";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className =
    "watch-history-card__action watch-history-card__action--primary";
  playButton.dataset.historyAction = "play";
  playButton.dataset.pointerKey = item.pointerKey;
  if (pointerVideoId) {
    playButton.dataset.videoId = pointerVideoId;
  }
  if (playbackData.url) {
    playButton.dataset.playUrl = encodeURIComponent(playbackData.url);
  }
  if (playbackData.magnet) {
    playButton.dataset.playMagnet = playbackData.magnet;
  }
  playButton.textContent = "Play";

  const channelButton = document.createElement("button");
  channelButton.type = "button";
  channelButton.className = "watch-history-card__action";
  channelButton.dataset.historyAction = "channel";
  channelButton.dataset.pointerKey = item.pointerKey;
  if (video?.pubkey) {
    channelButton.dataset.author = video.pubkey;
  }
  channelButton.textContent = "Open channel";

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className =
    "watch-history-card__action watch-history-card__action--danger";
  removeButton.dataset.variant = "danger";
  removeButton.dataset.historyAction = "remove";
  removeButton.dataset.pointerKey = item.pointerKey;
  removeButton.textContent = "Remove from history";
  if (item.pointer?.type) {
    removeButton.dataset.pointerType = item.pointer.type;
  }
  if (item.pointer?.value) {
    removeButton.dataset.pointerValue = item.pointer.value;
  }
  if (item.pointer?.relay) {
    removeButton.dataset.pointerRelay = item.pointer.relay;
  }
  if (Number.isFinite(item.watchedAt)) {
    removeButton.dataset.pointerWatchedAt = String(item.watchedAt);
  }
  if (item.pointer?.session === true) {
    removeButton.dataset.pointerSession = "true";
  }
  removeButton.setAttribute(
    "aria-label",
    "Remove this history entry (sync may take a moment)."
  );
  removeButton.title =
    "Removes this entry from history. Relay sync may take a moment.";

  actions.appendChild(playButton);
  actions.appendChild(channelButton);
  actions.appendChild(removeButton);

  meta.appendChild(actions);

  article.appendChild(primary);
  article.appendChild(meta);

  if (pointerVideoId) {
    article.dataset.videoId = pointerVideoId;
  }

  const moderationContext = normalizeVideoModerationContext(video?.moderation);
  const cardRef = {
    pointerKey: item.pointerKey,
    article,
    primary,
    meta,
    details,
    badgeMount: moderationMount,
    thumbnailInner,
    thumbnailLink,
    titleLink,
    playButton,
    channelButton,
    removeButton,
    creatorNameButton,
    avatarButton: creatorAvatarButton,
    video: video || null,
    hiddenContainer: null,
    badgeEl: null,
    badgeLabelEl: null,
    badgeTextEl: null,
    badgeIconSvg: null,
    badgeIconWrapper: null,
    overrideButton: null,
    blockButton: null,
    badgeId: "",
    boundOverride: null,
    boundBlock: null
  };

  registerHistoryCard(item.pointerKey, cardRef);
  applyHistoryCardModeration(cardRef, moderationContext);

  return article;
}

export function createWatchHistoryRenderer(config = {}) {
  const {
    fetchHistory = async (
      actorInput,
      { cursor = 0, forceRefresh = false } = {}
    ) => {
      const app = getAppInstance();
      const engine = app?.feedEngine;
      if (engine && typeof engine.run === "function") {
        const runtime = buildWatchHistoryFeedRuntime({
          actor: actorInput,
          cursor,
          forceRefresh,
        });
        return engine.run("watch-history", { runtime });
      }
      const items = await watchHistoryService.loadLatest(actorInput, {
        allowStale: !forceRefresh,
        forceRefresh,
      });
      const normalized = normalizeHistoryItems(items);
      return { items: normalized, metadata: { engine: "service-fallback" } };
    },
    snapshot = watchHistoryService.snapshot.bind(watchHistoryService),
    getActor,
    viewSelector = "#watchHistoryView",
    gridSelector = "#watchHistoryGrid",
    loadingSelector = "#watchHistoryLoading",
    statusSelector = "#watchHistoryStatus",
    emptySelector = "#watchHistoryEmpty",
    sentinelSelector = "#watchHistorySentinel",
    loadMoreSelector = "#watchHistoryLoadMore",
    clearButtonSelector = '[data-history-action="clear-cache"]',
    republishButtonSelector = '[data-history-action="republish"]',
    refreshButtonSelector = '[data-history-action="refresh"]',
    privacyBannerSelector = "#watchHistoryPrivacyBanner",
    privacyMessageSelector = "#watchHistoryPrivacyMessage",
    privacyToggleSelector = "#watchHistoryPrivacyToggle",
    privacyDismissSelector = "#watchHistoryPrivacyDismiss",
    infoSelector = "#watchHistoryInfo",
    errorBannerSelector = "#watchHistoryError",
    scrollContainerSelector = null,
    featureBannerSelector = "#profileHistoryFeatureBanner",
    sessionWarningSelector = "#profileHistorySessionWarning",
    emptyCopy = WATCH_HISTORY_EMPTY_COPY,
    disabledCopy = WATCH_HISTORY_DISABLED_COPY,
    batchSize = WATCH_HISTORY_BATCH_SIZE,
    remove = (payload) => {
      const app = getAppInstance();
      const controller = app?.watchHistoryController;
      if (controller?.handleWatchHistoryRemoval) {
        return controller.handleWatchHistoryRemoval(payload);
      }
      return defaultRemoveHandler(payload);
    }
  } = config;

  const syncEnabled =
    typeof watchHistoryService.isEnabled === "function"
      ? watchHistoryService.isEnabled() === true
      : false;
  const localSupported =
    typeof watchHistoryService.supportsLocalHistory === "function"
      ? watchHistoryService.supportsLocalHistory() === true
      : false;
  const localOnly =
    typeof watchHistoryService.isLocalOnly === "function"
      ? watchHistoryService.isLocalOnly() === true
      : false;

  const state = {
    initialized: false,
    actor: null,
    items: [],
    fingerprint: "",
    cursor: 0,
    hasMore: false,
    isLoading: false,
    isRendering: false,
    lastError: null,
    observer: null,
    observerAttached: false,
    privacyDismissed: false,
    feedMetadata: null,
    sessionFallbackActive: false,
    syncEnabled,
    localSupported,
    localOnly,
    featureEnabled: syncEnabled || localSupported
  };

  let rendererRef = null;
  let fingerprintRefreshQueued = false;
  const scheduleTask =
    typeof queueMicrotask === "function"
      ? queueMicrotask
      : (callback) => Promise.resolve().then(callback);
  let elements = {
    view: null,
    grid: null,
    loading: null,
    status: null,
    empty: null,
    sentinel: null,
    loadMore: null,
    clearButton: null,
    republishButton: null,
    refreshButton: null,
    privacyBanner: null,
    privacyMessage: null,
    privacyToggle: null,
    privacyDismiss: null,
    info: null,
    errorBanner: null,
    scrollContainer: null,
    featureBanner: null,
    sessionWarning: null
  };

  let boundGridClickHandler = null;
  let boundLoadMoreHandler = null;
  let boundClearHandler = null;
  let boundRepublishHandler = null;
  let boundRefreshHandler = null;
  let boundPrivacyDismissHandler = null;

  const subscriptions = new Set();

  function refreshElements() {
    elements = {
      view: resolveElement(viewSelector),
      grid: resolveElement(gridSelector),
      loading: resolveElement(loadingSelector),
      status: resolveElement(statusSelector),
      empty: resolveElement(emptySelector),
      sentinel: resolveElement(sentinelSelector),
      loadMore: resolveElement(loadMoreSelector),
      clearButton: resolveElement(clearButtonSelector),
      republishButton: resolveElement(republishButtonSelector),
      refreshButton: resolveElement(refreshButtonSelector),
      privacyBanner: resolveElement(privacyBannerSelector),
      privacyMessage: resolveElement(privacyMessageSelector),
      privacyToggle: resolveElement(privacyToggleSelector),
      privacyDismiss: resolveElement(privacyDismissSelector),
      info: resolveElement(infoSelector),
      errorBanner: resolveElement(errorBannerSelector),
      scrollContainer: resolveElement(scrollContainerSelector),
      featureBanner: resolveElement(featureBannerSelector),
      sessionWarning: resolveElement(sessionWarningSelector)
    };
  }

  function clearSubscriptions() {
    for (const unsubscribe of subscriptions) {
      try {
        unsubscribe();
      } catch (error) {
        if (isDevEnv) {
          userLogger.warn(
            "[historyView] Failed to unsubscribe from watch history event:",
            error
          );
        }
      }
    }
    subscriptions.clear();
    fingerprintRefreshQueued = false;
  }

  function updateFeatureBanner() {
    const actor = typeof state.actor === "string" ? state.actor : undefined;
    const syncEnabled =
      typeof watchHistoryService.isEnabled === "function"
        ? watchHistoryService.isEnabled(actor) === true
        : false;
    const localSupported =
      typeof watchHistoryService.supportsLocalHistory === "function"
        ? watchHistoryService.supportsLocalHistory(actor) === true
        : false;
    const localOnly =
      typeof watchHistoryService.isLocalOnly === "function"
        ? watchHistoryService.isLocalOnly(actor) === true
        : false;
    state.syncEnabled = syncEnabled;
    state.localSupported = localSupported;
    state.localOnly = localOnly;
    state.featureEnabled = syncEnabled || localSupported;
    if (!(elements.featureBanner instanceof HTMLElement)) {
      return;
    }
    if (syncEnabled) {
      elements.featureBanner.textContent = "";
      setHidden(elements.featureBanner, true);
      return;
    }
    if (localOnly) {
      elements.featureBanner.textContent =
        "Watch history sync requires a logged-in Nostr account. This guest session is stored locally only.";
      setHidden(elements.featureBanner, false);
      return;
    }
    if (localSupported) {
      elements.featureBanner.textContent =
        "Watch history sync is disabled right now. We'll keep a local copy on this device.";
    } else {
      elements.featureBanner.textContent =
        "Watch history is disabled on this server.";
    }
    setHidden(elements.featureBanner, false);
  }

  function updateSessionFallbackWarning() {
    if (!(elements.sessionWarning instanceof HTMLElement)) {
      return;
    }
    const nip07Pubkey =
      typeof nostrClient?.pubkey === "string" ? nostrClient.pubkey : "";
    const sessionPubkey =
      typeof nostrClient?.sessionActor?.pubkey === "string"
        ? nostrClient.sessionActor.pubkey
        : "";
    const activeActor = typeof state.actor === "string" ? state.actor : "";
    const fallbackActive =
      !nip07Pubkey && sessionPubkey && sessionPubkey === activeActor;
    state.sessionFallbackActive = Boolean(fallbackActive);
    setHidden(elements.sessionWarning, !fallbackActive);
  }

  function queueFingerprintRefresh() {
    if (!fingerprintRefreshQueued) {
      return;
    }
    if (state.isLoading) {
      return;
    }
    if (!rendererRef) {
      return;
    }
    fingerprintRefreshQueued = false;
    void rendererRef.refresh({ force: false });
  }

  function subscribeToFingerprintUpdates() {
    if (typeof watchHistoryService.subscribe !== "function") {
      return;
    }
    const unsubscribe = watchHistoryService.subscribe(
      "fingerprint",
      (payload) => {
        if (!payload) {
          return;
        }
        if (payload.actor && state.actor && payload.actor !== state.actor) {
          return;
        }
        fingerprintRefreshQueued = true;
        if (!state.isLoading) {
          scheduleTask(() => {
            queueFingerprintRefresh();
          });
        }
      }
    );
    if (typeof unsubscribe === "function") {
      subscriptions.add(unsubscribe);
    }
  }

  function handleModerationUpdate(video) {
    if (!video || typeof video !== "object" || !video.id) {
      return;
    }

    let workingVideo = video;
    if (typeof structuredClone === "function") {
      try {
        workingVideo = structuredClone(video);
      } catch (error) {
        workingVideo = video;
      }
    } else {
      try {
        workingVideo = JSON.parse(JSON.stringify(video));
      } catch (error) {
        workingVideo = { ...video };
        if (video.moderation && typeof video.moderation === "object") {
          workingVideo.moderation = { ...video.moderation };
        }
      }
    }

    const app = getAppInstance();
    if (typeof app?.decorateVideoModeration === "function") {
      try {
        const decorated = app.decorateVideoModeration(workingVideo);
        if (decorated) {
          workingVideo = decorated;
        }
      } catch (error) {
        if (isDevEnv) {
          userLogger.warn(
            "[historyView] Failed to decorate moderation update:",
            error
          );
        }
      }
    }

    const context = normalizeVideoModerationContext(workingVideo?.moderation);
    const affectedPointers = [];
    state.items.forEach((entry) => {
      if (!entry) {
        return;
      }
      const entryVideo = entry.metadata?.video || entry.video;
      if (entryVideo && entryVideo.id === workingVideo.id) {
        entry.metadata.video = workingVideo;
        entry.video = workingVideo;
        if (entry.pointerKey) {
          affectedPointers.push(entry.pointerKey);
        }
      }
    });

    refreshRegisteredHistoryCards(
      workingVideo,
      context,
      affectedPointers.length ? affectedPointers : null
    );
  }

  function subscribeToModerationEvents() {
    if (typeof document === "undefined" || typeof document.addEventListener !== "function") {
      return;
    }
    const handler = (event) => {
      const video = event?.detail?.video;
      if (!video) {
        return;
      }
      handleModerationUpdate(video);
    };
    document.addEventListener("video:moderation-override", handler);
    document.addEventListener("video:moderation-block", handler);
    subscriptions.add(() => {
      document.removeEventListener("video:moderation-override", handler);
      document.removeEventListener("video:moderation-block", handler);
    });
  }

  function setLoadingState(loading) {
    state.isLoading = loading;
    if (elements.loading) {
      setHidden(elements.loading, !loading);
    }
    if (elements.status) {
      setHidden(elements.status, !loading);
    }
  }

  function showErrorBanner(message) {
    if (!(elements.errorBanner instanceof HTMLElement)) {
      return;
    }
    elements.errorBanner.textContent = message;
    setHidden(elements.errorBanner, false);
  }

  function hideErrorBanner() {
    if (!(elements.errorBanner instanceof HTMLElement)) {
      return;
    }
    elements.errorBanner.textContent = "";
    setHidden(elements.errorBanner, true);
  }

  function showEmptyState() {
    if (elements.grid) {
      elements.grid.innerHTML = "";
      setHidden(elements.grid, true);
    }
    clearHistoryCardRegistry();
    if (elements.empty) {
      setTextContent(elements.empty, emptyCopy);
      setHidden(elements.empty, false);
    }
    setHidden(elements.loadMore, true);
    if (elements.sentinel) {
      setHidden(elements.sentinel, true);
    }
  }

  function showFeatureDisabledState() {
    hideErrorBanner();
    if (elements.loading) {
      setHidden(elements.loading, true);
    }
    if (elements.status) {
      setHidden(elements.status, true);
    }
    detachObserver();
    if (elements.grid) {
      elements.grid.innerHTML = "";
      setHidden(elements.grid, true);
    }
    if (elements.empty) {
      setTextContent(elements.empty, disabledCopy || emptyCopy);
      setHidden(elements.empty, false);
    }
    if (elements.loadMore) {
      setHidden(elements.loadMore, true);
    }
    if (elements.sentinel) {
      setHidden(elements.sentinel, true);
    }
  }

  function ensureObserver() {
    if (!elements.sentinel || !WATCH_HISTORY_BATCH_RESOLVE) {
      return;
    }
    if (state.observer) {
      return;
    }
    if (typeof IntersectionObserver !== "function") {
      return;
    }
    state.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void renderer.loadMore();
          }
        }
      },
      {
        root: elements.scrollContainer || null,
        rootMargin: "0px 0px 320px 0px",
        threshold: 0.1
      }
    );
  }

  function attachObserver() {
    if (!state.observer || !elements.sentinel) {
      return;
    }
    if (!state.hasMore) {
      return;
    }
    if (!state.observerAttached) {
      state.observer.observe(elements.sentinel);
      state.observerAttached = true;
      setHidden(elements.sentinel, false);
    }
  }

  function detachObserver() {
    if (state.observer && state.observerAttached && elements.sentinel) {
      state.observer.unobserve(elements.sentinel);
      state.observerAttached = false;
      setHidden(elements.sentinel, true);
    }
  }

  function updateLoadMoreVisibility() {
    if (WATCH_HISTORY_BATCH_RESOLVE) {
      if (state.hasMore) {
        attachObserver();
      } else {
        detachObserver();
      }
      if (elements.loadMore) {
        setHidden(elements.loadMore, true);
      }
      return;
    }
    detachObserver();
    if (elements.loadMore) {
      setHidden(elements.loadMore, !state.hasMore);
      elements.loadMore.disabled = !state.hasMore;
    }
  }

  function updatePrivacyBanner() {
    if (!(elements.privacyBanner instanceof HTMLElement)) {
      return;
    }
    const dismissed = state.privacyDismissed;
    if (dismissed) {
      setHidden(elements.privacyBanner, true);
      return;
    }
    if (elements.privacyMessage) {
      elements.privacyMessage.textContent =
        "Watch history only stores the event IDs of videos you've played. Titles and thumbnails reload from relays when available.";
    }
    if (elements.privacyToggle) {
      setHidden(elements.privacyToggle, true);
    }
    setHidden(elements.privacyBanner, false);
  }

  function updateInfoCallout() {
    if (!(elements.info instanceof HTMLElement)) {
      return;
    }
    const message =
      "Watch history keeps a lean list of event IDs. Details load on demand from relays when you open this page. Nothing is published from this view.";
    elements.info.textContent = message;
  }

  async function resolveActorKey() {
    if (typeof getActor === "function") {
      try {
        const result = await getActor();
        if (typeof result === "string" && result.trim()) {
          return result.trim();
        }
      } catch (error) {
        userLogger.warn(
          "[historyView] Failed to resolve actor via getActor:",
          error
        );
      }
    }
    if (watchHistoryService?.publishView) {
      const pubkey = nostrClient?.pubkey || window?.app?.pubkey || "";
      if (typeof pubkey === "string" && pubkey.trim()) {
        return pubkey.trim();
      }
    }
    return undefined;
  }

  async function hydrateBatch(batch) {
    const hydrated = [];
    for (const item of batch) {
      if (!item) {
        continue;
      }

      const baseMetadata =
        item &&
        typeof item === "object" &&
        item.metadata &&
        typeof item.metadata === "object"
          ? { ...item.metadata }
          : {};

      const metadata = {
        ...baseMetadata,
        video: item.video || baseMetadata.video || null,
        profile: baseMetadata.profile || null
      };

      if (metadata.video && typeof metadata.video === "object") {
        const app = getAppInstance();
        if (typeof app?.decorateVideoModeration === "function") {
          try {
            const decorated = app.decorateVideoModeration(metadata.video);
            if (decorated) {
              metadata.video = decorated;
            }
          } catch (error) {
            if (isDevEnv) {
              userLogger.warn(
                "[historyView] Failed to decorate video moderation:",
                error
              );
            }
          }
        }
      }

      hydrated.push({ ...item, video: metadata.video, metadata });
    }
    return hydrated;
  }

  async function renderNextBatch() {
    if (!Array.isArray(state.items) || !state.items.length) {
      showEmptyState();
      return;
    }
    if (!(elements.grid instanceof HTMLElement)) {
      return;
    }
    if (state.cursor >= state.items.length) {
      state.hasMore = false;
      updateLoadMoreVisibility();
      return;
    }
    if (state.isRendering) {
      return;
    }
    state.isRendering = true;
    const start = state.cursor;
    const end = Math.min(state.items.length, start + Math.max(1, batchSize));
    const slice = state.items.slice(start, end);
    let hydrated;
    try {
      hydrated = await hydrateBatch(slice);
    } catch (error) {
      state.isRendering = false;
      if (isDevEnv) {
        userLogger.warn("[historyView] Failed to hydrate batch:", error);
      }
      return;
    }

    const fragment = document.createDocumentFragment();
    const dayContainers = new Map();

    const ensureDayContainer = (dayKey, label) => {
      if (dayContainers.has(dayKey)) {
        return dayContainers.get(dayKey);
      }
      let section = elements.grid.querySelector(
        `[data-history-day="${escapeSelector(dayKey)}"]`
      );
      if (!(section instanceof HTMLElement)) {
        section = document.createElement("section");
        section.dataset.historyDay = dayKey;
        section.className = "space-y-4";
        const header = document.createElement("h3");
        header.className =
          "text-sm font-semibold uppercase tracking-wide text-text";
        header.textContent = label;
        const list = document.createElement("div");
        list.dataset.historyDayList = "true";
        list.className = "space-y-4";
        section.appendChild(header);
        section.appendChild(list);
        fragment.appendChild(section);
      }
      const list = section.querySelector("[data-history-day-list]");
      const record = { section, list };
      dayContainers.set(dayKey, record);
      return record;
    };

    hydrated.forEach((entry) => {
      if (!entry) {
        return;
      }
      const dayLabel = formatDayLabel(entry.watchedAt);
      const dayKey = `${dayLabel}`;
      const container = ensureDayContainer(dayKey, dayLabel);
      if (!(container?.list instanceof HTMLElement)) {
        return;
      }
      const card = buildHistoryCard({
        item: entry,
        video: entry.metadata?.video || null,
        profile: entry.metadata?.profile || null
      });
      container.list.appendChild(card);
    });

    elements.grid.appendChild(fragment);
    setHidden(elements.grid, false);
    setHidden(elements.empty, true);

    state.cursor = end;
    state.hasMore = state.cursor < state.items.length;
    updateLoadMoreVisibility();
    state.isRendering = false;
  }

  function bindGridEvents() {
    if (!(elements.grid instanceof HTMLElement)) {
      return;
    }
    if (boundGridClickHandler) {
      elements.grid.removeEventListener("click", boundGridClickHandler);
    }
    boundGridClickHandler = async (event) => {
      const trigger =
        event.target instanceof HTMLElement
          ? event.target.closest("[data-history-action]")
          : null;
      if (!(trigger instanceof HTMLElement)) {
        return;
      }
      const action = trigger.dataset.historyAction || "";
      const pointerKeyAttr =
        trigger.dataset.pointerKey ||
        (trigger.closest("[data-pointer-key]")?.dataset.pointerKey ?? "");
      if (!action) {
        return;
      }
      switch (action) {
        case "play": {
          event.preventDefault();
          const videoId = trigger.dataset.videoId || pointerKeyAttr;
          const rawUrlAttr = trigger.dataset.playUrl || "";
          const magnetAttr = trigger.dataset.playMagnet || "";
          let url = "";
          if (rawUrlAttr) {
            try {
              url = decodeURIComponent(rawUrlAttr);
            } catch (error) {
              url = rawUrlAttr;
            }
          }

          const app = getAppInstance();
          if (videoId && app?.playVideoByEventId) {
            app.playVideoByEventId(videoId, { url, magnet: magnetAttr });
            return;
          }

          if (app?.playVideoWithFallback) {
            app.playVideoWithFallback({
              url,
              magnet: magnetAttr
            });
          }
          break;
        }
        case "channel": {
          event.preventDefault();
          const author = trigger.dataset.author || "";
          const app = getAppInstance();
          if (author && app?.goToProfile) {
            app.goToProfile(author);
          } else if (app?.showError) {
            app.showError("No creator info available.");
          }
          break;
        }
        case "remove": {
          event.preventDefault();
          if (pointerKeyAttr) {
            await renderer.handleRemove(pointerKeyAttr);
          }
          break;
        }
        default:
          break;
      }
    };
    elements.grid.addEventListener("click", boundGridClickHandler);
  }

  function bindLoadMore() {
    if (!(elements.loadMore instanceof HTMLElement)) {
      return;
    }
    if (boundLoadMoreHandler) {
      elements.loadMore.removeEventListener("click", boundLoadMoreHandler);
    }
    boundLoadMoreHandler = (event) => {
      event.preventDefault();
      void renderer.loadMore();
    };
    elements.loadMore.addEventListener("click", boundLoadMoreHandler);
  }

  function bindActions() {
    if (elements.clearButton) {
      if (boundClearHandler) {
        elements.clearButton.removeEventListener("click", boundClearHandler);
      }
      boundClearHandler = async (event) => {
        event.preventDefault();
        userLogger.info("[historyView] 'Clear local history' clicked.");
        const actor = await resolveActorKey();
        try {
          await watchHistoryService.resetProgress(actor);
          state.items = [];
          state.cursor = 0;
          state.hasMore = false;
          showEmptyState();
          const app = getAppInstance();
          if (typeof app?.showSuccess === "function") {
            app.showSuccess("Local watch history reset.");
          } else {
            console.log("Local watch history reset.");
          }
        } catch (error) {
          const message =
            error && typeof error.message === "string"
              ? error.message
              : "Failed to reset local watch history.";
          const app = getAppInstance();
          if (typeof app?.showError === "function") {
            app.showError(message);
          } else {
            console.error(message);
          }
        }
      };
      elements.clearButton.addEventListener("click", boundClearHandler);
    }

    if (elements.republishButton) {
      if (boundRepublishHandler) {
        elements.republishButton.removeEventListener(
          "click",
          boundRepublishHandler
        );
      }
      boundRepublishHandler = async (event) => {
        event.preventDefault();
        userLogger.info("[historyView] 'Republish now' clicked.");
        const actor = await resolveActorKey();
        try {
          const payload = state.items.map((entry) => ({
            ...entry.pointer,
            watchedAt: entry.watchedAt,
          }));
          await snapshot(payload, { actor, reason: "manual-republish" });
          const app = getAppInstance();
          if (typeof app?.showSuccess === "function") {
            app.showSuccess("Watch history snapshot queued for publish.");
          } else {
            console.log("Watch history snapshot queued for publish.");
          }
        } catch (error) {
          const app = getAppInstance();
          if (typeof app?.showError === "function") {
            app.showError("Failed to publish watch history. Try again later.");
          } else {
            console.error("Failed to publish watch history.");
          }
          userLogger.warn("[historyView] Republish failed:", error);
        }
      };
      elements.republishButton.addEventListener("click", boundRepublishHandler);
    }

    if (elements.refreshButton) {
      if (boundRefreshHandler) {
        elements.refreshButton.removeEventListener("click", boundRefreshHandler);
      }
      boundRefreshHandler = async (event) => {
        event.preventDefault();
        userLogger.info("[historyView] 'Refresh' clicked.");
        await renderer.refresh({ force: true });
        const app = getAppInstance();
        if (typeof app?.showSuccess === "function") {
          app.showSuccess("Watch history refreshed from relays.");
        }
      };
      elements.refreshButton.addEventListener("click", boundRefreshHandler);
    }
  }

  function bindPrivacyControls() {
    if (elements.privacyToggle) {
      setHidden(elements.privacyToggle, true);
    }

    if (elements.privacyDismiss) {
      if (boundPrivacyDismissHandler) {
        elements.privacyDismiss.removeEventListener(
          "click",
          boundPrivacyDismissHandler
        );
      }
      boundPrivacyDismissHandler = (event) => {
        event.preventDefault();
        state.privacyDismissed = true;
        writePreference(WATCH_HISTORY_PRIVACY_DISMISSED_KEY, "true");
        updatePrivacyBanner();
      };
      elements.privacyDismiss.addEventListener(
        "click",
        boundPrivacyDismissHandler
      );
    }
  }

  async function loadHistory({ force = false, actorOverride } = {}) {
    if (state.isLoading) {
      return false;
    }
    if (!state.featureEnabled) {
      state.actor = null;
      updateSessionFallbackWarning();
      state.items = [];
      state.fingerprint = "";
      state.cursor = 0;
      state.hasMore = false;
      state.lastError = null;
      showFeatureDisabledState();
      return false;
    }
    setLoadingState(true);
    const actor =
      typeof actorOverride === "string" && actorOverride.trim()
        ? actorOverride.trim()
        : await resolveActorKey();
    state.actor = actor;
    updateSessionFallbackWarning();
    let result = null;
    try {
      result = await fetchHistory(actor, {
        cursor: 0,
        forceRefresh: force === true,
      });
      state.lastError = null;
      hideErrorBanner();
    } catch (error) {
      state.lastError = error;
      const message =
        error && typeof error.message === "string"
          ? error.message
          : "Failed to load watch history from relays.";
      showErrorBanner(message);
      result = null;
    }
    setLoadingState(false);
    if (fingerprintRefreshQueued) {
      scheduleTask(() => {
        queueFingerprintRefresh();
      });
    }
    const feedItems = Array.isArray(result?.items) ? result.items : [];
    const normalized = [];
    for (const entry of feedItems) {
      const pointer = normalizePointerInput(entry?.pointer || entry);
      if (!pointer) {
        continue;
      }
      const pointerKeyValue =
        typeof entry?.pointerKey === "string" && entry.pointerKey
          ? entry.pointerKey
          : pointerKey(pointer);
      if (!pointerKeyValue) {
        continue;
      }
      const watchedAtRaw = Number.isFinite(entry?.watchedAt)
        ? entry.watchedAt
        : Number.isFinite(entry?.metadata?.watchedAt)
          ? entry.metadata.watchedAt
          : 0;
      const watchedAt = Math.max(0, Math.floor(Number(watchedAtRaw) || 0));
      const baseMetadata =
        entry &&
        typeof entry === "object" &&
        entry.metadata &&
        typeof entry.metadata === "object"
          ? { ...entry.metadata }
          : {};
      const video = entry?.video || baseMetadata.video || null;
      const profile = baseMetadata.profile || null;
      const metadata = {
        ...baseMetadata,
        pointerKey: pointerKeyValue,
        watchedAt: Number.isFinite(baseMetadata.watchedAt)
          ? baseMetadata.watchedAt
          : watchedAt || null,
        video: video || null,
        profile: profile || null
      };
      normalized.push({
        pointer,
        pointerKey: pointerKeyValue,
        watchedAt,
        video: metadata.video,
        metadata
      });
    }

    const fingerprint = computeFingerprint(normalized);
    if (!force && fingerprint && fingerprint === state.fingerprint) {
      return false;
    }
    state.items = normalized;
    state.feedMetadata =
      result && typeof result.metadata === "object" && result.metadata
        ? { ...result.metadata }
        : null;
    state.fingerprint = fingerprint;
    state.cursor = 0;
    state.hasMore = state.items.length > 0;
    return true;
  }

  async function renderInitial() {
    if (!(elements.grid instanceof HTMLElement)) {
      return;
    }
    state.cursor = 0;
    state.hasMore = state.items.length > 0;
    elements.grid.innerHTML = "";
    clearHistoryCardRegistry();
    removeEmptyDayContainers(elements.grid);
    if (!state.items.length) {
      showEmptyState();
      return;
    }
    setHidden(elements.empty, true);
    setHidden(elements.grid, false);
    await renderNextBatch();
  }

  const renderer = {
    async init(options = {}) {
      if (typeof document === "undefined") {
        return;
      }
      clearSubscriptions();
      refreshElements();
      updateFeatureBanner();
      ensureObserver();
      bindGridEvents();
      bindLoadMore();
      bindActions();
      bindPrivacyControls();
      subscribeToFingerprintUpdates();
      subscribeToModerationEvents();
      updateInfoCallout();
      state.privacyDismissed =
        readPreference(WATCH_HISTORY_PRIVACY_DISMISSED_KEY, "false") === "true";
      updatePrivacyBanner();
      state.initialized = true;
      if (!state.featureEnabled) {
        state.items = [];
        state.fingerprint = "";
        state.cursor = 0;
        state.hasMore = false;
        state.lastError = null;
        showFeatureDisabledState();
        return;
      }
      // Use cached data immediately if available (force: false) unless overridden
      const force = options.force === true;
      await this.refresh({ ...options, force });
    },
    async ensureInitialLoad(options = {}) {
      if (!state.initialized) {
        await this.init(options);
        return;
      }
      refreshElements();
      updateFeatureBanner();
      if (!state.featureEnabled) {
        state.items = [];
        state.fingerprint = "";
        state.cursor = 0;
        state.hasMore = false;
        state.lastError = null;
        showFeatureDisabledState();
        return;
      }
    },
    async refresh(options = {}) {
      updateFeatureBanner();
      if (!state.featureEnabled) {
        state.items = [];
        state.fingerprint = "";
        state.cursor = 0;
        state.hasMore = false;
        state.lastError = null;
        showFeatureDisabledState();
        return;
      }
      const { actor, force = true } = options;
      const changed = await loadHistory({
        force,
        actorOverride: actor
      });
      if (!changed && state.items.length) {
        updateLoadMoreVisibility();
        return;
      }
      await renderInitial();
    },
    async loadMore() {
      if (!state.featureEnabled) {
        return [];
      }
      if (!state.items.length) {
        return [];
      }
      await renderNextBatch();
      return state.items.slice(0, state.cursor);
    },
    resume() {
      updateLoadMoreVisibility();
    },
    pause() {
      detachObserver();
    },
    destroy() {
      detachObserver();
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }
      if (elements.grid && boundGridClickHandler) {
        elements.grid.removeEventListener("click", boundGridClickHandler);
        boundGridClickHandler = null;
      }
      if (elements.loadMore && boundLoadMoreHandler) {
        elements.loadMore.removeEventListener("click", boundLoadMoreHandler);
        boundLoadMoreHandler = null;
      }
      if (elements.clearButton && boundClearHandler) {
        elements.clearButton.removeEventListener("click", boundClearHandler);
        boundClearHandler = null;
      }
      if (elements.republishButton && boundRepublishHandler) {
        elements.republishButton.removeEventListener(
          "click",
          boundRepublishHandler
        );
        boundRepublishHandler = null;
      }
      if (elements.refreshButton && boundRefreshHandler) {
        elements.refreshButton.removeEventListener("click", boundRefreshHandler);
        boundRefreshHandler = null;
      }
      if (elements.privacyDismiss && boundPrivacyDismissHandler) {
        elements.privacyDismiss.removeEventListener(
          "click",
          boundPrivacyDismissHandler
        );
        boundPrivacyDismissHandler = null;
      }
      clearSubscriptions();
      if (elements.grid) {
        elements.grid.innerHTML = "";
      }
      clearHistoryCardRegistry();
      state.initialized = false;
      state.items = [];
      state.cursor = 0;
      state.hasMore = false;
      rendererRef = null;
      fingerprintRefreshQueued = false;
    },
    async handleRemove(pointerKeyValue) {
      if (!pointerKeyValue) {
        return;
      }
      const index = state.items.findIndex(
        (entry) => entry.pointerKey === pointerKeyValue
      );
      if (index === -1) {
        return;
      }
      const [removed] = state.items.splice(index, 1);
      state.fingerprint = computeFingerprint(state.items);
      state.cursor = Math.min(state.cursor, state.items.length);
      state.hasMore = state.cursor < state.items.length;
      const card = elements.grid?.querySelector(
        `[data-pointer-key="${escapeSelector(pointerKeyValue)}"]`
      );
      const parentDay = card?.closest("[data-history-day]");
      cleanupHistoryCard(pointerKeyValue);
      if (card) {
        card.remove();
      }
      removeEmptyDayContainers(elements.grid);
      if (!state.items.length) {
        showEmptyState();
      } else {
        updateLoadMoreVisibility();
      }
      const remainingItems = state.items.slice();
      const actor = await resolveActorKey();
      let refreshNeeded = true;
      try {
        const handler =
          typeof remove === "function"
            ? remove
            : (payload) => defaultRemoveHandler(payload);
        const result = await handler({
          actor,
          items: remainingItems,
          removed,
          pointerKey: pointerKeyValue,
          snapshot,
          reason: "remove-item"
        });
        const app = getAppInstance();
        if (!result?.handledToasts) {
          app?.showSuccess?.("Removed from watch history.");
        }
      } catch (error) {
        const app = getAppInstance();
        if (!error?.handled) {
          app?.showError?.("Failed to remove from history. Reloading list.");
        }
        if (isDevEnv) {
          userLogger.warn("[historyView] Removal failed:", error);
        }
      } finally {
        if (parentDay instanceof HTMLElement) {
          removeEmptyDayContainers(elements.grid);
        }
        if (refreshNeeded) {
          try {
            await this.refresh({ force: true });
          } catch (error) {
            if (isDevEnv) {
              userLogger.warn(
                "[historyView] Failed to refresh watch history after removal:",
                error
              );
            }
          }
        }
      }
    },
    async render() {
      await renderInitial();
    },
    getState() {
      return {
        ...state,
        items: state.items.slice()
      };
    }
  };

  rendererRef = renderer;
  return renderer;
}

export const watchHistoryRenderer = createWatchHistoryRenderer();

export async function initHistoryView() {
  await watchHistoryRenderer.init();
}

if (typeof window !== "undefined") {
  window.bitvid = window.bitvid || {};
  window.bitvid.initHistoryView = initHistoryView;
  window.bitvid.watchHistoryRenderer = watchHistoryRenderer;
}
