// js/adminListStore.js

import {
  ADMIN_LIST_MODE,
  ADMIN_LIST_NAMESPACE,
  ADMIN_SUPER_NPUB,
  ADMIN_EDITORS_NPUBS,
  isDevMode,
} from "./config.js";
import { nostrClient } from "./nostr.js";
import {
import { devLogger, userLogger } from "./utils/logger.js";
  buildAdminListEvent,
  ADMIN_LIST_IDENTIFIERS,
} from "./nostrEventSchemas.js";

const LEGACY_STORAGE_KEYS = {
  editors: "bitvid_admin_editors",
  whitelist: "bitvid_admin_whitelist",
  whitelistLegacy: "bitvid_whitelist",
  blacklist: "bitvid_admin_blacklist",
  blacklistLegacy: "bitvid_blacklist",
};

const PUBLISH_TIMEOUT_MS = 7000;

function createError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function normalizeNpub(value) {
  return typeof value === "string" ? value.trim() : "";
}

const HEX_PUBKEY_REGEX = /^[0-9a-f]{64}$/i;

function isHexPubkey(value) {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return HEX_PUBKEY_REGEX.test(trimmed);
}

function dedupeNpubs(values) {
  const normalized = Array.isArray(values) ? values.map(normalizeNpub) : [];
  return Array.from(
    normalized.reduce((set, npub) => {
      if (npub) {
        set.add(npub);
      }
      return set;
    }, new Set())
  );
}

function canDecodeNpub() {
  return !!(
    typeof window !== "undefined" &&
    window?.NostrTools?.nip19 &&
    typeof window.NostrTools.nip19.decode === "function"
  );
}

function isLikelyNpub(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (!canDecodeNpub()) {
    return true;
  }

  try {
    const decoded = window.NostrTools.nip19.decode(trimmed);
    return decoded?.type === "npub";
  } catch (error) {
    return false;
  }
}

function sanitizeNpubList(values) {
  return dedupeNpubs(values).filter(isLikelyNpub);
}

function sanitizeAdminState(state = {}) {
  const sanitizedEditors = sanitizeNpubList(state.editors || []);
  const sanitizedWhitelist = sanitizeNpubList(state.whitelist || []);
  const whitelistSet = new Set(sanitizedWhitelist.map(normalizeNpub));

  const adminGuardSet = new Set([
    normalizeNpub(ADMIN_SUPER_NPUB),
    ...ADMIN_EDITORS_NPUBS.map(normalizeNpub),
    ...sanitizedEditors.map(normalizeNpub),
  ]);

  const sanitizedBlacklist = sanitizeNpubList(state.blacklist || []).filter(
    (npub) => {
      const normalized = normalizeNpub(npub);
      if (!normalized) {
        return false;
      }
      if (whitelistSet.has(normalized)) {
        return false;
      }
      if (adminGuardSet.has(normalized)) {
        return false;
      }
      return true;
    }
  );

  return {
    editors: sanitizedEditors,
    whitelist: sanitizedWhitelist,
    blacklist: sanitizedBlacklist,
  };
}

function hasAnyEntries(state = {}) {
  return Boolean(
    (Array.isArray(state.editors) && state.editors.length) ||
      (Array.isArray(state.whitelist) && state.whitelist.length) ||
      (Array.isArray(state.blacklist) && state.blacklist.length)
  );
}

function readJsonListFromStorage(key) {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    devLogger.warn(`[adminListStore] Failed to parse legacy list for ${key:`, error);
    }
    return null;
  }
}

function loadLegacyAdminState() {
  const editors = readJsonListFromStorage(LEGACY_STORAGE_KEYS.editors) || [];
  const whitelist =
    readJsonListFromStorage(LEGACY_STORAGE_KEYS.whitelist) ||
    readJsonListFromStorage(LEGACY_STORAGE_KEYS.whitelistLegacy) ||
    [];
  const blacklist =
    readJsonListFromStorage(LEGACY_STORAGE_KEYS.blacklist) ||
    readJsonListFromStorage(LEGACY_STORAGE_KEYS.blacklistLegacy) ||
    [];

  const sanitized = sanitizeAdminState({ editors, whitelist, blacklist });
  return hasAnyEntries(sanitized) ? sanitized : null;
}

function clearLegacyStorageFor(listKey) {
  if (typeof localStorage === "undefined") {
    return;
  }

  const keyGroups = {
    editors: [LEGACY_STORAGE_KEYS.editors],
    whitelist: [
      LEGACY_STORAGE_KEYS.whitelist,
      LEGACY_STORAGE_KEYS.whitelistLegacy,
    ],
    blacklist: [
      LEGACY_STORAGE_KEYS.blacklist,
      LEGACY_STORAGE_KEYS.blacklistLegacy,
    ],
  };

  const keys = keyGroups[listKey];
  if (!Array.isArray(keys)) {
    return;
  }

  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      devLogger.warn(`[adminListStore] Failed to clear legacy storage for ${key:`, error);
      }
    }
  }
}

function ensureNostrReady() {
  if (!nostrClient || !nostrClient.pool) {
    throw createError(
      "nostr-unavailable",
      "Nostr relay pool is not initialized."
    );
  }

  const relays = Array.isArray(nostrClient.relays) ? nostrClient.relays : [];
  if (!relays.length) {
    throw createError("nostr-unavailable", "No Nostr relays configured.");
  }

  return relays;
}

function decodeNpubToHex(npub) {
  const trimmed = normalizeNpub(npub);
  if (!trimmed) {
    throw createError("invalid npub", "Empty npub provided.");
  }

  try {
    const decoded = window?.NostrTools?.nip19?.decode(trimmed);
    if (decoded?.type !== "npub" || !decoded?.data) {
      throw new Error("Invalid npub format");
    }
    return typeof decoded.data === "string"
      ? decoded.data
      : decoded.data?.pubkey || "";
  } catch (error) {
    throw createError("invalid npub", "Unable to decode npub.", error);
  }
}

function encodeHexToNpub(hex) {
  try {
    return window?.NostrTools?.nip19?.npubEncode(hex) || "";
  } catch (error) {
    devLogger.warn("Failed to encode hex pubkey to npub:", error);
    return "";
  }
}

function normalizeParticipantTagValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const nip19 = window?.NostrTools?.nip19;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("npub")) {
    if (nip19?.decode) {
      try {
        const decoded = nip19.decode(trimmed);
        if (decoded?.type === "npub") {
          return trimmed;
        }
      } catch (error) {
        // Swallow decode errors so we can still fall back to the raw npub string.
      }
    }
    return trimmed;
  }

  if (isHexPubkey(trimmed)) {
    const encoded = encodeHexToNpub(trimmed);
    if (encoded) {
      return encoded;
    }
    if (!canDecodeNpub()) {
      return trimmed;
    }
  }

  if (nip19?.decode) {
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded?.type === "npub") {
        return trimmed;
      }
    } catch (error) {
      // Ignore decode failures; values that cannot be interpreted as npubs are dropped.
    }
  }

  return "";
}

function extractNpubsFromEvent(event) {
  if (!event || !Array.isArray(event.tags)) {
    return [];
  }

  const candidates = event.tags
    .filter((tag) => Array.isArray(tag) && tag[0] === "p" && tag[1])
    .map((tag) => tag[1]);

  const npubs = candidates
    .map((value) => normalizeParticipantTagValue(value))
    .filter((npub) => typeof npub === "string" && npub);

  return dedupeNpubs(npubs);
}

async function loadNostrList(identifier) {
  const relays = ensureNostrReady();
  const dTagValue = `${ADMIN_LIST_NAMESPACE}:${identifier}`;
  const filter = {
    kinds: [30000],
    "#d": [dTagValue],
    limit: 50,
  };

  let events = [];
  try {
    const combined = await nostrClient.pool.list(relays, [filter]);
    if (Array.isArray(combined)) {
      events = combined;
    }
  } catch (error) {
    devLogger.warn(
    `[adminListStore] Combined relay fetch failed for ${identifier}:`,
    error
    );
  }

  if (!events.length) {
    const perRelay = await Promise.all(
      relays.map(async (url) => {
        try {
          const result = await nostrClient.pool.list([url], [filter]);
          return Array.isArray(result) ? result : [];
        } catch (error) {
          devLogger.warn(
          `[adminListStore] Relay fetch failed for ${identifier} on ${url}:`,
          error
          );
          return [];
        }
      })
    );
    events = perRelay.flat();
  }

  if (!events.length) {
    return [];
  }

  const newest = events.reduce((latest, event) => {
    if (!latest) {
      return event;
    }
    if (event.created_at === latest.created_at) {
      return event.id > latest.id ? event : latest;
    }
    return event.created_at > latest.created_at ? event : latest;
  }, null);

  return extractNpubsFromEvent(newest);
}

async function loadNostrState() {
  const [editors, whitelist, blacklist] = await Promise.all([
    loadNostrList(ADMIN_LIST_IDENTIFIERS.editors),
    loadNostrList(ADMIN_LIST_IDENTIFIERS.whitelist),
    loadNostrList(ADMIN_LIST_IDENTIFIERS.blacklist),
  ]);

  return sanitizeAdminState({ editors, whitelist, blacklist });
}

function buildListEvent(listKey, npubs, actorHex) {
  const hexPubkeys = Array.from(
    new Set(npubs.map((npub) => {
      try {
        return decodeNpubToHex(npub);
      } catch (error) {
        devLogger.warn(
        `[adminListStore] Failed to decode npub while publishing ${listKey}:`,
        error
        );
        return "";
      }
    }).filter((hex) => !!hex))
  );

  if (listKey === "whitelist" || listKey === "editors") {
    try {
      const superHex = decodeNpubToHex(ADMIN_SUPER_NPUB);
      if (superHex && !hexPubkeys.includes(superHex)) {
        hexPubkeys.push(superHex);
      }
    } catch (error) {
      devLogger.warn("Failed to ensure super admin presence:", error);
    }
  }

  return buildAdminListEvent(listKey, {
    pubkey: actorHex,
    created_at: Math.floor(Date.now() / 1000),
    hexPubkeys,
  });
}

function publishToRelay(url, signedEvent, listKey) {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ url, success: false, error: new Error("timeout") });
      }
    }, PUBLISH_TIMEOUT_MS);

    const finalize = (success, error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ url, success, error });
    };

    try {
      const pub = nostrClient.pool.publish([url], signedEvent);
      if (!pub) {
        finalize(false, new Error("publish returned no result"));
        return;
      }

      if (typeof pub.on === "function") {
        const registerHandler = (eventName, handler) => {
          try {
            pub.on(eventName, handler);
            return true;
          } catch (error) {
            devLogger.warn(
            `[adminListStore] Relay publish rejected ${eventName} listener:`,
            error
            );
            return false;
          }
        };

        const handleFailure = (reason) => {
          const error =
            reason instanceof Error
              ? reason
              : new Error(String(reason || "failed"));
          finalize(false, error);
        };

        let handlerRegistered = false;
        handlerRegistered =
          registerHandler("ok", () => finalize(true)) || handlerRegistered;
        handlerRegistered =
          registerHandler("seen", () => finalize(true)) || handlerRegistered;
        handlerRegistered =
          registerHandler("failed", handleFailure) || handlerRegistered;

        if (handlerRegistered) {
          return;
        }
      }

      if (typeof pub.then === "function") {
        pub.then(() => finalize(true)).catch((error) => finalize(false, error));
        return;
      }
    } catch (error) {
      finalize(false, error);
      return;
    }

    finalize(true);
  }).then((result) => {
    if (!result.success && isDevMode) {
      userLogger.warn(
        `[adminListStore] Publish failed for ${listKey} on ${result.url}:`,
        result.error
      );
    }
    return result;
  });
}

async function persistNostrState(actorNpub, updates = {}) {
  ensureNostrReady();
  const extension = window?.nostr;
  if (!extension || typeof extension.signEvent !== "function") {
    throw createError(
      "nostr-extension-missing",
      "A Nostr extension with signEvent support is required."
    );
  }

  const actorHex = decodeNpubToHex(actorNpub);
  if (!actorHex) {
    throw createError("invalid npub", "Unable to decode the actor npub.");
  }

  const sanitizedUpdates = {};
  const actorNormalized = normalizeNpub(actorNpub);

  if (Array.isArray(updates.editors)) {
    sanitizedUpdates.editors = sanitizeNpubList(updates.editors).filter((npub) => {
      const normalized = normalizeNpub(npub);
      return normalized && normalized !== normalizeNpub(ADMIN_SUPER_NPUB);
    });
  }

  if (Array.isArray(updates.whitelist)) {
    sanitizedUpdates.whitelist = sanitizeNpubList(updates.whitelist);
  }

  if (Array.isArray(updates.blacklist)) {
    const whitelistSet = new Set(
      (sanitizedUpdates.whitelist || []).map(normalizeNpub)
    );
    const editorGuard = new Set([
      normalizeNpub(ADMIN_SUPER_NPUB),
      ...ADMIN_EDITORS_NPUBS.map(normalizeNpub),
      ...((sanitizedUpdates.editors || []).map(normalizeNpub) || []),
    ]);

    if (actorNormalized) {
      editorGuard.add(actorNormalized);
    }

    sanitizedUpdates.blacklist = sanitizeNpubList(updates.blacklist).filter(
      (npub) => {
        const normalized = normalizeNpub(npub);
        if (!normalized) {
          return false;
        }
        if (whitelistSet.has(normalized)) {
          return false;
        }
        if (editorGuard.has(normalized)) {
          return false;
        }
        return true;
      }
    );
  }

  const entries = Object.entries(sanitizedUpdates).filter(([, value]) =>
    Array.isArray(value)
  );

  if (!entries.length) {
    return;
  }

  for (const [listKey, npubs] of entries) {
    const event = buildListEvent(listKey, npubs, actorHex);

    let signedEvent;
    try {
      signedEvent = await extension.signEvent(event);
    } catch (error) {
      throw createError("signature-failed", "Failed to sign admin list event.", error);
    }

    const relays = ensureNostrReady();
    const publishResults = await Promise.all(
      relays.map((url) => publishToRelay(url, signedEvent, listKey))
    );

    if (!publishResults.some((result) => result.success)) {
      throw createError(
        "publish-failed",
        `Failed to publish ${listKey} list to any relay.`
      );
    }

    clearLegacyStorageFor(listKey);
  }
}

export async function loadAdminState() {
  if (ADMIN_LIST_MODE !== "nostr" && isDevMode) {
    userLogger.warn(
      `[adminListStore] ADMIN_LIST_MODE "${ADMIN_LIST_MODE}" is deprecated. Defaulting to remote Nostr lists.`
    );
  }

  const state = await loadNostrState();
  if (!hasAnyEntries(state)) {
    const legacy = loadLegacyAdminState();
    if (legacy && isDevMode) {
      userLogger.warn(
        "[adminListStore] Ignoring legacy admin lists because remote mode is enforced. Publish them to Nostr to retain access.",
        legacy
      );
    }
  }

  return state;
}

export async function persistAdminState(actorNpub, updates) {
  if (ADMIN_LIST_MODE !== "nostr" && isDevMode) {
    userLogger.warn(
      `[adminListStore] ADMIN_LIST_MODE "${ADMIN_LIST_MODE}" is deprecated. Remote lists are enforced.`
    );
  }

  return persistNostrState(actorNpub, updates);
}

export const __adminListStoreTestHooks = Object.freeze({
  extractNpubsFromEvent,
  normalizeParticipantTagValue,
});
