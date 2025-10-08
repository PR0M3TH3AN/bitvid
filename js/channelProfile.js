// js/channelProfile.js

import {
  nostrClient,
  DEFAULT_RELAY_URLS,
  convertEventToVideo as sharedConvertEventToVideo,
} from "./nostr.js";
import { subscriptions } from "./subscriptions.js"; // <-- NEW import
import { attachHealthBadges } from "./gridHealth.js";
import { attachUrlHealthBadges } from "./urlHealthObserver.js";
import { accessControl } from "./accessControl.js";
import { getApplication } from "./applicationContext.js";
import { escapeHTML } from "./utils/domUtils.js";
import { VideoCard } from "./ui/components/VideoCard.js";
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
  validateInvoiceAmount,
} from "./payments/zapSharedState.js";
import { splitAndZap } from "./payments/zapSplit.js";
import {
  resolveLightningAddress,
  fetchPayServiceData,
  requestInvoice,
} from "./payments/lnurl.js";
import { getPlatformLightningAddress } from "./payments/platformAddress.js";
import { ensureWallet, sendPayment as sendWalletPayment } from "./payments/nwcClient.js";

const getApp = () => getApplication();

let currentChannelHex = null;
let currentChannelNpub = null;
let currentChannelLightningAddress = "";

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
            : undefined,
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
            undefined,
        }
      : undefined,
    shares: details?.context?.shares
      ? {
          total: details.context.shares.total,
          creator: details.context.shares.creatorShare,
          platform: details.context.shares.platformShare,
        }
      : undefined,
    tracker: summarizeZapTracker(details?.tracker),
    retryAttempt:
      Number.isInteger(details?.retryAttempt) && details.retryAttempt >= 0
        ? details.retryAttempt
        : undefined,
  };
  console.error("[zap] Channel zap failure", summary, error);
}
let currentChannelProfileEvent = null;

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
let currentVideoLoadToken = 0;
let currentProfileLoadToken = 0;

const FALLBACK_CHANNEL_BANNER = "assets/jpg/bitvid.jpg";
const FALLBACK_CHANNEL_AVATAR = "assets/svg/default-profile.svg";
const PROFILE_EVENT_CACHE_TTL_MS = 5 * 60 * 1000;

const channelProfileMetadataCache = new Map();

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
  const shouldShow = !!visible && isLoggedIn;
  zapButton.classList.toggle("hidden", !shouldShow);
  zapButton.disabled = !shouldShow;
  zapButton.setAttribute("aria-disabled", (!shouldShow).toString());
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
  closeZapControls();
  if (controls) {
    controls.setAttribute("aria-hidden", "true");
  }
  if (amountInput) {
    amountInput.disabled = !shouldShow;
  }
  if (sendButton) {
    sendButton.disabled = !shouldShow;
    sendButton.setAttribute("aria-hidden", (!shouldShow).toString());
    if (shouldShow) {
      sendButton.removeAttribute("tabindex");
      sendButton.removeAttribute("aria-busy");
      sendButton.classList.remove("opacity-50", "pointer-events-none");
    } else {
      sendButton.setAttribute("tabindex", "-1");
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
  setZapWalletPromptVisible(shouldShow && !hasWallet);
  if (shouldShow) {
    setupZapWalletLink();
  }
}

function getChannelShareButton() {
  if (cachedChannelShareButton && !document.body.contains(cachedChannelShareButton)) {
    cachedChannelShareButton = null;
  }
  if (!cachedChannelShareButton) {
    cachedChannelShareButton = document.getElementById("channelShareBtn");
  }
  return cachedChannelShareButton;
}

function getChannelMenuElement() {
  if (cachedChannelMenu && !document.body.contains(cachedChannelMenu)) {
    cachedChannelMenu = null;
  }
  if (!cachedChannelMenu) {
    cachedChannelMenu = document.getElementById("moreDropdown-channel-profile");
  }
  return cachedChannelMenu;
}

function getZapControlsContainer() {
  if (cachedZapControls && !document.body.contains(cachedZapControls)) {
    cachedZapControls = null;
  }
  if (!cachedZapControls) {
    cachedZapControls = document.getElementById("zapControls");
  }
  return cachedZapControls;
}

function getZapFormElement() {
  if (cachedZapForm && !document.body.contains(cachedZapForm)) {
    cachedZapForm = null;
  }
  if (!cachedZapForm) {
    cachedZapForm = document.getElementById("zapForm");
  }
  return cachedZapForm;
}

function getZapAmountInput() {
  if (cachedZapAmountInput && !document.body.contains(cachedZapAmountInput)) {
    cachedZapAmountInput = null;
  }
  if (!cachedZapAmountInput) {
    cachedZapAmountInput = document.getElementById("zapAmountInput");
  }
  return cachedZapAmountInput;
}

function getZapSplitSummaryElement() {
  if (cachedZapSplitSummary && !document.body.contains(cachedZapSplitSummary)) {
    cachedZapSplitSummary = null;
  }
  if (!cachedZapSplitSummary) {
    cachedZapSplitSummary = document.getElementById("zapSplitSummary");
  }
  return cachedZapSplitSummary;
}

function getZapStatusElement() {
  if (cachedZapStatus && !document.body.contains(cachedZapStatus)) {
    cachedZapStatus = null;
  }
  if (!cachedZapStatus) {
    cachedZapStatus = document.getElementById("zapStatus");
  }
  return cachedZapStatus;
}

function getZapReceiptsList() {
  if (cachedZapReceipts && !document.body.contains(cachedZapReceipts)) {
    cachedZapReceipts = null;
  }
  if (!cachedZapReceipts) {
    cachedZapReceipts = document.getElementById("zapReceipts");
  }
  return cachedZapReceipts;
}

function getZapSendButton() {
  if (cachedZapSendBtn && !document.body.contains(cachedZapSendBtn)) {
    cachedZapSendBtn = null;
  }
  if (!cachedZapSendBtn) {
    cachedZapSendBtn = document.getElementById("zapSendBtn");
  }
  return cachedZapSendBtn;
}

function getZapWalletPrompt() {
  if (cachedZapWalletPrompt && !document.body.contains(cachedZapWalletPrompt)) {
    cachedZapWalletPrompt = null;
  }
  if (!cachedZapWalletPrompt) {
    cachedZapWalletPrompt = document.getElementById("zapWalletPrompt");
  }
  return cachedZapWalletPrompt;
}

function getZapWalletLink() {
  if (cachedZapWalletLink && !document.body.contains(cachedZapWalletLink)) {
    cachedZapWalletLink = null;
  }
  if (!cachedZapWalletLink) {
    cachedZapWalletLink = document.getElementById("zapWalletLink");
  }
  return cachedZapWalletLink;
}

function getZapCloseButton() {
  if (cachedZapCloseBtn && !document.body.contains(cachedZapCloseBtn)) {
    cachedZapCloseBtn = null;
  }
  if (!cachedZapCloseBtn) {
    cachedZapCloseBtn = document.getElementById("zapCloseBtn");
  }
  return cachedZapCloseBtn;
}

function setZapWalletPromptVisible(visible) {
  const prompt = getZapWalletPrompt();
  if (!prompt) {
    return;
  }
  const shouldShow = !!visible;
  prompt.classList.toggle("hidden", !shouldShow);
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
      app.openWalletPane();
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
  return zapControlsOpen;
}

function openZapControls({ focus = false } = {}) {
  const controls = getZapControlsContainer();
  const zapButton = getChannelZapButton();
  if (!controls || !zapButton) {
    return false;
  }
  if (!zapControlsOpen) {
    controls.classList.remove("hidden");
    controls.setAttribute("aria-hidden", "false");
    zapButton.setAttribute("aria-expanded", "true");
    zapControlsOpen = true;
  }
  if (focus) {
    focusZapAmountField();
  }
  return true;
}

function closeZapControls({ focusButton = false } = {}) {
  const controls = getZapControlsContainer();
  const zapButton = getChannelZapButton();
  if (controls) {
    controls.classList.add("hidden");
    controls.setAttribute("aria-hidden", "true");
  }
  if (zapButton) {
    zapButton.setAttribute("aria-expanded", "false");
    if (focusButton && typeof zapButton.focus === "function") {
      zapButton.focus();
    }
  }
  zapControlsOpen = false;
  return Boolean(controls && zapButton);
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
    "text-gray-300",
    "text-gray-400",
    "text-green-300",
    "text-red-300",
    "text-yellow-300"
  );

  if (!message) {
    statusEl.classList.add("text-gray-400");
    return;
  }

  switch (normalizedTone) {
    case "success":
      statusEl.classList.add("text-green-300");
      break;
    case "error":
      statusEl.classList.add("text-red-300");
      break;
    case "warning":
      statusEl.classList.add("text-yellow-300");
      break;
    default:
      statusEl.classList.add("text-gray-300");
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

  if (!Array.isArray(receipts) || receipts.length === 0) {
    if (partial) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "rounded border border-gray-700 bg-gray-800/70 p-3 text-gray-300";
      emptyItem.textContent = "No receipts were returned for this attempt.";
      list.appendChild(emptyItem);
    }
    return;
  }

  receipts.forEach((receipt) => {
    if (!receipt) {
      return;
    }

    const li = document.createElement("li");
    li.className = "rounded border border-gray-700 bg-gray-800/70 p-3";

    const header = document.createElement("div");
    header.className = "flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-200";

    const shareType = receipt.recipientType || receipt.type || "creator";
    const shareLabel = document.createElement("span");
    shareLabel.textContent = `${describeShareType(shareType)} • ${Math.max(
      0,
      Math.round(Number(receipt.amount || 0))
    )} sats`;

    const status = document.createElement("span");
    const isSuccess = receipt.status
      ? receipt.status === "success"
      : !receipt.error;
    status.textContent = isSuccess ? "Success" : "Failed";
    status.className = isSuccess ? "text-green-300" : "text-red-300";

    header.appendChild(shareLabel);
    header.appendChild(status);
    li.appendChild(header);

    const address = document.createElement("p");
    address.className = "mt-1 text-xs text-gray-300 break-all";
    const addressValue = receipt.address || "";
    if (addressValue) {
      address.textContent = addressValue;
      li.appendChild(address);
    }

    const detail = document.createElement("p");
    detail.className = "mt-2 text-xs text-gray-400";
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
    lightningAddress,
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

  const creatorEntry = await fetchLightningMetadata(currentChannelLightningAddress);
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
      platformAddress = await getPlatformLightningAddress({ forceRefresh: false });
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
    platformAddress,
  };
}

function createZapDependencies({
  creatorEntry,
  platformEntry,
  shares,
  shareTracker,
  walletSettings,
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
            fetchedAt: Date.now(),
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
            fetchedAt: Date.now(),
          });
        }
        return metadata;
      },
      validateInvoiceAmount,
      requestInvoice,
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
              walletSettings: options?.settings,
            },
            error
          );
          throw error;
        }
      },
      sendPayment: async (bolt11, params) => {
        const shareType = activeShare || "unknown";
        const shareAmount =
          shareType === "platform"
            ? shares.platformShare
            : shares.creatorShare;
        const address =
          shareType === "platform"
            ? platformEntry?.address || getCachedPlatformLightningAddress()
            : creatorEntry?.address || currentChannelLightningAddress;
        const normalizedParams = {
          ...(params || {}),
        };
        if (!Number.isFinite(normalizedParams.amountSats) && Number.isFinite(shareAmount)) {
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
              payment,
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
              error,
            });
          }
          logZapError(
            "wallet.sendPayment",
            {
              shareType,
              amount: shareAmount,
              address,
              tracker: shareTracker,
              context: { shares },
            },
            error
          );
          throw error;
        } finally {
          activeShare = null;
        }
      },
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
        const fallback = await getPlatformLightningAddress({ forceRefresh: false });
        setCachedPlatformLightningAddress(fallback || "");
        return fallback;
      },
    },
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
    nwcUri: normalizedUri,
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
        walletSettings: settings,
      },
      error
    );
    throw error;
  }
  const shareTracker = [];
  const dependencies = createZapDependencies({
    ...context,
    shareTracker,
    walletSettings: settings,
  });
  const videoEvent = getZapVideoEvent();

  let previousOverride;
  const hasGlobal = typeof globalThis !== "undefined";
  if (hasGlobal && typeof overrideFee === "number" && Number.isFinite(overrideFee)) {
    previousOverride = globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
    globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = overrideFee;
  }

  try {
    const result = await splitAndZap(
      {
        videoEvent,
        amountSats: context.shares.total,
        walletSettings: settings,
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
        tracker: shareTracker,
      },
      error
    );
    throw error;
  } finally {
    if (hasGlobal && typeof overrideFee === "number" && Number.isFinite(overrideFee)) {
      if (typeof previousOverride === "number") {
        globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = previousOverride;
      } else if (globalThis && "__BITVID_PLATFORM_FEE_OVERRIDE__" in globalThis) {
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
        walletSettings,
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
          tracker,
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
      renderZapReceipts(aggregatedTracker.length ? aggregatedTracker : tracker, {
        partial: true,
      });
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
  }

  const zapButton = getChannelZapButton();
  if (!zapButton) {
    return;
  }

  if (!isZapControlsOpen()) {
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

  if (!isZapControlsOpen()) {
    openZapControls({ focus: true });
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
  sendButton.classList.add("opacity-50", "pointer-events-none");
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
          Array.isArray(pendingZapRetry?.shares) && pendingZapRetry.shares.length
            ? pendingZapRetry.shares.length
            : undefined,
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
    sendButton.classList.remove("opacity-50", "pointer-events-none");
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
    console.warn("Falling back to basic channel share URL:", error);
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
  const container = document.querySelector(".channel-profile-container");
  if (!container) {
    return;
  }
  const app = getApp();
  app?.attachMoreMenuHandlers?.(container);
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
    console.warn("Failed to refresh moderation lists for channel menu:", error);
  }

  const canBlacklist =
    typeof app?.canCurrentUserManageBlacklist === "function"
      ? app.canCurrentUserManageBlacklist()
      : false;

  const buttons = menu.querySelectorAll("button[data-action]");
  buttons.forEach((button) => {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const action = button.dataset.action || "";
    if (action === "copy-npub") {
      if (currentChannelNpub) {
        button.dataset.npub = currentChannelNpub;
        button.classList.remove("hidden");
        button.setAttribute("aria-hidden", "false");
      } else {
        delete button.dataset.npub;
        button.classList.add("hidden");
        button.setAttribute("aria-hidden", "true");
      }
      return;
    }

    if (action === "block-author") {
      if (currentChannelHex) {
        button.dataset.author = currentChannelHex;
        button.classList.remove("hidden");
        button.setAttribute("aria-hidden", "false");
      } else {
        delete button.dataset.author;
        button.classList.add("hidden");
        button.setAttribute("aria-hidden", "true");
      }
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
        button.classList.remove("hidden");
        button.setAttribute("aria-hidden", "false");
      } else {
        delete button.dataset.author;
        delete button.dataset.npub;
        button.classList.add("hidden");
        button.setAttribute("aria-hidden", "true");
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
    console.error(
      "No npub found in hash (e.g. #view=channel-profile&npub=...)"
    );
    return;
  }

  currentChannelHex = null;
  currentChannelNpub = null;
  currentChannelLightningAddress = "";
  currentChannelProfileEvent = null;
  setCachedPlatformLightningAddress("");
  resetZapRetryState();
  clearZapReceipts();
  setZapStatus("", "neutral");

  // 2) Decode npub => hex pubkey
  let hexPub;
  try {
    const decoded = window.NostrTools.nip19.decode(npub);
    if (decoded.type === "npub" && decoded.data) {
      hexPub = decoded.data;
    } else {
      throw new Error("Invalid npub decoding result.");
    }
  } catch (err) {
    console.error("Error decoding npub:", err);
    return;
  }

  currentChannelHex = hexPub;
  currentChannelNpub = npub;

  const app = getApp();

  setupChannelShareButton();
  setupChannelMoreMenu();
  await updateChannelMenuState();

  // 3) If user is logged in, load subscriptions and show sub/unsub button
  if (app?.pubkey) {
    await subscriptions.loadSubscriptions(app.pubkey);
    renderSubscribeButton(hexPub);
  } else {
    const btn = document.getElementById("subscribeBtnArea");
    if (btn) btn.classList.add("hidden");
  }

  setupZapButton();
  syncChannelShareButtonState();

  // 4) Load user’s profile (banner, avatar, etc.) and channel videos
  const profilePromise = loadUserProfile(hexPub)
    .then(() => updateChannelMenuState())
    .catch((error) => {
      console.error("Failed to load channel profile:", error);
    })
    .finally(() => {
      syncChannelShareButtonState();
    });

  const videosPromise = loadUserVideos(hexPub).catch((error) => {
    console.error("Failed to load channel videos:", error);
  });

  await Promise.allSettled([profilePromise, videosPromise]);
}

function setupZapButton() {
  const zapButton = getChannelZapButton();
  const amountInput = getZapAmountInput();
  const controls = getZapControlsContainer();
  const zapForm = getZapFormElement();
  if (!zapButton || !amountInput || !controls || !zapForm || !getZapSendButton()) {
    return;
  }

  setChannelZapVisibility(false);
  controls.classList.add("hidden");
  controls.setAttribute("aria-hidden", "true");
  zapButton.setAttribute("aria-expanded", "false");
  setupZapWalletLink();
  const closeBtn = getZapCloseButton();
  if (closeBtn && closeBtn.dataset.initialized !== "true") {
    closeBtn.addEventListener("click", (event) => {
      event?.preventDefault?.();
      closeZapControls({ focusButton: true });
    });
    closeBtn.dataset.initialized = "true";
  }

  if (zapButton.dataset.initialized === "true") {
    updateZapSplitSummary();
    return;
  }

  const app = getApp();
  const activeSettings =
    typeof app?.getActiveNwcSettings === "function"
      ? app.getActiveNwcSettings()
      : {};
  if (Number.isFinite(activeSettings?.defaultZap) && activeSettings.defaultZap > 0) {
    amountInput.value = Math.max(0, Math.round(activeSettings.defaultZap));
  }

  updateZapSplitSummary();
  amountInput.addEventListener("input", handleZapAmountChange);
  amountInput.addEventListener("change", handleZapAmountChange);
  if (zapForm.dataset.initialized !== "true") {
    zapForm.addEventListener("submit", handleZapSend);
    zapForm.dataset.initialized = "true";
  }
  zapButton.addEventListener("click", handleZapButtonClick);
  zapButton.dataset.initialized = "true";
}

/**
 * Renders a Subscribe / Unsubscribe button with an icon,
 * using color #fe0032 and the subscribe-button-icon.svg on the left.
 */
function renderSubscribeButton(channelHex) {
  const container = document.getElementById("subscribeBtnArea");
  if (!container) return;

  const app = getApp();

  container.classList.remove("hidden");
  const alreadySubscribed = subscriptions.isSubscribed(channelHex);

  // We'll use #fe0032 for both subscribe/unsubscribe,
  // and the same icon. If you prefer separate logic for unsub, you can do it here.
  container.innerHTML = `
    <button
      id="subscribeToggleBtn"
      class="flex items-center gap-2 px-4 py-2 rounded text-white
             hover:opacity-90 focus:outline-none"
      style="background-color: #fe0032;"
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
      if (!app?.pubkey) {
        console.error("Not logged in => cannot subscribe/unsubscribe.");
        return;
      }
      try {
        if (alreadySubscribed) {
          await subscriptions.removeChannel(channelHex, app.pubkey);
        } else {
          await subscriptions.addChannel(channelHex, app.pubkey);
        }
        // Re-render the button so it toggles state
        renderSubscribeButton(channelHex);
      } catch (err) {
        console.error("Failed to update subscription:", err);
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
    trimProfileString(raw.picture) || trimProfileString(raw.image) || FALLBACK_CHANNEL_AVATAR;
  const about = trimProfileString(raw.about || raw.bio);
  const website = trimProfileString(raw.website || raw.url);
  const banner =
    trimProfileString(raw.banner || raw.header || raw.background) || "";
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
    lightningAddress,
  };
}

function rememberChannelProfile(pubkey, { profile = {}, event = null } = {}) {
  if (typeof pubkey !== "string" || !pubkey) {
    return;
  }

  channelProfileMetadataCache.set(pubkey, {
    timestamp: Date.now(),
    profile: normalizeChannelProfileMetadata(profile),
    event: event ? { ...event } : null,
  });
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
    event: entry.event ? { ...entry.event } : null,
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
  if (!nostrClient?.allEvents || typeof nostrClient.allEvents.forEach !== "function") {
    return [];
  }

  const normalized = typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
  if (!normalized) {
    return [];
  }

  const results = [];
  nostrClient.allEvents.forEach((event) => {
    if (
      event &&
      event.kind === 30078 &&
      typeof event.pubkey === "string" &&
      event.pubkey.trim().toLowerCase() === normalized
    ) {
      results.push(event);
    }
  });

  return results;
}

function buildRenderableChannelVideos({ events = [], app } = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  const convertedVideos = events
    .map((evt) => sharedConvertEventToVideo(evt))
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
    app?.dedupeVideosByRoot?.(uniqueVideos) ?? dedupeToNewestByRoot(uniqueVideos);

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
  allowEmptyMessage = true,
} = {}) {
  if (!container || loadToken !== currentVideoLoadToken) {
    return false;
  }

  if (!Array.isArray(videos) || videos.length === 0) {
    if (allowEmptyMessage) {
      container.dataset.hasChannelVideos = "false";
      container.innerHTML = `<p class="text-gray-500">No videos to display.</p>`;
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
    typeof value === "string" && value
      ? value.trim().toLowerCase()
      : "";
  const normalizePubkey =
    typeof app?.normalizeHexPubkey === "function"
      ? (value) => app.normalizeHexPubkey(value) || fallbackNormalizePubkey(value)
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
          description: detail.video?.description,
        })
      ).catch((error) => {
        console.error("Failed to play channel video via event id:", error);
        if (typeof app?.playVideoWithFallback === "function") {
          app.playVideoWithFallback({
            url: detail.url,
            magnet: detail.magnet,
          });
        }
      });
      return;
    }

    if (typeof app?.playVideoWithFallback === "function") {
      Promise.resolve(
        app.playVideoWithFallback({ url: detail.url, magnet: detail.magnet })
      ).catch((error) => {
        console.error("Failed to start fallback playback for channel video:", error);
      });
    }
  };

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
    if (pointerInfo && typeof app?.persistWatchHistoryMetadataForVideo === "function") {
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

    const highlightClass =
      canEdit && video.isPrivate ? "video-card--owner-private" : "";

    const videoCard = new VideoCard({
      document,
      video,
      index,
      shareUrl,
      pointerInfo,
      timeAgo,
      highlightClass,
      capabilities: {
        canEdit,
        canDelete: canEdit,
        canRevert: hasOlder,
        canManageBlacklist:
          typeof app?.canCurrentUserManageBlacklist === "function"
            ? app.canCurrentUserManageBlacklist()
            : false,
      },
      helpers: {
        escapeHtml: (value) => escapeHTML(value),
        isMagnetSupported: (magnet) => app?.isMagnetUriSupported?.(magnet),
        toLocaleString: (value) =>
          typeof value === "number" ? value.toLocaleString() : value,
      },
      assets: {
        fallbackThumbnailSrc: "assets/jpg/video-thumbnail-fallback.jpg",
        unsupportedBtihMessage,
      },
      state: { loadedThumbnails },
      ensureGlobalMoreMenuHandlers: () => app?.ensureGlobalMoreMenuHandlers?.(),
      onRequestCloseAllMenus: () => app?.closeAllMoreMenus?.(),
      formatters: {
        formatTimeAgo: (ts) =>
          typeof app?.formatTimeAgo === "function"
            ? app.formatTimeAgo(ts)
            : new Date(ts * 1000).toLocaleString(),
      },
    });

    videoCard.onPlay = ({ event: domEvent, video: cardVideo }) => {
      const trigger = domEvent?.currentTarget || domEvent?.target;
      const detail = extractPlaybackDetail(trigger, cardVideo || video);
      detail.video = detail.video || video;
      startPlayback(detail);
    };

    videoCard.onEdit = ({ video: editVideo, index: editIndex }) => {
      app?.handleEditVideo?.({
        eventId: editVideo?.id || "",
        index: Number.isFinite(editIndex) ? editIndex : null,
      });
    };

    videoCard.onRevert = ({ video: revertVideo, index: revertIndex }) => {
      app?.handleRevertVideo?.({
        eventId: revertVideo?.id || "",
        index: Number.isFinite(revertIndex) ? revertIndex : null,
      });
    };

    videoCard.onDelete = ({ video: deleteVideo, index: deleteIndex }) => {
      app?.handleFullDeleteVideo?.({
        eventId: deleteVideo?.id || "",
        index: Number.isFinite(deleteIndex) ? deleteIndex : null,
      });
    };

    videoCard.onMoreAction = ({ dataset = {} }) => {
      const action = dataset.action || "";
      const detail = {
        ...dataset,
        eventId: dataset.eventId || video.id || "",
        context: dataset.context || "channel-grid",
      };
      app?.handleMoreMenuAction?.(action || "copy-link", detail);
    };

    videoCard.onAuthorNavigate = ({ pubkey }) => {
      const targetPubkey = pubkey || video.pubkey || "";
      if (targetPubkey && typeof app?.goToProfile === "function") {
        app.goToProfile(targetPubkey);
      }
    };

    const cardEl = videoCard.getRoot();
    if (cardEl) {
      fragment.appendChild(cardEl);
    }
  });

  if (renderIndex === 0) {
    if (allowEmptyMessage) {
      container.dataset.hasChannelVideos = "false";
      container.innerHTML = `<p class="text-gray-500">No videos to display.</p>`;
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
  loadToken = null,
} = {}) {
  if (loadToken !== null && loadToken !== currentProfileLoadToken) {
    return;
  }

  const normalized = normalizeChannelProfileMetadata(profile);

  const bannerEl = document.getElementById("channelBanner");
  if (bannerEl) {
    bannerEl.src = normalized.banner || FALLBACK_CHANNEL_BANNER;
  }

  const avatarEl = document.getElementById("channelAvatar");
  if (avatarEl) {
    avatarEl.src = normalized.picture || FALLBACK_CHANNEL_AVATAR;
  }

  const nameEl = document.getElementById("channelName");
  if (nameEl) {
    nameEl.textContent = normalized.name || "Unknown User";
  }

  const channelNpubEl = document.getElementById("channelNpub");
  if (channelNpubEl) {
    if (npub) {
      channelNpubEl.textContent = npub;
    } else if (pubkey) {
      try {
        channelNpubEl.textContent = window.NostrTools.nip19.npubEncode(pubkey);
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
    lnEl.textContent =
      lightningAddress || "No lightning address found.";
  }

  if (event) {
    currentChannelProfileEvent = { ...event };
  } else if (loadToken === currentProfileLoadToken && !event) {
    currentChannelProfileEvent = null;
  }

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
  if (!nostrClient?.pool || !Array.isArray(nostrClient?.relays)) {
    return { event: null, profile: {} };
  }

  try {
    const events = await nostrClient.pool.list(nostrClient.relays, [
      { kinds: [0], authors: [pubkey], limit: 1 },
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
        console.warn("Failed to parse channel metadata payload:", error);
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
      loadToken,
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
        loadToken,
      });
    } else {
      applyChannelProfileMetadata({
        profile: {},
        event: null,
        pubkey,
        npub: currentChannelNpub,
        loadToken,
      });
    }
  }

  try {
    const result = await fetchChannelProfileFromRelays(pubkey);
    if (loadToken !== currentProfileLoadToken) {
      return;
    }

    rememberChannelProfile(pubkey, result);

    if (typeof app?.setProfileCacheEntry === "function") {
      try {
        app.setProfileCacheEntry(pubkey, {
          ...result.profile,
          lightningAddress:
            result.profile?.lightningAddress ||
            result.profile?.lud16 ||
            result.profile?.lud06 ||
            "",
        });
      } catch (error) {
        console.warn(
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
      loadToken,
    });
  } catch (error) {
    if (loadToken === currentProfileLoadToken) {
      console.error("Failed to fetch user profile data:", error);
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
async function loadUserVideos(pubkey) {
  const app = getApp();
  const container = document.getElementById("channelVideoList");
  const loadToken = ++currentVideoLoadToken;
  const hadExistingContent =
    !!container && container.querySelector("[data-video-id]");

  if (container) {
    container.dataset.loading = "true";
    if (!hadExistingContent) {
      container.innerHTML = `
        <div class="py-16 flex justify-center">
          <span class="text-gray-400 animate-pulse">Loading videos…</span>
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
        app,
      });
      if (cachedVideos.length) {
        renderedFromCache =
          renderChannelVideosFromList({
            videos: cachedVideos,
            container,
            app,
            loadToken,
            allowEmptyMessage: false,
          }) || renderedFromCache;
      }
    }
  }

  const ensureAccessPromise = accessControl
    .ensureReady()
    .catch((error) => {
      console.warn(
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
      limit: 200,
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
        console.error("Relay error (default pool):", error);
      }
    } else {
      const relayPromises = relayList.map((url) =>
        nostrClient.pool.list([url], [filter])
      );

      const settled = await Promise.allSettled(relayPromises);
      settled.forEach((result, index) => {
        const relayUrl = relayList[index];

        if (result.status === "fulfilled") {
          const relayEvents = Array.isArray(result.value)
            ? result.value
            : [];
          events.push(...relayEvents);
          return;
        }

        if (result.reason) {
          console.error(`Relay error (${relayUrl}):`, result.reason);
        }
      });
    }

    await ensureAccessPromise;

    if (loadToken !== currentVideoLoadToken) {
      return;
    }

    if (!container) {
      console.warn("channelVideoList element not found in DOM.");
      return;
    }

    const videos = buildRenderableChannelVideos({ events, app });
    const rendered = renderChannelVideosFromList({
      videos,
      container,
      app,
      loadToken,
      allowEmptyMessage: true,
    });

    renderedFromCache = rendered || renderedFromCache;
  } catch (err) {
    if (loadToken === currentVideoLoadToken && container && !renderedFromCache) {
      container.dataset.hasChannelVideos = "false";
      container.innerHTML = `
        <p class="text-red-400">Failed to load videos. Please try again.</p>
      `;
    }
    console.error("Error loading user videos:", err);
  } finally {
    await ensureAccessPromise;
    if (loadToken === currentVideoLoadToken && container) {
      delete container.dataset.loading;
    }
  }
}

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
    console.error("Failed to refresh channel videos after admin update:", error);
  });
});

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

