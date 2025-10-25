// js/channelProfile.js

import { nostrClient } from "./nostrClientFacade.js";
import { convertEventToVideo as sharedConvertEventToVideo } from "./nostr/index.js";
import { DEFAULT_RELAY_URLS } from "./nostr/toolkit.js";
import { subscriptions } from "./subscriptions.js";
import { attachHealthBadges } from "./gridHealth.js";
import { attachUrlHealthBadges } from "./urlHealthObserver.js";
import { accessControl } from "./accessControl.js";
import { getApplication } from "./applicationContext.js";
import { escapeHTML } from "./utils/domUtils.js";
import { formatShortNpub } from "./utils/formatters.js";
import createPopover from "./ui/overlay/popoverEngine.js";
import { VideoCard } from "./ui/components/VideoCard.js";
import { createChannelProfileMenuPanel } from "./ui/components/videoMenuRenderers.js";
import { ALLOW_NSFW_CONTENT } from "./config.js";
import { sanitizeProfileMediaUrl } from "./utils/profileMedia.js";
import moderationService from "./services/moderationService.js";
import {
  calculateZapShares,
  describeShareType,
  fetchLightningMetadata,
  formatMinRequirement,
  getCachedLightningEntry,
  getCachedMetadataByUrl,
  getCachedPlatformLightningAddress,
  isMetadataEntryFresh,
  normalizeLightningAddressKey,
  rememberLightningMetadata,
  setCachedPlatformLightningAddress,
  validateInvoiceAmount
} from "./payments/zapSharedState.js";
import { splitAndZap } from "./payments/zapSplit.js";
import { showLoginRequiredToZapNotification } from "./payments/zapNotifications.js";
import {
  resolveLightningAddress,
  fetchPayServiceData,
  requestInvoice
} from "./payments/lnurl.js";
import { getPlatformLightningAddress } from "./payments/platformAddress.js";
import { devLogger, userLogger } from "./utils/logger.js";
import {
  ensureWallet,
  sendPayment as sendWalletPayment
} from "./payments/nwcClient.js";
import {
  prepareStaticModal,
  openStaticModal
} from "./ui/components/staticModalAccessibility.js";
import { setModalState as setGlobalModalState } from "./state/appState.js";

const getApp = () => getApplication();

let currentChannelHex = null;
let currentChannelNpub = null;
let currentChannelLightningAddress = "";
let channelZapPendingOpen = false;

function normalizeHex(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(trimmed) ? trimmed : "";
}

function shouldBlurChannelMedia(pubkey) {
  const normalized = normalizeHex(pubkey);
  if (!normalized) {
    return false;
  }

  try {
    if (moderationService.isAuthorMutedByViewer(normalized) === true) {
      return true;
    }
  } catch (error) {
    devLogger.warn("[ChannelProfile] Failed to resolve viewer mute state", error);
  }

  const app = getApp();
  const videos =
    app?.videosMap instanceof Map ? Array.from(app.videosMap.values()) : [];

  for (const video of videos) {
    if (!video || typeof video !== "object") {
      continue;
    }
    const videoPubkey =
      typeof video.pubkey === "string" ? video.pubkey.trim().toLowerCase() : "";
    if (videoPubkey !== normalized) {
      continue;
    }
    const moderation =
      video.moderation && typeof video.moderation === "object"
        ? video.moderation
        : null;
    if (!moderation) {
      continue;
    }
    if (moderation.hidden === true) {
      return true;
    }
    if (moderation.blurThumbnail === true) {
      const reason =
        typeof moderation.blurReason === "string"
          ? moderation.blurReason.trim().toLowerCase()
          : "";
      if (reason.startsWith("trusted-")) {
        return true;
      }
    }
  }

  return false;
}

function applyChannelVisualBlur({ bannerEl = null, avatarEl = null, pubkey = "" } = {}) {
  const shouldBlur = shouldBlurChannelMedia(pubkey);
  const applyState = (element) => {
    if (!element) {
      return;
    }
    if (shouldBlur) {
      element.dataset.visualState = "blurred";
    } else if (element.dataset.visualState) {
      delete element.dataset.visualState;
    }
  };

  applyState(bannerEl);
  applyState(avatarEl);
}

const summarizeZapTracker = (tracker) =>
  Array.isArray(tracker)
    ? tracker.map((entry) => ({
        type: entry?.type || "unknown",
        status: entry?.status || "unknown",
        amount:
          Number.isFinite(entry?.amount) && entry.amount >= 0
            ? entry.amount
            : undefined,
        address: entry?.address || undefined,
        hasPayment: Boolean(entry?.payment),
        errorMessage:
          typeof entry?.error?.message === "string"
            ? entry.error.message
            : entry?.error
              ? String(entry.error)
              : undefined
      }))
    : undefined;

function logZapError(stage, details = {}, error) {
  const summary = {
    stage,
    shareType: details?.shareType,
    address: details?.address,
    amount:
      Number.isFinite(details?.amount) && details.amount >= 0
        ? details.amount
        : undefined,
    overrideFee:
      typeof details?.overrideFee === "number"
        ? details.overrideFee
        : undefined,
    commentLength:
      typeof details?.comment === "string" ? details.comment.length : undefined,
    wallet: details?.walletSettings
      ? {
          hasUri: Boolean(details.walletSettings.nwcUri),
          type:
            details.walletSettings.type ||
            details.walletSettings.name ||
            details.walletSettings.client ||
            undefined
        }
      : undefined,
    shares: details?.context?.shares
      ? {
          total: details.context.shares.total,
          creator: details.context.shares.creatorShare,
          platform: details.context.shares.platformShare
        }
      : undefined,
    tracker: summarizeZapTracker(details?.tracker),
    retryAttempt:
      Number.isInteger(details?.retryAttempt) && details.retryAttempt >= 0
        ? details.retryAttempt
        : undefined
  };
  userLogger.error("[zap] Channel zap failure", summary, error);
}
let currentChannelProfileEvent = null;
let currentChannelProfileSnapshot = null;
let currentChannelProfileHasExplicitPayload = false;

let cachedZapButton = null;
let cachedChannelShareButton = null;
let cachedChannelMenu = null;
let cachedZapControls = null;
let cachedZapForm = null;
let cachedZapAmountInput = null;
let cachedZapSplitSummary = null;
let cachedZapStatus = null;
let cachedZapReceipts = null;
let cachedZapWalletPrompt = null;
let cachedZapWalletLink = null;
let cachedZapCloseBtn = null;
let cachedZapSendBtn = null;

let pendingZapRetry = null;
let zapInFlight = false;
let zapControlsOpen = false;
let zapPopover = null;
let zapPopoverTrigger = null;
let zapShouldFocusOnOpen = false;
let zapPopoverOpenPromise = null;
let channelMenuPopover = null;
let channelMenuOpen = false;
let currentVideoLoadToken = 0;
let currentProfileLoadToken = 0;

const FALLBACK_CHANNEL_BANNER = "assets/jpg/bitvid.jpg";
const FALLBACK_CHANNEL_AVATAR = "assets/svg/default-profile.svg";
const PROFILE_EVENT_CACHE_TTL_MS = 5 * 60 * 1000;

const channelProfileMetadataCache = new Map();

function hasExplicitChannelProfilePayload(profile) {
  return (
    profile &&
    typeof profile === "object" &&
    Object.keys(profile).length > 0
  );
}

function touchChannelProfileCacheEntry(pubkey) {
  if (typeof pubkey !== "string" || !pubkey) {
    return false;
  }

  const existing = channelProfileMetadataCache.get(pubkey);
  if (!existing) {
    return false;
  }

  channelProfileMetadataCache.set(pubkey, {
    timestamp: Date.now(),
    profile: { ...existing.profile },
    event: existing.event ? { ...existing.event } : null
  });

  return true;
}

const SUPPORTED_BANNER_REFERRER_POLICIES = new Set([
  "no-referrer",
  "origin",
  "origin-when-cross-origin",
  "same-origin",
  "strict-origin",
  "strict-origin-when-cross-origin",
  "unsafe-url"
]);

const DEFAULT_BANNER_REFERRER_POLICY_SEQUENCE = [
  "no-referrer",
  "strict-origin-when-cross-origin",
  "origin-when-cross-origin",
  "unsafe-url"
];

const bannerLoadStates = new WeakMap();

function resolveToAbsoluteUrl(url) {
  if (typeof url !== "string") {
    return "";
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  try {
    if (typeof window !== "undefined" && window.location) {
      return new URL(trimmed, window.location.href).href;
    }
    return new URL(trimmed).href;
  } catch (error) {
    return trimmed;
  }
}

function normalizeReferrerPolicy(policy) {
  if (policy === null) {
    return null;
  }

  if (typeof policy !== "string") {
    return undefined;
  }

  const trimmed = policy.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.toLowerCase() === "default") {
    return null;
  }

  if (!SUPPORTED_BANNER_REFERRER_POLICIES.has(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function buildBannerPolicySequence(policies) {
  const normalized = [];
  const source = Array.isArray(policies) ? policies : [];
  const seen = new Set();

  for (const entry of source) {
    if (entry === null) {
      continue;
    }
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || trimmed.toLowerCase() === "default") {
      continue;
    }
    if (!SUPPORTED_BANNER_REFERRER_POLICIES.has(trimmed)) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }
    normalized.push(trimmed);
    seen.add(trimmed);
  }

  normalized.push(null);
  return normalized;
}

function attemptBannerPolicy(bannerEl) {
  const state = bannerLoadStates.get(bannerEl);
  if (!state) {
    return false;
  }

  if (state.loadToken !== currentProfileLoadToken) {
    return false;
  }

  if (!state.url) {
    bannerLoadStates.delete(bannerEl);
    if (state.fallbackSrc) {
      setBannerVisual(bannerEl, state.fallbackSrc, { referrerPolicy: null });
    } else {
      setBannerVisual(bannerEl, "", { referrerPolicy: null });
    }
    return false;
  }

  while (state.attemptIndex < state.policies.length) {
    const candidate = state.policies[state.attemptIndex];
    state.attemptIndex += 1;

    const normalizedPolicy = normalizeReferrerPolicy(candidate);
    if (normalizedPolicy === undefined) {
      continue;
    }

    bannerLoadStates.set(bannerEl, state);
    setBannerVisual(bannerEl, state.url, { referrerPolicy: normalizedPolicy });
    return true;
  }

  bannerLoadStates.delete(bannerEl);
  if (state.url) {
    devLogger.warn(
      "[channelProfile.banner] Exhausted referrer policies for banner",
      { url: state.url }
    );
  }

  if (state.fallbackSrc) {
    setBannerVisual(bannerEl, state.fallbackSrc, { referrerPolicy: null });
  } else {
    setBannerVisual(bannerEl, "", { referrerPolicy: null });
  }

  return false;
}

function setBannerVisual(el, url, { referrerPolicy } = {}) {
  if (!el) {
    return;
  }

  const resolvedUrl = typeof url === "string" ? url : "";
  const tagName = el.tagName ? el.tagName.toLowerCase() : "";

  if (tagName === "img") {
    if (referrerPolicy !== undefined) {
      const normalizedPolicy =
        referrerPolicy === null
          ? ""
          : typeof referrerPolicy === "string"
            ? referrerPolicy
            : "";

      if ("referrerPolicy" in el) {
        try {
          el.referrerPolicy = normalizedPolicy;
        } catch (error) {
          devLogger.warn(
            "[channelProfile.banner] Failed to set banner referrer policy",
            error
          );
        }
      }

      if (normalizedPolicy) {
        el.setAttribute("referrerpolicy", normalizedPolicy);
      } else {
        el.removeAttribute("referrerpolicy");
      }

      el.dataset.bannerReferrerPolicy = normalizedPolicy;
    }

    if (el.src !== resolvedUrl) {
      el.src = resolvedUrl;
    }
  } else {
    const value = resolvedUrl ? `url("${resolvedUrl}")` : "";
    if (el.style.backgroundImage !== value) {
      el.style.backgroundImage = value;
    }
  }

  if (el.dataset.bannerSrc !== resolvedUrl) {
    el.dataset.bannerSrc = resolvedUrl;
  }
}

function ensureBannerFallbackHandler(bannerEl) {
  if (!bannerEl) {
    return;
  }

  const tagName = bannerEl.tagName ? bannerEl.tagName.toLowerCase() : "";
  if (tagName !== "img") {
    return;
  }

  if (!bannerEl.dataset.bannerReferrerPolicy) {
    const initialPolicy = bannerEl.getAttribute("referrerpolicy") || "";
    bannerEl.dataset.bannerReferrerPolicy = initialPolicy;
  }

  if (bannerEl.dataset.bannerFallbackAttached === "true") {
    return;
  }

  const handleError = () => {
    const state = bannerLoadStates.get(bannerEl);
    if (state && state.loadToken !== currentProfileLoadToken) {
      return;
    }

    const activeSrc = bannerEl.currentSrc || bannerEl.src || "";
    const normalizedActive = resolveToAbsoluteUrl(activeSrc);

    if (
      state &&
      state.resolvedUrl &&
      normalizedActive &&
      normalizedActive === state.resolvedUrl
    ) {
      const retried = attemptBannerPolicy(bannerEl);
      if (retried) {
        return;
      }
      return;
    }

    const fallbackAttr =
      (typeof bannerEl.dataset?.fallbackSrc === "string"
        ? bannerEl.dataset.fallbackSrc.trim()
        : "") ||
      bannerEl.getAttribute("data-fallback-src") ||
      "";
    const fallbackSrc =
      (state && state.fallbackSrc) || fallbackAttr || FALLBACK_CHANNEL_BANNER;
    const fallbackResolved =
      (state && state.resolvedFallback) || resolveToAbsoluteUrl(fallbackSrc);

    bannerLoadStates.delete(bannerEl);

    if (fallbackSrc && normalizedActive !== fallbackResolved) {
      setBannerVisual(bannerEl, fallbackSrc, { referrerPolicy: null });
    } else if (!fallbackSrc) {
      setBannerVisual(bannerEl, "", { referrerPolicy: null });
    }
  };

  bannerEl.addEventListener("error", handleError, { passive: true });
  bannerEl.dataset.bannerFallbackAttached = "true";
}

function applyBannerWithPolicies({
  bannerEl,
  url,
  fallbackSrc,
  policies = DEFAULT_BANNER_REFERRER_POLICY_SEQUENCE,
  loadToken
} = {}) {
  if (!bannerEl) {
    return;
  }

  const normalizedUrl =
    typeof url === "string" && url.trim() ? url.trim() : "";
  const fallbackCandidate =
    (typeof fallbackSrc === "string" && fallbackSrc.trim()) ||
    FALLBACK_CHANNEL_BANNER;
  const normalizedPolicies = buildBannerPolicySequence(policies);
  const expectedToken = Number.isInteger(loadToken)
    ? loadToken
    : currentProfileLoadToken;

  if (!normalizedUrl) {
    bannerLoadStates.delete(bannerEl);
    setBannerVisual(bannerEl, fallbackCandidate, { referrerPolicy: null });
    return;
  }

  bannerLoadStates.set(bannerEl, {
    url: normalizedUrl,
    resolvedUrl: resolveToAbsoluteUrl(normalizedUrl),
    fallbackSrc: fallbackCandidate,
    resolvedFallback: resolveToAbsoluteUrl(fallbackCandidate),
    policies: normalizedPolicies,
    attemptIndex: 0,
    loadToken: expectedToken
  });

  attemptBannerPolicy(bannerEl);
}

function getChannelZapButton() {
  if (cachedZapButton && !document.body.contains(cachedZapButton)) {
    cachedZapButton = null;
  }
  if (!cachedZapButton) {
    cachedZapButton = document.getElementById("zapButton");
  }
  return cachedZapButton;
}

function setChannelZapVisibility(visible) {
  const zapButton = getChannelZapButton();
  const controls = getZapControlsContainer();
  const amountInput = getZapAmountInput();
  const sendButton = getZapSendButton();
  if (!zapButton) {
    return;
  }
  const app = getApp();
  const isLoggedIn =
    typeof app?.isUserLoggedIn === "function"
      ? app.isUserLoggedIn()
      : Boolean(app?.normalizeHexPubkey?.(app?.pubkey));
  const shouldShow = !!visible;
  const requiresLogin = shouldShow && !isLoggedIn;

  if (
    shouldShow &&
    (!zapPopover || zapPopoverTrigger !== zapButton)
  ) {
    setupZapButton({ force: true });
  }

  zapButton.toggleAttribute("hidden", !shouldShow);
  zapButton.disabled = !shouldShow;
  zapButton.setAttribute(
    "aria-disabled",
    (requiresLogin || !shouldShow).toString()
  );
  zapButton.setAttribute("aria-hidden", (!shouldShow).toString());
  zapButton.setAttribute("aria-expanded", "false");
  if (shouldShow) {
    zapButton.removeAttribute("tabindex");
  } else {
    zapButton.setAttribute("tabindex", "-1");
    resetZapRetryState();
    zapInFlight = false;
    clearZapReceipts();
    setZapStatus("", "neutral");
  }
  if (requiresLogin) {
    zapButton.dataset.requiresLogin = "true";
  } else {
    delete zapButton.dataset.requiresLogin;
  }
  closeZapControls();
  if (controls) {
    controls.setAttribute("aria-hidden", "true");
    controls.hidden = true;
  }
  const shouldEnableInputs = shouldShow && !requiresLogin;
  if (amountInput) {
    amountInput.disabled = !shouldEnableInputs;
  }
  if (sendButton) {
    sendButton.disabled = !shouldEnableInputs;
    sendButton.setAttribute("aria-hidden", (!shouldEnableInputs).toString());
    if (shouldEnableInputs) {
      sendButton.removeAttribute("tabindex");
      sendButton.removeAttribute("aria-busy");
      delete sendButton.dataset.state;
    } else {
      sendButton.setAttribute("tabindex", "-1");
      delete sendButton.dataset.state;
    }
  }

  const hasWallet =
    typeof app?.hasActiveWalletConnection === "function"
      ? app.hasActiveWalletConnection()
      : (() => {
          const settings =
            typeof app?.getActiveNwcSettings === "function"
              ? app.getActiveNwcSettings()
              : {};
          const uri =
            typeof settings?.nwcUri === "string" ? settings.nwcUri.trim() : "";
          return uri.length > 0;
        })();
  setZapWalletPromptVisible(shouldEnableInputs && !hasWallet);
  if (shouldEnableInputs) {
    setupZapWalletLink();
  }
}

function isSessionActorWithoutLogin() {
  const app = getApp();
  const isLoggedIn =
    typeof app?.isUserLoggedIn === "function"
      ? app.isUserLoggedIn()
      : Boolean(app?.normalizeHexPubkey?.(app?.pubkey) || app?.pubkey);
  if (isLoggedIn) {
    return false;
  }

  return getSessionActorPubkey().length > 0;
}

function getSessionActorPubkey() {
  return typeof nostrClient?.sessionActor?.pubkey === "string"
    ? nostrClient.sessionActor.pubkey.trim()
    : "";
}

function getChannelShareButton() {
  if (
    cachedChannelShareButton &&
    !document.body.contains(cachedChannelShareButton)
  ) {
    cachedChannelShareButton = null;
  }
  if (!cachedChannelShareButton) {
    cachedChannelShareButton = document.getElementById("channelShareBtn");
  }
  return cachedChannelShareButton;
}

function getChannelMenuElement() {
  if (cachedChannelMenu && cachedChannelMenu.isConnected) {
    return cachedChannelMenu;
  }

  const doc = typeof document !== "undefined" ? document : null;
  const existing = doc?.getElementById("channelProfileMoreMenu") || null;
  const HTMLElementCtor =
    doc?.defaultView?.HTMLElement ||
    (typeof HTMLElement !== "undefined" ? HTMLElement : null);
  if (HTMLElementCtor && existing instanceof HTMLElementCtor) {
    cachedChannelMenu = existing;
  } else {
    cachedChannelMenu = null;
  }
  return cachedChannelMenu;
}

function getZapControlsContainer() {
  if (cachedZapControls) {
    if (cachedZapControls.isConnected) {
      return cachedZapControls;
    }

    const doc = typeof document !== "undefined" ? document : null;
    const HTMLElementCtor =
      doc?.defaultView?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null);
    const existing = doc?.getElementById("zapControls") || null;
    if (existing && (!HTMLElementCtor || existing instanceof HTMLElementCtor)) {
      cachedZapControls = existing;
      return cachedZapControls;
    }

    return cachedZapControls;
  }

  const doc = typeof document !== "undefined" ? document : null;
  const existing = doc?.getElementById("zapControls") || null;
  const HTMLElementCtor =
    doc?.defaultView?.HTMLElement ||
    (typeof HTMLElement !== "undefined" ? HTMLElement : null);
  if (existing && (!HTMLElementCtor || existing instanceof HTMLElementCtor)) {
    cachedZapControls = existing;
  } else {
    cachedZapControls = null;
  }
  return cachedZapControls;
}

function getZapFormElement() {
  if (cachedZapForm) {
    if (cachedZapForm.isConnected) {
      return cachedZapForm;
    }

    const container = getZapControlsContainer();
    if (container) {
      const existing = container.querySelector("#zapForm");
      if (existing) {
        cachedZapForm = existing;
      }
    }

    return cachedZapForm;
  }

  const container = getZapControlsContainer();
  cachedZapForm = container?.querySelector("#zapForm") || null;
  return cachedZapForm;
}

function getZapAmountInput() {
  if (cachedZapAmountInput) {
    if (cachedZapAmountInput.isConnected) {
      return cachedZapAmountInput;
    }

    const container = getZapControlsContainer();
    if (container) {
      const existing = container.querySelector("#zapAmountInput");
      if (existing) {
        cachedZapAmountInput = existing;
      }
    }

    return cachedZapAmountInput;
  }

  const container = getZapControlsContainer();
  cachedZapAmountInput = container?.querySelector("#zapAmountInput") || null;
  return cachedZapAmountInput;
}

function getZapSplitSummaryElement() {
  if (cachedZapSplitSummary) {
    if (cachedZapSplitSummary.isConnected) {
      return cachedZapSplitSummary;
    }

    const container = getZapControlsContainer();
    if (container) {
      const existing = container.querySelector("#zapSplitSummary");
      if (existing) {
        cachedZapSplitSummary = existing;
      }
    }

    return cachedZapSplitSummary;
  }

  const container = getZapControlsContainer();
  cachedZapSplitSummary = container?.querySelector("#zapSplitSummary") || null;
  return cachedZapSplitSummary;
}

function getZapStatusElement() {
  if (cachedZapStatus) {
    if (cachedZapStatus.isConnected) {
      return cachedZapStatus;
    }

    const container = getZapControlsContainer();
    if (container) {
      const existing = container.querySelector("#zapStatus");
      if (existing) {
        cachedZapStatus = existing;
      }
    }

    return cachedZapStatus;
  }

  const container = getZapControlsContainer();
  cachedZapStatus = container?.querySelector("#zapStatus") || null;
  return cachedZapStatus;
}

function getZapReceiptsList() {
  if (cachedZapReceipts) {
    if (cachedZapReceipts.isConnected) {
      return cachedZapReceipts;
    }

    const container = getZapControlsContainer();
    if (container) {
      const existing = container.querySelector("#zapReceipts");
      if (existing) {
        cachedZapReceipts = existing;
      }
    }

    return cachedZapReceipts;
  }

  const container = getZapControlsContainer();
  cachedZapReceipts = container?.querySelector("#zapReceipts") || null;
  return cachedZapReceipts;
}

function getZapSendButton() {
  if (cachedZapSendBtn) {
    if (cachedZapSendBtn.isConnected) {
      return cachedZapSendBtn;
    }

    const container = getZapControlsContainer();
    if (container) {
      const existing = container.querySelector("#zapSendBtn");
      if (existing) {
        cachedZapSendBtn = existing;
      }
    }

    return cachedZapSendBtn;
  }

  const container = getZapControlsContainer();
  cachedZapSendBtn = container?.querySelector("#zapSendBtn") || null;
  return cachedZapSendBtn;
}

function getZapWalletPrompt() {
  if (cachedZapWalletPrompt) {
    if (cachedZapWalletPrompt.isConnected) {
      return cachedZapWalletPrompt;
    }

    const container = getZapControlsContainer();
    if (container) {
      const existing = container.querySelector("#zapWalletPrompt");
      if (existing) {
        cachedZapWalletPrompt = existing;
      }
    }

    return cachedZapWalletPrompt;
  }

  const container = getZapControlsContainer();
  cachedZapWalletPrompt = container?.querySelector("#zapWalletPrompt") || null;
  return cachedZapWalletPrompt;
}

function getZapWalletLink() {
  if (cachedZapWalletLink) {
    if (cachedZapWalletLink.isConnected) {
      return cachedZapWalletLink;
    }

    const container = getZapControlsContainer();
    if (container) {
      const existing = container.querySelector("#zapWalletLink");
      if (existing) {
        cachedZapWalletLink = existing;
      }
    }

    return cachedZapWalletLink;
  }

  const container = getZapControlsContainer();
  cachedZapWalletLink = container?.querySelector("#zapWalletLink") || null;
  return cachedZapWalletLink;
}

function getZapCloseButton() {
  if (cachedZapCloseBtn) {
    if (cachedZapCloseBtn.isConnected) {
      return cachedZapCloseBtn;
    }

    const container = getZapControlsContainer();
    if (container) {
      const existing = container.querySelector("#zapCloseBtn");
      if (existing) {
        cachedZapCloseBtn = existing;
      }
    }

    return cachedZapCloseBtn;
  }

  const container = getZapControlsContainer();
  cachedZapCloseBtn = container?.querySelector("#zapCloseBtn") || null;
  return cachedZapCloseBtn;
}

function cacheZapPanelElements(panel) {
  if (!panel || panel.nodeType !== 1) {
    cachedZapControls = null;
    cachedZapForm = null;
    cachedZapAmountInput = null;
    cachedZapSplitSummary = null;
    cachedZapStatus = null;
    cachedZapReceipts = null;
    cachedZapWalletPrompt = null;
    cachedZapWalletLink = null;
    cachedZapCloseBtn = null;
    cachedZapSendBtn = null;
    zapPopoverOpenPromise = null;
    zapShouldFocusOnOpen = false;
    return;
  }

  cachedZapControls = panel;
  cachedZapForm = panel.querySelector("#zapForm");
  cachedZapAmountInput = panel.querySelector("#zapAmountInput");
  cachedZapSplitSummary = panel.querySelector("#zapSplitSummary");
  cachedZapStatus = panel.querySelector("#zapStatus");
  cachedZapReceipts = panel.querySelector("#zapReceipts");
  cachedZapWalletPrompt = panel.querySelector("#zapWalletPrompt");
  cachedZapWalletLink = panel.querySelector("#zapWalletLink");
  cachedZapCloseBtn = panel.querySelector("#zapCloseBtn");
  cachedZapSendBtn = panel.querySelector("#zapSendBtn");
}

function initializeZapPanel() {
  const zapButton = getChannelZapButton();
  const amountInput = getZapAmountInput();
  const zapForm = getZapFormElement();
  const sendButton = getZapSendButton();
  if (!zapButton || !amountInput || !zapForm || !sendButton) {
    return;
  }

  zapButton.setAttribute("aria-expanded", "false");

  if (zapForm.dataset.initialized !== "true") {
    zapForm.addEventListener("submit", handleZapSend);
    zapForm.dataset.initialized = "true";
  }

  if (amountInput.dataset.initialized !== "true") {
    amountInput.addEventListener("input", handleZapAmountChange);
    amountInput.addEventListener("change", handleZapAmountChange);
    amountInput.dataset.initialized = "true";
  }

  const closeBtn = getZapCloseButton();
  if (closeBtn && closeBtn.dataset.initialized !== "true") {
    closeBtn.addEventListener("click", (event) => {
      event?.preventDefault?.();
      closeZapControls({ focusButton: true });
    });
    closeBtn.dataset.initialized = "true";
  }

  setupZapWalletLink();

  const app = getApp();
  const activeSettings =
    typeof app?.getActiveNwcSettings === "function"
      ? app.getActiveNwcSettings()
      : {};

  const hasWallet =
    typeof app?.hasActiveWalletConnection === "function"
      ? app.hasActiveWalletConnection()
      : (() => {
          const settings =
            typeof app?.getActiveNwcSettings === "function"
              ? app.getActiveNwcSettings()
              : {};
          const uri =
            typeof settings?.nwcUri === "string" ? settings.nwcUri.trim() : "";
          return uri.length > 0;
        })();

  const shouldShowPrompt = !zapButton.hasAttribute("hidden") && !hasWallet;
  setZapWalletPromptVisible(shouldShowPrompt);

  if (
    Number.isFinite(activeSettings?.defaultZap) &&
    activeSettings.defaultZap > 0
  ) {
    amountInput.value = Math.max(0, Math.round(activeSettings.defaultZap));
  } else if (!amountInput.value) {
    amountInput.value = "";
  }

  updateZapSplitSummary();
  setZapStatus("", "neutral");
  clearZapReceipts();
}

function setZapWalletPromptVisible(visible) {
  const prompt = getZapWalletPrompt();
  if (!prompt) {
    return;
  }
  const shouldShow = !!visible;
  prompt.toggleAttribute("hidden", !shouldShow);
  prompt.setAttribute("aria-hidden", (!shouldShow).toString());
}

function setupZapWalletLink() {
  const link = getZapWalletLink();
  if (!link) {
    return;
  }
  if (link.dataset.initialized === "true") {
    return;
  }
  link.addEventListener("click", (event) => {
    event?.preventDefault?.();
    const app = getApp();
    if (typeof app?.openWalletPane === "function") {
      Promise.resolve()
        .then(() => app.openWalletPane())
        .catch((error) => {
          devLogger.warn(
            "[zap] Failed to open wallet pane from channel view:",
            error
          );
          app?.showError?.("Wallet settings are not available right now.");
        });
    } else {
      devLogger.warn(
        "[zap] Wallet pane requested but application did not expose openWalletPane()."
      );
      app?.showError?.("Wallet settings are not available right now.");
    }
  });
  link.dataset.initialized = "true";
}

function focusZapAmountField() {
  const amountInput = getZapAmountInput();
  if (amountInput && typeof amountInput.focus === "function") {
    try {
      amountInput.focus({ preventScroll: true });
    } catch (error) {
      amountInput.focus();
    }
  }
}

function isZapControlsOpen() {
  if (typeof zapPopover?.isOpen === "function") {
    return zapPopover.isOpen();
  }
  return zapControlsOpen;
}

function openZapControls({ focus = false } = {}) {
  const zapButton = getChannelZapButton();
  if (!zapButton) {
    zapShouldFocusOnOpen = false;
    return false;
  }

  if (!zapPopover || zapPopoverTrigger !== zapButton) {
    const initialized = setupZapButton({ force: true });
    if (!initialized || !zapPopover || zapPopoverTrigger !== zapButton) {
      zapShouldFocusOnOpen = false;
      return false;
    }
  }

  if (zapPopoverOpenPromise) {
    if (focus) {
      zapShouldFocusOnOpen = true;
    }
    return true;
  }

  zapShouldFocusOnOpen = focus;

  let result;
  try {
    result = zapPopover.open();
  } catch (error) {
    zapShouldFocusOnOpen = false;
    zapPopoverOpenPromise = null;
    devLogger.warn("[zap] Failed to open zap popover", error);
    return false;
  }

  if (result && typeof result.then === "function") {
    const pending = result
      .catch((error) => {
        devLogger.warn("[zap] Zap popover open rejected", error);
        return false;
      })
      .finally(() => {
        zapPopoverOpenPromise = null;
        zapShouldFocusOnOpen = false;
      });
    zapPopoverOpenPromise = pending;
    return true;
  }

  zapShouldFocusOnOpen = false;
  zapPopoverOpenPromise = null;
  return Boolean(result);
}

function closeZapControls({ focusButton = false } = {}) {
  const zapButton = getChannelZapButton();
  zapShouldFocusOnOpen = false;
  zapPopoverOpenPromise = null;

  if (zapPopover) {
    const result = zapPopover.close({ restoreFocus: focusButton });
    if (!result && focusButton && zapButton && typeof zapButton.focus === "function") {
      try {
        zapButton.focus({ preventScroll: true });
      } catch (error) {
        zapButton.focus();
      }
    }
    return Boolean(result);
  }

  zapControlsOpen = false;
  if (zapButton) {
    zapButton.setAttribute("aria-expanded", "false");
    if (focusButton && typeof zapButton.focus === "function") {
      try {
        zapButton.focus({ preventScroll: true });
      } catch (error) {
        zapButton.focus();
      }
    }
  }
  return false;
}

function updateZapSplitSummary({ overrideFee = null } = {}) {
  const summaryEl = getZapSplitSummaryElement();
  if (!summaryEl) {
    return;
  }

  const amountInput = getZapAmountInput();
  const numeric = Math.max(0, Math.round(Number(amountInput?.value || 0)));
  if (!numeric) {
    summaryEl.textContent = "Enter an amount to view the split.";
    return;
  }

  const shares = calculateZapShares(numeric, overrideFee);

  const parts = [];
  const creatorEntry = getCachedLightningEntry(currentChannelLightningAddress);
  const creatorMin = formatMinRequirement(creatorEntry?.metadata);
  let creatorText = `Creator: ${shares.creatorShare} sats`;
  if (Number.isFinite(creatorMin) && creatorMin > 0) {
    creatorText += ` (min ${creatorMin})`;
  }
  parts.push(creatorText);

  if (shares.platformShare > 0) {
    const platformEntry = getCachedLightningEntry(
      getCachedPlatformLightningAddress()
    );
    const platformMin = formatMinRequirement(platformEntry?.metadata);
    let platformText = `Platform: ${shares.platformShare} sats`;
    if (Number.isFinite(platformMin) && platformMin > 0) {
      platformText += ` (min ${platformMin})`;
    }
    parts.push(platformText);
  }

  summaryEl.textContent = parts.join(" • ");
}

function setZapStatus(message, tone = "neutral") {
  const statusEl = getZapStatusElement();
  if (!statusEl) {
    return;
  }

  const normalizedTone = typeof tone === "string" ? tone : "neutral";
  statusEl.textContent = message || "";
  statusEl.classList.remove(
    "text-text",
    "text-muted",
    "text-info",
    "text-critical",
    "text-warning-strong"
  );

  if (!message) {
    statusEl.classList.add("text-muted");
    return;
  }

  switch (normalizedTone) {
    case "success":
      statusEl.classList.add("text-info");
      break;
    case "error":
      statusEl.classList.add("text-critical");
      break;
    case "warning":
      statusEl.classList.add("text-warning-strong");
      break;
    default:
      statusEl.classList.add("text-text");
      break;
  }
}

function clearZapReceipts() {
  const list = getZapReceiptsList();
  if (!list) {
    return;
  }
  list.innerHTML = "";
}

function renderZapReceipts(receipts, { partial = false } = {}) {
  const list = getZapReceiptsList();
  if (!list) {
    return;
  }

  list.innerHTML = "";

  const doc = list.ownerDocument || (typeof document !== "undefined" ? document : null);

  if (!Array.isArray(receipts) || receipts.length === 0) {
    if (partial) {
      const emptyItem = doc?.createElement?.("li");
      emptyItem.className =
        "rounded border border-border bg-panel/70 p-3 text-text";
      emptyItem.textContent = "No receipts were returned for this attempt.";
      list.appendChild(emptyItem);
    }
    return;
  }

  receipts.forEach((receipt) => {
    if (!receipt) {
      return;
    }

    const li = doc?.createElement?.("li");
    if (!li) {
      return;
    }
    li.className = "rounded border border-border bg-panel/70 p-3";

    const header = doc?.createElement?.("div");
    if (!header) {
      return;
    }
    header.className =
      "flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text";

    const shareType = receipt.recipientType || receipt.type || "creator";
    const shareLabel = doc?.createElement?.("span");
    shareLabel.textContent = `${describeShareType(shareType)} • ${Math.max(
      0,
      Math.round(Number(receipt.amount || 0))
    )} sats`;

    const status = doc?.createElement?.("span");
    if (!shareLabel || !status) {
      return;
    }
    const isSuccess = receipt.status
      ? receipt.status === "success"
      : !receipt.error;
    status.textContent = isSuccess ? "Success" : "Failed";
    status.className = isSuccess ? "text-info" : "text-critical";

    header.appendChild(shareLabel);
    header.appendChild(status);
    li.appendChild(header);

    const address = doc?.createElement?.("p");
    if (address) {
      address.className = "mt-1 text-xs text-text break-all";
    }
    const addressValue = receipt.address || "";
    if (address && addressValue) {
      address.textContent = addressValue;
      li.appendChild(address);
    }

    const detail = doc?.createElement?.("p");
    if (!detail) {
      return;
    }
    detail.className = "mt-2 text-xs text-muted";
    if (isSuccess) {
      let detailMessage = "Invoice settled.";
      const preimage = receipt.payment?.result?.preimage;
      if (typeof preimage === "string" && preimage) {
        detailMessage = `Preimage: ${preimage.slice(0, 18)}${
          preimage.length > 18 ? "…" : ""
        }`;
      }
      detail.textContent = detailMessage;
    } else {
      const errorMessage =
        (receipt.error && receipt.error.message) ||
        (typeof receipt.error === "string" ? receipt.error : "Payment failed.");
      detail.textContent = errorMessage;
    }
    li.appendChild(detail);

    list.appendChild(li);
  });
}

function resetZapRetryState() {
  pendingZapRetry = null;
  const zapButton = getChannelZapButton();
  if (zapButton) {
    delete zapButton.dataset.retryPending;
    zapButton.setAttribute("aria-label", "Open zap dialog");
    zapButton.title = "Open zap dialog";
  }
  const sendButton = getZapSendButton();
  if (sendButton) {
    delete sendButton.dataset.retryPending;
    sendButton.textContent = "Send";
    sendButton.setAttribute("aria-label", "Send a zap");
    sendButton.removeAttribute("title");
  }
}

function markZapRetryPending(shares) {
  const validShares = Array.isArray(shares)
    ? shares.filter((share) => share && share.amount > 0)
    : [];
  if (!validShares.length) {
    resetZapRetryState();
    return;
  }

  pendingZapRetry = { shares: validShares, createdAt: Date.now() };
  const zapButton = getChannelZapButton();
  if (zapButton) {
    zapButton.dataset.retryPending = "true";
    zapButton.setAttribute("aria-label", "Retry failed zap shares");
    zapButton.title = "Retry failed zap shares";
  }
  const sendButton = getZapSendButton();
  if (sendButton) {
    sendButton.dataset.retryPending = "true";
    sendButton.textContent = "Retry";
    sendButton.setAttribute("aria-label", "Retry failed zap shares");
    sendButton.title = "Retry failed zap shares";
  }
}

function getZapVideoEvent() {
  const lightningAddress = currentChannelLightningAddress || "";
  const baseEvent =
    currentChannelProfileEvent && typeof currentChannelProfileEvent === "object"
      ? { ...currentChannelProfileEvent }
      : {};
  return {
    kind: typeof baseEvent.kind === "number" ? baseEvent.kind : 0,
    id: baseEvent.id || currentChannelHex || "",
    pubkey: baseEvent.pubkey || currentChannelHex || "",
    tags: Array.isArray(baseEvent.tags) ? [...baseEvent.tags] : [],
    content: typeof baseEvent.content === "string" ? baseEvent.content : "",
    created_at: baseEvent.created_at || Math.floor(Date.now() / 1000),
    lightningAddress
  };
}

async function prepareLightningContext({ amount, overrideFee = null }) {
  if (!currentChannelLightningAddress) {
    throw new Error("This creator has not configured a Lightning address yet.");
  }

  const shares = calculateZapShares(amount, overrideFee);
  if (!shares.total) {
    throw new Error("Enter a zap amount greater than zero.");
  }

  const creatorEntry = await fetchLightningMetadata(
    currentChannelLightningAddress
  );
  if (shares.creatorShare > 0) {
    try {
      validateInvoiceAmount(creatorEntry.metadata, shares.creatorShare);
    } catch (error) {
      const detail = error?.message || "Unable to validate creator share.";
      throw new Error(`Creator share error: ${detail}`);
    }
  }

  let platformEntry = null;
  let platformAddress = "";
  if (shares.platformShare > 0) {
    platformAddress = getCachedPlatformLightningAddress();
    if (!platformAddress) {
      platformAddress = await getPlatformLightningAddress({
        forceRefresh: false
      });
      setCachedPlatformLightningAddress(platformAddress || "");
    }
    if (!platformAddress) {
      throw new Error("Platform Lightning address is unavailable.");
    }

    platformEntry = await fetchLightningMetadata(platformAddress);
    try {
      validateInvoiceAmount(platformEntry.metadata, shares.platformShare);
    } catch (error) {
      const detail = error?.message || "Unable to validate platform share.";
      throw new Error(`Platform share error: ${detail}`);
    }
  }

  updateZapSplitSummary();

  return {
    shares,
    creatorEntry,
    platformEntry,
    platformAddress
  };
}

function createZapDependencies({
  creatorEntry,
  platformEntry,
  shares,
  shareTracker,
  walletSettings
}) {
  const creatorKey = normalizeLightningAddressKey(
    creatorEntry?.address || currentChannelLightningAddress
  );
  const platformKey = normalizeLightningAddressKey(
    platformEntry?.address || getCachedPlatformLightningAddress()
  );

  let activeShare = null;

  return {
    lnurl: {
      resolveLightningAddress: (value) => {
        const normalized = normalizeLightningAddressKey(value);
        if (normalized && normalized === creatorKey) {
          activeShare = "creator";
          if (creatorEntry?.resolved) {
            return { ...creatorEntry.resolved };
          }
        } else if (normalized && normalized === platformKey) {
          activeShare = "platform";
          if (platformEntry?.resolved) {
            return { ...platformEntry.resolved };
          }
        } else {
          activeShare = null;
        }

        const resolved = resolveLightningAddress(value);
        if (normalized) {
          rememberLightningMetadata({
            key: normalized,
            address: resolved.address || value,
            resolved,
            fetchedAt: Date.now()
          });
        }
        return resolved;
      },
      fetchPayServiceData: async (url) => {
        const cached = getCachedMetadataByUrl(url);
        if (cached?.metadata && isMetadataEntryFresh(cached)) {
          return cached.metadata;
        }

        const metadata = await fetchPayServiceData(url);
        if (cached) {
          rememberLightningMetadata({
            ...cached,
            metadata,
            fetchedAt: Date.now()
          });
        }
        return metadata;
      },
      validateInvoiceAmount,
      requestInvoice
    },
    wallet: {
      ensureWallet: async (options) => {
        try {
          return await ensureWallet(options);
        } catch (error) {
          logZapError(
            "wallet.ensureWallet",
            {
              tracker: shareTracker,
              context: { shares },
              walletSettings: options?.settings
            },
            error
          );
          throw error;
        }
      },
      sendPayment: async (bolt11, params) => {
        const shareType = activeShare || "unknown";
        const shareAmount =
          shareType === "platform" ? shares.platformShare : shares.creatorShare;
        const address =
          shareType === "platform"
            ? platformEntry?.address || getCachedPlatformLightningAddress()
            : creatorEntry?.address || currentChannelLightningAddress;
        const normalizedParams = {
          ...(params || {})
        };
        if (
          !Number.isFinite(normalizedParams.amountSats) &&
          Number.isFinite(shareAmount)
        ) {
          normalizedParams.amountSats = shareAmount;
        }
        if (!normalizedParams.settings && walletSettings) {
          normalizedParams.settings = walletSettings;
        }
        try {
          const payment = await sendWalletPayment(bolt11, normalizedParams);
          if (Array.isArray(shareTracker)) {
            shareTracker.push({
              type: shareType,
              status: "success",
              amount: shareAmount,
              address,
              payment
            });
          }
          return payment;
        } catch (error) {
          if (Array.isArray(shareTracker)) {
            shareTracker.push({
              type: shareType,
              status: "error",
              amount: shareAmount,
              address,
              error
            });
          }
          logZapError(
            "wallet.sendPayment",
            {
              shareType,
              amount: shareAmount,
              address,
              tracker: shareTracker,
              context: { shares }
            },
            error
          );
          throw error;
        } finally {
          activeShare = null;
        }
      }
    },
    platformAddress: {
      getPlatformLightningAddress: async () => {
        if (platformEntry?.address) {
          return platformEntry.address;
        }
        const cachedAddress = getCachedPlatformLightningAddress();
        if (cachedAddress) {
          return cachedAddress;
        }
        const fallback = await getPlatformLightningAddress({
          forceRefresh: false
        });
        setCachedPlatformLightningAddress(fallback || "");
        return fallback;
      }
    }
  };
}

function getWalletSettingsOrPrompt() {
  const app = getApp();
  const settings =
    typeof app?.getActiveNwcSettings === "function"
      ? app.getActiveNwcSettings()
      : {};
  const normalizedUri =
    typeof settings?.nwcUri === "string" ? settings.nwcUri.trim() : "";
  if (!normalizedUri) {
    app?.showError?.("Connect a Lightning wallet to send zaps.");
    if (typeof app?.openWalletPane === "function") {
      app.openWalletPane();
    }
    return null;
  }
  return {
    ...settings,
    nwcUri: normalizedUri
  };
}

async function runZapAttempt({ amount, overrideFee = null, walletSettings }) {
  const settings = walletSettings || getWalletSettingsOrPrompt();
  if (!settings) {
    return null;
  }

  let context;
  try {
    context = await prepareLightningContext({ amount, overrideFee });
  } catch (error) {
    logZapError(
      "prepareLightningContext",
      {
        amount,
        overrideFee,
        walletSettings: settings
      },
      error
    );
    throw error;
  }
  const shareTracker = [];
  const dependencies = createZapDependencies({
    ...context,
    shareTracker,
    walletSettings: settings
  });
  const videoEvent = getZapVideoEvent();

  let previousOverride;
  const hasGlobal = typeof globalThis !== "undefined";
  if (
    hasGlobal &&
    typeof overrideFee === "number" &&
    Number.isFinite(overrideFee)
  ) {
    previousOverride = globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
    globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = overrideFee;
  }

  try {
    const result = await splitAndZap(
      {
        videoEvent,
        amountSats: context.shares.total,
        walletSettings: settings
      },
      dependencies
    );
    return { context, result, shareTracker };
  } catch (error) {
    if (Array.isArray(shareTracker) && shareTracker.length) {
      error.__zapShareTracker = shareTracker;
    }
    logZapError(
      "splitAndZap",
      {
        amount,
        overrideFee,
        walletSettings: settings,
        context,
        tracker: shareTracker
      },
      error
    );
    throw error;
  } finally {
    if (
      hasGlobal &&
      typeof overrideFee === "number" &&
      Number.isFinite(overrideFee)
    ) {
      if (typeof previousOverride === "number") {
        globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = previousOverride;
      } else if (
        globalThis &&
        "__BITVID_PLATFORM_FEE_OVERRIDE__" in globalThis
      ) {
        delete globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
      }
    }
  }
}

function handleZapAmountChange() {
  resetZapRetryState();
  updateZapSplitSummary();
}

async function executePendingRetry({ walletSettings }) {
  const retryState = pendingZapRetry;
  const shares = Array.isArray(retryState?.shares) ? retryState.shares : [];
  if (!shares.length) {
    resetZapRetryState();
    return;
  }

  const app = getApp();
  const summary = shares
    .map((share) => `${describeShareType(share.type)} ${share.amount} sats`)
    .join(", ");
  setZapStatus(`Retrying failed share(s): ${summary}`, "warning");
  clearZapReceipts();

  const aggregatedReceipts = [];
  const aggregatedTracker = [];

  for (const share of shares) {
    const overrideFee = share.type === "platform" ? 100 : 0;
    try {
      const attempt = await runZapAttempt({
        amount: share.amount,
        overrideFee,
        walletSettings
      });
      if (!attempt) {
        setZapStatus("", "neutral");
        return;
      }
      if (attempt?.result?.receipts) {
        aggregatedReceipts.push(...attempt.result.receipts);
      } else if (Array.isArray(attempt?.shareTracker)) {
        aggregatedTracker.push(...attempt.shareTracker);
      }
    } catch (error) {
      const tracker = Array.isArray(error?.__zapShareTracker)
        ? error.__zapShareTracker
        : [];
      logZapError(
        "retry.share",
        {
          shareType: share?.type || "unknown",
          amount: share?.amount,
          address: share?.address,
          walletSettings,
          tracker
        },
        error
      );
      if (tracker.length) {
        aggregatedTracker.push(...tracker);
      }
      const failureShares = tracker.filter(
        (entry) => entry && entry.status !== "success" && entry.amount > 0
      );
      markZapRetryPending(failureShares.length ? failureShares : [share]);
      const message = error?.message || "Retry failed.";
      setZapStatus(message, "error");
      app?.showError?.(message);
      renderZapReceipts(
        aggregatedTracker.length ? aggregatedTracker : tracker,
        {
          partial: true
        }
      );
      return;
    }
  }

  renderZapReceipts(
    aggregatedReceipts.length ? aggregatedReceipts : aggregatedTracker,
    { partial: false }
  );
  setZapStatus("Retry completed successfully.", "success");
  app?.showSuccess?.("Failed shares retried successfully.");
  resetZapRetryState();
}

function handleZapButtonClick(event) {
  if (event) {
    event.preventDefault();
    if (typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
  }

  const zapButton = getChannelZapButton();
  if (!zapButton) {
    return;
  }

  const requiresLogin = zapButton.dataset?.requiresLogin === "true";

  if (requiresLogin || isSessionActorWithoutLogin()) {
    channelZapPendingOpen = true;
    const doc =
      zapButton?.ownerDocument ||
      (typeof document !== "undefined" ? document : null);
    showLoginRequiredToZapNotification({ document: doc });
    return;
  }

  channelZapPendingOpen = false;

  if (!zapPopover || zapPopoverTrigger !== zapButton) {
    setupZapButton({ force: true });
  }

  if (!zapPopover) {
    return;
  }

  if (zapPopoverOpenPromise) {
    zapShouldFocusOnOpen = true;
    return;
  }

  const popoverIsOpen = isZapControlsOpen();

  if (!popoverIsOpen) {
    openZapControls({ focus: true });
    return;
  }

  if (zapInFlight) {
    return;
  }

  closeZapControls({ focusButton: true });
}

async function handleZapSend(event) {
  if (event?.preventDefault) {
    event.preventDefault();
  }

  const zapButton = getChannelZapButton();
  const amountInput = getZapAmountInput();
  const sendButton = getZapSendButton();
  const app = getApp();

  if (!amountInput || !sendButton) {
    return;
  }

  if (!zapPopover || zapPopoverTrigger !== zapButton) {
    setupZapButton({ force: true });
  }

  if (!isZapControlsOpen()) {
    if (zapPopoverOpenPromise) {
      zapShouldFocusOnOpen = true;
      return;
    }
    openZapControls({ focus: true });
    return;
  }

  if (zapPopoverOpenPromise) {
    return;
  }

  if (!zapPopover) {
    return;
  }

  if (!currentChannelLightningAddress) {
    const message = "This creator has not configured a Lightning address yet.";
    setZapStatus(message, "error");
    app?.showError?.(message);
    return;
  }

  if (zapInFlight) {
    return;
  }

  const walletSettings = getWalletSettingsOrPrompt();
  if (!walletSettings) {
    return;
  }

  zapInFlight = true;
  if (zapButton) {
    zapButton.disabled = true;
    zapButton.setAttribute("aria-disabled", "true");
  }
  sendButton.disabled = true;
  sendButton.setAttribute("aria-busy", "true");
  sendButton.dataset.state = "loading";
  amountInput.disabled = true;

  let attemptedAmount = null;
  try {
    if (pendingZapRetry?.shares?.length) {
      await executePendingRetry({ walletSettings });
      return;
    }

    const amount = Math.max(0, Math.round(Number(amountInput.value || 0)));
    attemptedAmount = amount;
    if (!amount) {
      const message = "Enter a zap amount greater than zero.";
      setZapStatus(message, "error");
      app?.showError?.(message);
      return;
    }

    clearZapReceipts();
    setZapStatus(`Sending ${amount} sats…`, "warning");

    const attempt = await runZapAttempt({ amount, walletSettings });
    if (!attempt) {
      setZapStatus("", "neutral");
      return;
    }

    const { context, result } = attempt;
    const receipts = Array.isArray(result?.receipts) ? result.receipts : [];
    renderZapReceipts(receipts, { partial: false });

    const creatorShare = context.shares.creatorShare;
    const platformShare = context.shares.platformShare;
    const summary = platformShare
      ? `Sent ${context.shares.total} sats (creator ${creatorShare}, platform ${platformShare}).`
      : `Sent ${context.shares.total} sats to the creator.`;
    setZapStatus(summary, "success");
    app?.showSuccess?.("Zap sent successfully!");
    resetZapRetryState();
  } catch (error) {
    const tracker = Array.isArray(error?.__zapShareTracker)
      ? error.__zapShareTracker
      : [];
    logZapError(
      "handleZapSend",
      {
        amount: attemptedAmount,
        walletSettings,
        tracker,
        retryAttempt:
          Array.isArray(pendingZapRetry?.shares) &&
          pendingZapRetry.shares.length
            ? pendingZapRetry.shares.length
            : undefined
      },
      error
    );
    if (tracker.length) {
      renderZapReceipts(tracker, { partial: true });
    }

    const failureShares = tracker.filter(
      (entry) => entry && entry.status !== "success" && entry.amount > 0
    );
    if (failureShares.length) {
      markZapRetryPending(failureShares);
      const summary = failureShares
        .map((share) => `${describeShareType(share.type)} ${share.amount} sats`)
        .join(", ");
      const tone = tracker.length > failureShares.length ? "warning" : "error";
      const statusMessage =
        tracker.length > failureShares.length
          ? `Partial zap failure. Press Send again to retry: ${summary}.`
          : `Zap failed. Press Send again to retry: ${summary}.`;
      setZapStatus(statusMessage, tone);
      app?.showError?.(error?.message || statusMessage);
    } else {
      resetZapRetryState();
      const message = error?.message || "Zap failed. Please try again.";
      setZapStatus(message, "error");
      app?.showError?.(message);
    }
  } finally {
    zapInFlight = false;
    if (zapButton) {
      zapButton.disabled = false;
      zapButton.removeAttribute("aria-disabled");
    }
    sendButton.disabled = false;
    sendButton.removeAttribute("aria-busy");
    delete sendButton.dataset.state;
    amountInput.disabled = false;
  }
}

function buildChannelShareUrl() {
  if (!currentChannelNpub) {
    return "";
  }

  const app = getApp();
  const base =
    typeof app?.getShareUrlBase === "function" ? app.getShareUrlBase() : "";
  if (base) {
    return `${base}#view=channel-profile&npub=${encodeURIComponent(currentChannelNpub)}`;
  }

  try {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = `#view=channel-profile&npub=${currentChannelNpub}`;
    return url.toString();
  } catch (error) {
    userLogger.warn("Falling back to basic channel share URL:", error);
    const origin = window.location?.origin || "";
    const pathname = window.location?.pathname || "";
    if (!origin && !pathname) {
      return "";
    }
    return `${origin}${pathname}#view=channel-profile&npub=${currentChannelNpub}`;
  }
}

function syncChannelShareButtonState() {
  const shareBtn = getChannelShareButton();
  if (!shareBtn) {
    return;
  }
  const hasNpub = typeof currentChannelNpub === "string" && currentChannelNpub;
  shareBtn.disabled = !hasNpub;
  shareBtn.setAttribute("aria-disabled", (!hasNpub).toString());
  shareBtn.classList.toggle("opacity-50", !hasNpub);
  shareBtn.classList.toggle("cursor-not-allowed", !hasNpub);
}

function setupChannelShareButton() {
  const shareBtn = getChannelShareButton();
  if (!shareBtn) {
    return;
  }

  const app = getApp();

  syncChannelShareButtonState();

  if (shareBtn.dataset.initialized === "true") {
    return;
  }

  shareBtn.addEventListener("click", () => {
    const shareUrl = buildChannelShareUrl();
    if (!shareUrl) {
      app?.showError?.("Could not generate channel link.");
      return;
    }

    navigator.clipboard
      .writeText(shareUrl)
      .then(() => app?.showSuccess?.("Channel link copied to clipboard!"))
      .catch(() => app?.showError?.("Failed to copy the link."));
  });

  shareBtn.dataset.initialized = "true";
}

function setupChannelMoreMenu() {
  const doc = typeof document !== "undefined" ? document : null;
  const moreBtn = doc?.getElementById("channelMoreBtn") || null;

  if (!moreBtn) {
    if (channelMenuPopover?.destroy) {
      channelMenuPopover.destroy();
    }
    channelMenuPopover = null;
    cachedChannelMenu = null;
    channelMenuOpen = false;
    return;
  }

  if (channelMenuPopover?.destroy) {
    channelMenuPopover.destroy();
    channelMenuPopover = null;
  }

  const documentRef =
    moreBtn.ownerDocument || (typeof document !== "undefined" ? document : null);

  const render = ({ document: docRef }) => {
    const panel = createChannelProfileMenuPanel({
      document: docRef,
      context: "channel-profile",
    });

    if (!panel) {
      return null;
    }

    panel.id = "channelProfileMoreMenu";
    panel.dataset.state = panel.dataset.state || "closed";
    panel.setAttribute("aria-hidden", "true");
    panel.hidden = true;

    cachedChannelMenu = panel;

    const buttons = panel.querySelectorAll("button[data-action]");
    buttons.forEach((button) => {
      if (button.dataset.channelMenuBound === "true") {
        return;
      }
      button.dataset.channelMenuBound = "true";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const dataset = {};
        Object.entries(button.dataset || {}).forEach(([key, value]) => {
          if (key === "channelMenuBound") {
            return;
          }
          dataset[key] = value;
        });
        if (!dataset.context) {
          dataset.context = "channel-profile";
        }
        if (!dataset.author && currentChannelHex) {
          dataset.author = currentChannelHex;
        }
        if (!dataset.npub && currentChannelNpub) {
          dataset.npub = currentChannelNpub;
        }

        const action = dataset.action || "";
        try {
          await handleChannelMenuAction(action, dataset);
        } finally {
          channelMenuPopover?.close();
        }
      });
    });

    updateChannelMenuState();

    return panel;
  };

  const popover = createPopover(moreBtn, render, {
    document: documentRef,
    placement: "bottom-end",
    restoreFocusOnClose: true,
  });

  if (!popover) {
    return;
  }

  const originalOpen = popover.open?.bind(popover);
  if (originalOpen) {
    popover.open = async (...args) => {
      const result = await originalOpen(...args);
      if (result) {
        channelMenuOpen = true;
        const panel = getChannelMenuElement();
        if (panel) {
          panel.dataset.state = "open";
          panel.hidden = false;
          panel.setAttribute("aria-hidden", "false");
        }
        moreBtn.setAttribute("aria-expanded", "true");
      }
      return result;
    };
  }

  const originalClose = popover.close?.bind(popover);
  if (originalClose) {
    popover.close = (options = {}) => {
      const wasOpen = typeof popover.isOpen === "function" && popover.isOpen();
      const result = originalClose(options);
      if (wasOpen && result) {
        channelMenuOpen = false;
        const panel = getChannelMenuElement();
        if (panel) {
          panel.dataset.state = "closed";
          panel.hidden = true;
          panel.setAttribute("aria-hidden", "true");
        }
        moreBtn.setAttribute("aria-expanded", "false");
      }
      return result;
    };
  }

  const originalDestroy = popover.destroy?.bind(popover);
  if (originalDestroy) {
    popover.destroy = (...args) => {
      originalDestroy(...args);
      if (channelMenuPopover === popover) {
        channelMenuPopover = null;
      }
      channelMenuOpen = false;
      cachedChannelMenu = null;
    };
  }

  channelMenuPopover = popover;

  if (moreBtn.dataset.initialized !== "true") {
    moreBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!channelMenuPopover) {
        return;
      }
      channelMenuPopover.toggle();
    });
    moreBtn.dataset.initialized = "true";
  }

  moreBtn.setAttribute("aria-expanded", "false");
}

async function handleChannelMenuAction(action, dataset = {}) {
  const normalized = typeof action === "string" ? action.trim() : "";
  if (!normalized) {
    return;
  }

  const detail = { ...dataset };
  if (!detail.context) {
    detail.context = "channel-profile";
  }
  if (!detail.author && currentChannelHex) {
    detail.author = currentChannelHex;
  }
  if (!detail.npub && currentChannelNpub) {
    detail.npub = currentChannelNpub;
  }

  const app = getApp();

  try {
    await app?.handleMoreMenuAction?.(normalized, detail);
  } catch (error) {
    userLogger.error("Failed to handle channel menu action:", error);
  }
}

async function updateChannelMenuState() {
  const menu = getChannelMenuElement();
  if (!menu) {
    return;
  }

  const app = getApp();

  try {
    await accessControl.ensureReady();
  } catch (error) {
    userLogger.warn("Failed to refresh moderation lists for channel menu:", error);
  }

  try {
    await moderationService.ensureViewerMuteListLoaded();
  } catch (error) {
    userLogger.warn("Failed to refresh viewer mute list for channel menu:", error);
  }

  const canBlacklist =
    typeof app?.canCurrentUserManageBlacklist === "function"
      ? app.canCurrentUserManageBlacklist()
      : false;

  const buttons = menu.querySelectorAll("button[data-action]");
  const toggleButtonVisibility = (button, shouldShow) => {
    if (!button) {
      return;
    }
    if (shouldShow) {
      button.removeAttribute("hidden");
      button.setAttribute("aria-hidden", "false");
    } else {
      button.setAttribute("hidden", "");
      button.setAttribute("aria-hidden", "true");
    }
  };

  buttons.forEach((button) => {
    if (!button || button.nodeType !== 1) {
      return;
    }

    const action = button.dataset.action || "";
    if (action === "copy-npub") {
      if (currentChannelNpub) {
        button.dataset.npub = currentChannelNpub;
        button.removeAttribute("hidden");
        button.setAttribute("aria-hidden", "false");
      } else {
        delete button.dataset.npub;
        button.setAttribute("aria-hidden", "true");
        button.setAttribute("hidden", "");
      }
      return;
    }

    if (action === "block-author") {
      if (currentChannelHex) {
        button.dataset.author = currentChannelHex;
        button.removeAttribute("hidden");
        button.setAttribute("aria-hidden", "false");
      } else {
        delete button.dataset.author;
        button.setAttribute("aria-hidden", "true");
        button.setAttribute("hidden", "");
      }
      return;
    }

    if (action === "mute-author" || action === "unmute-author") {
      if (currentChannelHex) {
        button.dataset.author = currentChannelHex;
      } else {
        delete button.dataset.author;
      }

      let isMuted = false;
      if (currentChannelHex) {
        try {
          isMuted = moderationService.isAuthorMutedByViewer(currentChannelHex) === true;
        } catch (error) {
          userLogger.warn("Failed to resolve viewer mute state for channel menu:", error);
        }
      }

      const shouldShow = action === "mute-author" ? !isMuted : isMuted;
      toggleButtonVisibility(button, shouldShow && !!currentChannelHex);
      return;
    }

    if (action === "blacklist-author") {
      if (canBlacklist && currentChannelHex) {
        button.dataset.author = currentChannelHex;
        if (currentChannelNpub) {
          button.dataset.npub = currentChannelNpub;
        } else {
          delete button.dataset.npub;
        }
        button.removeAttribute("hidden");
        button.setAttribute("aria-hidden", "false");
      } else {
        delete button.dataset.author;
        delete button.dataset.npub;
        button.setAttribute("aria-hidden", "true");
        button.setAttribute("hidden", "");
      }
    }
  });
}

/**
 * Initialize the channel profile view.
 * Called when #view=channel-profile&npub=...
 */
export async function initChannelProfileView() {
  // 1) Get npub from hash
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const npub = hashParams.get("npub");
  if (!npub) {
    userLogger.error(
      "No npub found in hash (e.g. #view=channel-profile&npub=...)"
    );
    return;
  }

  currentChannelHex = null;
  currentChannelNpub = null;
  currentChannelLightningAddress = "";
  currentChannelProfileEvent = null;
  currentChannelProfileSnapshot = null;
  currentChannelProfileHasExplicitPayload = false;
  setCachedPlatformLightningAddress("");
  resetZapRetryState();
  clearZapReceipts();
  setZapStatus("", "neutral");

  // 2) Decode npub => hex pubkey
  let hexPub;
  try {
    const decoded = window.NostrTools.nip19.decode(npub);
    if (decoded.type === "npub" && decoded.data) {
      if (typeof decoded.data === "string") {
        hexPub = decoded.data;
      } else {
        let bufferSource = null;
        if (decoded.data instanceof Uint8Array) {
          bufferSource = decoded.data;
        } else if (Array.isArray(decoded.data)) {
          bufferSource = Uint8Array.from(decoded.data);
        } else if (
          decoded.data?.type === "Buffer" &&
          Array.isArray(decoded.data?.data)
        ) {
          bufferSource = Uint8Array.from(decoded.data.data);
        }

        if (bufferSource) {
          if (typeof window?.NostrTools?.utils?.bytesToHex === "function") {
            hexPub = window.NostrTools.utils.bytesToHex(bufferSource);
          } else {
            hexPub = Array.from(bufferSource)
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("");
          }
        }
      }

      if (typeof hexPub !== "string" || !hexPub) {
        throw new Error("Unable to normalize npub to hex string.");
      }

      hexPub = hexPub.trim().toLowerCase();
    } else {
      throw new Error("Invalid npub decoding result.");
    }
  } catch (err) {
    userLogger.error("Error decoding npub:", err);
    return;
  }

  currentChannelHex = hexPub;
  currentChannelNpub = npub;

  const app = getApp();

  setupChannelShareButton();
  setupChannelMoreMenu();

  const initialMenuRefresh = updateChannelMenuState().catch((error) => {
    userLogger.error("Failed to prepare channel menu state:", error);
  });

  let subscriptionsTask = null;
  // 3) Load subscription state when logged in, but always render the toggle UI
  if (app?.pubkey) {
    subscriptionsTask = subscriptions
      .loadSubscriptions(app.pubkey)
      .catch((error) => {
        userLogger.error("Failed to load subscriptions for channel view:", error);
      })
      .finally(() => {
        renderSubscribeButton(hexPub);
      });
  } else {
    renderSubscribeButton(hexPub);
  }

  setupZapButton();
  setChannelZapVisibility(false);
  syncChannelShareButtonState();

  // 4) Load user’s profile (banner, avatar, etc.) and channel videos
  const profilePromise = loadUserProfile(hexPub)
    .then(() => updateChannelMenuState())
    .catch((error) => {
      userLogger.error("Failed to load channel profile:", error);
    })
    .finally(() => {
      syncChannelShareButtonState();
    });

  const videosPromise = loadUserVideos(hexPub).catch((error) => {
    userLogger.error("Failed to load channel videos:", error);
  });

  const pendingTasks = [profilePromise, videosPromise];
  if (initialMenuRefresh) {
    pendingTasks.push(initialMenuRefresh);
  }
  if (subscriptionsTask) {
    pendingTasks.push(subscriptionsTask);
  }

  await Promise.allSettled(pendingTasks);
}

function setupZapButton({ force = false } = {}) {
  const zapButton = getChannelZapButton();
  if (!zapButton) {
    return false;
  }

  if (!force && zapPopover && zapPopoverTrigger === zapButton) {
    if (zapButton.dataset.initialized === "true") {
      return true;
    }
  }

  if (zapPopover?.destroy) {
    zapPopover.destroy();
    zapPopover = null;
    zapPopoverTrigger = null;
    zapPopoverOpenPromise = null;
    zapShouldFocusOnOpen = false;
    delete zapButton.dataset.zapPopoverWarmBound;
  }

  const documentRef =
    zapButton.ownerDocument ||
    (typeof document !== "undefined" ? document : null);

  const render = ({ document: doc }) => {
    if (!doc || typeof doc.createElement !== "function") {
      return null;
    }

    const panel = doc.createElement("div");
    panel.id = "zapControls";
    panel.className = "popover__panel card w-72 max-w-popover-safe p-4";
    panel.dataset.variant = "zap";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Channel zap dialog");
    panel.setAttribute("aria-hidden", "true");
    panel.dataset.state = panel.dataset.state || "closed";
    panel.hidden = true;

    panel.innerHTML = `
      <div class="grid gap-4">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-strong">
            Send a zap
          </h3>
          <button
            type="button"
            id="zapCloseBtn"
            class="btn-ghost px-2 py-1 text-xs"
            aria-label="Close zap dialog"
          >
            ✕
          </button>
        </div>
        <p
          id="zapWalletPrompt"
          class="text-sm text-muted"
          aria-hidden="true"
          hidden
        >
          Connect a wallet in
          <button
            type="button"
            id="zapWalletLink"
            class="btn-ghost px-2 py-1 text-xs"
          >
            Wallet Connect settings
          </button>
          to send zaps.
        </p>
        <form id="zapForm" class="bv-stack bv-stack--tight">
          <div>
            <label
              for="zapAmountInput"
              id="zapAmountLabel"
              class="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-strong"
            >
              Zap amount (sats)
            </label>
            <input
              id="zapAmountInput"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              class="input"
              placeholder="Enter sats"
              aria-labelledby="zapAmountLabel"
            />
          </div>
          <p
            id="zapSplitSummary"
            class="text-sm text-muted"
            aria-live="polite"
          >
            Enter an amount to view the split.
          </p>
          <p
            id="zapStatus"
            class="text-xs text-muted"
            role="status"
            aria-live="polite"
          ></p>
          <ul
            id="zapReceipts"
            class="space-y-2 text-xs text-muted"
          ></ul>
          <div class="flex items-center justify-end gap-2">
            <button
              type="submit"
              id="zapSendBtn"
              class="btn"
              aria-label="Send a zap"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    `;

    cacheZapPanelElements(panel);
    initializeZapPanel();

    return panel;
  };

  const popover = createPopover(zapButton, render, {
    document: documentRef,
    placement: "bottom-end",
    restoreFocusOnClose: true,
    maxWidthToken: "max-w-popover-safe",
  });

  if (!popover) {
    zapPopoverOpenPromise = null;
    zapShouldFocusOnOpen = false;
    return false;
  }

  const originalOpen = popover.open?.bind(popover);
  if (originalOpen) {
    popover.open = async (...args) => {
      let result;
      try {
        result = await originalOpen(...args);
      } catch (error) {
        zapPopoverOpenPromise = null;
        zapShouldFocusOnOpen = false;
        throw error;
      }
      if (result) {
        zapControlsOpen = true;
        const controls = getZapControlsContainer();
        if (controls) {
          controls.dataset.state = "open";
          controls.hidden = false;
          controls.setAttribute("aria-hidden", "false");
        }
        zapButton.setAttribute("aria-expanded", "true");
        if (zapShouldFocusOnOpen) {
          focusZapAmountField();
        }
      }
      zapShouldFocusOnOpen = false;
      return result;
    };
  }

  const originalClose = popover.close?.bind(popover);
  if (originalClose) {
    popover.close = (options = {}) => {
      const wasOpen = typeof popover.isOpen === "function" && popover.isOpen();
      const result = originalClose(options);
      if (wasOpen && result) {
        zapControlsOpen = false;
        const controls = getZapControlsContainer();
        if (controls) {
          controls.dataset.state = "closed";
          controls.hidden = true;
          controls.setAttribute("aria-hidden", "true");
        }
        zapButton.setAttribute("aria-expanded", "false");
      }
      zapShouldFocusOnOpen = false;
      zapPopoverOpenPromise = null;
      return result;
    };
  }

  const originalDestroy = popover.destroy?.bind(popover);
  if (originalDestroy) {
    popover.destroy = (...args) => {
      originalDestroy(...args);
      if (zapPopover === popover) {
        zapPopover = null;
        zapPopoverTrigger = null;
      }
      zapPopoverOpenPromise = null;
      zapShouldFocusOnOpen = false;
      cacheZapPanelElements(null);
    };
  }

  zapPopover = popover;
  zapPopoverTrigger = zapButton;

  const warmZapPopover = () => {
    if (!zapPopover || zapPopover !== popover) {
      return;
    }
    if (zapButton.hasAttribute("hidden")) {
      return;
    }
    if (typeof popover.preload !== "function") {
      return;
    }
    try {
      popover.preload();
    } catch (error) {
      devLogger.warn("[zap] Failed to preload zap controls", error);
    }
  };

  if (
    typeof popover.preload === "function" &&
    !zapButton.hasAttribute("hidden")
  ) {
    if (
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function"
    ) {
      window.requestIdleCallback(() => warmZapPopover(), { timeout: 250 });
    } else {
      setTimeout(() => {
        warmZapPopover();
      }, 0);
    }
  }

  if (zapButton.dataset.zapPopoverWarmBound !== "true") {
    const handleWarm = () => {
      warmZapPopover();
    };
    zapButton.addEventListener("pointerenter", handleWarm, { once: true });
    zapButton.addEventListener("pointerdown", handleWarm, { once: true });
    zapButton.addEventListener("focus", handleWarm, { once: true });
    zapButton.dataset.zapPopoverWarmBound = "true";
  }

  if (zapButton.dataset.initialized !== "true") {
    zapButton.addEventListener("click", handleZapButtonClick);
    zapButton.dataset.initialized = "true";
  }

  return true;
}

/**
 * Renders a Subscribe / Unsubscribe button with an icon,
 * using the primary button token styling and the subscribe icon on the left.
 */
function renderSubscribeButton(channelHex) {
  const container = document.getElementById("subscribeBtnArea");
  if (!container) return;

  const app = getApp();
  const isLoggedIn = Boolean(app?.pubkey);

  container.classList.remove("hidden");
  const alreadySubscribed =
    isLoggedIn && subscriptions.isSubscribed(channelHex);

  // Both subscribe/unsubscribe states share the primary styling and icon.
  // If you prefer separate logic for unsub, you can do it here.
  container.innerHTML = `
    <button
      id="subscribeToggleBtn"
      type="button"
      class="btn normal-case rounded hover:opacity-90 focus-visible:bg-primary"
      data-state="${alreadySubscribed ? "subscribed" : "unsubscribed"}"
    >
      <img
        src="assets/svg/subscribe-button-icon.svg"
        alt="Subscribe Icon"
        class="w-5 h-5"
      />
      <span>${alreadySubscribed ? "Unsubscribe" : "Subscribe"}</span>
    </button>
  `;

  const toggleBtn = document.getElementById("subscribeToggleBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", async () => {
      const currentApp = getApp();
      if (!currentApp?.pubkey) {
        const loginModal =
          prepareStaticModal({ id: "loginModal" }) ||
          document.getElementById("loginModal");

        if (
          loginModal &&
          openStaticModal(loginModal, { triggerElement: toggleBtn })
        ) {
          setGlobalModalState("login", true);
        } else {
          userLogger.warn(
            "Unable to open login modal for subscription toggle."
          );
        }
        return;
      }
      try {
        if (alreadySubscribed) {
          await subscriptions.removeChannel(channelHex, currentApp.pubkey);
        } else {
          await subscriptions.addChannel(channelHex, currentApp.pubkey);
        }
        // Re-render the button so it toggles state
        renderSubscribeButton(channelHex);
      } catch (err) {
        userLogger.error("Failed to update subscription:", err);
      }
    });
  }
}

function trimProfileString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeChannelProfileMetadata(raw = {}) {
  const name =
    trimProfileString(raw.display_name) ||
    trimProfileString(raw.name) ||
    "Unknown User";
  const picture =
    sanitizeProfileMediaUrl(raw.picture) ||
    sanitizeProfileMediaUrl(raw.image) ||
    FALLBACK_CHANNEL_AVATAR;
  const about = trimProfileString(raw.about || raw.bio);
  const website = trimProfileString(raw.website || raw.url);
  const banner =
    sanitizeProfileMediaUrl(
      raw.banner ||
        raw.header ||
        raw.background ||
        raw.cover ||
        raw.cover_image ||
        raw.coverImage
    ) || "";
  const lud16 = trimProfileString(raw.lud16);
  const lud06 = trimProfileString(raw.lud06);
  const lightningAddress =
    trimProfileString(raw.lightningAddress) || lud16 || lud06 || "";

  return {
    name,
    picture,
    about,
    website,
    banner,
    lud16,
    lud06,
    lightningAddress
  };
}

function rememberChannelProfile(pubkey, { profile = {}, event = null } = {}) {
  if (typeof pubkey !== "string" || !pubkey) {
    return false;
  }

  const hasPayload = hasExplicitChannelProfilePayload(profile);
  if (!hasPayload) {
    touchChannelProfileCacheEntry(pubkey);
    return false;
  }

  const incomingEventTimestamp =
    typeof event?.created_at === "number" ? event.created_at : 0;
  const existing = channelProfileMetadataCache.get(pubkey);
  const existingEventTimestamp =
    typeof existing?.event?.created_at === "number"
      ? existing.event.created_at
      : 0;

  if (
    existingEventTimestamp &&
    incomingEventTimestamp &&
    incomingEventTimestamp < existingEventTimestamp
  ) {
    touchChannelProfileCacheEntry(pubkey);
    return false;
  }

  channelProfileMetadataCache.set(pubkey, {
    timestamp: Date.now(),
    profile: normalizeChannelProfileMetadata(profile),
    event: event ? { ...event } : null
  });

  return true;
}

function getCachedChannelProfile(pubkey) {
  const entry = channelProfileMetadataCache.get(pubkey);
  if (!entry) {
    return null;
  }

  if (
    typeof entry.timestamp !== "number" ||
    Date.now() - entry.timestamp > PROFILE_EVENT_CACHE_TTL_MS
  ) {
    channelProfileMetadataCache.delete(pubkey);
    return null;
  }

  return {
    profile: entry.profile,
    event: entry.event ? { ...entry.event } : null
  };
}

function isValidRelayUrl(url) {
  if (typeof url !== "string") {
    return false;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }

  if (!/^wss?:\/\//i.test(trimmed)) {
    return false;
  }

  if (/\s/.test(trimmed)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return Boolean(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function getCachedChannelVideoEvents(pubkey) {
  const normalized =
    typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
  if (!normalized) {
    return [];
  }

  const collectMatches = (source, iterator) => {
    const matches = [];
    if (!source || typeof iterator !== "function") {
      return matches;
    }

    iterator((event) => {
      const candidate = event || null;
      if (!candidate) {
        return;
      }

      const candidatePubkey =
        typeof candidate.pubkey === "string"
          ? candidate.pubkey.trim().toLowerCase()
          : "";

      if (!candidatePubkey || candidatePubkey !== normalized) {
        return;
      }

      matches.push(candidate);
    });

    return matches;
  };

  const rawMatches = collectMatches(nostrClient?.rawEvents, (callback) => {
    if (
      nostrClient?.rawEvents &&
      typeof nostrClient.rawEvents.forEach === "function"
    ) {
      nostrClient.rawEvents.forEach((event) => {
        if (event?.kind === 30078) {
          callback(event);
        }
      });
    }
  });

  if (rawMatches.length) {
    return rawMatches;
  }

  const processedMatches = collectMatches(
    nostrClient?.allEvents,
    (callback) => {
      if (
        nostrClient?.allEvents &&
        typeof nostrClient.allEvents.forEach === "function"
      ) {
        nostrClient.allEvents.forEach((video) => {
          if (video) {
            callback(video);
          }
        });
      }
    }
  );

  return processedMatches;
}

function normalizeRenderableChannelVideo(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const looksLikeRawEvent =
    typeof entry.content === "string" ||
    Array.isArray(entry.tags) ||
    typeof entry.kind === "number";

  if (looksLikeRawEvent) {
    const converted = sharedConvertEventToVideo(entry);
    if (converted && !converted.invalid) {
      return converted;
    }
    return null;
  }

  const looksLikeConvertedVideo =
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.pubkey === "string" &&
    Number.isFinite(entry.created_at);

  if (looksLikeConvertedVideo) {
    if (entry.invalid) {
      return null;
    }

    return {
      ...entry,
      invalid: false,
    };
  }

  return null;
}

function buildRenderableChannelVideos({ events = [], app } = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  const convertedVideos = events
    .map((entry) => normalizeRenderableChannelVideo(entry))
    .filter((vid) => vid && !vid.invalid);

  if (!convertedVideos.length) {
    return [];
  }

  const dedupedById = new Map();
  convertedVideos.forEach((video) => {
    if (video?.id && !dedupedById.has(video.id)) {
      dedupedById.set(video.id, video);
    }
  });

  const uniqueVideos = Array.from(dedupedById.values());

  const newestByRoot =
    app?.dedupeVideosByRoot?.(uniqueVideos) ??
    dedupeToNewestByRoot(uniqueVideos);

  let videos = newestByRoot.filter((video) => !video.deleted);
  videos = videos.filter((video) => {
    if (!video || !video.id) {
      return false;
    }

    if (app?.blacklistedEventIds?.has?.(video.id)) {
      return false;
    }

    if (!accessControl.canAccess(video)) {
      return false;
    }

    return true;
  });

  videos.sort((a, b) => b.created_at - a.created_at);
  return videos;
}

function renderChannelVideosFromList({
  videos = [],
  container,
  app,
  loadToken,
  allowEmptyMessage = true
} = {}) {
  if (!container || loadToken !== currentVideoLoadToken) {
    return false;
  }

  if (!Array.isArray(videos) || videos.length === 0) {
    if (allowEmptyMessage) {
      container.dataset.hasChannelVideos = "false";
      container.innerHTML = `<p class="text-muted-strong">No videos to display.</p>`;
      return true;
    }
    return false;
  }

  container.dataset.hasChannelVideos = "true";
  container.innerHTML = "";

  const fragment = document.createDocumentFragment();
  const allKnownEventsArray = Array.from(nostrClient.allEvents.values());
  const loadedThumbnails =
    app?.loadedThumbnails instanceof Map ? app.loadedThumbnails : null;
  const unsupportedBtihMessage =
    typeof app?.getUnsupportedBtihMessage === "function"
      ? app.getUnsupportedBtihMessage()
      : "This magnet link is missing a compatible BitTorrent v1 info hash.";

  const fallbackNormalizePubkey = (value) =>
    typeof value === "string" && value ? value.trim().toLowerCase() : "";
  const normalizePubkey =
    typeof app?.normalizeHexPubkey === "function"
      ? (value) =>
          app.normalizeHexPubkey(value) || fallbackNormalizePubkey(value)
      : fallbackNormalizePubkey;
  const normalizedViewerPubkey = normalizePubkey(app?.pubkey);
  let renderIndex = 0;

  const extractPlaybackDetail = (trigger, video) => {
    if (
      app?.videoListView &&
      typeof app.videoListView.extractPlaybackDetail === "function"
    ) {
      return app.videoListView.extractPlaybackDetail(trigger, video);
    }

    const element = trigger instanceof HTMLElement ? trigger : null;
    const target =
      element?.closest("[data-play-url],[data-play-magnet]") || element;

    const rawUrlValue =
      (target?.dataset && typeof target.dataset.playUrl === "string"
        ? target.dataset.playUrl
        : null) ??
      target?.getAttribute?.("data-play-url") ??
      "";
    const rawMagnetValue =
      (target?.dataset && typeof target.dataset.playMagnet === "string"
        ? target.dataset.playMagnet
        : null) ??
      target?.getAttribute?.("data-play-magnet") ??
      "";

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
      target?.dataset?.videoId ||
      target?.getAttribute?.("data-video-id") ||
      video?.id ||
      "";

    return { videoId, url, magnet, video };
  };

  const playbackHandler =
    typeof app?.videoListViewPlaybackHandler === "function"
      ? app.videoListViewPlaybackHandler.bind(app)
      : null;

  const startPlayback = (detail) => {
    if (playbackHandler) {
      playbackHandler(detail);
      return;
    }

    if (detail.videoId && typeof app?.playVideoByEventId === "function") {
      Promise.resolve(
        app.playVideoByEventId(detail.videoId, {
          url: detail.url,
          magnet: detail.magnet,
          title: detail.video?.title,
          description: detail.video?.description
        })
      ).catch((error) => {
        userLogger.error("Failed to play channel video via event id:", error);
        if (typeof app?.playVideoWithFallback === "function") {
          app.playVideoWithFallback({
            url: detail.url,
            magnet: detail.magnet
          });
        }
      });
      return;
    }

    if (typeof app?.playVideoWithFallback === "function") {
      Promise.resolve(
        app.playVideoWithFallback({ url: detail.url, magnet: detail.magnet })
      ).catch((error) => {
        userLogger.error(
          "Failed to start fallback playback for channel video:",
          error
        );
      });
    }
  };

  const allowNsfw = ALLOW_NSFW_CONTENT === true;

  videos.forEach((video) => {
    if (!video || !video.id || !video.title) {
      return;
    }

    const normalizedVideoPubkey = normalizePubkey(video.pubkey);
    const canEdit =
      Boolean(normalizedVideoPubkey) &&
      Boolean(normalizedViewerPubkey) &&
      normalizedVideoPubkey === normalizedViewerPubkey;

    if (video.isPrivate && !canEdit) {
      return;
    }

    if (!allowNsfw && video?.isNsfw === true && !canEdit) {
      return;
    }

    app?.videosMap?.set(video.id, video);

    const index = renderIndex++;
    let hasOlder = false;
    if (canEdit && video.videoRootId) {
      hasOlder = app?.hasOlderVersion?.(video, allKnownEventsArray) || false;
    }

    const pointerInfo =
      typeof app?.deriveVideoPointerInfo === "function"
        ? app.deriveVideoPointerInfo(video)
        : null;
    if (
      pointerInfo &&
      typeof app?.persistWatchHistoryMetadataForVideo === "function"
    ) {
      app.persistWatchHistoryMetadataForVideo(video, pointerInfo);
    }

    const shareUrl =
      typeof app?.buildShareUrlFromEventId === "function"
        ? app.buildShareUrlFromEventId(video.id)
        : "#";
    const timeAgo =
      typeof app?.formatTimeAgo === "function"
        ? app.formatTimeAgo(video.created_at)
        : new Date(video.created_at * 1000).toLocaleString();

    let cardState = "";
    if (canEdit && video.isPrivate) {
      cardState = "private";
    }
    if (!allowNsfw && video?.isNsfw === true && canEdit) {
      cardState = "critical";
    }

    const videoCard = new VideoCard({
      document,
      video,
      index,
      shareUrl,
      pointerInfo,
      timeAgo,
      cardState,
      capabilities: {
        canEdit,
        canDelete: canEdit,
        canRevert: hasOlder,
        canManageBlacklist:
          typeof app?.canCurrentUserManageBlacklist === "function"
            ? app.canCurrentUserManageBlacklist()
            : false
      },
      nsfwContext: {
        isNsfw: video?.isNsfw === true,
        allowNsfw,
        viewerIsOwner: canEdit
      },
      helpers: {
        escapeHtml: (value) => escapeHTML(value),
        isMagnetSupported: (magnet) => app?.isMagnetUriSupported?.(magnet),
        toLocaleString: (value) =>
          typeof value === "number" ? value.toLocaleString() : value
      },
      assets: {
        fallbackThumbnailSrc: "assets/jpg/video-thumbnail-fallback.jpg",
        unsupportedBtihMessage
      },
      state: { loadedThumbnails },
      ensureGlobalMoreMenuHandlers: () => app?.ensureGlobalMoreMenuHandlers?.(),
      onRequestCloseAllMenus: () => app?.closeAllMoreMenus?.(),
      formatters: {
        formatTimeAgo: (ts) =>
          typeof app?.formatTimeAgo === "function"
            ? app.formatTimeAgo(ts)
            : new Date(ts * 1000).toLocaleString()
      }
    });

    videoCard.onPlay = ({ event: domEvent, video: cardVideo }) => {
      const trigger = domEvent?.currentTarget || domEvent?.target;
      const detail = extractPlaybackDetail(trigger, cardVideo || video);
      detail.video = detail.video || video;
      startPlayback(detail);
    };

    videoCard.onModerationOverride = ({ video: overrideVideo, card: overrideCard }) =>
      typeof app?.handleModerationOverride === "function"
        ? app.handleModerationOverride({
            video: overrideVideo,
            card: overrideCard,
          })
        : false;

    videoCard.onModerationHide = ({ video: hideVideo, card: hideCard }) =>
      typeof app?.handleModerationHide === "function"
        ? app.handleModerationHide({
            video: hideVideo,
            card: hideCard,
          })
        : false;

    videoCard.onEdit = ({ video: editVideo, index: editIndex }) => {
      app?.handleEditVideo?.({
        eventId: editVideo?.id || "",
        index: Number.isFinite(editIndex) ? editIndex : null
      });
    };

    videoCard.onRevert = ({ video: revertVideo, index: revertIndex }) => {
      app?.handleRevertVideo?.({
        eventId: revertVideo?.id || "",
        index: Number.isFinite(revertIndex) ? revertIndex : null
      });
    };

    videoCard.onDelete = ({ video: deleteVideo, index: deleteIndex }) => {
      app?.handleFullDeleteVideo?.({
        eventId: deleteVideo?.id || "",
        index: Number.isFinite(deleteIndex) ? deleteIndex : null
      });
    };

    videoCard.onMoreAction = ({ dataset = {} }) => {
      const action = dataset.action || "";
      const detail = {
        ...dataset,
        eventId: dataset.eventId || video.id || "",
        context: dataset.context || "channel-grid"
      };
      app?.handleMoreMenuAction?.(action || "copy-link", detail);
    };

    videoCard.onAuthorNavigate = ({ pubkey }) => {
      const targetPubkey = pubkey || video.pubkey || "";
      if (targetPubkey && typeof app?.goToProfile === "function") {
        app.goToProfile(targetPubkey);
      }
    };

    videoCard.onRequestMoreMenu = (detail = {}) => {
      if (typeof app?.requestMoreMenu === "function") {
        app.requestMoreMenu({
          ...detail,
          video: detail.video || video,
          pointerInfo: detail.pointerInfo || pointerInfo,
        });
      }
    };

    videoCard.onCloseMoreMenu = (detail = {}) => {
      if (typeof app?.closeMoreMenu === "function") {
        return app.closeMoreMenu(detail);
      }
      return false;
    };

    videoCard.onRequestSettingsMenu = (detail = {}) => {
      if (typeof app?.requestVideoSettingsMenu === "function") {
        app.requestVideoSettingsMenu(detail);
      }
    };

    videoCard.onCloseSettingsMenu = (detail = {}) => {
      if (typeof app?.closeVideoSettingsMenu === "function") {
        return app.closeVideoSettingsMenu(detail);
      }
      return false;
    };

    const cardEl = videoCard.getRoot();
    if (cardEl) {
      fragment.appendChild(cardEl);
    }
  });

  if (renderIndex === 0) {
    if (allowEmptyMessage) {
      container.dataset.hasChannelVideos = "false";
      container.innerHTML = `<p class="text-muted-strong">No videos to display.</p>`;
      return true;
    }
    return false;
  }

  container.appendChild(fragment);

  attachHealthBadges(container);
  attachUrlHealthBadges(container, ({ badgeEl, url, eventId }) => {
    const video = app?.videosMap?.get(eventId) || { id: eventId };
    app?.handleUrlHealthBadge?.({ video, url, badgeEl });
  });

  app?.mountVideoListView?.();

  const lazyEls = container.querySelectorAll("[data-lazy]");
  lazyEls.forEach((el) => app?.mediaLoader?.observe?.(el));

  app?.attachMoreMenuHandlers?.(container);

  return true;
}

function applyChannelProfileMetadata({
  profile = {},
  event = null,
  pubkey = "",
  npub = "",
  loadToken = null
} = {}) {
  if (loadToken !== null && loadToken !== currentProfileLoadToken) {
    return;
  }

  const normalized = normalizeChannelProfileMetadata(profile);
  const hasExplicitProfilePayload =
    hasExplicitChannelProfilePayload(profile);
  const incomingEventTimestamp =
    typeof event?.created_at === "number" ? event.created_at : 0;
  const existingEventTimestamp =
    typeof currentChannelProfileEvent?.created_at === "number"
      ? currentChannelProfileEvent.created_at
      : 0;

  if (currentChannelProfileSnapshot) {
    const isOlderEvent =
      incomingEventTimestamp &&
      existingEventTimestamp &&
      incomingEventTimestamp < existingEventTimestamp;
    if (isOlderEvent) {
      return;
    }

    if (!hasExplicitProfilePayload) {
      if (currentChannelProfileHasExplicitPayload) {
        return;
      }

      const shouldIgnoreEmptyPayload =
        !incomingEventTimestamp ||
        incomingEventTimestamp <= existingEventTimestamp;
      if (shouldIgnoreEmptyPayload) {
        return;
      }
    }
  }

  const expectedLoadToken =
    loadToken !== null ? loadToken : currentProfileLoadToken;

  const bannerEl = document.getElementById("channelBanner");
  if (bannerEl) {
    const fallbackAttr =
      (typeof bannerEl.dataset?.fallbackSrc === "string"
        ? bannerEl.dataset.fallbackSrc.trim()
        : "") ||
      bannerEl.getAttribute("data-fallback-src") ||
      "";
    const fallbackSrc = fallbackAttr || FALLBACK_CHANNEL_BANNER;

    if (bannerEl.dataset.fallbackSrc !== fallbackSrc) {
      bannerEl.dataset.fallbackSrc = fallbackSrc;
    }
    if (!bannerEl.getAttribute("data-fallback-src") && fallbackSrc) {
      bannerEl.setAttribute("data-fallback-src", fallbackSrc);
    }

    ensureBannerFallbackHandler(bannerEl);

    if (!normalized.banner) {
      bannerLoadStates.delete(bannerEl);
      setBannerVisual(bannerEl, fallbackSrc, { referrerPolicy: null });
    } else {
      applyBannerWithPolicies({
        bannerEl,
        url: normalized.banner,
        fallbackSrc,
        loadToken: expectedLoadToken
      });
    }
  }

  const avatarEl = document.getElementById("channelAvatar");
  if (avatarEl) {
    avatarEl.src = normalized.picture || FALLBACK_CHANNEL_AVATAR;
  }

  const blurPubkey = pubkey || currentChannelHex || "";
  applyChannelVisualBlur({ bannerEl, avatarEl, pubkey: blurPubkey });

  const nameEl = document.getElementById("channelName");
  if (nameEl) {
    nameEl.textContent = normalized.name || "Unknown User";
  }

  const channelNpubEl = document.getElementById("channelNpub");
  if (channelNpubEl) {
    if (npub) {
      channelNpubEl.textContent = formatShortNpub(npub);
    } else if (pubkey) {
      try {
        const encoded = window.NostrTools.nip19.npubEncode(pubkey);
        channelNpubEl.textContent = formatShortNpub(encoded);
      } catch (error) {
        channelNpubEl.textContent = "";
      }
    }
  }

  const aboutEl = document.getElementById("channelAbout");
  if (aboutEl) {
    aboutEl.textContent = normalized.about || "";
  }

  const websiteEl = document.getElementById("channelWebsite");
  if (websiteEl) {
    if (normalized.website) {
      websiteEl.href = normalized.website;
      websiteEl.textContent = normalized.website;
    } else {
      websiteEl.textContent = "";
      websiteEl.removeAttribute("href");
    }
  }

  const previousLightning = currentChannelLightningAddress;
  const lightningAddress = normalized.lightningAddress || "";
  currentChannelLightningAddress = lightningAddress;

  const lnEl = document.getElementById("channelLightning");
  if (lnEl) {
    lnEl.textContent = lightningAddress || "No lightning address found.";
  }

  if (event) {
    currentChannelProfileEvent = { ...event };
  } else if (loadToken === currentProfileLoadToken && !event) {
    currentChannelProfileEvent = null;
  }

  currentChannelProfileSnapshot = { ...normalized };
  currentChannelProfileHasExplicitPayload = hasExplicitProfilePayload;

  if (lightningAddress) {
    if (lightningAddress !== previousLightning) {
      fetchLightningMetadata(lightningAddress)
        .then(() => updateZapSplitSummary())
        .catch(() => {});
    }
  } else {
    updateZapSplitSummary();
  }

  setChannelZapVisibility(Boolean(lightningAddress));
}

async function fetchChannelProfileFromRelays(pubkey) {
  try {
    await nostrClient.ensurePool();
  } catch (error) {
    userLogger.error("Failed to initialize relay pool for channel profile:", error);
    return { event: null, profile: {} };
  }

  const pool = nostrClient?.pool;
  const relayCandidates = Array.isArray(nostrClient?.relays)
    ? nostrClient.relays.filter(
        (relayUrl) => typeof relayUrl === "string" && relayUrl.trim().length > 0
      )
    : [];
  const relayUrls = relayCandidates.length > 0 ? relayCandidates : DEFAULT_RELAY_URLS;

  if (!pool || !Array.isArray(relayUrls) || relayUrls.length === 0) {
    return { event: null, profile: {} };
  }

  try {
    const events = await pool.list(relayUrls, [
      { kinds: [0], authors: [pubkey], limit: 1 }
    ]);

    let newestEvent = null;
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || !event.content) {
        continue;
      }
      if (!newestEvent || event.created_at > newestEvent.created_at) {
        newestEvent = event;
      }
    }

    if (newestEvent?.content) {
      try {
        const meta = JSON.parse(newestEvent.content);
        return { event: newestEvent, profile: meta };
      } catch (error) {
        userLogger.warn("Failed to parse channel metadata payload:", error);
        return { event: newestEvent, profile: {} };
      }
    }

    return { event: newestEvent, profile: {} };
  } catch (error) {
    throw error;
  }
}

/**
 * Fetches and displays the user's metadata (kind=0).
 */
async function loadUserProfile(pubkey) {
  const app = getApp();
  const loadToken = ++currentProfileLoadToken;

  setChannelZapVisibility(false);

  const cachedEntry = getCachedChannelProfile(pubkey);
  if (cachedEntry) {
    applyChannelProfileMetadata({
      profile: cachedEntry.profile,
      event: cachedEntry.event,
      pubkey,
      npub: currentChannelNpub,
      loadToken
    });
  } else {
    const stateEntry =
      typeof app?.getProfileCacheEntry === "function"
        ? app.getProfileCacheEntry(pubkey)
        : null;
    if (stateEntry?.profile) {
      applyChannelProfileMetadata({
        profile: stateEntry.profile,
        event: null,
        pubkey,
        npub: currentChannelNpub,
        loadToken
      });
    } else {
      applyChannelProfileMetadata({
        profile: {},
        event: null,
        pubkey,
        npub: currentChannelNpub,
        loadToken
      });
    }
  }

  try {
    const result = await fetchChannelProfileFromRelays(pubkey);
    if (loadToken !== currentProfileLoadToken) {
      return;
    }

    const cachedUpdated = rememberChannelProfile(pubkey, result);

    if (cachedUpdated && typeof app?.setProfileCacheEntry === "function") {
      try {
        const profileForCache =
          result && typeof result.profile === "object" && result.profile
            ? { ...result.profile }
            : {};

        if (!profileForCache.lightningAddress) {
          const lightningFallback =
            result.profile?.lightningAddress ||
            result.profile?.lud16 ||
            result.profile?.lud06 ||
            "";
          if (lightningFallback) {
            profileForCache.lightningAddress = lightningFallback;
          }
        }

        app.setProfileCacheEntry(pubkey, profileForCache);
      } catch (error) {
        userLogger.warn(
          "Failed to persist channel profile metadata to cache:",
          error
        );
      }
    }

    applyChannelProfileMetadata({
      profile: result.profile,
      event: result.event,
      pubkey,
      npub: currentChannelNpub,
      loadToken
    });
  } catch (error) {
    if (loadToken === currentProfileLoadToken) {
      userLogger.error("Failed to fetch user profile data:", error);
      const lnEl = document.getElementById("channelLightning");
      if (lnEl && !currentChannelLightningAddress) {
        lnEl.textContent = "No lightning address found.";
      }
      if (!currentChannelLightningAddress) {
        updateZapSplitSummary();
        setChannelZapVisibility(false);
      }
    }
  }
}

/**
 * Fetches and displays this user's videos (kind=30078).
 * Filters out older overshadowed notes, blacklisted, etc.
 */
export function refreshActiveChannelVideoGrid({ reason } = {}) {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  if (hashParams.get("view") !== "channel-profile") {
    return Promise.resolve();
  }

  if (!currentChannelHex) {
    return Promise.resolve();
  }

  const activeNpub = hashParams.get("npub");
  if (currentChannelNpub && activeNpub && activeNpub !== currentChannelNpub) {
    return Promise.resolve();
  }

  try {
    const result = loadUserVideos(currentChannelHex);
    return result instanceof Promise ? result : Promise.resolve(result);
  } catch (error) {
    userLogger.warn(
      reason
        ? `Failed to trigger channel refresh after ${reason}:`
        : "Failed to trigger channel refresh:",
      error,
    );
    return Promise.resolve();
  }
}

async function loadUserVideos(pubkey) {
  const app = getApp();
  const container = document.getElementById("channelVideoList");
  const loadToken = ++currentVideoLoadToken;
  const hadExistingContent =
    !!container && container.querySelector("[data-video-id]");
  let hasVisibleContent = Boolean(hadExistingContent);

  if (container) {
    container.dataset.loading = "true";
    if (!hadExistingContent) {
      container.innerHTML = `
        <div class="py-16 flex justify-center">
        <span class="text-muted animate-pulse">Loading videos…</span>
        </div>
      `;
    }
  }

  let renderedFromCache = false;
  if (container) {
    const cachedEvents = getCachedChannelVideoEvents(pubkey);
    if (cachedEvents.length) {
      const cachedVideos = buildRenderableChannelVideos({
        events: cachedEvents,
        app
      });
      if (cachedVideos.length) {
        const rendered = renderChannelVideosFromList({
          videos: cachedVideos,
          container,
          app,
          loadToken,
          allowEmptyMessage: false
        });
        if (rendered) {
          hasVisibleContent = true;
        }
        renderedFromCache = rendered || renderedFromCache;
      }
    }
  }

  const ensureAccessPromise = accessControl.ensureReady().catch((error) => {
    userLogger.warn(
      "Failed to ensure admin lists were loaded before channel fetch:",
      error
    );
  });

  try {
    // 1) Build filter for videos from this pubkey
    const filter = {
      kinds: [30078],
      authors: [pubkey],
      "#t": ["video"],
      limit: 200
    };

    // 2) Collect raw events from all relays
    const events = [];
    const knownRelays = Array.isArray(nostrClient.relays)
      ? nostrClient.relays
      : Array.from(nostrClient.relays || []);
    const relayList = knownRelays.filter((url) => isValidRelayUrl(url));

    if (relayList.length === 0) {
      try {
        const fallbackEvents = await nostrClient.pool.list(
          Array.from(DEFAULT_RELAY_URLS),
          [filter]
        );
        if (Array.isArray(fallbackEvents)) {
          events.push(...fallbackEvents);
        }
      } catch (error) {
        userLogger.error("Relay error (default pool):", error);
      }
    } else {
      const relayPromises = relayList.map((url) =>
        nostrClient.pool.list([url], [filter])
      );

      const settled = await Promise.allSettled(relayPromises);
      settled.forEach((result, index) => {
        const relayUrl = relayList[index];

        if (result.status === "fulfilled") {
          const relayEvents = Array.isArray(result.value) ? result.value : [];
          events.push(...relayEvents);
          return;
        }

        if (result.reason) {
          userLogger.error(`Relay error (${relayUrl}):`, result.reason);
        }
      });
    }

    await ensureAccessPromise;

    if (loadToken !== currentVideoLoadToken) {
      return;
    }

    if (!container) {
      userLogger.warn("channelVideoList element not found in DOM.");
      return;
    }

    const videos = buildRenderableChannelVideos({ events, app });
    const rendered = renderChannelVideosFromList({
      videos,
      container,
      app,
      loadToken,
      allowEmptyMessage: !hasVisibleContent
    });

    if (rendered) {
      hasVisibleContent = true;
    }

    renderedFromCache = rendered || renderedFromCache;
  } catch (err) {
    if (
      loadToken === currentVideoLoadToken &&
      container &&
      !renderedFromCache &&
      !hasVisibleContent
    ) {
      container.dataset.hasChannelVideos = "false";
      container.innerHTML = `
        <p class="text-critical">Failed to load videos. Please try again.</p>
      `;
    }
    userLogger.error("Error loading user videos:", err);
  } finally {
    await ensureAccessPromise;
    if (loadToken === currentVideoLoadToken && container) {
      delete container.dataset.loading;
    }
  }
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("bitvid:access-control-updated", () => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (hashParams.get("view") !== "channel-profile") {
      return;
    }

    if (!currentChannelHex) {
      return;
    }

    const activeNpub = hashParams.get("npub");
    if (currentChannelNpub && activeNpub && activeNpub !== currentChannelNpub) {
      return;
    }

    loadUserVideos(currentChannelHex).catch((error) => {
      userLogger.error(
        "Failed to refresh channel videos after admin update:",
        error
      );
    });
  });

  window.addEventListener("bitvid:auth-changed", (event) => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (hashParams.get("view") !== "channel-profile") {
      return;
    }

  if (!currentChannelHex) {
    return;
  }

  const activeNpub = hashParams.get("npub");
  if (currentChannelNpub && activeNpub && activeNpub !== currentChannelNpub) {
    return;
  }

  setChannelZapVisibility(Boolean(currentChannelLightningAddress));
  syncChannelShareButtonState();

  const detail = event?.detail;
  if (!detail || typeof detail !== "object") {
    return;
  }

  if (detail.status === "logout") {
    zapInFlight = false;
    zapPopoverOpenPromise = null;
    zapShouldFocusOnOpen = false;
    resetZapRetryState();
    setZapStatus("", "neutral");
    clearZapReceipts();
    channelZapPendingOpen = false;
    const amountInput = getZapAmountInput();
    if (amountInput) {
      amountInput.value = "";
    }
    return;
  }

    if (detail.status === "login") {
      zapInFlight = false;
      resetZapRetryState();
      setZapStatus("", "neutral");
      if (channelZapPendingOpen) {
        channelZapPendingOpen = false;
        const zapButton = getChannelZapButton();
        const requiresLogin =
          zapButton?.dataset?.requiresLogin === "true" ||
          zapButton?.hasAttribute("hidden");
        if (zapButton && !requiresLogin) {
          const opened = openZapControls({ focus: true });
          if (!opened) {
            setupZapButton({ force: true });
            openZapControls({ focus: true });
          }
        }
      }
      return;
    }
  });
}

/**
 * Keep only the newest version of each video root.
 */
function dedupeToNewestByRoot(videos) {
  const map = new Map();
  for (const vid of videos) {
    const rootId = vid.videoRootId || vid.id;
    const existing = map.get(rootId);
    if (!existing || vid.created_at > existing.created_at) {
      map.set(rootId, vid);
    }
  }
  return Array.from(map.values());
}
