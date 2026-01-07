// js/payments/zapSplit.js

import { ADMIN_SUPER_NPUB } from "../config.js";
import { nostrToolsReady } from "../nostrToolsBootstrap.js";
import {
  resolveLightningAddress,
  fetchPayServiceData,
  validateInvoiceAmount,
  requestInvoice,
  encodeLnurlBech32,
} from "./lnurl.js";
import { ensureWallet, sendPayment } from "./nwcClient.js";
import { getPlatformLightningAddress } from "./platformAddress.js";
import { RELAY_URLS } from "../nostr/toolkit.js";
import { signEventWithPrivateKey } from "../nostr/publishHelpers.js";
import { userLogger } from "../utils/logger.js";
import { validateZapReceipt } from "./zapReceiptValidator.js";
import {
  clampPercent,
  parsePercentValue,
  resolvePlatformFeePercent,
} from "./platformFee.js";

const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const ZAP_KIND = 9734;
const DEFAULT_DEPS = Object.freeze({
  lnurl: Object.freeze({
    resolveLightningAddress,
    fetchPayServiceData,
    validateInvoiceAmount,
    requestInvoice,
    encodeLnurlBech32,
  }),
  wallet: Object.freeze({ ensureWallet, sendPayment }),
  platformAddress: Object.freeze({ getPlatformLightningAddress }),
  validator: Object.freeze({ validateZapReceipt }),
});

const globalScope =
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
    ? globalThis
    : null;

const nostrToolsReadySource =
  globalScope &&
  globalScope.nostrToolsReady &&
  typeof globalScope.nostrToolsReady.then === "function"
    ? globalScope.nostrToolsReady
    : nostrToolsReady;

function normalizeToolkitCandidate(candidate) {
  if (
    candidate &&
    typeof candidate === "object" &&
    candidate.ok !== false &&
    typeof candidate.then !== "function"
  ) {
    return candidate;
  }
  return null;
}

function readToolkitFromScope(scope = globalScope) {
  if (!scope || typeof scope !== "object") {
    return null;
  }

  const candidates = [];

  const canonical = scope.__BITVID_CANONICAL_NOSTR_TOOLS__;
  if (canonical) {
    candidates.push(canonical);
  }

  const direct = scope.NostrTools;
  if (direct) {
    candidates.push(direct);
  }

  const nestedWindow =
    scope.window && scope.window !== scope && typeof scope.window === "object"
      ? scope.window
      : null;
  if (nestedWindow) {
    if (nestedWindow.__BITVID_CANONICAL_NOSTR_TOOLS__) {
      candidates.push(nestedWindow.__BITVID_CANONICAL_NOSTR_TOOLS__);
    }
    if (nestedWindow.NostrTools) {
      candidates.push(nestedWindow.NostrTools);
    }
  }

  for (const candidate of candidates) {
    const normalized = normalizeToolkitCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

const __zapNostrToolsBootstrap = await (async () => {
  try {
    const result = await nostrToolsReadySource;
    if (result && typeof result === "object" && result.ok === false) {
      return {
        toolkit: normalizeToolkitCandidate(readToolkitFromScope()),
        failure: result,
      };
    }
    const normalized = normalizeToolkitCandidate(result);
    if (normalized) {
      return { toolkit: normalized, failure: null };
    }
    return {
      toolkit: normalizeToolkitCandidate(readToolkitFromScope()),
      failure: null,
    };
  } catch (error) {
    return {
      toolkit: normalizeToolkitCandidate(readToolkitFromScope()),
      failure: error,
    };
  }
})();

let cachedNostrTools = __zapNostrToolsBootstrap.toolkit || null;
const nostrToolsInitializationFailure = __zapNostrToolsBootstrap.failure || null;

if (!cachedNostrTools && nostrToolsInitializationFailure) {
  userLogger.warn(
    "[zapSplit] nostr-tools helpers unavailable after bootstrap.",
    nostrToolsInitializationFailure
  );
}

function rememberNostrTools(candidate) {
  const normalized = normalizeToolkitCandidate(candidate);
  if (normalized) {
    cachedNostrTools = normalized;
  }
}

function getCachedNostrTools() {
  const fallback = readToolkitFromScope();
  if (cachedNostrTools && fallback && fallback !== cachedNostrTools) {
    rememberNostrTools(fallback);
  } else if (!cachedNostrTools && fallback) {
    rememberNostrTools(fallback);
  }
  return cachedNostrTools || fallback || null;
}

async function ensureNostrTools() {
  if (cachedNostrTools) {
    return cachedNostrTools;
  }
  try {
    const result = await nostrToolsReadySource;
    rememberNostrTools(result);
  } catch (error) {
    userLogger.warn("[zapSplit] Failed to resolve nostr-tools helpers.", error);
  }
  if (!cachedNostrTools) {
    rememberNostrTools(readToolkitFromScope());
  }
  return cachedNostrTools || null;
}

function getOverridePlatformFee() {
  return resolvePlatformFeePercent(globalThis?.__BITVID_PLATFORM_FEE_OVERRIDE__);
}

function sanitizeAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    throw new Error("Zap amount must be a positive integer.");
  }
  const rounded = Math.round(numeric);
  if (rounded <= 0) {
    throw new Error("Zap amount must be greater than zero.");
  }
  return rounded;
}

function sanitizeComment(comment) {
  if (typeof comment !== "string") {
    return "";
  }
  return comment.trim();
}

function sanitizeAddress(address) {
  const trimmed = typeof address === "string" ? address.trim() : "";
  return trimmed || "";
}

function mergeDependencies(overrides = {}) {
  const lnurlDeps = {
    ...DEFAULT_DEPS.lnurl,
    ...(overrides.lnurl || {}),
  };
  const walletDeps = {
    ...DEFAULT_DEPS.wallet,
    ...(overrides.wallet || {}),
  };
  const platformDeps = {
    ...DEFAULT_DEPS.platformAddress,
    ...(overrides.platformAddress || {}),
  };

  const validatorDeps = {
    ...DEFAULT_DEPS.validator,
    ...(overrides.validator || {}),
  };

  return {
    lnurl: lnurlDeps,
    wallet: walletDeps,
    platformAddress: platformDeps,
    validator: validatorDeps,
  };
}

function getNostrTools() {
  const tools = getCachedNostrTools();
  if (tools?.nip04) {
    return tools;
  }
  const scope = globalScope || (typeof window !== "undefined" ? window : globalThis);
  const canonical = scope?.__BITVID_CANONICAL_NOSTR_TOOLS__ || null;
  if (canonical && tools && !tools.nip04 && canonical.nip04) {
    try {
      tools.nip04 = canonical.nip04;
      return tools;
    } catch (error) {
      return { ...canonical, ...tools, nip04: canonical.nip04 };
    }
  }
  return tools || canonical || null;
}

function decodeAdminPubkey() {
  const trimmed = typeof ADMIN_SUPER_NPUB === "string" ? ADMIN_SUPER_NPUB.trim() : "";
  if (!trimmed) {
    return null;
  }
  if (HEX64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const tools = getNostrTools();
  const decoder = tools?.nip19?.decode;
  if (typeof decoder === "function") {
    try {
      const decoded = decoder(trimmed);
      if (decoded?.type === "npub" && typeof decoded.data === "string") {
        const hex = decoded.data.trim();
        if (HEX64_REGEX.test(hex)) {
          return hex.toLowerCase();
        }
      }
    } catch (error) {
      return null;
    }
  }
  return null;
}

function derivePointerTag(videoEvent) {
  if (!videoEvent || typeof videoEvent !== "object") {
    return null;
  }
  if (!Array.isArray(videoEvent.tags)) {
    return null;
  }
  const dTag = videoEvent.tags.find((tag) => Array.isArray(tag) && tag[0] === "d" && tag[1]);
  if (!dTag) {
    return null;
  }
  if (!Number.isFinite(videoEvent.kind) || typeof videoEvent.pubkey !== "string") {
    return null;
  }
  const value = `${videoEvent.kind}:${videoEvent.pubkey}:${dTag[1]}`;
  return ["a", value];
}

function resolveRelayUrls(wallet) {
  const normalized = [];
  const seen = new Set();

  const addCandidate = (candidate) => {
    if (!candidate) {
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(addCandidate);
      return;
    }
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        normalized.push(trimmed);
      }
    }
  };

  if (wallet && typeof wallet === "object") {
    addCandidate(wallet.relayUrls);
    addCandidate(wallet.relays);
    addCandidate(wallet.relayUrl);
  }

  if (!normalized.length) {
    addCandidate(Array.isArray(RELAY_URLS) ? RELAY_URLS : []);
  }

  return normalized;
}

function resolveBech32Lnurl(resolved, encodeFn) {
  const candidate = typeof resolved?.address === "string" ? resolved.address.trim() : "";
  if (candidate && candidate.toLowerCase().startsWith("lnurl")) {
    return candidate.toLowerCase();
  }

  const callbackUrl = typeof resolved?.url === "string" ? resolved.url.trim() : "";
  if (!callbackUrl) {
    return "";
  }

  if (typeof encodeFn !== "function") {
    throw new Error("LNURL encoder is unavailable.");
  }

  return encodeFn(callbackUrl);
}

function buildZapRequest({
  wallet,
  recipientPubkey,
  videoEvent,
  amountSats,
  comment,
  lnurl,
}) {
  const tags = [];
  if (recipientPubkey) {
    tags.push(["p", recipientPubkey]);
  }
  if (videoEvent?.id) {
    tags.push(["e", videoEvent.id]);
  }
  const pointerTag = derivePointerTag(videoEvent);
  if (pointerTag) {
    tags.push(pointerTag);
  }
  if (typeof lnurl === "string") {
    const normalizedLnurl = lnurl.trim();
    if (normalizedLnurl) {
      tags.push(["lnurl", normalizedLnurl]);
    }
  }
  if (Number.isFinite(amountSats)) {
    tags.push(["amount", String(Math.max(0, Math.round(amountSats)) * 1000)]);
  }

  const relayUrls = resolveRelayUrls(wallet);
  if (relayUrls.length) {
    tags.push(["relays", ...relayUrls]);
  }

  const event = {
    kind: ZAP_KIND,
    content: comment || "",
    created_at: Math.floor(Date.now() / 1000),
    tags,
    pubkey: wallet?.clientPubkey || "",
  };

  const signedEvent = signEventWithPrivateKey(event, wallet?.secretKey);
  return JSON.stringify(signedEvent);
}

function determineRecipientPubkey({ recipientType, metadata, videoEvent }) {
  if (metadata?.nostrPubkey && HEX64_REGEX.test(metadata.nostrPubkey)) {
    return metadata.nostrPubkey.toLowerCase();
  }
  if (recipientType === "creator" && typeof videoEvent?.pubkey === "string") {
    return videoEvent.pubkey;
  }
  if (recipientType === "platform") {
    return decodeAdminPubkey();
  }
  return null;
}

async function processShare({
  recipientType,
  address,
  amountSats,
  comment,
  videoEvent,
  wallet,
  deps,
}) {
  const resolved = deps.lnurl.resolveLightningAddress(address);
  const metadata = await deps.lnurl.fetchPayServiceData(resolved.url);
  const { amountMsats } = deps.lnurl.validateInvoiceAmount(metadata, amountSats);

  const lnurlTag = resolveBech32Lnurl(resolved, deps.lnurl.encodeLnurlBech32);
  if (!lnurlTag) {
    throw new Error("Unable to resolve LNURL for zap request.");
  }

  let zapRequest = null;
  if (metadata.allowsNostr === true || metadata.nostrPubkey) {
    const recipientPubkey = determineRecipientPubkey({
      recipientType,
      metadata,
      videoEvent,
    });
    if (recipientPubkey) {
      zapRequest = buildZapRequest({
        wallet,
        recipientPubkey,
        videoEvent,
        amountSats,
        comment,
        lnurl: lnurlTag,
      });
    }
  }

  const invoice = await deps.lnurl.requestInvoice(metadata, {
    amountMsats,
    comment,
    zapRequest,
    lnurl: lnurlTag,
  });

  try {
    const payment = await deps.wallet.sendPayment(invoice.invoice, {
      amountSats,
      zapRequest,
      lnurl: lnurlTag,
    });

    let validation = null;
    if (typeof deps.validator.validateZapReceipt === "function") {
      try {
        validation = await deps.validator.validateZapReceipt(
          {
            zapRequest,
            amountSats,
            metadata,
            invoice,
            payment,
            lnurl: resolved,
            recipientType,
            address,
          }
        );
      } catch (validationError) {
        userLogger.warn(
          `[zapSplit] Zap receipt validation threw for ${recipientType} share.`,
          validationError
        );
        validation = {
          status: "failed",
          reason: "Zap receipt validation encountered an unexpected error.",
          event: null,
        };
      }
    }

    const receipt = {
      recipientType,
      address,
      amount: amountSats,
      lnurl: resolved,
      metadata,
      invoice,
      payment,
      zapRequest,
      status: "success",
    };

    if (validation && typeof validation === "object") {
      receipt.validation = validation;
      if (validation.status === "passed" && validation.event) {
        receipt.validatedEvent = validation.event;
      } else if (validation.status === "failed") {
        receipt.validationFailed = true;
      }
    }

    return receipt;
  } catch (error) {
    userLogger.warn(
      `[zapSplit] Failed to send ${recipientType} zap share.`,
      error
    );
    return {
      recipientType,
      address,
      amount: amountSats,
      lnurl: resolved,
      metadata,
      invoice,
      payment: null,
      zapRequest,
      status: "error",
      error,
    };
  }
}

export async function splitAndZap(
  { videoEvent, amountSats, comment = "", walletSettings } = {},
  dependencies = {}
) {
  if (!videoEvent || typeof videoEvent !== "object") {
    throw new Error("A video event is required to zap.");
  }

  const amount = sanitizeAmount(amountSats);
  const note = sanitizeComment(comment);
  const deps = mergeDependencies(dependencies);

  const wallet = await deps.wallet.ensureWallet({ settings: walletSettings });

  const creatorAddress = sanitizeAddress(videoEvent.lightningAddress);
  if (!creatorAddress) {
    throw new Error("This creator has not configured a Lightning address yet.");
  }

  const platformFee = clampPercent(getOverridePlatformFee());
  const platformShare = Math.floor((amount * platformFee) / 100);
  const creatorShare = amount - platformShare;

  let platformAddress = null;
  if (platformShare > 0) {
    platformAddress = sanitizeAddress(
      await deps.platformAddress.getPlatformLightningAddress({ forceRefresh: false })
    );
    if (!platformAddress) {
      throw new Error("Platform Lightning address is unavailable.");
    }
  }

  const receipts = [];

  if (creatorShare > 0) {
    receipts.push(
      await processShare({
        recipientType: "creator",
        address: creatorAddress,
        amountSats: creatorShare,
        comment: note,
        videoEvent,
        wallet,
        deps,
      })
    );
  }

  if (platformShare > 0) {
    receipts.push(
      await processShare({
        recipientType: "platform",
        address: platformAddress,
        amountSats: platformShare,
        comment: note,
        videoEvent,
        wallet,
        deps,
      })
    );
  }

  return {
    totalAmount: amount,
    creatorShare,
    platformShare,
    receipts,
  };
}

export const __TESTING__ = Object.freeze({
  buildZapRequest,
  determineRecipientPubkey,
  derivePointerTag,
  mergeDependencies,
  parsePercentValue,
  clampPercent,
});
