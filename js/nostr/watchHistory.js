import {
  WATCH_HISTORY_KIND,
  WATCH_HISTORY_LIST_IDENTIFIER,
  WATCH_HISTORY_LEGACY_LIST_IDENTIFIERS,
  WATCH_HISTORY_MAX_ITEMS,
  WATCH_HISTORY_BATCH_RESOLVE,
  WATCH_HISTORY_BATCH_PAGE_SIZE,
  WATCH_HISTORY_PAYLOAD_MAX_BYTES,
  WATCH_HISTORY_FETCH_EVENT_LIMIT,
  WATCH_HISTORY_CACHE_TTL_MS,
} from "../config.js";
import {
  buildWatchHistoryChunkEvent,
  buildWatchHistoryIndexEvent,
} from "../nostrEventSchemas.js";
import { publishEventToRelays } from "../nostrPublish.js";
import {
  RELAY_URLS,
  ensureNostrTools,
  getCachedNostrTools,
} from "./toolkit.js";
import { DEFAULT_NIP07_PERMISSION_METHODS } from "./nip07Permissions.js";
import { devLogger, userLogger } from "../utils/logger.js";

/**
 * Domain utilities for watch-history interactions. This module owns pointer
 * normalization/serialization, chunking, fingerprint hashing, persistence,
 * relay publishing, fetch/decrypt flows, and exposes a manager factory that is
 * dependency-injected with the nostr client hooks it needs.
 */
const WATCH_HISTORY_STORAGE_KEY = "bitvid:watch-history:v2";
const WATCH_HISTORY_STORAGE_VERSION = 2;
const WATCH_HISTORY_REPUBLISH_BASE_DELAY_MS = 2000;
const WATCH_HISTORY_REPUBLISH_MAX_DELAY_MS = 5 * 60 * 1000;
const WATCH_HISTORY_REPUBLISH_MAX_ATTEMPTS = 8;
const WATCH_HISTORY_REPUBLISH_JITTER = 0.25;

function cloneVideoMetadata(video) {
  if (!video || typeof video !== "object") {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(video));
  } catch (error) {
    devLogger.warn("[nostr] Failed to clone watch history video metadata", error);
    return { ...video };
  }
}

function cloneProfileMetadata(profile) {
  if (!profile || typeof profile !== "object") {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(profile));
  } catch (error) {
    devLogger.warn("[nostr] Failed to clone watch history profile metadata", error);
    return { ...profile };
  }
}

function clonePointerMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch (error) {
    devLogger.warn("[nostr] Failed to clone watch history pointer metadata", error);
    return { ...metadata };
  }
}

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
  if (!target.metadata && source.metadata && typeof source.metadata === "object") {
    target.metadata = clonePointerMetadata(source.metadata);
  } else if (target.metadata && source.metadata) {
    const merged = clonePointerMetadata(target.metadata) || {};
    const additional = clonePointerMetadata(source.metadata) || {};
    target.metadata = { ...merged, ...additional };
  }
  if (!target.video && source.video) {
    target.video = cloneVideoMetadata(source.video);
  }
  if (!target.profile && source.profile) {
    target.profile = cloneProfileMetadata(source.profile);
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

  const metadata = clonePointerMetadata(pointer.metadata);
  if (metadata) {
    cloned.metadata = metadata;
  }

  const video = cloneVideoMetadata(pointer.video) || metadata?.video || null;
  if (video) {
    cloned.video = video;
  }

  const profile = cloneProfileMetadata(pointer.profile) || metadata?.profile || null;
  if (profile) {
    cloned.profile = profile;
  }

  if (pointer.completed === true || metadata?.completed === true) {
    cloned.completed = true;
  }

  if (!Number.isFinite(cloned.resumeAt) && Number.isFinite(metadata?.resumeAt)) {
    cloned.resumeAt = metadata.resumeAt;
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
  const source = Array.isArray(payload.items) ? payload.items : [];
  for (const candidate of source) {
    const pointer = normalizePointerInput(candidate);
    if (!pointer) {
      continue;
    }
    const key = pointerKey(pointer);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(pointer);
  }
  return normalized;
}

function parseWatchHistoryPayload(plaintext) {
  if (typeof plaintext !== "string") {
    return {
      version: 0,
      items: [],
      snapshot: "",
      chunkIndex: 0,
      totalChunks: 1,
    };
  }
  try {
    const parsed = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object") {
      return {
        version: 0,
        items: [],
        snapshot: "",
        chunkIndex: 0,
        totalChunks: 1,
      };
    }
    const version = Number.isFinite(parsed.version) ? parsed.version : 0;
    const items = normalizePointersFromPayload(parsed);
    const snapshot = typeof parsed.snapshot === "string" ? parsed.snapshot : "";
    const chunkIndex = Number.isFinite(parsed.chunkIndex)
      ? Math.max(0, Math.floor(parsed.chunkIndex))
      : 0;
    const totalChunks = Number.isFinite(parsed.totalChunks)
      ? Math.max(1, Math.floor(parsed.totalChunks))
      : 1;
    return { version, items, snapshot, chunkIndex, totalChunks };
  } catch (error) {
    devLogger.warn("[nostr] Failed to parse watch history payload:", error);
    return {
      version: 0,
      items: [],
      snapshot: "",
      chunkIndex: 0,
      totalChunks: 1,
    };
  }
}

export function chunkWatchHistoryPayloadItems(payloadItems, snapshotId, maxBytes) {
  const items = Array.isArray(payloadItems) ? payloadItems : [];
  const safeMax = Math.max(128, Math.floor(maxBytes || 0));
  const measurementLimit = Math.max(64, safeMax - 32);
  const normalizedSnapshot = typeof snapshotId === "string" ? snapshotId : "";

  const chunks = [];
  const skipped = [];
  let current = [];

  const estimateLength = (chunkItems, chunkIndex, totalGuess) =>
    JSON.stringify({
      version: 2,
      snapshot: normalizedSnapshot,
      chunkIndex,
      totalChunks: totalGuess,
      items: chunkItems,
    }).length;

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    if (!current.length) {
      const candidate = [item];
      const size = estimateLength(candidate, chunks.length, chunks.length + 1);
      if (size <= measurementLimit) {
        current = candidate;
        continue;
      }
      skipped.push(item);
      continue;
    }

    const next = [...current, item];
    const nextSize = estimateLength(next, chunks.length, chunks.length + 1);
    if (nextSize <= measurementLimit) {
      current = next;
      continue;
    }

    chunks.push(current);
    current = [item];
  }

  if (current.length) {
    chunks.push(current);
  }

  let needsRebalance = true;
  while (needsRebalance) {
    needsRebalance = false;
    for (let index = 0; index < chunks.length; index += 1) {
      let chunkItems = chunks[index];
      if (!Array.isArray(chunkItems)) {
        chunks[index] = [];
        chunkItems = chunks[index];
      }
      let payloadSize = JSON.stringify({
        version: 2,
        snapshot: normalizedSnapshot,
        chunkIndex: index,
        totalChunks: chunks.length,
        items: chunkItems,
      }).length;
      while (chunkItems.length && payloadSize > safeMax) {
        const overflow = chunkItems.pop();
        if (!overflow) {
          break;
        }
        if (!chunks[index + 1]) {
          chunks[index + 1] = [];
        }
        chunks[index + 1].unshift(overflow);
        needsRebalance = true;
        chunkItems = chunks[index];
        payloadSize = JSON.stringify({
          version: 2,
          snapshot: normalizedSnapshot,
          chunkIndex: index,
          totalChunks: chunks.length,
          items: chunkItems,
        }).length;
      }
    }
  }

  while (chunks.length > 1 && chunks[chunks.length - 1].length === 0) {
    chunks.pop();
  }

  if (!chunks.length) {
    chunks.push([]);
  }

  return { chunks, skipped };
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
  if (!Number.isFinite(maxItems) || maxItems <= 0) {
    return deduped;
  }
  return deduped.slice(0, Math.max(0, Math.floor(maxItems)));
}

function sanitizeWatchHistoryMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch (error) {
    devLogger.warn("[nostr] Failed to sanitize watch history metadata:", error);
    return {};
  }
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
      const metadata = clonePointerMetadata(item?.metadata);
      if (metadata) {
        payload.metadata = metadata;
      }
      const video = metadata?.video || cloneVideoMetadata(item?.video);
      if (video) {
        if (payload.metadata) {
          payload.metadata.video = payload.metadata.video || video;
        } else {
          payload.video = video;
        }
      }
      const profile = metadata?.profile || cloneProfileMetadata(item?.profile);
      if (profile) {
        if (payload.metadata) {
          payload.metadata.profile = payload.metadata.profile || profile;
        } else {
          payload.profile = profile;
        }
      }
      const resumeAt = Number.isFinite(item?.resumeAt)
        ? Math.max(0, Math.floor(item.resumeAt))
        : undefined;
      if (resumeAt !== undefined) {
        if (payload.metadata) {
          if (!Number.isFinite(payload.metadata.resumeAt)) {
            payload.metadata.resumeAt = resumeAt;
          }
        } else {
          payload.resumeAt = resumeAt;
        }
      }
      if (item?.completed === true) {
        if (payload.metadata) {
          payload.metadata.completed = true;
        } else {
          payload.completed = true;
        }
      }
      if (payload.metadata && !Object.keys(payload.metadata).length) {
        delete payload.metadata;
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

async function computeWatchHistoryFingerprintForItems(items) {
  const serialized = serializeWatchHistoryItems(items);
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

function mergeWatchHistoryItemsWithFallback(parsed, fallbackItems) {
  if (!parsed || typeof parsed !== "object") {
    return {
      version: 0,
      items: fallbackItems,
      snapshot: "",
      chunkIndex: 0,
      totalChunks: 1,
    };
  }
  if (Array.isArray(parsed.items) && parsed.items.length) {
    return parsed;
  }
  if (!Array.isArray(fallbackItems) || fallbackItems.length === 0) {
    return parsed;
  }
  return { ...parsed, items: fallbackItems };
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
  const baseSegment = ivIndex >= 0 ? normalizedCiphertext.slice(0, ivIndex) : normalizedCiphertext;
  const ivSegment = ivIndex >= 0 ? normalizedCiphertext.slice(ivIndex + 4) : "";
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
  }

  getCacheTtlMs() {
    if (Number.isFinite(this.cacheTtlMs) && this.cacheTtlMs > 0) {
      return this.cacheTtlMs;
    }
    const configured = Number(WATCH_HISTORY_CACHE_TTL_MS);
    const resolved =
      Number.isFinite(configured) && configured > 0
        ? Math.floor(configured)
        : 24 * 60 * 60 * 1000;
    this.cacheTtlMs = resolved;
    return resolved;
  }

  getStorage() {
    if (this.storage && this.storage.version === WATCH_HISTORY_STORAGE_VERSION) {
      return this.storage;
    }
    const emptyStorage = { version: WATCH_HISTORY_STORAGE_VERSION, actors: {} };
    if (typeof localStorage === "undefined") {
      this.storage = emptyStorage;
      return this.storage;
    }
    let raw = null;
    try {
      raw = localStorage.getItem(WATCH_HISTORY_STORAGE_KEY);
    } catch (error) {
      devLogger.warn("[nostr] Failed to read watch history storage:", error);
      this.storage = emptyStorage;
      return this.storage;
    }
    if (!raw || typeof raw !== "string") {
      this.storage = emptyStorage;
      return this.storage;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      devLogger.warn("[nostr] Failed to parse watch history storage:", error);
      this.storage = emptyStorage;
      return this.storage;
    }
    const now = Date.now();
    const ttl = this.getCacheTtlMs();
    const actors =
      parsed && typeof parsed === "object" && parsed.actors && typeof parsed.actors === "object"
        ? parsed.actors
        : {};
    const sanitizedActors = {};
    let mutated = false;
    for (const [actorKeyRaw, entry] of Object.entries(actors)) {
      const actorKey = normalizeActorKey(actorKeyRaw);
      if (!actorKey) {
        mutated = true;
        continue;
      }
      const savedAt = Number(entry?.savedAt);
      if (!Number.isFinite(savedAt) || savedAt <= 0 || now - savedAt > ttl) {
        mutated = true;
        continue;
      }
      const items = Array.isArray(entry?.items)
        ? canonicalizeWatchHistoryItems(entry.items, WATCH_HISTORY_MAX_ITEMS)
        : [];
      const metadata = sanitizeWatchHistoryMetadata(entry?.metadata);
      const snapshotId = typeof entry?.snapshotId === "string" ? entry.snapshotId : "";
      const fingerprint = typeof entry?.fingerprint === "string" ? entry.fingerprint : "";
      sanitizedActors[actorKey] = {
        actor:
          typeof entry?.actor === "string" && entry.actor.trim()
            ? entry.actor.trim()
            : actorKey,
        snapshotId,
        fingerprint,
        savedAt,
        items,
        metadata,
      };
    }
    const storage = {
      version: WATCH_HISTORY_STORAGE_VERSION,
      actors: sanitizedActors,
    };
    if (mutated || parsed?.version !== WATCH_HISTORY_STORAGE_VERSION) {
      try {
        localStorage.setItem(WATCH_HISTORY_STORAGE_KEY, JSON.stringify(storage));
      } catch (error) {
        devLogger.warn("[nostr] Failed to rewrite watch history storage:", error);
      }
    }
    this.storage = storage;
    return this.storage;
  }

  persistEntry(actorInput, entry) {
    const actorKey = normalizeActorKey(actorInput);
    if (!actorKey) {
      return;
    }
    const storage = this.getStorage();
    const actors = { ...storage.actors };
    const now = Date.now();
    const ttl = this.getCacheTtlMs();
    let mutated = false;
    for (const [key, value] of Object.entries(actors)) {
      const savedAt = Number(value?.savedAt);
      if (!Number.isFinite(savedAt) || savedAt <= 0 || now - savedAt > ttl) {
        delete actors[key];
        mutated = true;
      }
    }
    if (!entry) {
      if (actors[actorKey]) {
        delete actors[actorKey];
        mutated = true;
      }
    } else {
      const items = Array.isArray(entry.items)
        ? canonicalizeWatchHistoryItems(entry.items, WATCH_HISTORY_MAX_ITEMS)
        : [];
      const metadata = sanitizeWatchHistoryMetadata(entry.metadata);
      const snapshotId = typeof entry.snapshotId === "string" ? entry.snapshotId : "";
      const fingerprint = typeof entry.fingerprint === "string" ? entry.fingerprint : "";
      const savedAt = Number.isFinite(entry.savedAt) && entry.savedAt > 0 ? entry.savedAt : now;
      const actorValue =
        typeof entry.actor === "string" && entry.actor.trim()
          ? entry.actor.trim()
          : actorInput || actorKey;
      actors[actorKey] = {
        actor: actorValue,
        snapshotId,
        fingerprint,
        savedAt,
        items,
        metadata,
      };
      mutated = true;
    }
    const payload = {
      version: WATCH_HISTORY_STORAGE_VERSION,
      actors,
    };
    this.storage = payload;
    if (!mutated || typeof localStorage === "undefined") {
      return;
    }
    try {
      localStorage.setItem(WATCH_HISTORY_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      devLogger.warn("[nostr] Failed to persist watch history entry:", error);
    }
  }

  cancelRepublish(snapshotId = null) {
    if (!snapshotId) {
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
    const key = typeof snapshotId === "string" ? snapshotId.trim() : "";
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

  scheduleRepublish(snapshotId, operation, options = {}) {
    const key = typeof snapshotId === "string" ? snapshotId.trim() : "";
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
    const exponentialDelay = WATCH_HISTORY_REPUBLISH_BASE_DELAY_MS * Math.pow(2, attempt);
    const cappedDelay = Math.min(exponentialDelay, WATCH_HISTORY_REPUBLISH_MAX_DELAY_MS);
    const jitter = Math.random() * cappedDelay * WATCH_HISTORY_REPUBLISH_JITTER;
    const delay = Math.max(
      WATCH_HISTORY_REPUBLISH_BASE_DELAY_MS,
      Math.floor(cappedDelay + jitter),
    );
    if (onSchedule) {
      try {
        onSchedule({ snapshotId: key, attempt: attempt + 1, delay });
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
    const items = Array.isArray(itemsOverride)
      ? canonicalizeWatchHistoryItems(itemsOverride, WATCH_HISTORY_MAX_ITEMS)
      : (() => {
          const cacheEntry = this.cache.get(actorKey) || this.getStorage().actors?.[actorKey];
          return Array.isArray(cacheEntry?.items)
            ? canonicalizeWatchHistoryItems(cacheEntry.items, WATCH_HISTORY_MAX_ITEMS)
            : [];
        })();
    const fingerprint = await computeWatchHistoryFingerprintForItems(items);
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
      const metadata = sanitizeWatchHistoryMetadata(storageEntry?.metadata);
      const alreadyAttempted = metadata.autoSnapshotAttempted === true;
      const items = Array.isArray(storageEntry?.items)
        ? canonicalizeWatchHistoryItems(storageEntry.items, WATCH_HISTORY_MAX_ITEMS)
        : [];
      if (!items.length || alreadyAttempted) {
        return fetchResult;
      }
      metadata.autoSnapshotAttempted = true;
      metadata.autoSnapshotAttemptedAt = Date.now();
      const publishResult = await this.publishSnapshot(items, {
        actorPubkey: resolvedActor,
        snapshotId: storageEntry?.snapshotId,
        source: "background-refresh",
      });
      const fingerprint = await this.getFingerprint(resolvedActor, items);
      const entry = {
        actor: resolvedActor,
        items,
        snapshotId: publishResult.snapshotId || storageEntry?.snapshotId || "",
        pointerEvent: publishResult.pointerEvent || null,
        chunkEvents: publishResult.chunkEvents || [],
        savedAt: Date.now(),
        fingerprint,
        metadata,
      };
      this.cache.set(actorKey, entry);
      this.persistEntry(actorKey, entry);
      if (!publishResult.ok && publishResult.retryable) {
        const retrySnapshot = entry.snapshotId || publishResult.snapshotId;
        if (retrySnapshot) {
          this.scheduleRepublish(retrySnapshot, async (attempt) =>
            this.publishSnapshot(entry.items, {
              actorPubkey: resolvedActor,
              snapshotId: retrySnapshot,
              attempt,
              source: "background-refresh",
            }),
          );
        }
      } else if (publishResult.ok && entry.snapshotId) {
        this.cancelRepublish(entry.snapshotId);
      }
      return {
        pointerEvent: entry.pointerEvent,
        items: entry.items,
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

  async publishSnapshot(rawItems, options = {}) {
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
    const useActiveSignerEncrypt =
      canUseActiveSignerSign && signer && typeof signer.nip04Encrypt === "function";
    const activeSigner = canUseActiveSignerSign ? signer : null;
    const encryptionSigner = useActiveSignerEncrypt ? signer : null;
    if (
      (canUseActiveSignerSign || useActiveSignerEncrypt) &&
      this.deps.shouldRequestExtensionPermissions?.(signer)
    ) {
      await this.deps.ensureExtensionPermissions?.(DEFAULT_NIP07_PERMISSION_METHODS);
    }
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
    const canonicalItems = canonicalizeWatchHistoryItems(
      Array.isArray(rawItems) ? rawItems : [],
      WATCH_HISTORY_MAX_ITEMS,
    );
    const snapshotId =
      typeof options.snapshotId === "string" && options.snapshotId.trim()
        ? options.snapshotId.trim()
        : `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const { chunks, skipped } = chunkWatchHistoryPayloadItems(
      canonicalItems,
      snapshotId,
      WATCH_HISTORY_PAYLOAD_MAX_BYTES,
    );
    if (skipped.length) {
      userLogger.warn(
        `[nostr] Watch history snapshot skipped ${skipped.length} oversize ${
          skipped.length === 1 ? "entry" : "entries"
        }.`,
      );
    }
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
    devLogger.info("[nostr] Preparing to publish watch history snapshot.", {
      actor: actorKey,
      snapshotId,
      itemCount: canonicalItems.length,
      chunkCount: chunks.length,
      relaysRequested: relays,
      attempt: options.attempt || 0,
      source: options.source || "unknown",
    });
    const createdAtBase = Math.max(Math.floor(Date.now() / 1000), this.lastCreatedAt + 1);
    let cachedNip04Tools = null;
    const ensureNip04Tools = async () => {
      if (cachedNip04Tools) {
        return cachedNip04Tools;
      }

      const ensureToolkit =
        typeof this.deps.ensureNostrTools === "function"
          ? this.deps.ensureNostrTools
          : ensureNostrTools;
      if (ensureToolkit) {
        try {
          const ensured = await ensureToolkit();
          if (
            ensured?.nip04 &&
            typeof ensured.nip04.encrypt === "function"
          ) {
            cachedNip04Tools = ensured;
            return cachedNip04Tools;
          }
        } catch (error) {
          devLogger.warn(
            "[nostr] Failed to resolve nostr-tools for watch history:",
            error,
          );
        }
      }

      const readCachedToolkit =
        typeof this.deps.getCachedNostrTools === "function"
          ? this.deps.getCachedNostrTools
          : getCachedNostrTools;
      if (readCachedToolkit) {
        try {
          const cached = await readCachedToolkit();
          if (
            cached?.nip04 &&
            typeof cached.nip04.encrypt === "function"
          ) {
            cachedNip04Tools = cached;
            return cachedNip04Tools;
          }
        } catch (error) {
          devLogger.warn(
            "[nostr] Failed to read cached nostr-tools for watch history:",
            error,
          );
        }
      }

      return null;
    };
    const encryptChunk = async (plaintext) => {
      if (encryptionSigner) {
        return encryptionSigner.nip04Encrypt(actorPubkey, plaintext);
      }
      const tools = await ensureNip04Tools();
      if (!tools?.nip04 || typeof tools.nip04.encrypt !== "function") {
        throw new Error("nip04-unavailable");
      }
      return tools.nip04.encrypt(privateKey, actorPubkey, plaintext);
    };
    const signEvent = async (event) => {
      if (activeSigner) {
        return activeSigner.signEvent(event);
      }
      return this.deps.signEventWithPrivateKey(event, privateKey);
    };
    let createdAtCursor = createdAtBase;
    const chunkResults = [];
    const chunkAddresses = [];
    let anyChunkRejected = false;
    let anyChunkPartial = false;
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
    for (let index = 0; index < chunks.length; index += 1) {
      const chunkItems = Array.isArray(chunks[index]) ? chunks[index] : [];
      const pointerTags = chunkItems.map((pointer) => {
        const tag = [pointer.type === "a" ? "a" : "e", pointer.value];
        if (pointer.relay) {
          tag.push(pointer.relay);
        }
        return tag;
      });
      devLogger.info(
        "[nostr] Publishing watch history chunk.",
        {
          actor: actorKey,
          snapshotId,
          chunkIndex: index,
          chunkSize: chunkItems.length,
          relays,
        },
      );
      const plaintext = JSON.stringify({
        version: 2,
        snapshot: snapshotId,
        chunkIndex: index,
        totalChunks: chunks.length,
        items: chunkItems,
      });
      let ciphertext = "";
      try {
        ciphertext = await encryptChunk(plaintext);
      } catch (error) {
        userLogger.warn("[nostr] Failed to encrypt watch history chunk:", error);
        return { ok: false, error: "encryption-failed", retryable: false };
      }
      const chunkIdentifier = `${snapshotId}:${index}`;
      const event = buildWatchHistoryChunkEvent({
        pubkey: actorPubkey,
        created_at: createdAtCursor,
        chunkIdentifier,
        snapshotId,
        chunkIndex: index,
        totalChunks: chunks.length,
        pointerTags,
        content: ciphertext,
      });
      createdAtCursor += 1;
      let signedEvent;
      try {
        signedEvent = await signEvent(event);
      } catch (error) {
        userLogger.warn("[nostr] Failed to sign watch history chunk:", error);
        return { ok: false, error: "signing-failed", retryable: false };
      }
      const publishResults = await publishEventToRelays(
        pool,
        relays,
        signedEvent,
      );
      const relayStatus = formatRelayStatus(publishResults);
      const acceptedCount = relayStatus.filter((entry) => entry.success).length;
      if (acceptedCount === 0) {
        anyChunkRejected = true;
        userLogger.warn(
          `[nostr] Watch history chunk ${index} rejected by all relays:`,
          publishResults,
        );
      } else {
        const logMessage =
          acceptedCount === relays.length ? "accepted" : "partially accepted";
        if (acceptedCount === relays.length) {
          devLogger.info(
            `[nostr] Watch history chunk ${index} accepted by ${acceptedCount}/${relays.length} relay(s).`,
          );
        } else {
          anyChunkPartial = true;
          userLogger.warn(
            `[nostr] Watch history chunk ${index} ${logMessage} by ${acceptedCount}/${relays.length} relay(s).`,
            publishResults,
          );
        }
      }
      const address = this.deps.eventToAddressPointer?.(signedEvent);
      if (address) {
        chunkAddresses.push(address);
      }
      chunkResults.push({
        event: signedEvent,
        publishResults,
        acceptedCount,
        relayStatus,
      });
    }
    const pointerEvent = buildWatchHistoryIndexEvent({
      pubkey: actorPubkey,
      created_at: createdAtCursor,
      snapshotId,
      totalChunks: chunks.length,
      chunkAddresses,
    });
    createdAtCursor += 1;
    let signedPointerEvent;
    try {
      signedPointerEvent = await signEvent(pointerEvent);
    } catch (error) {
      userLogger.warn("[nostr] Failed to sign watch history pointer event:", error);
      return { ok: false, error: "signing-failed", retryable: false };
    }
    devLogger.info(
      "[nostr] Publishing watch history pointer event.",
      {
        actor: actorKey,
        snapshotId,
        relays,
      },
    );
    const pointerResults = await publishEventToRelays(
      pool,
      relays,
      signedPointerEvent,
    );
    const pointerRelayStatus = formatRelayStatus(pointerResults);
    const pointerAcceptedCount = pointerRelayStatus.filter((entry) => entry.success).length;
    const pointerAccepted = pointerAcceptedCount > 0;
    if (pointerAcceptedCount === relays.length) {
      devLogger.info(
        `[nostr] Watch history pointer accepted by ${pointerAcceptedCount}/${relays.length} relay(s).`,
      );
    } else if (pointerAccepted) {
      userLogger.warn(
        `[nostr] Watch history pointer partially accepted by ${pointerAcceptedCount}/${relays.length} relay(s).`,
        pointerResults,
      );
    } else {
      userLogger.warn(
        "[nostr] Watch history pointer rejected by all relays:",
        pointerResults,
      );
    }
    this.lastCreatedAt = createdAtCursor;
    const chunkStatuses = chunkResults.map((entry) => entry.relayStatus);
    const chunkAcceptedEverywhere = chunkResults.every(
      (entry) => entry.acceptedCount === relays.length,
    );
    const chunkRejectedEverywhere = chunkResults.some((entry) => entry.acceptedCount === 0);
    const pointerRejectedEverywhere = pointerAcceptedCount === 0;
    const pointerPartial = pointerAccepted && pointerAcceptedCount < relays.length;
    const partialAcceptance = pointerPartial || anyChunkPartial;
    const success =
      !pointerRejectedEverywhere &&
      pointerAcceptedCount === relays.length &&
      chunkAcceptedEverywhere &&
      !anyChunkRejected;
    let errorCode = null;
    if (!success) {
      if (pointerRejectedEverywhere && chunkRejectedEverywhere) {
        errorCode = "pointer-and-chunk-rejected";
      } else if (pointerRejectedEverywhere) {
        errorCode = "pointer-rejected";
      } else if (chunkRejectedEverywhere || anyChunkRejected) {
        errorCode = "chunk-rejected";
      } else if (partialAcceptance) {
        errorCode = "partial-relay-acceptance";
      } else {
        errorCode = "publish-rejected";
      }
    }
    const result = {
      ok: success,
      retryable: !success,
      actor: actorPubkey,
      snapshotId,
      items: canonicalItems,
      pointerEvent: signedPointerEvent,
      chunkEvents: chunkResults.map((entry) => entry.event),
      publishResults: {
        pointer: pointerResults,
        chunks: chunkResults.map((entry) => entry.publishResults),
        relayStatus: {
          pointer: pointerRelayStatus,
          chunks: chunkStatuses,
        },
      },
      skippedCount: skipped.length,
      source: options.source || "manual",
      partial: partialAcceptance,
    };
    if (!success && errorCode) {
      result.error = errorCode;
    }

    const shouldPersistLocally =
      pointerAcceptedCount > 0 && !chunkRejectedEverywhere;

    if (shouldPersistLocally) {
      const storage = this.getStorage();
      const previousEntry =
        this.cache.get(actorKey) || storage.actors?.[actorKey] || {};
      const metadata = sanitizeWatchHistoryMetadata(previousEntry.metadata);
      metadata.updatedAt = Date.now();
      metadata.status = success ? "ok" : "partial";
      metadata.lastPublishResults = result.publishResults;
      metadata.skippedCount = result.skippedCount || 0;
      if (success) {
        delete metadata.lastError;
      } else {
        metadata.lastError = result.error || "publish-partial";
      }

      const entry = {
        actor: actorPubkey,
        items: canonicalItems,
        snapshotId,
        pointerEvent: result.pointerEvent,
        chunkEvents: result.chunkEvents,
        savedAt: Date.now(),
        fingerprint: await this.getFingerprint(actorPubkey, canonicalItems),
        metadata,
      };

      this.cache.set(actorKey, entry);
      this.persistEntry(actorKey, entry);
    }

    devLogger.info("[nostr] Watch history snapshot publish result.", {
      actor: actorKey,
      snapshotId,
      success,
      partialAcceptance,
      error: result.error || null,
      pointerAcceptedCount,
      chunkAcceptedCounts: chunkResults.map((entry) => entry.acceptedCount),
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
    const existingItems = Array.isArray(cachedEntry.items)
      ? canonicalizeWatchHistoryItems(cachedEntry.items, WATCH_HISTORY_MAX_ITEMS)
      : [];
    const incomingItems = Array.isArray(rawItems) ? rawItems : [];
    const combined =
      options.replace === true ? incomingItems : [...incomingItems, ...existingItems];
    const canonicalItems = canonicalizeWatchHistoryItems(
      combined,
      WATCH_HISTORY_MAX_ITEMS,
    );
    const fingerprint = await this.getFingerprint(resolvedActor, canonicalItems);
    devLogger.info("[nostr] Updating watch history list.", {
      actor: resolvedActor,
      incomingItemCount: incomingItems.length,
      finalItemCount: canonicalItems.length,
      replace: options.replace === true,
    });
    const publishResult = await this.publishSnapshot(canonicalItems, {
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
    const metadata = sanitizeWatchHistoryMetadata(cachedEntry.metadata);
    metadata.updatedAt = Date.now();
    metadata.status = publishResult.ok ? "ok" : "error";
    metadata.lastPublishResults = publishResult.publishResults;
    metadata.skippedCount = publishResult.skippedCount || 0;
    if (!publishResult.ok) {
      metadata.lastError = publishResult.error || "publish-failed";
    } else {
      delete metadata.lastError;
    }
    const entry = {
      actor: resolvedActor,
      items: canonicalItems,
      snapshotId: publishResult.snapshotId || cachedEntry.snapshotId || "",
      pointerEvent: publishResult.pointerEvent || cachedEntry.pointerEvent || null,
      chunkEvents: publishResult.chunkEvents || cachedEntry.chunkEvents || [],
      savedAt: Date.now(),
      fingerprint,
      metadata,
    };
    this.cache.set(actorKey, entry);
    this.persistEntry(actorKey, entry);
    if (!publishResult.ok && publishResult.retryable && entry.snapshotId) {
      this.scheduleRepublish(entry.snapshotId, async (attempt) =>
        this.publishSnapshot(entry.items, {
          actorPubkey: resolvedActor,
          snapshotId: entry.snapshotId,
          attempt,
        }),
      );
    } else if (publishResult.ok && entry.snapshotId) {
      this.cancelRepublish(entry.snapshotId);
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
    const existingItems = Array.isArray(existingEntry.items)
      ? canonicalizeWatchHistoryItems(existingEntry.items, WATCH_HISTORY_MAX_ITEMS)
      : [];
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
    const normalizedLogged = normalizeActorKey(
      typeof this.deps.getActivePubkey === "function" ? this.deps.getActivePubkey() : "",
    );
    const signer = this.deps.resolveActiveSigner?.(actorKey) || null;
    const canUseActiveSignerDecrypt =
      normalizedLogged &&
      normalizedLogged === actorKey &&
      signer &&
      typeof signer.nip04Decrypt === "function";
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
      const items = Array.isArray(storageEntry?.items)
        ? canonicalizeWatchHistoryItems(storageEntry.items, WATCH_HISTORY_MAX_ITEMS)
        : [];
      const fingerprint = typeof storageEntry?.fingerprint === "string"
        ? storageEntry.fingerprint
        : await this.getFingerprint(resolvedActor, items);
      const entry = {
        actor: resolvedActor,
        items,
        snapshotId: typeof storageEntry?.snapshotId === "string"
          ? storageEntry.snapshotId
          : "",
        pointerEvent: null,
        chunkEvents: [],
        savedAt: now,
        fingerprint,
        metadata: sanitizeWatchHistoryMetadata(storageEntry?.metadata),
      };
      this.cache.set(actorKey, entry);
      this.persistEntry(actorKey, entry);
      return { pointerEvent: null, items, snapshotId: entry.snapshotId };
    };
    if (!actorKeyIsHex) {
      userLogger.warn(
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
      userLogger.warn(
        "[nostr] Cannot fetch watch history because relay pool is unavailable. Returning cached values.",
      );
      return {
        pointerEvent: existingEntry?.pointerEvent || null,
        items: existingEntry?.items || [],
        snapshotId: existingEntry?.snapshotId || "",
      };
    }
    const identifiers = [
      WATCH_HISTORY_LIST_IDENTIFIER,
      ...WATCH_HISTORY_LEGACY_LIST_IDENTIFIERS,
    ];
    const limitRaw = Number(WATCH_HISTORY_FETCH_EVENT_LIMIT);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 20;
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
      const filters = [
        {
          kinds: [WATCH_HISTORY_KIND],
          authors: [actorKey],
          "#d": identifiers,
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
    const pointerEvent = pointerEvents.reduce((latest, current) => {
      if (!current || typeof current !== "object") {
        return latest;
      }
      const currentCreated = Number.isFinite(current.created_at)
        ? current.created_at
        : 0;
      const latestCreated = Number.isFinite(latest?.created_at)
        ? latest.created_at
        : 0;
      if (currentCreated > latestCreated) {
        return current;
      }
      return latest;
    }, null);
    if (!pointerEvent) {
      devLogger.info(
        "[nostr] No watch history pointer event found on relays. Falling back to storage.",
        {
          actor: resolvedActor,
        },
      );
      return await loadFromStorage();
    }
    const fallbackItems = extractPointerItemsFromEvent(pointerEvent);
    const pointerPayload = parseWatchHistoryContentWithFallback(
      pointerEvent.content,
      fallbackItems,
      {
        version: 0,
        items: fallbackItems,
        snapshot: "",
        chunkIndex: 0,
        totalChunks: 1,
      },
    );
    const snapshotId = (() => {
      const tags = Array.isArray(pointerEvent.tags) ? pointerEvent.tags : [];
      for (const tag of tags) {
        if (Array.isArray(tag) && tag[0] === "snapshot" && typeof tag[1] === "string") {
          return tag[1];
        }
      }
      return pointerPayload.snapshot || "";
    })();
    const chunkAddresses = (() => {
      const tags = Array.isArray(pointerEvent.tags) ? pointerEvent.tags : [];
      const addresses = [];
      for (const tag of tags) {
        if (Array.isArray(tag) && tag[0] === "a" && typeof tag[1] === "string" && tag[1]) {
          addresses.push(tag[1]);
        }
      }
      return addresses;
    })();
    const chunkIdentifiers = [];
    for (const address of chunkAddresses) {
      const parts = address.split(":");
      if (parts.length >= 3) {
        const identifier = parts.slice(2).join(":");
        if (identifier) {
          chunkIdentifiers.push(identifier);
        }
      }
    }
    const chunkFilters = [];
    if (chunkIdentifiers.length) {
      chunkFilters.push({
        kinds: [WATCH_HISTORY_KIND],
        authors: [actorKey],
        "#d": chunkIdentifiers,
        limit: Math.max(chunkIdentifiers.length * 2, limit),
      });
    } else if (snapshotId) {
      chunkFilters.push({
        kinds: [WATCH_HISTORY_KIND],
        authors: [actorKey],
        "#snapshot": [snapshotId],
        limit,
      });
    }
    let chunkEvents = [];
    if (chunkFilters.length) {
      try {
        const chunkResults = await pool.list(readRelays, chunkFilters);
        chunkEvents = Array.isArray(chunkResults)
          ? chunkResults
              .flat()
              .filter((event) => event && typeof event === "object")
          : [];
      } catch (error) {
        devLogger.warn("[nostr] Failed to fetch watch history chunks:", error);
      }
    }
    const latestChunks = new Map();
    for (const event of chunkEvents) {
      const identifier = (() => {
        const tags = Array.isArray(event.tags) ? event.tags : [];
        for (const tag of tags) {
          if (Array.isArray(tag) && tag[0] === "d" && typeof tag[1] === "string") {
            return tag[1];
          }
        }
        return null;
      })();
      if (!identifier) {
        continue;
      }
      const existing = latestChunks.get(identifier);
      const createdAt = Number.isFinite(event?.created_at) ? event.created_at : 0;
      const existingCreated = Number.isFinite(existing?.created_at) ? existing.created_at : 0;
      if (!existing || createdAt > existingCreated) {
        latestChunks.set(identifier, event);
      }
    }
    const decryptErrors = [];
    const collectedItems = [];
    const ensureDecryptTools = async () => {
      const tools = await ensureNostrTools();
      if (tools?.nip04 && typeof tools.nip04.decrypt === "function") {
        devLogger.info("[nostr] Loaded nostr-tools nip04 helpers for watch history decryption.");
        return tools;
      }
      userLogger.warn(
        "[nostr] Unable to load nostr-tools nip04 helpers for watch history decryption.",
      );
      return null;
    };
    const decryptChunk = async (ciphertext, context = {}) => {
      if (decryptSigner) {
        devLogger.info("[nostr] Using active signer to decrypt watch history chunk.", {
          actorKey,
          chunkIdentifier: context.chunkIdentifier ?? null,
          eventId: context.eventId ?? null,
        });
        const plaintext = await decryptSigner.nip04Decrypt(actorKey, ciphertext);
        devLogger.info("[nostr] Successfully decrypted watch history chunk via active signer.", {
          actorKey,
          chunkIdentifier: context.chunkIdentifier ?? null,
          eventId: context.eventId ?? null,
        });
        return plaintext;
      }
      const session = this.deps.getSessionActor?.();
      if (!session || session.pubkey !== actorKey) {
        devLogger.info(
          "[nostr] Session actor mismatch while decrypting watch history chunk. Ensuring session actor matches requested key.",
        );
        const ensured = await this.deps.ensureSessionActor?.();
        if (normalizeActorKey(ensured) !== actorKey) {
          throw new Error("session-actor-mismatch");
        }
      }
      const refreshedSession = this.deps.getSessionActor?.();
      if (!refreshedSession || refreshedSession.pubkey !== actorKey) {
        throw new Error("session-actor-missing");
      }
      const tools = await ensureDecryptTools();
      if (!tools?.nip04 || typeof tools.nip04.decrypt !== "function") {
        userLogger.warn(
          "[nostr] Unable to decrypt watch history chunk because nip04 helpers are unavailable.",
          {
            actorKey,
            chunkIdentifier: context.chunkIdentifier ?? null,
            eventId: context.eventId ?? null,
          },
        );
        throw new Error("nip04-unavailable");
      }
      devLogger.info(
        "[nostr] Using session actor private key to decrypt watch history chunk.",
        {
          actorKey,
          chunkIdentifier: context.chunkIdentifier ?? null,
          eventId: context.eventId ?? null,
          sessionActor: refreshedSession.pubkey ?? null,
        },
      );
      const plaintext = await tools.nip04.decrypt(
        refreshedSession.privateKey,
        actorKey,
        ciphertext,
      );
      devLogger.info("[nostr] Successfully decrypted watch history chunk via session actor key.", {
        actorKey,
        chunkIdentifier: context.chunkIdentifier ?? null,
        eventId: context.eventId ?? null,
      });
      return plaintext;
    };
    const chunkCount = latestChunks.size || chunkIdentifiers.length || 0;
    const chunkKeys = chunkIdentifiers.length
      ? chunkIdentifiers
      : Array.from(latestChunks.keys());
    for (const identifier of chunkKeys) {
      const event = latestChunks.get(identifier);
      if (!event) {
        continue;
      }
      const fallbackPointers = extractPointerItemsFromEvent(event);
      const ciphertext = typeof event.content === "string" ? event.content : "";
      const ciphertextPreview = ciphertext.slice(0, 32);
      let payload;
      const chunkContext = {
        chunkIdentifier: identifier,
        eventId: event.id ?? null,
      };
      if (isNip04EncryptedWatchHistoryEvent(event, ciphertext)) {
        devLogger.info("[nostr] Watch history chunk is marked as NIP-04 encrypted. Beginning decrypt flow.", {
          actorKey,
          ...chunkContext,
        });
        try {
          const plaintext = await decryptChunk(ciphertext, chunkContext);
          devLogger.info("[nostr] Decrypted watch history chunk. Parsing plaintext payload.", {
            actorKey,
            ...chunkContext,
            plaintextPreview: typeof plaintext === "string" ? plaintext.slice(0, 64) : null,
            expectedPlaintextFormat:
              "JSON string with { version, items, snapshot, chunkIndex, totalChunks }",
          });
          payload = parseWatchHistoryContentWithFallback(
            plaintext,
            fallbackPointers,
            {
              version: 0,
              items: fallbackPointers,
              snapshot: snapshotId,
              chunkIndex: 0,
              totalChunks: chunkCount || 1,
            },
          );
        } catch (error) {
          decryptErrors.push(error);
          userLogger.error(
            "[nostr] Decrypt failed for watch history chunk. Falling back to pointer items.",
            {
              actorKey,
              ...chunkContext,
              error: error?.message || error,
              ciphertextPreview,
              fallbackPointerCount: Array.isArray(fallbackPointers)
                ? fallbackPointers.length
                : 0,
              expectedPlaintextFormat:
                "JSON string with { version, items, snapshot, chunkIndex, totalChunks }",
            },
          );
          payload = {
            version: 0,
            items: fallbackPointers,
          };
        }
      } else {
        devLogger.info("[nostr] Watch history chunk is plaintext. Attempting to parse expected payload format.", {
          actorKey,
          ...chunkContext,
          ciphertextPreview,
          expectedPlaintextFormat:
            "JSON string with { version, items, snapshot, chunkIndex, totalChunks }",
        });
        payload = parseWatchHistoryContentWithFallback(
          ciphertext,
          fallbackPointers,
          {
            version: 0,
            items: fallbackPointers,
            snapshot: snapshotId,
            chunkIndex: 0,
            totalChunks: chunkCount || 1,
          },
        );
      }
      if (Array.isArray(payload?.items)) {
        collectedItems.push(...payload.items);
      }
    }
    if (decryptErrors.length) {
      userLogger.warn(
        `[nostr] Failed to decrypt ${decryptErrors.length} watch history chunk(s) for ${actorKey}. Using fallback pointers.`,
      );
    }
    const mergedItems = collectedItems.length ? collectedItems : pointerPayload.items;
    const canonicalItems = canonicalizeWatchHistoryItems(
      mergedItems,
      WATCH_HISTORY_MAX_ITEMS,
    );
    const fingerprint = await this.getFingerprint(
      resolvedActor,
      canonicalItems,
    );
    const metadata = sanitizeWatchHistoryMetadata(
      this.getStorage().actors?.[actorKey]?.metadata,
    );
    metadata.lastFetchedAt = now;
    metadata.decryptErrors = decryptErrors.length;
    const entry = {
      actor: resolvedActor,
      items: canonicalItems,
      snapshotId,
      pointerEvent,
      chunkEvents: Array.from(latestChunks.values()),
      savedAt: now,
      fingerprint,
      metadata,
    };
    this.cache.set(actorKey, entry);
    this.persistEntry(actorKey, entry);
    return { pointerEvent, items: canonicalItems, snapshotId };
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
    const fallbackItems = Array.isArray(storage.actors?.[actorKey]?.items)
      ? canonicalizeWatchHistoryItems(
          storage.actors[actorKey].items,
          WATCH_HISTORY_MAX_ITEMS,
        )
      : [];
    const fetchResult = await this.fetch(resolvedActor, {
      forceRefresh: options.forceRefresh || false,
    });
    const merged = mergeWatchHistoryItemsWithFallback(
      {
        version: 2,
        items: fetchResult.items || [],
        snapshot: fetchResult.snapshotId || "",
        chunkIndex: 0,
        totalChunks: Array.isArray(fetchResult.items)
          ? fetchResult.items.length
          : 0,
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
    const canonicalItems = canonicalizeWatchHistoryItems(
      merged.items || [],
      batchLimit,
    );
    const fingerprint = await this.getFingerprint(
      resolvedActor,
      canonicalItems,
    );
    devLogger.info("[nostr] Watch history fetch complete.", {
      actor: resolvedActor,
      snapshotId: fetchResult.snapshotId || null,
      pointerFound: !!fetchResult.pointerEvent,
      itemCount: canonicalItems.length,
    });
    devLogger.info("[nostr] Watch history resolved and cached.", {
      actor: resolvedActor,
      itemCount: canonicalItems.length,
      snapshotId: fetchResult.snapshotId || null,
    });
    const entry = {
      actor: resolvedActor,
      items: canonicalItems,
      snapshotId: fetchResult.snapshotId || storage.actors?.[actorKey]?.snapshotId || "",
      pointerEvent: fetchResult.pointerEvent || null,
      chunkEvents: [],
      savedAt: Date.now(),
      fingerprint,
      metadata: sanitizeWatchHistoryMetadata(storage.actors?.[actorKey]?.metadata),
    };
    this.cache.set(actorKey, entry);
    this.persistEntry(actorKey, entry);
    return canonicalItems;
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

export function cancelWatchHistoryRepublish(manager, snapshotId = null) {
  return manager.cancelRepublish(snapshotId);
}

export function scheduleWatchHistoryRepublish(
  manager,
  snapshotId,
  operation,
  options = {},
) {
  return manager.scheduleRepublish(snapshotId, operation, options);
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

