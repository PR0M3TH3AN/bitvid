import { PLATFORM_FEE_PERCENT } from "../config.js";
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
  const percentSource =
    typeof overrideFee === "number" && Number.isFinite(overrideFee)
      ? overrideFee
      : PLATFORM_FEE_PERCENT;
  const feePercent = Math.min(100, Math.max(0, Math.round(percentSource)));
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
