// js/payments/platformAddress.js

import { PLATFORM_LUD16_OVERRIDE, ADMIN_SUPER_NPUB } from "../config.js";
import { nostrClient } from "../nostr.js";
import { setProfileCacheEntry } from "../state/cache.js";

const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedAddress = null;

function getGlobalWindow() {
  if (typeof window !== "undefined") {
    return window;
  }
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  return {};
}

function getNostrTools() {
  const win = getGlobalWindow();
  const tools = win?.NostrTools || null;
  const canonical = win?.__BITVID_CANONICAL_NOSTR_TOOLS__ || null;

  if (tools && canonical && !tools.nip04 && canonical.nip04) {
    try {
      tools.nip04 = canonical.nip04;
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
      console.warn("[platformAddress] Failed to decode ADMIN_SUPER_NPUB", error);
    }
  }

  return null;
}

function shouldUseOverride() {
  return typeof PLATFORM_LUD16_OVERRIDE === "string" && PLATFORM_LUD16_OVERRIDE.trim();
}

function getOverrideAddress() {
  const trimmed = PLATFORM_LUD16_OVERRIDE.trim();
  return trimmed || null;
}

function isCacheFresh(entry) {
  if (!entry) {
    return false;
  }
  if (typeof entry.expiresAt !== "number") {
    return false;
  }
  return entry.expiresAt > Date.now();
}

async function fetchAdminMetadata(adminPubkey) {
  if (!adminPubkey) {
    return null;
  }

  let pool;
  try {
    pool = await nostrClient.ensurePool();
  } catch (error) {
    console.warn("[platformAddress] Failed to initialize Nostr pool", error);
    return null;
  }

  if (!pool) {
    return null;
  }

  const relayUrls = Array.isArray(nostrClient?.relays)
    ? nostrClient.relays
    : [];
  if (relayUrls.length === 0) {
    console.warn("[platformAddress] Nostr client is not ready.");
    return null;
  }

  try {
    const events = await pool.list(relayUrls, [
      { kinds: [0], authors: [adminPubkey], limit: 1 },
    ]);

    if (!Array.isArray(events) || events.length === 0) {
      return null;
    }

    let newest = null;
    for (const event of events) {
      if (!event || event.pubkey !== adminPubkey || !event.content) {
        continue;
      }
      if (!newest || event.created_at > newest.created_at) {
        newest = event;
      }
    }

    if (!newest?.content) {
      return null;
    }

    const data = JSON.parse(newest.content);
    const lightningAddress =
      typeof data.lud16 === "string" && data.lud16.trim()
        ? data.lud16.trim()
        : typeof data.lud06 === "string" && data.lud06.trim()
        ? data.lud06.trim()
        : "";

    if (lightningAddress) {
      setProfileCacheEntry(adminPubkey, data, { persist: false });
    }

    return lightningAddress || null;
  } catch (error) {
    console.warn("[platformAddress] Failed to fetch admin metadata", error);
    return null;
  }
}

export async function getPlatformLightningAddress({ forceRefresh = false } = {}) {
  if (shouldUseOverride()) {
    return getOverrideAddress();
  }

  if (!forceRefresh && isCacheFresh(cachedAddress)) {
    return cachedAddress.value;
  }

  const adminPubkey = decodeAdminPubkey();
  if (!adminPubkey) {
    return null;
  }

  if (forceRefresh !== true && cachedAddress?.value) {
    return cachedAddress.value;
  }

  const lightningAddress = await fetchAdminMetadata(adminPubkey);
  if (lightningAddress) {
    cachedAddress = {
      value: lightningAddress,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  }

  return lightningAddress || cachedAddress?.value || null;
}

export function __resetPlatformAddressCache() {
  cachedAddress = null;
}
