// js/adminListStore.js

import {
  ADMIN_LIST_MODE,
  ADMIN_LIST_NAMESPACE,
  ADMIN_SUPER_NPUB,
  ADMIN_EDITORS_NPUBS,
  ADMIN_COMMUNITY_BLACKLIST_SOURCES,
  ADMIN_COMMUNITY_BLACKLIST_PREFIX,
  isDevMode,
} from "./config.js";
import {
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostr.js";
import { devLogger, userLogger } from "./utils/logger.js";
import {
  buildAdminListEvent,
  ADMIN_LIST_IDENTIFIERS,
} from "./nostrEventSchemas.js";
import { publishEventToRelay } from "./nostrPublish.js";

const LEGACY_STORAGE_KEYS = {
  editors: "bitvid_admin_editors",
  whitelist: "bitvid_admin_whitelist",
  whitelistLegacy: "bitvid_whitelist",
  blacklist: "bitvid_admin_blacklist",
  blacklistLegacy: "bitvid_blacklist",
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

const globalScope =
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
    ? globalThis
    : null;

function readNostrToolsFromScope(scope = globalScope) {
  if (!scope || typeof scope !== "object") {
    return null;
  }

  const candidates = [];

  if (scope.__BITVID_CANONICAL_NOSTR_TOOLS__) {
    candidates.push(scope.__BITVID_CANONICAL_NOSTR_TOOLS__);
  }

  if (scope.NostrTools) {
    candidates.push(scope.NostrTools);
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
    if (candidate && typeof candidate === "object") {
      const nip19 = candidate?.nip19;
      if (
        nip19 &&
        typeof nip19 === "object" &&
        (typeof nip19.decode === "function" ||
          typeof nip19.npubEncode === "function")
      ) {
        return candidate;
      }
    }
  }

  return null;
}

let cachedNostrTools = null;
let cachedNip19 = null;

function getNip19Tools() {
  const toolkit = readNostrToolsFromScope();
  if (toolkit && toolkit !== cachedNostrTools) {
    cachedNostrTools = toolkit;
    cachedNip19 =
      toolkit?.nip19 && typeof toolkit.nip19 === "object"
        ? toolkit.nip19
        : cachedNip19;
  } else if (!cachedNostrTools && toolkit) {
    cachedNostrTools = toolkit;
    cachedNip19 =
      toolkit?.nip19 && typeof toolkit.nip19 === "object"
        ? toolkit.nip19
        : cachedNip19;
  }

  return cachedNip19 || null;
}

function canDecodeNpub() {
  const nip19 = getNip19Tools();
  if (nip19 && typeof nip19.decode === "function") {
    return true;
  }

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

  if (isHexPubkey(trimmed)) {
    return true;
  }

  const nip19 = getNip19Tools();
  const decoder = nip19?.decode;

  if (typeof decoder !== "function") {
    return trimmed.toLowerCase().startsWith("npub");
  }

  try {
    const decoded = decoder(trimmed);
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
    devLogger.warn(
      `[adminListStore] Failed to parse legacy list for ${key}:`,
      error,
    );
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
      devLogger.warn(
        `[adminListStore] Failed to clear legacy storage for ${key}:`,
        error,
      );
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

  const writeRelays =
    Array.isArray(nostrClient.writeRelays) && nostrClient.writeRelays.length
      ? nostrClient.writeRelays
      : [];
  const relays = writeRelays.length
    ? writeRelays
    : Array.isArray(nostrClient.relays)
    ? nostrClient.relays
    : [];

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

  const nip19 = getNip19Tools();
  const decoder = nip19?.decode;

  try {
    if (typeof decoder === "function") {
      const decoded = decoder(trimmed);
      if (decoded?.type !== "npub" || !decoded?.data) {
        throw new Error("Invalid npub format");
      }
      return typeof decoded.data === "string"
        ? decoded.data
        : decoded.data?.pubkey || "";
    }

    const fallback = window?.NostrTools?.nip19?.decode;
    if (typeof fallback === "function") {
      const decoded = fallback(trimmed);
      if (decoded?.type !== "npub" || !decoded?.data) {
        throw new Error("Invalid npub format");
      }
      return typeof decoded.data === "string"
        ? decoded.data
        : decoded.data?.pubkey || "";
    }
  } catch (error) {
    throw createError("invalid npub", "Unable to decode npub.", error);
  }

  throw createError("invalid npub", "Unable to decode npub.");
}

function parseCommunityBlacklistReferences(event) {
  if (!event || !Array.isArray(event.tags)) {
    return [];
  }

  const references = [];
  const seen = new Set();

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }

    const tagName = typeof tag[0] === "string" ? tag[0] : "";
    if (tagName !== "a") {
      continue;
    }

    const rawValue = typeof tag[1] === "string" ? tag[1].trim() : "";
    if (!rawValue) {
      continue;
    }

    const [kindSegment, authorSegment, ...identifierSegments] = rawValue.split(":");
    if (!identifierSegments.length) {
      continue;
    }

    const kind = Number.parseInt(kindSegment, 10);
    if (!Number.isFinite(kind) || kind !== 30000) {
      continue;
    }

    const dTagValue = identifierSegments.join(":").trim();
    if (!dTagValue) {
      continue;
    }

    if (
      !dTagValue.startsWith(
        `${ADMIN_LIST_NAMESPACE}:${ADMIN_COMMUNITY_BLACKLIST_PREFIX}`
      )
    ) {
      continue;
    }

    const authorCandidate = typeof authorSegment === "string" ? authorSegment.trim() : "";
    if (!authorCandidate) {
      continue;
    }

    let authorHex = "";
    if (isHexPubkey(authorCandidate)) {
      authorHex = authorCandidate.toLowerCase();
    } else if (authorCandidate.toLowerCase().startsWith("npub")) {
      try {
        authorHex = decodeNpubToHex(authorCandidate);
      } catch (error) {
        devLogger.warn(
          `[adminListStore] Failed to decode community curator npub for ${dTagValue}:`,
          error,
        );
        authorHex = "";
      }
    }

    if (!authorHex) {
      continue;
    }

    const key = `${authorHex}::${dTagValue}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    references.push({ authorHex, dTag: dTagValue });
  }

  return references;
}

function encodeHexToNpub(hex) {
  const nip19 = getNip19Tools();
  const encoder = nip19?.npubEncode;

  if (typeof encoder === "function") {
    try {
      return encoder(hex) || "";
    } catch (error) {
      devLogger.warn("Failed to encode hex pubkey to npub:", error);
    }
  }

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

  const nip19 = getNip19Tools();
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
    return trimmed;
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

async function fetchLatestListEvent(filter, contextLabel = "admin-list") {
  const relays = ensureNostrReady();

  const normalizedFilter = {};
  if (Array.isArray(filter?.kinds) && filter.kinds.length) {
    normalizedFilter.kinds = [...filter.kinds];
  } else {
    normalizedFilter.kinds = [30000];
  }

  if (typeof filter?.limit === "number") {
    normalizedFilter.limit = filter.limit;
  } else {
    normalizedFilter.limit = 50;
  }

  if (Array.isArray(filter?.["#d"]) && filter["#d"].length) {
    normalizedFilter["#d"] = [...filter["#d"]];
  }

  if (Array.isArray(filter?.authors) && filter.authors.length) {
    normalizedFilter.authors = [...filter.authors];
  }

  let events = [];
  try {
    const combined = await nostrClient.pool.list(relays, [normalizedFilter]);
    if (Array.isArray(combined)) {
      events = combined;
    }
  } catch (error) {
    devLogger.warn(
      `[adminListStore] Combined relay fetch failed for ${contextLabel}:`,
      error,
    );
  }

  if (!events.length) {
    const perRelay = await Promise.all(
      relays.map(async (url) => {
        try {
          const result = await nostrClient.pool.list([url], [normalizedFilter]);
          return Array.isArray(result) ? result : [];
        } catch (error) {
          devLogger.warn(
            `[adminListStore] Relay fetch failed for ${contextLabel} on ${url}:`,
            error,
          );
          return [];
        }
      })
    );
    events = perRelay.flat();
  }

  if (!events.length) {
    return null;
  }

  return events.reduce((latest, event) => {
    if (!latest) {
      return event;
    }
    if (event.created_at === latest.created_at) {
      return event.id > latest.id ? event : latest;
    }
    return event.created_at > latest.created_at ? event : latest;
  }, null);
}

async function loadNostrList(identifier) {
  const dTagValue = `${ADMIN_LIST_NAMESPACE}:${identifier}`;
  const event = await fetchLatestListEvent({ "#d": [dTagValue] }, identifier);
  return event ? extractNpubsFromEvent(event) : [];
}

async function loadNostrState() {
  const [editors, whitelist, blacklist] = await Promise.all([
    loadNostrList(ADMIN_LIST_IDENTIFIERS.editors),
    loadNostrList(ADMIN_LIST_IDENTIFIERS.whitelist),
    loadNostrList(ADMIN_LIST_IDENTIFIERS.blacklist),
  ]);

  return sanitizeAdminState({ editors, whitelist, blacklist });
}

async function loadCommunityBlacklistEntries() {
  let superAdminHex = "";
  try {
    superAdminHex = decodeNpubToHex(ADMIN_SUPER_NPUB);
  } catch (error) {
    devLogger.warn(
      "[adminListStore] Failed to decode super admin npub for community blacklist lookup:",
      error,
    );
    return [];
  }

  const sourceIdentifier = `${ADMIN_LIST_NAMESPACE}:${ADMIN_COMMUNITY_BLACKLIST_SOURCES}`;

  let sourceEvent = null;
  try {
    sourceEvent = await fetchLatestListEvent(
      { "#d": [sourceIdentifier], authors: [superAdminHex] },
      "community-blacklist-sources",
    );
  } catch (error) {
    devLogger.warn(
      "[adminListStore] Failed to load community blacklist source list:",
      error,
    );
    return [];
  }

  if (!sourceEvent) {
    return [];
  }

  const references = parseCommunityBlacklistReferences(sourceEvent);
  if (!references.length) {
    return [];
  }

  const results = await Promise.all(
    references.map(async (reference) => {
      try {
        const event = await fetchLatestListEvent(
          { "#d": [reference.dTag], authors: [reference.authorHex] },
          reference.dTag,
        );
        return event ? extractNpubsFromEvent(event) : [];
      } catch (error) {
        devLogger.warn(
          `[adminListStore] Failed to load community blacklist ${reference.dTag}:`,
          error,
        );
        return [];
      }
    })
  );

  return results.flat();
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

function publishListWithFirstAcceptance(pool, relays, event, options = {}) {
  const publishRelay =
    typeof options.publishRelay === "function"
      ? options.publishRelay
      : publishEventToRelay;
  const listKey = typeof options.listKey === "string" ? options.listKey : "";
  const publishOptions =
    options && typeof options.publishOptions === "object"
      ? options.publishOptions
      : undefined;

  const relayPromises = Array.isArray(relays)
    ? relays.map((url) => publishRelay(pool, url, event, publishOptions))
    : [];
  const resultsBuffer = new Array(relayPromises.length);

  const resolveMessage = listKey
    ? `Failed to publish ${listKey} list to any relay.`
    : "Failed to publish admin list to any relay.";

  const normalizeFailureError = (value) => {
    if (value instanceof Error) {
      return value;
    }

    if (value && typeof value === "object") {
      if (value.error instanceof Error) {
        return value.error;
      }

      if (typeof value.error === "string" && value.error.trim()) {
        return new Error(value.error.trim());
      }
    }

    if (typeof value === "string" && value.trim()) {
      return new Error(value.trim());
    }

    if (value && typeof value === "object" && typeof value.reason === "string") {
      const trimmed = value.reason.trim();
      if (trimmed) {
        return new Error(trimmed);
      }
    }

    return new Error("publish failed");
  };

  const normalizeResult = (result, fallbackUrl = "") => {
    if (result && typeof result === "object") {
      const url = typeof result.url === "string" ? result.url : fallbackUrl;
      const success = !!result.success;
      const error = success ? null : normalizeFailureError(result);
      return { url, success, error };
    }

    return {
      url: fallbackUrl,
      success: false,
      error: normalizeFailureError(result),
    };
  };

  const acceptancePromises = relayPromises.map((promise, index) =>
    promise
      .then((result) => {
        const normalized = normalizeResult(
          result,
          Array.isArray(relays) ? relays[index] : "",
        );
        resultsBuffer[index] = normalized;
        if (normalized.success) {
          return normalized;
        }

        throw normalized;
      })
      .catch((reason) => {
        const normalized = normalizeResult(
          reason,
          Array.isArray(relays) ? relays[index] : "",
        );
        if (typeof resultsBuffer[index] === "undefined") {
          resultsBuffer[index] = normalized;
        }
        throw normalized;
      })
  );

  const firstAcceptance = (() => {
    if (!relayPromises.length) {
      return Promise.reject(createError("publish-failed", resolveMessage));
    }

    return Promise.any(acceptancePromises).catch((aggregateError) => {
      const error = createError("publish-failed", resolveMessage, aggregateError);
      throw error;
    });
  })();

  const allResults = Promise.allSettled(relayPromises).then((entries) => {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const fallbackUrl = Array.isArray(relays) ? relays[index] : "";
      const result =
        entry?.status === "fulfilled"
          ? normalizeResult(entry.value, fallbackUrl)
          : normalizeResult(entry?.reason, fallbackUrl);

      if (typeof resultsBuffer[index] === "undefined") {
        resultsBuffer[index] = result;
      }
    }

    return resultsBuffer;
  });

  return { firstAcceptance, allResults, resultsBuffer };
}

async function persistNostrState(actorNpub, updates = {}) {
  ensureNostrReady();
  const permissionResult = await requestDefaultExtensionPermissions();
  if (!permissionResult.ok) {
    throw createError(
      "extension-permission-denied",
      "The NIP-07 extension must allow signing before updating admin lists.",
      permissionResult.error,
    );
  }
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
    const { firstAcceptance, allResults } = publishListWithFirstAcceptance(
      nostrClient.pool,
      relays,
      signedEvent,
      { listKey },
    );

    const logSettledResults = allResults.then((results) => {
      if (isDevMode) {
        results
          .filter((result) => !result?.success)
          .forEach((result) => {
            userLogger.warn(
              `[adminListStore] Publish failed for ${listKey} on ${result.url}:`,
              result.error,
            );
          });
      }

      return results;
    });

    try {
      await firstAcceptance;
    } catch (error) {
      await logSettledResults.catch(() => {});
      throw error;
    }

    logSettledResults.catch((loggingError) => {
      devLogger.warn(
        `[adminListStore] Failed to summarize publish results for ${listKey}:`,
        loggingError,
      );
    });

    clearLegacyStorageFor(listKey);
  }
}

export async function loadAdminState() {
  if (ADMIN_LIST_MODE !== "nostr" && isDevMode) {
    userLogger.warn(
      `[adminListStore] ADMIN_LIST_MODE "${ADMIN_LIST_MODE}" is deprecated. Defaulting to remote Nostr lists.`
    );
  }

  const nostrState = await loadNostrState();

  let mergedState = nostrState;
  try {
    const communityEntries = await loadCommunityBlacklistEntries();
    if (Array.isArray(communityEntries) && communityEntries.length) {
      const baseEditors = Array.isArray(nostrState?.editors)
        ? nostrState.editors
        : [];
      const baseWhitelist = Array.isArray(nostrState?.whitelist)
        ? nostrState.whitelist
        : [];
      const baseBlacklist = Array.isArray(nostrState?.blacklist)
        ? nostrState.blacklist
        : [];

      mergedState = sanitizeAdminState({
        editors: baseEditors,
        whitelist: baseWhitelist,
        blacklist: [...baseBlacklist, ...communityEntries],
      });
    }
  } catch (error) {
    devLogger.warn(
      "[adminListStore] Failed to merge community blacklist entries:",
      error,
    );
  }

  if (!hasAnyEntries(mergedState)) {
    const legacy = loadLegacyAdminState();
    if (legacy && isDevMode) {
      userLogger.warn(
        "[adminListStore] Ignoring legacy admin lists because remote mode is enforced. Publish them to Nostr to retain access.",
        legacy
      );
    }
  }

  return mergedState;
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
  publishListWithFirstAcceptance,
});
