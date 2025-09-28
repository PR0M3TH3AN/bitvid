// js/adminListStore.js

import {
  ADMIN_LIST_MODE,
  ADMIN_LIST_NAMESPACE,
  ADMIN_SUPER_NPUB,
  ADMIN_EDITORS_NPUBS,
  isDevMode,
} from "./config.js";
import {
  ADMIN_INITIAL_BLACKLIST,
  ADMIN_INITIAL_WHITELIST,
} from "./lists.js";
import { nostrClient } from "./nostr.js";

export const ADMIN_EDITORS_KEY = "bitvid_admin_editors";
export const ADMIN_WHITELIST_KEY = "bitvid_admin_whitelist";
export const ADMIN_BLACKLIST_KEY = "bitvid_admin_blacklist";

const LEGACY_WHITELIST_KEY = "bitvid_whitelist";
const LEGACY_BLACKLIST_KEY = "bitvid_blacklist";

const LIST_IDENTIFIERS = {
  editors: "editors",
  whitelist: "whitelist",
  blacklist: "blacklist",
};

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
  const sanitizedWhitelistSet = new Set([
    ...ADMIN_INITIAL_WHITELIST.map(normalizeNpub),
    ...sanitizedWhitelist,
  ]);

  const adminGuardSet = new Set([
    normalizeNpub(ADMIN_SUPER_NPUB),
    ...ADMIN_EDITORS_NPUBS.map(normalizeNpub),
    ...sanitizedEditors,
  ]);

  const sanitizedBlacklist = sanitizeNpubList(state.blacklist || []).filter(
    (npub) => {
      const normalized = normalizeNpub(npub);
      if (!normalized) {
        return false;
      }
      if (adminGuardSet.has(normalized)) {
        return false;
      }
      if (sanitizedWhitelistSet.has(normalized)) {
        return false;
      }
      return true;
    }
  );

  return {
    editors: sanitizedEditors,
    whitelist: Array.from(sanitizedWhitelistSet),
    blacklist: sanitizedBlacklist,
  };
}

function loadJSONList(key) {
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
    console.warn(`Failed to parse list for ${key}:`, error);
    return null;
  }
}

function saveJSONList(key, values) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch (error) {
    console.warn(`Failed to persist list for ${key}:`, error);
  }
}

function migrateLegacyList(targetKey, legacyKey, fallback) {
  const stored = loadJSONList(targetKey);
  if (stored !== null) {
    return dedupeNpubs(stored);
  }

  const legacy = legacyKey ? loadJSONList(legacyKey) : null;
  if (legacy !== null) {
    const sanitized = dedupeNpubs(legacy);
    saveJSONList(targetKey, sanitized);
    return sanitized;
  }

  const sanitizedFallback = dedupeNpubs(fallback);
  if (sanitizedFallback.length) {
    saveJSONList(targetKey, sanitizedFallback);
  }
  return sanitizedFallback;
}

async function loadLocalState() {
  const state = {
    editors: migrateLegacyList(ADMIN_EDITORS_KEY, null, ADMIN_EDITORS_NPUBS),
    whitelist: migrateLegacyList(
      ADMIN_WHITELIST_KEY,
      LEGACY_WHITELIST_KEY,
      ADMIN_INITIAL_WHITELIST
    ),
    blacklist: migrateLegacyList(
      ADMIN_BLACKLIST_KEY,
      LEGACY_BLACKLIST_KEY,
      ADMIN_INITIAL_BLACKLIST
    ),
  };

  return sanitizeAdminState(state);
}

async function persistLocalState(_actorNpub, updates = {}) {
  if (
    !updates ||
    (!updates.editors && !updates.whitelist && !updates.blacklist)
  ) {
    return;
  }

  const currentState = await loadLocalState();
  const merged = {
    editors: updates.editors ? updates.editors : currentState.editors,
    whitelist: updates.whitelist ? updates.whitelist : currentState.whitelist,
    blacklist: updates.blacklist ? updates.blacklist : currentState.blacklist,
  };

  const sanitized = sanitizeAdminState(merged);

  if (updates.editors) {
    saveJSONList(ADMIN_EDITORS_KEY, sanitized.editors);
  }
  if (updates.whitelist) {
    saveJSONList(ADMIN_WHITELIST_KEY, sanitized.whitelist);
  }
  if (updates.blacklist) {
    saveJSONList(ADMIN_BLACKLIST_KEY, sanitized.blacklist);
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
    if (isDevMode) {
      console.warn("Failed to encode hex pubkey to npub:", error);
    }
    return "";
  }
}

function extractNpubsFromEvent(event) {
  if (!event || !Array.isArray(event.tags)) {
    return [];
  }

  const hexKeys = event.tags
    .filter((tag) => Array.isArray(tag) && tag[0] === "p" && tag[1])
    .map((tag) => tag[1]);

  const npubs = hexKeys
    .map((hex) => encodeHexToNpub(hex))
    .filter((npub) => typeof npub === "string" && npub);

  return dedupeNpubs(npubs);
}

async function loadNostrList(identifier) {
  const relays = ensureNostrReady();
  const dTagValue = `${ADMIN_LIST_NAMESPACE}:${identifier}`;
  const filter = {
    kinds: [30000],
    "#d": [dTagValue],
    limit: 1,
  };

  const perRelay = await Promise.all(
    relays.map(async (url) => {
      try {
        const events = await nostrClient.pool.list([url], [filter]);
        return Array.isArray(events) ? events : [];
      } catch (error) {
        if (isDevMode) {
          console.warn(`[adminListStore] Relay fetch failed for ${url}:`, error);
        }
        return [];
      }
    })
  );

  const events = perRelay.flat();
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
  const editors = await loadNostrList(LIST_IDENTIFIERS.editors);
  const whitelist = await loadNostrList(LIST_IDENTIFIERS.whitelist);
  const blacklist = await loadNostrList(LIST_IDENTIFIERS.blacklist);

  return sanitizeAdminState({
    editors,
    whitelist,
    blacklist,
  });
}

async function persistNostrState(actorNpub, updates = {}) {
  const relays = ensureNostrReady();
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

  const entries = Object.entries(updates)
    .filter(([key, value]) => {
      return key in LIST_IDENTIFIERS && Array.isArray(value);
    })
    .map(([key, value]) => {
      const base = sanitizeNpubList(value);
      if (key === "blacklist") {
        const guardSet = new Set([
          normalizeNpub(ADMIN_SUPER_NPUB),
          ...ADMIN_EDITORS_NPUBS.map(normalizeNpub),
          ...sanitizeNpubList(updates.editors || []),
        ]);
        const whitelistSet = new Set(
          sanitizeNpubList([
            ...ADMIN_INITIAL_WHITELIST,
            ...(updates.whitelist || []),
          ])
        );
        const sanitizedBlacklist = base.filter((npub) => {
          const normalized = normalizeNpub(npub);
          if (!normalized) {
            return false;
          }
          if (guardSet.has(normalized)) {
            return false;
          }
          if (whitelistSet.has(normalized)) {
            return false;
          }
          return true;
        });
        return [key, sanitizedBlacklist];
      }

      if (key === "editors") {
        const sanitizedEditors = base.filter((npub) => {
          const normalized = normalizeNpub(npub);
          return normalized && normalized !== normalizeNpub(ADMIN_SUPER_NPUB);
        });
        return [key, sanitizedEditors];
      }

      if (key === "whitelist") {
        const mergedWhitelist = sanitizeNpubList([
          ...ADMIN_INITIAL_WHITELIST,
          ...base,
        ]);
        return [key, mergedWhitelist];
      }

      return [key, base];
    });

  if (!entries.length) {
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  for (const [listKey, npubs] of entries) {
    const identifier = LIST_IDENTIFIERS[listKey];
    const dTagValue = `${ADMIN_LIST_NAMESPACE}:${identifier}`;

    const hexPubkeys = Array.from(
      new Set(
        npubs.map((npub) => decodeNpubToHex(npub)).filter((hex) => !!hex)
      )
    );

    const tags = [["d", dTagValue]];
    hexPubkeys.forEach((hex) => {
      tags.push(["p", hex]);
    });

    // Explicitly keep the super admin on the whitelist and editors lists when publishing.
    if (listKey === "whitelist" || listKey === "editors") {
      try {
        const superHex = decodeNpubToHex(ADMIN_SUPER_NPUB);
        if (superHex && !hexPubkeys.includes(superHex)) {
          tags.push(["p", superHex]);
        }
      } catch (error) {
        if (isDevMode) {
          console.warn("Failed to ensure super admin presence:", error);
        }
      }
    }

    const event = {
      kind: 30000,
      pubkey: actorHex,
      created_at: now,
      tags,
      content: "",
    };

    let signedEvent;
    try {
      signedEvent = await extension.signEvent(event);
    } catch (error) {
      throw createError("signature-failed", "Failed to sign admin list event.", error);
    }

    const publishResults = await Promise.all(
      relays.map(async (url) => {
        try {
          await nostrClient.pool.publish([url], signedEvent);
          if (isDevMode) {
            console.log(`[adminListStore] Published ${listKey} list to ${url}`);
          }
          return { url, success: true };
        } catch (error) {
          if (isDevMode) {
            console.warn(
              `[adminListStore] Failed to publish ${listKey} list to ${url}:`,
              error
            );
          }
          return { url, success: false, error };
        }
      })
    );

    if (!publishResults.some((result) => result.success)) {
      throw createError(
        "publish-failed",
        `Failed to publish ${listKey} list to any relay.`
      );
    }
  }
}

export async function loadAdminState() {
  if (ADMIN_LIST_MODE === "nostr") {
    return loadNostrState();
  }
  return loadLocalState();
}

export async function persistAdminState(actorNpub, updates) {
  if (ADMIN_LIST_MODE === "nostr") {
    return persistNostrState(actorNpub, updates);
  }
  return persistLocalState(actorNpub, updates);
}
