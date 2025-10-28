import { resolvePlatformFeePercent } from "./platformFee.js";
import {
  resolveLightningAddress as defaultResolveLightningAddress,
  fetchPayServiceData as defaultFetchPayServiceData,
  validateInvoiceAmount,
} from "./lnurl.js";

const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;

const lightningMetadataCache = new Map();
const lightningMetadataByUrl = new Map();
let cachedPlatformLightningAddress = "";

export function normalizeLightningAddressKey(address) {
  return typeof address === "string" ? address.trim().toLowerCase() : "";
}

export function isMetadataEntryFresh(entry) {
  if (!entry || typeof entry.fetchedAt !== "number") {
    return false;
  }
  return Date.now() - entry.fetchedAt < METADATA_CACHE_TTL_MS;
}

export function rememberLightningMetadata(entry) {
  if (!entry || !entry.key) {
    return entry;
  }
  lightningMetadataCache.set(entry.key, entry);
  if (entry.resolved?.url) {
    lightningMetadataByUrl.set(entry.resolved.url, entry);
  }
  return entry;
}

export function getCachedLightningEntry(address) {
  const key = normalizeLightningAddressKey(address);
  if (!key) {
    return null;
  }
  const entry = lightningMetadataCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.metadata && isMetadataEntryFresh(entry)) {
    return entry;
  }
  if (entry.metadata && !entry.promise) {
    return entry;
  }
  return entry.metadata ? entry : null;
}

export function getCachedMetadataByUrl(url) {
  if (!url) {
    return null;
  }
  return lightningMetadataByUrl.get(url) || null;
}

export async function fetchLightningMetadata(
  address,
  {
    resolveLightningAddress = defaultResolveLightningAddress,
    fetchPayServiceData = defaultFetchPayServiceData,
  } = {}
) {
  const key = normalizeLightningAddressKey(address);
  if (!key) {
    throw new Error("Lightning address is required.");
  }

  const cached = lightningMetadataCache.get(key);
  if (cached && cached.metadata && isMetadataEntryFresh(cached)) {
    return cached;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const fetchPromise = (async () => {
    const resolved = cached?.resolved || (await resolveLightningAddress(address));
    const metadata = await fetchPayServiceData(resolved.url);
    const entry = {
      key,
      address: resolved.address || address,
      resolved,
      metadata,
      fetchedAt: Date.now(),
    };
    rememberLightningMetadata(entry);
    return entry;
  })();

  lightningMetadataCache.set(key, {
    ...(cached || {}),
    key,
    promise: fetchPromise,
  });

  try {
    return await fetchPromise;
  } catch (error) {
    const current = lightningMetadataCache.get(key);
    if (current?.promise === fetchPromise) {
      lightningMetadataCache.delete(key);
    }
    throw error;
  }
}

export function calculateZapShares(amount, overrideFee = null) {
  const numericAmount = Math.max(0, Math.round(Number(amount) || 0));
  const feePercent = resolvePlatformFeePercent(
    typeof overrideFee === "undefined" ? null : overrideFee
  );
  const platformShare = Math.floor((numericAmount * feePercent) / 100);
  const creatorShare = numericAmount - platformShare;
  return {
    total: numericAmount,
    creatorShare,
    platformShare,
    feePercent,
  };
}

export function describeShareType(type) {
  if (type === "platform") {
    return "Platform";
  }
  if (type === "creator") {
    return "Creator";
  }
  return "Lightning";
}

export function formatMinRequirement(metadata) {
  if (!metadata || typeof metadata.minSendable !== "number") {
    return null;
  }
  if (metadata.minSendable <= 0) {
    return null;
  }
  return Math.ceil(metadata.minSendable / 1000);
}

export function setCachedPlatformLightningAddress(address) {
  cachedPlatformLightningAddress =
    typeof address === "string" ? address.trim() : "";
  return cachedPlatformLightningAddress;
}

export function getCachedPlatformLightningAddress() {
  return cachedPlatformLightningAddress;
}

export function clearZapCaches() {
  lightningMetadataCache.clear();
  lightningMetadataByUrl.clear();
  cachedPlatformLightningAddress = "";
}

export { validateInvoiceAmount };

function extractErrorMessage(error) {
  if (!error) {
    return "";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error?.message === "string") {
    return error.message;
  }
  if (typeof error?.reason === "string") {
    return error.reason;
  }
  if (typeof error?.error?.message === "string") {
    return error.error.message;
  }
  if (typeof error?.data?.error === "string") {
    return error.data.error;
  }
  if (typeof error?.data?.error?.message === "string") {
    return error.data.error.message;
  }
  return "";
}

const ALLOWANCE_ERROR_PATTERNS = [
  "budget exceeded",
  "allowance exceeded",
  "allowance exhausted",
  "allowance spent",
  "allowance depleted",
  "allowance limit reached",
  "spending allowance exceeded",
  "spending allowance reached",
  "spending limit reached",
  "quota exceeded",
];

export function isZapAllowanceExhaustedError(error) {
  const message = extractErrorMessage(error);
  if (!message) {
    return false;
  }
  const normalized = message.toLowerCase();
  if (ALLOWANCE_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return true;
  }
  if (normalized.includes("allowance") && normalized.includes("zap")) {
    if (
      normalized.includes("exceed") ||
      normalized.includes("exhaust") ||
      normalized.includes("spent") ||
      normalized.includes("deplet")
    ) {
      return true;
    }
  }
  if (normalized.includes("budget") && normalized.includes("zap")) {
    if (
      normalized.includes("exceed") ||
      normalized.includes("spent") ||
      normalized.includes("deplet")
    ) {
      return true;
    }
  }
  return false;
}

const ALLOWANCE_GUIDANCE_SUFFIX =
  "Increase your wallet zap limit or reduce the platform split to continue.";
const DEFAULT_ALLOWANCE_MESSAGE =
  "Your wallet's zap allowance has been exhausted. " + ALLOWANCE_GUIDANCE_SUFFIX;

export function buildZapAllowanceExhaustedMessage(error) {
  const baseMessage = extractErrorMessage(error).trim();
  if (!baseMessage) {
    return DEFAULT_ALLOWANCE_MESSAGE;
  }
  const normalized = baseMessage.toLowerCase();
  const punctuation = /[.!?]$/.test(baseMessage) ? "" : ".";
  if (
    normalized.includes("zap allowance") &&
    normalized.includes("increase") &&
    normalized.includes("platform split")
  ) {
    return baseMessage;
  }
  if (normalized.includes("zap") && normalized.includes("allowance")) {
    return `${baseMessage}${punctuation} ${ALLOWANCE_GUIDANCE_SUFFIX}`;
  }
  return `${baseMessage}${punctuation} ${DEFAULT_ALLOWANCE_MESSAGE}`;
}
