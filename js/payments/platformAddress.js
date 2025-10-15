// js/payments/platformAddress.js

import { PLATFORM_LUD16_OVERRIDE, ADMIN_SUPER_NPUB } from "../config.js";
import { nostrClient } from "../nostr.js";
import { setProfileCacheEntry } from "../state/cache.js";
import { nostrToolsReady } from "../nostrToolsBootstrap.js";
import { userLogger } from "../utils/logger.js";

const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedAddress = null;

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

const __platformNostrToolsBootstrap = await (async () => {
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

let cachedNostrTools = __platformNostrToolsBootstrap.toolkit || null;
const nostrToolsInitializationFailure =
  __platformNostrToolsBootstrap.failure || null;

if (!cachedNostrTools && nostrToolsInitializationFailure) {
  userLogger.warn(
    "[platformAddress] nostr-tools helpers unavailable after bootstrap.",
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
    userLogger.warn(
      "[platformAddress] Failed to resolve nostr-tools helpers.",
      error
    );
  }
  if (!cachedNostrTools) {
    rememberNostrTools(readToolkitFromScope());
  }
  return cachedNostrTools || null;
}

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
  const tools = getCachedNostrTools();
  if (tools?.nip04) {
    return tools;
  }
  const canonical = win?.__BITVID_CANONICAL_NOSTR_TOOLS__ || null;
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
      userLogger.warn("[platformAddress] Failed to decode ADMIN_SUPER_NPUB", error);
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
    userLogger.warn("[platformAddress] Failed to initialize Nostr pool", error);
    return null;
  }

  if (!pool) {
    return null;
  }

  const relayUrls = Array.isArray(nostrClient?.relays)
    ? nostrClient.relays
    : [];
  if (relayUrls.length === 0) {
    userLogger.warn("[platformAddress] Nostr client is not ready.");
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
    userLogger.warn("[platformAddress] Failed to fetch admin metadata", error);
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
