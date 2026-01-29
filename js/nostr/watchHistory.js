import {
  WATCH_HISTORY_KIND,
  WATCH_HISTORY_LIST_IDENTIFIER,
  WATCH_HISTORY_MAX_ITEMS,
  WATCH_HISTORY_BATCH_RESOLVE,
  WATCH_HISTORY_BATCH_PAGE_SIZE,
  WATCH_HISTORY_PAYLOAD_MAX_BYTES,
  WATCH_HISTORY_FETCH_EVENT_LIMIT,
  WATCH_HISTORY_CACHE_TTL_MS,
  WATCH_HISTORY_VERSION_TAG_VALUE,
} from "../config.js";
import {
  buildWatchHistoryEvent,
  NOTE_TYPES,
} from "../nostrEventSchemas.js";
import { CACHE_POLICIES } from "./cachePolicies.js";
import { publishEventToRelays } from "../nostrPublish.js";
import {
  RELAY_URLS,
  ensureNostrTools,
  getCachedNostrTools,
} from "./toolkit.js";
import { DEFAULT_NIP07_PERMISSION_METHODS } from "./nip07Permissions.js";
import { devLogger, userLogger } from "../utils/logger.js";
import { profileCache } from "../state/profileCache.js";
import { queueSignEvent } from "./signRequestQueue.js";

/**
 * Domain utilities for watch-history interactions. This module owns pointer
 * normalization/serialization, chunking, fingerprint hashing, persistence,
 * relay publishing, fetch/decrypt flows, and exposes a manager factory that is
 * dependency-injected with the nostr client hooks it needs.
 */
const WATCH_HISTORY_REPUBLISH_BASE_DELAY_MS = 2000;
const WATCH_HISTORY_REPUBLISH_MAX_DELAY_MS = 5 * 60 * 1000;
const WATCH_HISTORY_REPUBLISH_MAX_ATTEMPTS = 8;
const WATCH_HISTORY_REPUBLISH_JITTER = 0.25;
const WATCH_HISTORY_ENCRYPTION_FALLBACK_ORDER = Object.freeze([
  "nip44_v2",
  "nip44",
  "nip04",
]);

function mergePointerDetails(target, source) {
  if (!target || typeof target !== "object" || !source || typeof source !== "object") {
    return target;
  }
  if (source.session === true) {
    target.session = true;
  }
  if (Number.isFinite(source.resumeAt)) {
    target.resumeAt = Math.max(0, Math.floor(source.resumeAt));
  }
  if (source.completed === true) {
    target.completed = true;
  }
  if (Number.isFinite(source.watchedAt)) {
    target.watchedAt = Math.max(0, Math.floor(source.watchedAt));
  }
  if (typeof source.relay === "string" && source.relay.trim()) {
    if (!target.relay || !target.relay.trim()) {
      target.relay = source.relay.trim();
    }
  }
  return target;
}

function clonePointerItem(pointer) {
  if (!pointer || typeof pointer !== "object") {
    return null;
  }

  const cloned = {
    type: pointer.type === "a" ? "a" : "e",
    value: typeof pointer.value === "string" ? pointer.value.trim() : "",
  };

  if (!cloned.value) {
    return null;
  }

  if (typeof pointer.relay === "string" && pointer.relay.trim()) {
    cloned.relay = pointer.relay.trim();
  }

  if (Number.isFinite(pointer.watchedAt)) {
    cloned.watchedAt = Math.max(0, Math.floor(pointer.watchedAt));
  }

  if (Number.isFinite(pointer.resumeAt)) {
    cloned.resumeAt = Math.max(0, Math.floor(pointer.resumeAt));
  }

  if (pointer.completed === true) {
    cloned.completed = true;
  }

  if (pointer.session === true) {
    cloned.session = true;
  }

  return cloned;
}

export function pointerKey(pointer) {
  if (!pointer) {
    return "";
  }
  const type = pointer.type === "a" ? "a" : "e";
  const value = typeof pointer.value === "string" ? pointer.value.trim().toLowerCase() : "";
  if (!type || !value) {
    return "";
  }
  return `${type}:${value}`;
}

function normalizePointerTag(tag) {
  if (!Array.isArray(tag) || tag.length < 2) {
    return null;
  }
  const type = tag[0] === "a" ? "a" : tag[0] === "e" ? "e" : "";
  if (!type) {
    return null;
  }
  const value = typeof tag[1] === "string" ? tag[1].trim() : "";
  if (!value) {
    return null;
  }
  const relay =
    tag.length > 2 && typeof tag[2] === "string" && tag[2].trim()
      ? tag[2].trim()
      : null;
  return { type, value, relay };
}

export function normalizePointerInput(pointer) {
  if (!pointer) {
    return null;
  }
  if (Array.isArray(pointer)) {
    return normalizePointerTag(pointer);
  }
  if (typeof pointer === "object") {
    if (typeof pointer.type === "string" && typeof pointer.value === "string") {
      return clonePointerItem(pointer);
    }
    if (Array.isArray(pointer.tag)) {
      return normalizePointerTag(pointer.tag);
    }
  }
  if (typeof pointer !== "string") {
    return null;
  }
  const trimmed = pointer.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("naddr") || trimmed.startsWith("nevent")) {
    try {
      const decoder = getCachedNostrTools()?.nip19?.decode;
      if (typeof decoder === "function") {
        const decoded = decoder(trimmed);
        if (decoded?.type === "naddr" && decoded.data) {
          const { kind, pubkey, identifier, relays } = decoded.data;
          if (
            typeof kind === "number" &&
            typeof pubkey === "string" &&
            typeof identifier === "string"
          ) {
            const relay =
              Array.isArray(relays) && relays.length && typeof relays[0] === "string"
                ? relays[0]
                : null;
            return {
              type: "a",
              value: `${kind}:${pubkey}:${identifier}`,
              relay,
            };
          }
        }
        if (decoded?.type === "nevent" && decoded.data) {
          const { id, relays } = decoded.data;
          if (typeof id === "string" && id.trim()) {
            const relay =
              Array.isArray(relays) && relays.length && typeof relays[0] === "string"
                ? relays[0]
                : null;
            return {
              type: "e",
              value: id.trim(),
              relay,
            };
          }
        }
      }
    } catch (error) {
      devLogger.warn(`[nostr] Failed to decode pointer ${trimmed}:`, error);
    }
  }
  const type = trimmed.includes(":") ? "a" : "e";
  return { type, value: trimmed, relay: null };
}

function extractPointerItemsFromEvent(event) {
  const items = [];
  const seen = new Set();
  if (!event || typeof event !== "object") {
    return items;
  }
  const tags = Array.isArray(event.tags) ? event.tags : [];
  for (const tag of tags) {
    const pointer = normalizePointerTag(tag);
    if (!pointer) {
      continue;
    }
    const key = pointerKey(pointer);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(pointer);
  }
  return items;
}

function normalizePointersFromPayload(payload) {
  const normalized = [];
  const seen = new Set();
  if (!payload || typeof payload !== "object") {
    return normalized;
  }
  const watchedAt =
    payload.watchedAt && typeof payload.watchedAt === "object" ? payload.watchedAt : {};

  const processCandidate = (candidate) => {
    const pointer = normalizePointerInput(candidate);
    if (!pointer) {
      return;
    }
    const key = pointerKey(pointer);
    if (!key || seen.has(key)) {
      return;
    }
    const mapValue = watchedAt[pointer.value];
    if (Number.isFinite(mapValue)) {
      pointer.watchedAt = Math.max(0, Math.floor(mapValue));
    }
    seen.add(key);
    normalized.push(pointer);
  };

  const sourceItems = Array.isArray(payload.items) ? payload.items : [];
  for (const candidate of sourceItems) {
    processCandidate(candidate);
  }

  const sourceEvents = Array.isArray(payload.events) ? payload.events : [];
  for (const candidate of sourceEvents) {
    processCandidate(candidate);
  }

  return normalized;
}

const WATCH_HISTORY_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function parseWatchHistoryPayload(plaintext) {
  if (typeof plaintext !== "string") {
    return {
      version: 0,
      month: "",
      items: [],
      events: [],
      watchedAt: {},
      snapshot: "",
    };
  }
  try {
    const parsed = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object") {
      return {
        version: 0,
        month: "",
        items: [],
        events: [],
        watchedAt: {},
        snapshot: "",
      };
    }
    const version = Number.isFinite(parsed.version) ? parsed.version : 0;
    const month =
      typeof parsed.month === "string" && WATCH_HISTORY_MONTH_PATTERN.test(parsed.month)
        ? parsed.month
        : "";
    const items = normalizePointersFromPayload(parsed);
    const snapshot = typeof parsed.snapshot === "string" ? parsed.snapshot : "";
    const events = Array.isArray(parsed.events)
      ? parsed.events.filter((id) => typeof id === "string" && id.trim())
      : [];
    const watchedAt =
      parsed.watchedAt && typeof parsed.watchedAt === "object" ? parsed.watchedAt : {};

    return { version, month, items, events, watchedAt, snapshot };
  } catch (error) {
    devLogger.warn("[nostr] Failed to parse watch history payload:", error);
    return {
      version: 0,
      month: "",
      items: [],
      events: [],
      watchedAt: {},
      snapshot: "",
    };
  }
}

function normalizeWatchHistoryPayloadItem(entry, watchedAtMap) {
  const pointer = normalizePointerInput(entry);
  if (!pointer) {
    return null;
  }
  if (entry && typeof entry === "object" && entry.metadata && typeof entry.metadata === "object") {
    pointer.metadata = { ...entry.metadata };
  }
  const key = pointerKey(pointer);
  if (!key) {
    return null;
  }

  const watchedAtSource =
    watchedAtMap instanceof Map
      ? watchedAtMap.get(key)
      : watchedAtMap && typeof watchedAtMap === "object"
        ? watchedAtMap[key]
        : null;

  const watchedAt = Number.isFinite(watchedAtSource)
    ? Math.max(0, Math.floor(watchedAtSource))
    : Number.isFinite(pointer.watchedAt)
      ? Math.max(0, Math.floor(pointer.watchedAt))
      : undefined;

  return {
    pointer,
    id: pointer.value,
    watchedAt,
  };
}

export function buildWatchHistoryPayload(
  monthString,
  events,
  watchedAtMap,
  maxBytes = WATCH_HISTORY_PAYLOAD_MAX_BYTES,
) {
  const normalizedMonth = typeof monthString === "string" ? monthString.trim() : "";

  const payload = {
    version: 2,
    month: normalizedMonth,
    items: [],
    watchedAt: {},
    snapshot: "",
  };

  const included = [];
  const skipped = [];
  const maxBytesValue =
    Number.isFinite(maxBytes) && maxBytes > 0 ? Math.floor(maxBytes) : 0;

  for (const entry of Array.isArray(events) ? events : []) {
    const normalized = normalizeWatchHistoryPayloadItem(entry, watchedAtMap);
    if (!normalized) {
      continue;
    }

    const nextItems = [...payload.items, normalized.id];
    const sizeEntry = { ...normalized.pointer };
    if (Number.isFinite(normalized.watchedAt)) {
      sizeEntry.watchedAt = normalized.watchedAt;
    }
    const nextWatchedAt = { ...payload.watchedAt };
    if (Number.isFinite(normalized.watchedAt)) {
      nextWatchedAt[normalized.id] = normalized.watchedAt;
    }

    if (maxBytesValue) {
      const entrySize = JSON.stringify(sizeEntry).length;
      if (entrySize > maxBytesValue) {
        skipped.push(normalized.pointer);
        continue;
      }

      const candidatePayload = {
        ...payload,
        items: nextItems,
        watchedAt: nextWatchedAt,
      };
      const serialized = JSON.stringify(candidatePayload);
      if (serialized.length > maxBytesValue) {
        skipped.push(normalized.pointer);
        continue;
      }
    }

    payload.items = nextItems;
    payload.watchedAt = nextWatchedAt;
    included.push(normalized.pointer);
  }

  return { payload, included, skipped };
}

export function normalizeActorKey(actor) {
  if (typeof actor !== "string") {
    return "";
  }
  const trimmed = actor.trim();
  if (!trimmed) {
    return "";
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const toolkit = getCachedNostrTools();
  const decoder =
    (typeof window !== "undefined" ? window?.NostrTools?.nip19?.decode : null) ||
    toolkit?.nip19?.decode;
  if (typeof decoder === "function") {
    try {
      const decoded = decoder(trimmed);
      if (decoded?.type === "npub" && typeof decoded.data === "string") {
        return decoded.data.toLowerCase();
      }
      if (decoded?.type === "npub" && typeof decoded.data?.pubkey === "string") {
        return decoded.data.pubkey.toLowerCase();
      }
    } catch (error) {
      devLogger.warn("[nostr] Failed to decode actor key:", error);
    }
  }
  return trimmed.toLowerCase();
}

function canonicalizeWatchHistoryItems(rawItems, maxItems = WATCH_HISTORY_MAX_ITEMS) {
  const seen = new Map();
  if (Array.isArray(rawItems)) {
    for (const candidate of rawItems) {
      const pointer = normalizePointerInput(candidate);
      if (!pointer) {
        continue;
      }
      const key = pointerKey(pointer);
      if (!key) {
        continue;
      }
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, pointer);
        continue;
      }
      const currentWatched = Number.isFinite(existing.watchedAt) ? existing.watchedAt : 0;
      const incomingWatched = Number.isFinite(pointer.watchedAt) ? pointer.watchedAt : 0;
      if (incomingWatched > currentWatched) {
        mergePointerDetails(pointer, existing);
        pointer.watchedAt = incomingWatched;
        pointer.session = existing.session === true || pointer.session === true;
        seen.set(key, pointer);
        continue;
      }
      mergePointerDetails(existing, pointer);
      if (pointer.session === true) {
        existing.session = true;
      }
    }
  }
  const deduped = Array.from(seen.values());
  deduped.sort((a, b) => {
    const watchedA = Number.isFinite(a?.watchedAt) ? a.watchedAt : 0;
    const watchedB = Number.isFinite(b?.watchedAt) ? b.watchedAt : 0;
    if (watchedA !== watchedB) {
      return watchedB - watchedA;
    }
    const keyA = pointerKey(a);
    const keyB = pointerKey(b);
    if (keyA < keyB) {
      return -1;
    }
    if (keyA > keyB) {
      return 1;
    }
    return 0;
  });

  const limited = (!Number.isFinite(maxItems) || maxItems <= 0)
    ? deduped
    : deduped.slice(0, Math.max(0, Math.floor(maxItems)));

  const buckets = {};
  for (const item of limited) {
    const watchedAt = Number.isFinite(item.watchedAt) ? item.watchedAt : 0;
    const date = new Date(watchedAt * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const key = (watchedAt > 0) ? `${year}-${month}` : "1970-01";

    if (!buckets[key]) {
      buckets[key] = [];
    }
    buckets[key].push(item);
  }
  return buckets;
}

function sanitizeWatchHistoryMetadata(metadata) {
  return {};
}

function serializeWatchHistoryItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "[]";
  }
  const normalized = items
    .map((item) => {
      const type = item?.type === "a" ? "a" : "e";
      const value = typeof item?.value === "string" ? item.value : "";
      if (!type || !value) {
        return null;
      }
      const relay =
        typeof item?.relay === "string" && item.relay.trim()
          ? item.relay.trim()
          : undefined;
      const watchedAt = Number.isFinite(item?.watchedAt)
        ? Math.max(0, Math.floor(item.watchedAt))
        : undefined;
      const payload = { type, value };
      if (relay) {
        payload.relay = relay;
      }
      if (watchedAt !== undefined) {
        payload.watchedAt = watchedAt;
      }
      const resumeAt = Number.isFinite(item?.resumeAt)
        ? Math.max(0, Math.floor(item.resumeAt))
        : undefined;
      if (resumeAt !== undefined) {
        payload.resumeAt = resumeAt;
      }
      if (item?.completed === true) {
        payload.completed = true;
      }
      return payload;
    })
    .filter(Boolean);
  return JSON.stringify(normalized);
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function computeWatchHistoryFingerprintForItems(itemsOrBuckets) {
  // Check if buckets
  let flatItems = [];
  if (Array.isArray(itemsOrBuckets)) {
    flatItems = [...itemsOrBuckets];
  } else if (itemsOrBuckets && typeof itemsOrBuckets === "object") {
    flatItems = Object.keys(itemsOrBuckets)
      .sort()
      .reverse()
      .map((k) => itemsOrBuckets[k])
      .flat();
  }

  // Sort for deterministic fingerprint
  flatItems.sort((a, b) => {
    const keyA = pointerKey(a);
    const keyB = pointerKey(b);
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    return (b.watchedAt || 0) - (a.watchedAt || 0);
  });

  const serialized = serializeWatchHistoryItems(flatItems);
  const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
  if (encoder && window?.crypto?.subtle?.digest) {
    try {
      const data = encoder.encode(serialized);
      const digest = await window.crypto.subtle.digest("SHA-256", data);
      return bytesToHex(new Uint8Array(digest));
    } catch (error) {
      devLogger.warn("[nostr] Failed to hash watch history fingerprint:", error);
    }
  }
  return `fallback:${serialized}`;
}

function looksLikeJsonStructure(content) {
  if (typeof content !== "string") {
    return false;
  }
  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }
  const first = trimmed[0];
  return first === "{" || first === "[";
}

function hexToBytesCompat(hex, tools = null) {
  if (typeof hex !== "string") {
    throw new Error("Invalid hex input.");
  }
  const trimmed = hex.trim();
  if (!trimmed || trimmed.length % 2 !== 0) {
    throw new Error("Invalid hex input.");
  }
  if (tools?.utils && typeof tools.utils.hexToBytes === "function") {
    return tools.utils.hexToBytes(trimmed);
  }
  const bytes = new Uint8Array(trimmed.length / 2);
  for (let index = 0; index < trimmed.length; index += 2) {
    const byte = Number.parseInt(trimmed.slice(index, index + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error("Invalid hex input.");
    }
    bytes[index / 2] = byte;
  }
  return bytes;
}

function createNip44CipherSuite(tools, privateKeyHex, targetPubkeyHex) {
  if (!tools || !privateKeyHex || !targetPubkeyHex) {
    return null;
  }
  const normalizedPrivateKey =
    typeof privateKeyHex === "string" && privateKeyHex.trim()
      ? privateKeyHex.trim().toLowerCase()
      : "";
  const normalizedTarget =
    typeof targetPubkeyHex === "string" && targetPubkeyHex.trim()
      ? targetPubkeyHex.trim().toLowerCase()
      : "";
  if (!normalizedPrivateKey || !normalizedTarget) {
    return null;
  }

  let privateKeyBytes;
  try {
    privateKeyBytes = hexToBytesCompat(normalizedPrivateKey, tools);
  } catch (_) {
    return null;
  }

  const nip44 = tools?.nip44 && typeof tools.nip44 === "object" ? tools.nip44 : null;
  const suite = {};

  const nip44v2 = nip44?.v2 && typeof nip44.v2 === "object" ? nip44.v2 : null;
  if (
    nip44v2 &&
    typeof nip44v2.encrypt === "function" &&
    typeof nip44v2.decrypt === "function" &&
    typeof nip44v2?.utils?.getConversationKey === "function"
  ) {
    let cachedKey = null;
    const ensureKey = () => {
      if (!cachedKey) {
        cachedKey = nip44v2.utils.getConversationKey(privateKeyBytes, normalizedTarget);
      }
      return cachedKey;
    };
    suite.v2 = {
      encrypt: (plaintext) => nip44v2.encrypt(plaintext, ensureKey()),
      decrypt: (ciphertext) => nip44v2.decrypt(ciphertext, ensureKey()),
    };
  }

  const legacyGetConversationKey = (() => {
    if (typeof nip44?.getConversationKey === "function") {
      return nip44.getConversationKey.bind(nip44);
    }
    if (typeof nip44?.utils?.getConversationKey === "function") {
      return nip44.utils.getConversationKey.bind(nip44.utils);
    }
    return null;
  })();

  if (
    typeof nip44?.encrypt === "function" &&
    typeof nip44?.decrypt === "function" &&
    typeof legacyGetConversationKey === "function"
  ) {
    let cachedKey = null;
    const ensureLegacyKey = () => {
      if (!cachedKey) {
        cachedKey = legacyGetConversationKey(privateKeyBytes, normalizedTarget);
      }
      return cachedKey;
    };
    suite.legacy = {
      encrypt: (plaintext) => nip44.encrypt(plaintext, ensureLegacyKey()),
      decrypt: (ciphertext) => nip44.decrypt(ciphertext, ensureLegacyKey()),
    };
  }

  if (!suite.v2 && !suite.legacy) {
    return null;
  }

  return suite;
}

function normalizeEncryptionTagValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "nip04":
    case "nip-04":
    case "nip4":
      return "nip04";
    case "nip44_v2":
    case "nip44-v2":
    case "nip44v2":
      return "nip44_v2";
    case "nip44_v1":
    case "nip44-v1":
    case "nip44v1":
    case "nip44":
      return "nip44";
    default:
      return "";
  }
}

function extractWatchHistoryEncryptionHints(event, ciphertext) {
  const hints = [];
  const pushUnique = (hint) => {
    if (hint && !hints.includes(hint)) {
      hints.push(hint);
    }
  };

  const tags = Array.isArray(event?.tags) ? event.tags : [];
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    const label = typeof tag[0] === "string" ? tag[0].trim().toLowerCase() : "";
    if (label !== "encrypted") {
      continue;
    }
    const normalizedValue = normalizeEncryptionTagValue(tag[1]);
    if (normalizedValue) {
      pushUnique(normalizedValue);
    }
  }

  if (!hints.length && isNip04EncryptedWatchHistoryEvent(event, ciphertext)) {
    pushUnique("nip04");
  }

  return hints;
}

function determineWatchHistoryDecryptionOrder(
  event,
  ciphertext,
  availableSchemes = [],
) {
  const available = Array.isArray(availableSchemes) ? availableSchemes : [];
  const availableSet = new Set(available);
  const prioritized = [];
  const hints = extractWatchHistoryEncryptionHints(event, ciphertext);
  const aliasMap = {
    nip04: ["nip04"],
    nip44: ["nip44", "nip44_v2"],
    nip44_v2: ["nip44_v2", "nip44"],
  };

  for (const hint of hints) {
    const candidates = Array.isArray(aliasMap[hint]) ? aliasMap[hint] : [hint];
    for (const candidate of candidates) {
      if (availableSet.has(candidate) && !prioritized.includes(candidate)) {
        prioritized.push(candidate);
        break;
      }
    }
  }

  for (const fallback of WATCH_HISTORY_ENCRYPTION_FALLBACK_ORDER) {
    if (availableSet.has(fallback) && !prioritized.includes(fallback)) {
      prioritized.push(fallback);
    }
  }

  return prioritized.length ? prioritized : available;
}

async function resolveNostrToolkit(deps = {}, cacheRef = null) {
  if (cacheRef?.current) {
    return cacheRef.current;
  }

  const ensureToolkit =
    typeof deps.ensureNostrTools === "function" ? deps.ensureNostrTools : ensureNostrTools;
  if (ensureToolkit) {
    try {
      const ensured = await ensureToolkit();
      if (ensured) {
        if (cacheRef) {
          cacheRef.current = ensured;
        }
        return ensured;
      }
    } catch (error) {
      devLogger.warn("[nostr] Failed to resolve nostr-tools for watch history:", error);
    }
  }

  const readCachedToolkit =
    typeof deps.getCachedNostrTools === "function"
      ? deps.getCachedNostrTools
      : getCachedNostrTools;
  if (readCachedToolkit) {
    try {
      const cached = await readCachedToolkit();
      if (cached) {
        if (cacheRef) {
          cacheRef.current = cached;
        }
        return cached;
      }
    } catch (error) {
      devLogger.warn("[nostr] Failed to read cached nostr-tools for watch history:", error);
    }
  }

  return cacheRef?.current || null;
}

function mergeWatchHistoryItemsWithFallback(parsed, fallbackItems) {
  if (!parsed || typeof parsed !== "object") {
    return {
      version: 0,
      month: "",
      items: fallbackItems,
      snapshot: "",
    };
  }

  const fallbackMap = new Map();
  for (const item of Array.isArray(fallbackItems) ? fallbackItems : []) {
    const key = pointerKey(item);
    if (key) {
      fallbackMap.set(item.value, item);
    }
  }

  const merged = [];
  const sourceItems = Array.isArray(parsed.items) ? parsed.items : [];

  for (const item of sourceItems) {
    const fallback = fallbackMap.get(item.value);
    const pointer = fallback ? clonePointerItem(fallback) : item;

    if (fallback) {
      mergePointerDetails(pointer, item);
    }

    merged.push(pointer);
  }

  if (merged.length === 0 && Array.isArray(fallbackItems) && fallbackItems.length > 0) {
    return { ...parsed, items: fallbackItems };
  }

  return {
    version: parsed.version,
    month: parsed.month,
    items: merged,
    snapshot: parsed.snapshot,
  };
}

export function parseWatchHistoryContentWithFallback(content, fallbackItems, fallbackPayload) {
  if (!looksLikeJsonStructure(content)) {
    return fallbackPayload;
  }
  try {
    JSON.parse(content);
  } catch (error) {
    return fallbackPayload;
  }
  const parsed = parseWatchHistoryPayload(content);
  return mergeWatchHistoryItemsWithFallback(parsed, fallbackItems);
}

export function isNip04EncryptedWatchHistoryEvent(pointerEvent, ciphertext) {
  if (!pointerEvent || typeof pointerEvent !== "object") {
    return false;
  }
  const tags = Array.isArray(pointerEvent.tags) ? pointerEvent.tags : [];
  const normalizedCiphertext = typeof ciphertext === "string" ? ciphertext.trim() : "";
  if (!normalizedCiphertext) {
    return false;
  }
  const hasEncryptionTag = tags.some((tag) => {
    if (!Array.isArray(tag) || tag.length < 2) {
      return false;
    }
    const label = typeof tag[0] === "string" ? tag[0].trim().toLowerCase() : "";
    if (label !== "encrypted") {
      return false;
    }
    const value = typeof tag[1] === "string" ? tag[1].trim().toLowerCase() : "";
    return value === "nip04" || value === "nip-04";
  });
  if (hasEncryptionTag) {
    return !looksLikeJsonStructure(normalizedCiphertext);
  }
  if (looksLikeJsonStructure(normalizedCiphertext)) {
    return false;
  }
  const ivIndex = normalizedCiphertext.indexOf("?iv=");
  if (ivIndex < 0) {
    return false;
  }
  const baseSegment = normalizedCiphertext.slice(0, ivIndex);
  const ivSegment = normalizedCiphertext.slice(ivIndex + 4);
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!baseSegment || !base64Regex.test(baseSegment)) {
    return false;
  }
  if (ivSegment && !base64Regex.test(ivSegment)) {
    return false;
  }
  return true;
}

class WatchHistoryManager {
  constructor(deps) {
    this.deps = {
      ensureNostrTools,
      getCachedNostrTools,
      ...(deps || {}),
    };
    this.cache = new Map();
    this.storage = null;
    this.republishTimers = new Map();
    this.refreshPromises = new Map();
    this.cacheTtlMs = 0;
    this.fingerprints = new Map();
    this.lastCreatedAt = 0;

    profileCache.subscribe((event, detail) => {
      if (event === "profileChanged") {
        this.clear();
      } else if (event === "runtimeCleared") {
        const activePubkey = typeof this.deps.getActivePubkey === "function"
          ? this.deps.getActivePubkey()
          : "";
        const normalized = normalizeActorKey(detail.pubkey);
        const active = normalizeActorKey(activePubkey);
        if (normalized && active && normalized === active) {
          this.cache.delete(normalized);
        }
      }
    });
  }

  getCacheTtlMs() {
    if (Number.isFinite(this.cacheTtlMs) && this.cacheTtlMs > 0) {
      return this.cacheTtlMs;
    }
    const policyTtl = CACHE_POLICIES[NOTE_TYPES.WATCH_HISTORY]?.ttl;
    const configured = Number(WATCH_HISTORY_CACHE_TTL_MS);

    // Prefer config if set (for backward compat or overrides), otherwise policy
    let resolved =
      Number.isFinite(configured) && configured > 0
        ? Math.floor(configured)
        : Number.isFinite(policyTtl) && policyTtl > 0
          ? policyTtl
          : 24 * 60 * 60 * 1000;

    this.cacheTtlMs = resolved;
    return resolved;
  }

  getStorage(actorInput = null) {
    const actorKey = normalizeActorKey(actorInput) || normalizeActorKey(this.deps.getActivePubkey?.());
    if (!actorKey) {
        return { actors: {} }; // Return empty structure if no actor resolved
    }

    const cached = profileCache.get(NOTE_TYPES.WATCH_HISTORY);
    if (!cached) {
      return { actors: {} };
    }

    // Wrap single entry in actors map for compatibility
    return {
      actors: {
        [actorKey]: cached
      }
    };
  }

  persistEntry(actorInput, entry) {
    const actorKey = normalizeActorKey(actorInput);
    if (!actorKey || !entry) {
      return;
    }

    // Entry can have `items` (flat) or `records` (buckets). We standardize to records.
    let records = {};
    if (entry.records && typeof entry.records === "object") {
        const flat = Object.values(entry.records).flat();
        records = canonicalizeWatchHistoryItems(flat, WATCH_HISTORY_MAX_ITEMS);
    } else if (Array.isArray(entry.items)) {
        records = canonicalizeWatchHistoryItems(entry.items, WATCH_HISTORY_MAX_ITEMS);
    }
    const items = Object.values(records).flat();

    const snapshotId = typeof entry.snapshotId === "string" ? entry.snapshotId : "";
    const fingerprint = typeof entry.fingerprint === "string" ? entry.fingerprint : "";
    const savedAt = Number.isFinite(entry.savedAt) && entry.savedAt > 0 ? entry.savedAt : Date.now();
    const actorValue =
        typeof entry.actor === "string" && entry.actor.trim()
        ? entry.actor.trim()
        : actorInput || actorKey;

    const data = {
        actor: actorValue,
        snapshotId,
        fingerprint,
        savedAt,
        records,
        items,
        metadata: {},
    };

    // profileCache keys by active profile, so we just set the data for "watchHistory"
    profileCache.set(NOTE_TYPES.WATCH_HISTORY, data);
  }

  cancelRepublish(taskId = null) {
    if (!taskId) {
      for (const entry of this.republishTimers.values()) {
        if (entry && typeof entry.timer === "number") {
          clearTimeout(entry.timer);
        } else if (entry && entry.timer) {
          clearTimeout(entry.timer);
        } else if (typeof entry === "number") {
          clearTimeout(entry);
        }
      }
      this.republishTimers.clear();
      return;
    }
    const key = typeof taskId === "string" ? taskId.trim() : "";
    if (!key) {
      return;
    }
    const entry = this.republishTimers.get(key);
    if (entry && typeof entry.timer === "number") {
      clearTimeout(entry.timer);
    } else if (entry && entry.timer) {
      clearTimeout(entry.timer);
    } else if (typeof entry === "number") {
      clearTimeout(entry);
    }
    this.republishTimers.delete(key);
  }

  scheduleRepublish(taskId, operation, options = {}) {
    const key = typeof taskId === "string" ? taskId.trim() : "";
    if (!key || typeof operation !== "function") {
      return;
    }
    const onSchedule =
      typeof options?.onSchedule === "function" ? options.onSchedule : null;
    const previous = this.republishTimers.get(key);
    if (previous && typeof previous.timer === "number") {
      clearTimeout(previous.timer);
    } else if (previous && previous?.timer) {
      clearTimeout(previous.timer);
    }
    const requestedAttempt = Number.isFinite(options?.attempt)
      ? Math.max(0, Math.floor(options.attempt))
      : 0;
    const baseAttempt = Number.isFinite(previous?.attempt)
      ? Math.max(previous.attempt + 1, requestedAttempt)
      : requestedAttempt;
    const attempt = Math.min(baseAttempt, WATCH_HISTORY_REPUBLISH_MAX_ATTEMPTS);
    if (attempt > WATCH_HISTORY_REPUBLISH_MAX_ATTEMPTS) {
      return;
    }

    let delay = 0;
    if (attempt === 0) {
      delay = 10;
    } else {
      const exponentialDelay =
        WATCH_HISTORY_REPUBLISH_BASE_DELAY_MS * Math.pow(2, attempt);
      const cappedDelay = Math.min(
        exponentialDelay,
        WATCH_HISTORY_REPUBLISH_MAX_DELAY_MS,
      );
      const jitter =
        Math.random() * cappedDelay * WATCH_HISTORY_REPUBLISH_JITTER;
      delay = Math.max(
        WATCH_HISTORY_REPUBLISH_BASE_DELAY_MS,
        Math.floor(cappedDelay + jitter),
      );
    }

    if (onSchedule) {
      try {
        onSchedule({ taskId: key, attempt: attempt + 1, delay });
      } catch (error) {
        devLogger.warn(
          `[nostr] Failed to notify watch history republish schedule for ${key}:`,
          error,
        );
      }
    }
    const timer = setTimeout(async () => {
      this.republishTimers.delete(key);
      try {
        const result = await operation(attempt + 1);
        if (!result || result.ok !== true) {
          if (attempt + 1 <= WATCH_HISTORY_REPUBLISH_MAX_ATTEMPTS) {
            this.scheduleRepublish(key, operation, {
              attempt: attempt + 1,
              onSchedule,
            });
          } else {
            devLogger.warn(
              `[nostr] Watch history republish aborted for ${key}: max attempts reached.`,
            );
          }
        } else {
          this.cancelRepublish(key);
        }
      } catch (error) {
        devLogger.warn("[nostr] Watch history republish attempt failed:", error);
        if (attempt + 1 <= WATCH_HISTORY_REPUBLISH_MAX_ATTEMPTS) {
          this.scheduleRepublish(key, operation, {
            attempt: attempt + 1,
            onSchedule,
          });
        }
      }
    }, delay);
    this.republishTimers.set(key, {
      timer,
      attempt,
      operation,
    });
    return { attempt: attempt + 1, delay };
  }

  async getFingerprint(actorInput, itemsOverride = null) {
    const resolvedActor =
      typeof actorInput === "string" && actorInput.trim()
        ? actorInput.trim()
        : typeof this.deps.getActivePubkey === "function"
          ? this.deps.getActivePubkey()
          : "";
    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return "";
    }

    let itemsOrRecords = itemsOverride;
    if (!itemsOrRecords) {
        const cacheEntry = this.cache.get(actorKey) || this.getStorage().actors?.[actorKey];
        itemsOrRecords = cacheEntry?.records || cacheEntry?.items || [];
    }

    // Convert flat array to buckets if needed, or use as is if already bucketed/records
    let buckets = itemsOrRecords;
    if (Array.isArray(itemsOrRecords)) {
         buckets = canonicalizeWatchHistoryItems(itemsOrRecords, WATCH_HISTORY_MAX_ITEMS);
    }

    const fingerprint = await computeWatchHistoryFingerprintForItems(buckets);
    const previous = this.fingerprints.get(actorKey);
    if (previous && previous !== fingerprint) {
      devLogger.info(`[nostr] Watch history fingerprint changed for ${actorKey}.`);
    }
    this.fingerprints.set(actorKey, fingerprint);
    return fingerprint;
  }

  ensureBackgroundRefresh(actorInput = null) {
    const resolvedActor =
      typeof actorInput === "string" && actorInput.trim()
        ? actorInput.trim()
        : typeof this.deps.getActivePubkey === "function"
          ? this.deps.getActivePubkey()
          : this.deps.getSessionActor?.()?.pubkey || "";
    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return Promise.resolve({ pointerEvent: null, items: [], snapshotId: "" });
    }
    if (this.refreshPromises.has(actorKey)) {
      return this.refreshPromises.get(actorKey);
    }
    const promise = (async () => {
      const fetchResult = await this.fetch(resolvedActor, {
        forceRefresh: true,
      });
      if (fetchResult.pointerEvent) {
        return fetchResult;
      }
      const storageEntry = this.getStorage().actors?.[actorKey];

      const records = storageEntry?.records || {};
      const flatItems = Object.values(records).flat();

      if (!flatItems.length) {
        return fetchResult;
      }

      // We publish all records
      const publishResult = await this.publishRecords(records, {
        actorPubkey: resolvedActor,
        source: "background-refresh",
      });

      const fingerprint = await this.getFingerprint(resolvedActor, records);
      const entry = {
        actor: resolvedActor,
        records,
        items: flatItems, // Keep items for compat if needed, or just records
        snapshotId: publishResult.snapshotId || storageEntry?.snapshotId || "",
        pointerEvent: publishResult.pointerEvent || null,
        chunkEvents: [],
        savedAt: Date.now(),
        fingerprint,
        metadata: {},
      };
      this.cache.set(actorKey, entry);
      this.persistEntry(actorKey, entry);

      if (!publishResult.ok && publishResult.retryable) {
        // Schedule republish for failed months?
        // Simple retry for now
        this.scheduleRepublish("background-refresh", async (attempt) =>
            this.publishRecords(records, {
              actorPubkey: resolvedActor,
              attempt,
              source: "background-refresh",
            }),
          );
      }

      return {
        pointerEvent: entry.pointerEvent,
        items: flatItems,
        snapshotId: entry.snapshotId,
      };
    })()
      .catch((error) => {
        devLogger.warn("[nostr] Watch history background refresh failed:", error);
        throw error;
      })
      .finally(() => {
        this.refreshPromises.delete(actorKey);
      });
    this.refreshPromises.set(actorKey, promise);
    return promise;
  }

  async publishRecords(records, options = {}) {
     // High level wrapper to publish multiple months
     // records is { "YYYY-MM": [items] }

     const results = [];
     let allOk = true;
     let anyRetryable = false;

     const months = Object.keys(records).sort();
     for (const month of months) {
         const items = records[month];
         // Ideally we check if this month changed before publishing.
         // For now, we rely on the caller or just publish.
         // In a real optimized system we'd track dirty flags per month.

         const res = await this.publishMonthRecord(month, items, options);
         results.push(res);
         if (!res.ok) {
             allOk = false;
             if (res.retryable) anyRetryable = true;
         }
     }

     return {
         ok: allOk,
         retryable: anyRetryable,
         results,
         items: results.flatMap(r => r.items || []),
         snapshotId: "", // No single snapshot ID
         // Return last event as pointerEvent? Or null?
         pointerEvent: results.length > 0 ? results[results.length-1].pointerEvent : null
     };
  }

  async publishSnapshot(rawItems, options = {}) {
     // Compatibility wrapper
     const buckets = canonicalizeWatchHistoryItems(rawItems, WATCH_HISTORY_MAX_ITEMS);
     const result = await this.publishRecords(buckets, options);

     // Ensure items are returned for compatibility
     if (!result.items && result.results) {
         result.items = result.results.flatMap(r => r.items || []);
     }
     const actorCandidates = [options.actorPubkey];
     if (typeof this.deps.getActivePubkey === "function") {
       actorCandidates.push(this.deps.getActivePubkey());
     }
     const sessionActor = this.deps.getSessionActor?.();
     if (sessionActor?.pubkey) {
       actorCandidates.push(sessionActor.pubkey);
     }
     let resolvedActor = "";
     for (const candidate of actorCandidates) {
       if (typeof candidate === "string" && candidate.trim()) {
         resolvedActor = candidate.trim();
         break;
       }
     }
     if (!resolvedActor && typeof this.deps.ensureSessionActor === "function") {
       resolvedActor = await this.deps.ensureSessionActor();
     }
    const actorKey = normalizeActorKey(resolvedActor);
    if (actorKey) {
      const flatItems = Array.isArray(Object.values(buckets))
        ? Object.values(buckets).flat()
        : [];
      const fingerprint = await this.getFingerprint(resolvedActor, buckets);
      const entry = {
        actor: resolvedActor,
        records: buckets,
        items: Array.isArray(flatItems) ? flatItems : [],
        snapshotId: result.snapshotId || "",
         pointerEvent: result.pointerEvent || null,
         savedAt: Date.now(),
         fingerprint,
         metadata: {},
       };
       this.cache.set(actorKey, entry);
       this.persistEntry(actorKey, entry);
     }
     return result;
  }

  async publishMonthRecord(monthIdentifier, items, options = {}) {
    if (!items || !items.length) return { ok: true };

    const pool = typeof this.deps.getPool === "function" ? this.deps.getPool() : null;
    if (!pool) {
      return { ok: false, error: "nostr-uninitialized", retryable: false };
    }
    const actorCandidates = [options.actorPubkey];
    if (typeof this.deps.getActivePubkey === "function") {
      actorCandidates.push(this.deps.getActivePubkey());
    }
    const sessionActor = this.deps.getSessionActor?.();
    if (sessionActor?.pubkey) {
      actorCandidates.push(sessionActor.pubkey);
    }
    let resolvedActor = "";
    for (const candidate of actorCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        resolvedActor = candidate.trim();
        break;
      }
    }
    if (!resolvedActor && typeof this.deps.ensureSessionActor === "function") {
      resolvedActor = await this.deps.ensureSessionActor();
    }
    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return { ok: false, error: "missing-actor", retryable: false };
    }
    const actorPubkey = resolvedActor || actorKey;
    const normalizedLogged = normalizeActorKey(
      typeof this.deps.getActivePubkey === "function" ? this.deps.getActivePubkey() : "",
    );
    const signer = this.deps.resolveActiveSigner?.(actorKey) || null;
    const canUseActiveSignerSign =
      normalizedLogged &&
      normalizedLogged === actorKey &&
      signer &&
      typeof signer.signEvent === "function";

    const activeSigner = canUseActiveSignerSign ? signer : null;

    let privateKey = "";
    if (!canUseActiveSignerSign) {
      if (!sessionActor || sessionActor.pubkey !== actorKey) {
        const ensured = await this.deps.ensureSessionActor?.();
        if (normalizeActorKey(ensured) !== actorKey) {
          return { ok: false, error: "session-actor-mismatch", retryable: false };
        }
      }
      const currentSession = this.deps.getSessionActor?.();
      if (!currentSession || currentSession.pubkey !== actorKey) {
        return { ok: false, error: "session-actor-missing", retryable: false };
      }
      privateKey = currentSession.privateKey;
      if (!privateKey) {
        return { ok: false, error: "missing-session-key", retryable: false };
      }
    }

    // Sort items latest first for payload construction
    items.sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));

    const { payload, included, skipped } = buildWatchHistoryPayload(
      monthIdentifier,
      items,
      options.watchedAtMap || null
    );

    const relayCandidates = [];
    if (Array.isArray(options.relays) && options.relays.length) {
      relayCandidates.push(...options.relays);
    } else if (typeof this.deps.getWriteRelays === "function") {
      const write = this.deps.getWriteRelays();
      if (Array.isArray(write) && write.length) {
        relayCandidates.push(...write);
      }
    }
    if (!relayCandidates.length && typeof this.deps.getRelayFallback === "function") {
      const fallback = this.deps.getRelayFallback();
      if (Array.isArray(fallback) && fallback.length) {
        relayCandidates.push(...fallback);
      }
    }
    let relays = Array.from(new Set(relayCandidates));
    if (!relays.length) {
      relays = Array.from(RELAY_URLS);
    }

    devLogger.info("[nostr] Preparing to publish watch history month.", {
      actor: actorKey,
      monthIdentifier,
      itemCount: items.length,
      payloadCount: Array.isArray(payload.events) ? payload.events.length : 0,
      relaysRequested: relays,
      attempt: options.attempt || 0,
      source: options.source || "unknown",
    });

    const createdAtBase = Math.max(Math.floor(Date.now() / 1000), this.lastCreatedAt + 1);

    const signEvent = async (event) => {
      if (activeSigner) {
        return queueSignEvent(activeSigner, event, {
          timeoutMs: options.timeoutMs,
        });
      }
      return this.deps.signEventWithPrivateKey(event, privateKey);
    };
    let createdAtCursor = createdAtBase;

    const formatRelayStatus = (results = []) => {
      const normalized = Array.isArray(results) ? results : [];
      const statuses = [];
      const byUrl = new Map();
      for (const entry of normalized) {
        const url = typeof entry?.url === "string" ? entry.url : "";
        if (!url) {
          continue;
        }
        const reasonValue = (() => {
          const error = entry?.error;
          if (!error) {
            return null;
          }
          if (error instanceof Error) {
            return error.message || "publish failed";
          }
          if (typeof error === "string" && error.trim()) {
            return error.trim();
          }
          try {
            return JSON.stringify(error);
          } catch (_) {
            return String(error);
          }
        })();
        byUrl.set(url, {
          url,
          success: !!entry?.success,
          reason: reasonValue,
        });
      }
      for (const relayUrl of relays) {
        const existing = byUrl.get(relayUrl);
        if (existing) {
          statuses.push(existing);
        } else {
          statuses.push({ url: relayUrl, success: false, reason: "no-result" });
        }
      }
      return statuses;
    };

    const pointerTags = included.map((pointer) => {
      const tag = [pointer.type === "a" ? "a" : "e", pointer.value];
      if (pointer.relay) {
        tag.push(pointer.relay);
      }
      return tag;
    });

    const plaintext = JSON.stringify(payload);
    let content = plaintext;
    const encryptionTags = [];

    if (activeSigner) {
      if (this.deps.shouldRequestExtensionPermissions?.(activeSigner)) {
        await this.deps.ensureExtensionPermissions?.(DEFAULT_NIP07_PERMISSION_METHODS);
      }

      const encryptors = [];
      if (typeof activeSigner.nip44Encrypt === "function") {
        encryptors.push({ scheme: "nip44", encrypt: activeSigner.nip44Encrypt });
      }
      if (typeof activeSigner.nip04Encrypt === "function") {
        encryptors.push({ scheme: "nip04", encrypt: activeSigner.nip04Encrypt });
      }

      for (const encryptor of encryptors) {
        try {
          const encrypted = await encryptor.encrypt(actorPubkey, plaintext);
          if (typeof encrypted === "string" && encrypted) {
            content = encrypted;
            encryptionTags.push(["encrypted", encryptor.scheme]);
            break;
          }
        } catch (error) {
          devLogger.warn(
            "[nostr] Failed to encrypt watch history payload with signer:",
            error,
          );
        }
      }
    }

    if (!encryptionTags.length && privateKey) {
      try {
        const tools =
          (await this.deps.ensureNostrTools?.()) || this.deps.getCachedNostrTools?.();
        if (tools?.nip04 && typeof tools.nip04.encrypt === "function") {
          const encrypted = await tools.nip04.encrypt(
            privateKey,
            actorPubkey,
            plaintext,
          );
          if (typeof encrypted === "string" && encrypted) {
            content = encrypted;
            encryptionTags.push(["encrypted", "nip04"]);
          }
        }
      } catch (error) {
        devLogger.warn(
          "[nostr] Failed to encrypt watch history payload with fallback tools:",
          error,
        );
      }
    }

    if (!encryptionTags.length) {
      devLogger.warn("[nostr] Aborting watch history publish: mandatory encryption failed.");
      return { ok: false, error: "encryption-failed", retryable: true };
    }

    const event = buildWatchHistoryEvent({
      pubkey: actorPubkey,
      created_at: createdAtCursor,
      monthIdentifier,
      pointerTags,
      content,
    });
    if (encryptionTags.length) {
      event.tags.push(...encryptionTags);
    }
    createdAtCursor += 1;
    let signedEvent;
    try {
      signedEvent = await signEvent(event);
    } catch (error) {
      devLogger.warn("[nostr] Failed to sign watch history event:", error);
      return { ok: false, error: "signing-failed", retryable: false };
    }
    const publishResults = await publishEventToRelays(pool, relays, signedEvent);
    const relayStatus = formatRelayStatus(publishResults);
    const acceptedCount = relayStatus.filter((entry) => entry.success).length;
    let anyRejected = false;
    let anyPartial = false;
    if (acceptedCount === 0) {
      anyRejected = true;
      devLogger.warn("[nostr] Watch history event rejected by all relays:", publishResults);
    } else {
      const logMessage = acceptedCount === relays.length ? "accepted" : "partially accepted";
      if (acceptedCount === relays.length) {
        devLogger.info(
          `[nostr] Watch history event accepted by ${acceptedCount}/${relays.length} relay(s).`,
        );
      } else {
        anyPartial = true;
        devLogger.warn(
          `[nostr] Watch history event ${logMessage} by ${acceptedCount}/${relays.length} relay(s).`,
          publishResults,
        );
      }
    }
    this.lastCreatedAt = createdAtCursor;
    const partialAcceptance = anyPartial;
    const success = acceptedCount === relays.length && !anyRejected;
    let errorCode = null;
    if (!success) {
      if (anyRejected) {
        errorCode = "publish-rejected";
      } else if (partialAcceptance) {
        errorCode = "partial-relay-acceptance";
      }
    }
    const result = {
      ok: success,
      retryable: !success,
      actor: actorPubkey,
      monthIdentifier,
      items: items,
      pointerEvent: signedEvent,
      publishResults: {
        pointer: publishResults,
        relayStatus: {
          pointer: relayStatus,
        },
      },
      skippedCount: skipped.length,
      source: options.source || "manual",
      partial: partialAcceptance,
    };
    if (!success && errorCode) {
      result.error = errorCode;
    }

    devLogger.info("[nostr] Watch history month publish result.", {
      actor: actorKey,
      monthIdentifier,
      success,
      partialAcceptance,
      error: result.error || null,
      acceptedCount,
    });
    return result;
  }

  async updateList(rawItems = [], options = {}) {
    const actorCandidates = [options.actorPubkey];
    if (typeof this.deps.getActivePubkey === "function") {
      actorCandidates.push(this.deps.getActivePubkey());
    }
    let resolvedActor = "";
    for (const candidate of actorCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        resolvedActor = candidate.trim();
        break;
      }
    }
    if (!resolvedActor && typeof this.deps.ensureSessionActor === "function") {
      resolvedActor = await this.deps.ensureSessionActor();
    }
    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return { ok: false, error: "missing-actor" };
    }
    const storage = this.getStorage();
    const cachedEntry = this.cache.get(actorKey) || storage.actors?.[actorKey] || {};

    // Existing items - try to get records, fallback to items
    let existingItems = [];
    if (cachedEntry.records && typeof cachedEntry.records === "object") {
      existingItems = Object.keys(cachedEntry.records)
        .sort()
        .reverse()
        .map((k) => cachedEntry.records[k])
        .flat();
    } else if (Array.isArray(cachedEntry.items)) {
        existingItems = cachedEntry.items;
    }

    const incomingItems = Array.isArray(rawItems) ? rawItems : [];
    const combined =
      options.replace === true ? incomingItems : [...incomingItems, ...existingItems];

    // Bucket everything
    const records = canonicalizeWatchHistoryItems(
      combined,
      WATCH_HISTORY_MAX_ITEMS,
    );

    // Ensure empty months are preserved so they get cleared on relays
    if (cachedEntry.records && typeof cachedEntry.records === "object") {
      const oldKeys = Object.keys(cachedEntry.records);
      for (const oldKey of oldKeys) {
        if (!records[oldKey]) {
          records[oldKey] = [];
        }
      }
    }

    // Calculate fingerprint
    const fingerprint = await this.getFingerprint(resolvedActor, records);
    const flatItems = Object.values(records).flat();

    devLogger.info("[nostr] Updating watch history list.", {
      actor: resolvedActor,
      incomingItemCount: incomingItems.length,
      finalItemCount: flatItems.length,
      replace: options.replace === true,
    });

    // Publish
    const publishResult = await this.publishRecords(records, {
      actorPubkey: resolvedActor,
      snapshotId: options.snapshotId || cachedEntry.snapshotId,
      attempt: options.attempt || 0,
    });

    devLogger.info("[nostr] Watch history list publish attempt finished.", {
      actor: resolvedActor,
      snapshotId: publishResult.snapshotId || null,
      success: !!publishResult.ok,
      retryable: !!publishResult.retryable,
    });
    const entry = {
      actor: resolvedActor,
      records,
      items: flatItems,
      snapshotId: publishResult.snapshotId || cachedEntry.snapshotId || "",
      pointerEvent: publishResult.pointerEvent || cachedEntry.pointerEvent || null,
      savedAt: Date.now(),
      fingerprint,
      metadata: {},
    };
    this.cache.set(actorKey, entry);
    this.persistEntry(actorKey, entry);
    if (!publishResult.ok && publishResult.retryable) {
       // Retry full publish
      this.scheduleRepublish("update-list", async (attempt) =>
        this.publishRecords(records, {
          actorPubkey: resolvedActor,
          attempt,
        }),
      );
    } else {
      this.cancelRepublish("update-list");
    }
    return publishResult;
  }

  async removeItem(pointerInput, options = {}) {
    const pointer = normalizePointerInput(pointerInput);
    if (!pointer) {
      return { ok: false, error: "invalid-pointer" };
    }
    const actorCandidates = [options.actorPubkey];
    if (typeof this.deps.getActivePubkey === "function") {
      actorCandidates.push(this.deps.getActivePubkey());
    }
    let resolvedActor = "";
    for (const candidate of actorCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        resolvedActor = candidate.trim();
        break;
      }
    }
    if (!resolvedActor && typeof this.deps.ensureSessionActor === "function") {
      resolvedActor = await this.deps.ensureSessionActor();
    }
    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return { ok: false, error: "missing-actor" };
    }
    const existingEntry =
      this.cache.get(actorKey) || this.getStorage().actors?.[actorKey] || {};

    let existingItems = [];
    if (existingEntry.records) {
        existingItems = Object.values(existingEntry.records).flat();
    } else if (Array.isArray(existingEntry.items)) {
        existingItems = existingEntry.items;
    }

    const targetKey = pointerKey(pointer);
    const filtered = existingItems.filter((item) => pointerKey(item) !== targetKey);
    if (filtered.length === existingItems.length) {
      return {
        ok: true,
        skipped: true,
        snapshotId: existingEntry.snapshotId || "",
      };
    }
    return this.updateList(filtered, {
      ...options,
      actorPubkey: resolvedActor,
      replace: true,
    });
  }

  async fetch(actorInput, options = {}) {
    const actorCandidates = [actorInput];
    if (typeof this.deps.getActivePubkey === "function") {
      actorCandidates.push(this.deps.getActivePubkey());
    }
    const sessionActor = this.deps.getSessionActor?.();
    if (sessionActor?.pubkey) {
      actorCandidates.push(sessionActor.pubkey);
    }
    let resolvedActor = "";
    for (const candidate of actorCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        resolvedActor = candidate.trim();
        break;
      }
    }
    if (!resolvedActor) {
      resolvedActor = sessionActor?.pubkey || "";
    }
    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return { pointerEvent: null, items: [], snapshotId: "" };
    }
    const actorKeyIsHex = /^[0-9a-f]{64}$/.test(actorKey);

    const activePubkey = typeof this.deps.getActivePubkey === "function" ? this.deps.getActivePubkey() : "";
    const normalizedLogged = normalizeActorKey(activePubkey);

    let signer = this.deps.resolveActiveSigner?.(actorKey) || null;
    if (!signer && activePubkey && normalizedLogged === actorKey) {
        signer = this.deps.resolveActiveSigner?.(activePubkey);
    }

    const canUseActiveSignerDecrypt =
      normalizedLogged &&
      normalizedLogged === actorKey &&
      signer &&
      (typeof signer.nip04Decrypt === "function" || typeof signer.nip44Decrypt === "function");
    const decryptSigner = canUseActiveSignerDecrypt ? signer : null;

    if (decryptSigner && this.deps.shouldRequestExtensionPermissions?.(decryptSigner)) {
      await this.deps.ensureExtensionPermissions?.(DEFAULT_NIP07_PERMISSION_METHODS);
    }

    devLogger.info("[nostr] Fetching watch history from relays.", {
      actor: resolvedActor,
      forceRefresh: options.forceRefresh === true,
    });
    const existingEntry = this.cache.get(actorKey);
    const now = Date.now();
    const ttl = this.getCacheTtlMs();

    const loadFromStorage = async () => {
      const storageEntry = this.getStorage().actors?.[actorKey];

      let records = storageEntry?.records || {};
      let items = storageEntry?.items || [];
      if (!Object.keys(records).length && items.length) {
          records = canonicalizeWatchHistoryItems(items, WATCH_HISTORY_MAX_ITEMS);
          items = Object.values(records).flat();
      } else if (Object.keys(records).length && !items.length) {
          items = Object.values(records).flat();
      }

      const fingerprint = typeof storageEntry?.fingerprint === "string"
        ? storageEntry.fingerprint
        : await this.getFingerprint(resolvedActor, records);
      const entry = {
        actor: resolvedActor,
        items,
        records,
        snapshotId: typeof storageEntry?.snapshotId === "string"
          ? storageEntry.snapshotId
          : "",
        pointerEvent: null,
        savedAt: now,
        fingerprint,
        metadata: {},
      };
      this.cache.set(actorKey, entry);
      this.persistEntry(actorKey, entry);
      return { pointerEvent: null, items, snapshotId: entry.snapshotId };
    };

    if (!actorKeyIsHex) {
      devLogger.warn(
        `[nostr] Cannot normalize watch history actor key to hex. Aborting relay fetch for ${resolvedActor}.`,
      );
      if (
        !options.forceRefresh &&
        existingEntry &&
        Number.isFinite(existingEntry.savedAt) &&
        now - existingEntry.savedAt < ttl
      ) {
        return {
          pointerEvent: existingEntry.pointerEvent || null,
          items: existingEntry.items || [],
          snapshotId: existingEntry.snapshotId || "",
        };
      }
      return await loadFromStorage();
    }
    if (
      !options.forceRefresh &&
      existingEntry &&
      Number.isFinite(existingEntry.savedAt) &&
      now - existingEntry.savedAt < ttl
    ) {
      devLogger.info("[nostr] Using cached watch history entry.", {
        actor: resolvedActor,
        itemCount: Array.isArray(existingEntry.items) ? existingEntry.items.length : 0,
        cacheAgeMs: now - existingEntry.savedAt,
      });
      return {
        pointerEvent: existingEntry.pointerEvent || null,
        items: existingEntry.items || [],
        snapshotId: existingEntry.snapshotId || "",
      };
    }
    const pool = typeof this.deps.getPool === "function" ? this.deps.getPool() : null;
    if (!pool) {
      devLogger.warn(
        "[nostr] Cannot fetch watch history because relay pool is unavailable. Returning cached values.",
      );
      return {
        pointerEvent: existingEntry?.pointerEvent || null,
        items: existingEntry?.items || [],
        snapshotId: existingEntry?.snapshotId || "",
      };
    }
    const limitRaw = Number(WATCH_HISTORY_FETCH_EVENT_LIMIT);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 50;
    let readRelays = [];
    if (typeof this.deps.getReadRelays === "function") {
      const read = this.deps.getReadRelays();
      if (Array.isArray(read) && read.length) {
        readRelays = [...read];
      }
    }
    if (!readRelays.length && typeof this.deps.getRelayFallback === "function") {
      const fallback = this.deps.getRelayFallback();
      if (Array.isArray(fallback) && fallback.length) {
        readRelays = [...fallback];
      }
    }
    if (!readRelays.length) {
      readRelays = Array.from(RELAY_URLS);
    }
    let pointerEvents = [];
    try {
      const kinds = [WATCH_HISTORY_KIND];
      const filters = [
        {
          kinds,
          authors: [actorKey],
          // Filter by the new version tag to ignore older history lists
          "#v": [WATCH_HISTORY_VERSION_TAG_VALUE],
          limit,
        },
      ];
      const results = await pool.list(readRelays, filters);
      pointerEvents = Array.isArray(results)
        ? results
          .flat()
          .filter((event) => event && typeof event === "object")
        : [];
    } catch (error) {
      devLogger.warn("[nostr] Failed to fetch watch history pointer:", error);
    }

    // Process all events
    let eventToProcess = pointerEvents.length > 0 ? pointerEvents : null;

    if (!eventToProcess || eventToProcess.length === 0) {
      devLogger.info(
        "[nostr] No watch history event found on relays. Falling back to storage.",
        {
          actor: resolvedActor,
        },
      );
      return await loadFromStorage();
    }

    // Determine snapshotId from the latest event (prioritizing monthly)
    const sortedEvents = [...eventToProcess].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const latestEvent = sortedEvents[0];

    const chunkIdentifiers = [];
    for (const event of pointerEvents) {
      const tags = Array.isArray(event?.tags) ? event.tags : [];
      for (const tag of tags) {
        if (!Array.isArray(tag) || tag.length < 2) {
          continue;
        }
        if (tag[0] !== "a" || typeof tag[1] !== "string") {
          continue;
        }
        const segments = tag[1].split(":");
        if (segments.length < 3) {
          continue;
        }
        const kind = segments[0];
        const pubkey = segments[1];
        const identifier = segments.slice(2).join(":");
        if (String(WATCH_HISTORY_KIND) !== kind) {
          continue;
        }
        if (normalizeActorKey(pubkey) !== actorKey) {
          continue;
        }
        if (identifier && !chunkIdentifiers.includes(identifier)) {
          chunkIdentifiers.push(identifier);
        }
      }
    }

    let decryptedItems = [];
    if (chunkIdentifiers.length && decryptSigner) {
      try {
        const results = await pool.list(readRelays, [
          {
            kinds: [WATCH_HISTORY_KIND],
            authors: [actorKey],
            "#d": chunkIdentifiers,
          },
        ]);
        const chunkEvents = Array.isArray(results)
          ? results.flat().filter((event) => event && typeof event === "object")
          : [];
        for (const event of chunkEvents) {
          const ciphertext = typeof event.content === "string" ? event.content : "";
          if (!ciphertext) {
            continue;
          }
          let plaintext = "";
          if (typeof decryptSigner.nip04Decrypt === "function") {
            try {
              plaintext = await decryptSigner.nip04Decrypt(actorKey, ciphertext);
            } catch (error) {
              devLogger.warn("[nostr] Failed to decrypt watch history chunk:", error);
            }
          }
          if (!plaintext) {
            continue;
          }
          const parsed = parseWatchHistoryPayload(plaintext);
          if (Array.isArray(parsed.items) && parsed.items.length) {
            decryptedItems.push(...parsed.items);
          }
        }
      } catch (error) {
        devLogger.warn("[nostr] Failed to fetch watch history chunks:", error);
      }
    }

    // We will collect items from all events and merge them
    const eventsToProcess = Array.isArray(eventToProcess) ? eventToProcess : [eventToProcess];
    const collectedItems = [];

    // Deduplicate events by ID
    const uniqueEvents = new Map();
    for (const ev of eventsToProcess) {
        if (ev && ev.id) uniqueEvents.set(ev.id, ev);
    }

    for (const event of uniqueEvents.values()) {
      const fallbackPointers = extractPointerItemsFromEvent(event);
      const ciphertext = typeof event.content === "string" ? event.content : "";

      const dTag = event.tags.find(t => t[0] === 'd');
      const eventSnapshotId = dTag ? dTag[1] : "";

      // Try parsing as plaintext first
      const payload = parseWatchHistoryContentWithFallback(
          ciphertext,
          fallbackPointers,
          {
            version: 0,
            items: fallbackPointers,
            snapshot: eventSnapshotId,
          }
      );

      if (Array.isArray(payload?.items)) {
        collectedItems.push(...payload.items);
      }
    }

    const fallbackItems = extractPointerItemsFromEvent(latestEvent);
    const mergedItems = decryptedItems.length
      ? decryptedItems
      : collectedItems.length
        ? collectedItems
        : fallbackItems;

    // Canonicalize into buckets
    const records = canonicalizeWatchHistoryItems(
      mergedItems,
      WATCH_HISTORY_MAX_ITEMS,
    );
    const flatItems = Object.keys(records)
      .sort()
      .reverse()
      .map((k) => records[k])
      .flat();

    const fingerprint = await this.getFingerprint(
      resolvedActor,
      records,
    );

    const entry = {
      actor: resolvedActor,
      items: flatItems,
      records,
      snapshotId: "", // No single snapshot ID anymore
      pointerEvent: latestEvent,
      savedAt: now,
      fingerprint,
      metadata: {},
    };
    this.cache.set(actorKey, entry);
    this.persistEntry(actorKey, entry);
    return { pointerEvent: latestEvent, items: flatItems, snapshotId: "" };
  }

  async resolve(actorInput, options = {}) {
    const actorCandidates = [actorInput];
    if (typeof this.deps.getActivePubkey === "function") {
      actorCandidates.push(this.deps.getActivePubkey());
    }
    let resolvedActor = "";
    for (const candidate of actorCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        resolvedActor = candidate.trim();
        break;
      }
    }
    if (!resolvedActor && typeof this.deps.ensureSessionActor === "function") {
      resolvedActor = await this.deps.ensureSessionActor();
    }
    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return [];
    }
    devLogger.info("[nostr] Resolving watch history for actor.", {
      actor: resolvedActor,
      forceRefresh: options.forceRefresh === true,
    });
    const storage = this.getStorage();
    const storageEntry = storage.actors?.[actorKey];

    let fallbackItems = [];
    if (storageEntry?.records) {
        fallbackItems = Object.values(storageEntry.records).flat();
    } else if (storageEntry?.items) {
        fallbackItems = storageEntry.items;
    }

    const fetchResult = await this.fetch(resolvedActor, {
      forceRefresh: options.forceRefresh || false,
    });
    const merged = mergeWatchHistoryItemsWithFallback(
      {
        version: 2,
        items: fetchResult.items || [],
        snapshot: fetchResult.snapshotId || "",
      },
      fallbackItems,
    );
    const shouldBatch = Boolean(WATCH_HISTORY_BATCH_RESOLVE);
    const batchPageSizeRaw = Number(WATCH_HISTORY_BATCH_PAGE_SIZE);
    const hasCustomBatchSize =
      Number.isFinite(batchPageSizeRaw) && batchPageSizeRaw > 0;
    const batchLimit = shouldBatch && hasCustomBatchSize
      ? Math.min(Math.floor(batchPageSizeRaw), WATCH_HISTORY_MAX_ITEMS)
      : WATCH_HISTORY_MAX_ITEMS;

    // Re-bucket with limit
    const records = canonicalizeWatchHistoryItems(
      merged.items || [],
      batchLimit,
    );
    const flatItems = Object.keys(records)
      .sort()
      .reverse()
      .map((k) => records[k])
      .flat();

    const fingerprint = await this.getFingerprint(
      resolvedActor,
      records,
    );
    devLogger.info("[nostr] Watch history fetch complete.", {
      actor: resolvedActor,
      snapshotId: fetchResult.snapshotId || null,
      pointerFound: !!fetchResult.pointerEvent,
      itemCount: flatItems.length,
    });
    devLogger.info("[nostr] Watch history resolved and cached.", {
      actor: resolvedActor,
      itemCount: flatItems.length,
      snapshotId: fetchResult.snapshotId || null,
    });
    const entry = {
      actor: resolvedActor,
      records,
      items: flatItems,
      snapshotId: fetchResult.snapshotId || storage.actors?.[actorKey]?.snapshotId || "",
      pointerEvent: fetchResult.pointerEvent || null,
      savedAt: Date.now(),
      fingerprint,
      metadata: {},
    };
    this.cache.set(actorKey, entry);
    this.persistEntry(actorKey, entry);
    return flatItems;
  }

  clear() {
    for (const timer of this.republishTimers.values()) {
      if (timer && typeof timer.timer === "number") {
        clearTimeout(timer.timer);
      } else if (timer && timer.timer) {
        clearTimeout(timer.timer);
      } else if (typeof timer === "number") {
        clearTimeout(timer);
      }
    }
    this.republishTimers.clear();
    this.cache.clear();
    this.fingerprints.clear();
    this.refreshPromises.clear();
    this.lastCreatedAt = 0;
    this.storage = null;
  }
}

export function getWatchHistoryCacheTtlMs(manager) {
  return manager.getCacheTtlMs();
}

export function getWatchHistoryStorage(manager) {
  return manager.getStorage();
}

export function persistWatchHistoryEntry(manager, actorInput, entry) {
  return manager.persistEntry(actorInput, entry);
}

export function cancelWatchHistoryRepublish(manager, taskId = null) {
  return manager.cancelRepublish(taskId);
}

export function scheduleWatchHistoryRepublish(
  manager,
  taskId,
  operation,
  options = {},
) {
  return manager.scheduleRepublish(taskId, operation, options);
}

export function getWatchHistoryFingerprint(
  manager,
  actorInput,
  itemsOverride = null,
) {
  return manager.getFingerprint(actorInput, itemsOverride);
}

export function ensureWatchHistoryBackgroundRefresh(manager, actorInput = null) {
  return manager.ensureBackgroundRefresh(actorInput);
}

export function publishWatchHistorySnapshot(manager, rawItems, options = {}) {
  return manager.publishSnapshot(rawItems, options);
}

export function updateWatchHistoryList(manager, rawItems = [], options = {}) {
  return manager.updateList(rawItems, options);
}

export function removeWatchHistoryItem(manager, pointerInput, options = {}) {
  return manager.removeItem(pointerInput, options);
}

export function fetchWatchHistory(manager, actorInput, options = {}) {
  return manager.fetch(actorInput, options);
}

export function resolveWatchHistory(manager, actorInput, options = {}) {
  return manager.resolve(actorInput, options);
}

/**
 * Create a watch-history manager. Callers supply the nostr client hooks needed
 * to sign, encrypt, fetch, and publish events. All dependencies are optional;
 * the manager feature-detects and no-ops when a capability is unavailable.
 *
 * @param {object} deps - Lazy dependency bag wired up by NostrClient.
 * @returns {WatchHistoryManager}
 */
export function createWatchHistoryManager(deps) {
  return new WatchHistoryManager(deps);
}

/**
 * Convenience bundle for consumers that only need helper utilities without a
 * full manager instance.
 */
export const watchHistoryHelpers = {
  canonicalizeWatchHistoryItems,
  sanitizeWatchHistoryMetadata,
  serializeWatchHistoryItems,
  computeWatchHistoryFingerprintForItems,
  extractPointerItemsFromEvent,
};
