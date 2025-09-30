// js/nostr.js

import {
  isDevMode,
  WATCH_HISTORY_KIND,
  WATCH_HISTORY_LIST_IDENTIFIER,
  WATCH_HISTORY_MAX_ITEMS,
  WATCH_HISTORY_BATCH_RESOLVE,
} from "./config.js";
import { ACCEPT_LEGACY_V1 } from "./constants.js";
import { accessControl } from "./accessControl.js";
// 🔧 merged conflicting changes from codex/update-video-publishing-and-parsing-logic vs unstable
import { deriveTitleFromEvent, magnetFromText } from "./videoEventUtils.js";
import { extractMagnetHints } from "./magnet.js";

/**
 * The usual relays
 */
const RELAY_URLS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
];

const EVENTS_CACHE_STORAGE_KEY = "bitvid:eventsCache:v1";
const LEGACY_EVENTS_STORAGE_KEY = "bitvidEvents";
const EVENTS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const NIP07_LOGIN_TIMEOUT_MS = 15_000; // 15 seconds
const SESSION_ACTOR_STORAGE_KEY = "bitvid:sessionActor:v1";
const WATCH_HISTORY_CACHE_STORAGE_KEY = "bitvid:watchHistoryCache:v1";
const WATCH_HISTORY_CACHE_TTL_MS = EVENTS_CACHE_TTL_MS;

// To limit error spam
let errorLogCount = 0;
const MAX_ERROR_LOGS = 100;
function logErrorOnce(message, eventContent = null) {
  if (errorLogCount < MAX_ERROR_LOGS) {
    console.error(message);
    if (eventContent) {
      console.log(`Event Content: ${eventContent}`);
    }
    errorLogCount++;
  }
  if (errorLogCount === MAX_ERROR_LOGS) {
    console.error(
      "Maximum error log limit reached. Further errors will be suppressed."
    );
  }
}

function pointerKey(pointer) {
  if (!pointer || typeof pointer !== "object") {
    return "";
  }

  const type = pointer.type === "a" ? "a" : "e";
  const value =
    typeof pointer.value === "string" ? pointer.value.trim().toLowerCase() : "";

  if (!value) {
    return "";
  }

  return `${type}:${value}`;
}

function clonePointerItem(pointer) {
  if (!pointer || typeof pointer !== "object") {
    return null;
  }

  const type = pointer.type === "a" ? "a" : "e";
  const value = typeof pointer.value === "string" ? pointer.value.trim() : "";
  if (!value) {
    return null;
  }

  const relay =
    typeof pointer.relay === "string" && pointer.relay.trim()
      ? pointer.relay.trim()
      : null;

  return { type, value, relay };
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

function normalizePointerInput(pointer) {
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
      const decoder = window?.NostrTools?.nip19?.decode;
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
    } catch (err) {
      if (isDevMode) {
        console.warn(`[nostr] Failed to decode pointer ${trimmed}:`, err);
      }
    }
  }

  const type = trimmed.includes(":") ? "a" : "e";
  return { type, value: trimmed, relay: null };
}

function pointerToTag(pointer) {
  const normalized = clonePointerItem(pointer);
  if (!normalized) {
    return null;
  }

  const tag = [normalized.type, normalized.value];
  if (normalized.relay) {
    tag.push(normalized.relay);
  }
  return tag;
}

function extractPointerItemsFromEvent(event) {
  if (!event || typeof event !== "object") {
    return [];
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  const seen = new Set();
  const items = [];

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

function eventToAddressPointer(event) {
  if (!event || typeof event !== "object") {
    return "";
  }

  const kind = typeof event.kind === "number" ? event.kind : null;
  const pubkey = typeof event.pubkey === "string" ? event.pubkey : "";
  if (!kind || !pubkey) {
    return "";
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === "d" && typeof tag[1] === "string") {
      return `${kind}:${pubkey}:${tag[1]}`;
    }
  }

  return "";
}

function signEventWithPrivateKey(event, privateKey) {
  if (
    !privateKey ||
    typeof privateKey !== "string" ||
    !window?.NostrTools?.getEventHash ||
    typeof window.NostrTools.signEvent !== "function"
  ) {
    throw new Error("Missing signing primitives");
  }

  const tags = Array.isArray(event.tags)
    ? event.tags.map((tag) => (Array.isArray(tag) ? [...tag] : tag))
    : [];

  const prepared = {
    kind: event.kind,
    pubkey: event.pubkey,
    created_at: event.created_at,
    tags,
    content: typeof event.content === "string" ? event.content : "",
  };

  const id = window.NostrTools.getEventHash(prepared);
  const sig = window.NostrTools.signEvent(prepared, privateKey);

  return { ...prepared, id, sig };
}

function cloneEventForCache(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const cloned = { ...event };
  if (Array.isArray(event.tags)) {
    cloned.tags = event.tags.map((tag) =>
      Array.isArray(tag) ? [...tag] : tag
    );
  }

  return cloned;
}

/**
 * Example "encryption" that just reverses strings.
 * In real usage, replace with actual crypto.
 */
function fakeEncrypt(magnet) {
  return magnet.split("").reverse().join("");
}
function fakeDecrypt(encrypted) {
  return encrypted.split("").reverse().join("");
}

function decodeNpubToHex(npub) {
  if (typeof npub !== "string" || !npub.trim()) {
    return "";
  }

  if (
    !window?.NostrTools?.nip19 ||
    typeof window.NostrTools.nip19.decode !== "function"
  ) {
    return "";
  }

  try {
    const decoded = window.NostrTools.nip19.decode(npub.trim());
    if (decoded?.type === "npub" && typeof decoded.data === "string") {
      return decoded.data;
    }
  } catch (error) {
    if (isDevMode) {
      console.warn(`[nostr] Failed to decode npub: ${npub}`, error);
    }
  }
  return "";
}

const DM_PUBLISH_TIMEOUT_MS = 10_000;

function publishEventToRelay(pool, url, event) {
  return new Promise((resolve) => {
    let settled = false;
    const finalize = (success, error = null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ url, success, error });
    };

    const timeoutId = setTimeout(() => {
      finalize(false, new Error("publish timeout"));
    }, DM_PUBLISH_TIMEOUT_MS);

    try {
      const pub = pool.publish([url], event);

      if (pub && typeof pub.on === "function") {
        pub.on("ok", () => {
          clearTimeout(timeoutId);
          finalize(true);
        });
        pub.on("seen", () => {
          clearTimeout(timeoutId);
          finalize(true);
        });
        pub.on("failed", (reason) => {
          clearTimeout(timeoutId);
          const err =
            reason instanceof Error
              ? reason
              : new Error(String(reason || "publish failed"));
          finalize(false, err);
        });
        return;
      }

      if (pub && typeof pub.then === "function") {
        pub
          .then(() => {
            clearTimeout(timeoutId);
            finalize(true);
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            finalize(false, error);
          });
        return;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      finalize(false, error);
      return;
    }

    clearTimeout(timeoutId);
    finalize(true);
  });
}

const EXTENSION_MIME_MAP = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  ogv: "video/ogg",
  ogg: "video/ogg",
  m3u8: "application/x-mpegURL",
  mpd: "application/dash+xml",
  ts: "video/mp2t",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  flv: "video/x-flv",
  "3gp": "video/3gpp",
};

function inferMimeTypeFromUrl(url) {
  if (!url || typeof url !== "string") {
    return "";
  }

  let pathname = "";
  try {
    const parsed = new URL(url);
    pathname = parsed.pathname || "";
  } catch (err) {
    const sanitized = url.split("?")[0].split("#")[0];
    pathname = sanitized || "";
  }

  const lastSegment = pathname.split("/").pop() || "";
  const match = lastSegment.match(/\.([a-z0-9]+)$/i);
  if (!match) {
    return "";
  }

  const extension = match[1].toLowerCase();
  return EXTENSION_MIME_MAP[extension] || "";
}

/**
 * Convert a raw Nostr event into Bitvid's canonical "video" object.
 *
 * The converter intentionally centralises all of the quirky legacy handling so
 * that feed rendering, subscriptions, and deep links rely on the exact same
 * rules. Any future regression around magnet-only posts or malformed JSON
 * should be solved by updating this function (and its tests) instead of
 * sprinkling ad-hoc checks elsewhere in the UI.
 *
 * Also accepts legacy (<v2) payloads when ACCEPT_LEGACY_V1 allows it.
 */
function convertEventToVideo(event = {}) {
  const safeTrim = (value) => (typeof value === "string" ? value.trim() : "");

  const rawContent = typeof event.content === "string" ? event.content : "";
  const tags = Array.isArray(event.tags) ? event.tags : [];

  let parsedContent = {};
  let parseError = null;
  if (rawContent) {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === "object") {
        parsedContent = parsed;
      }
    } catch (err) {
      parseError = err;
      parsedContent = {};
    }
  }

  const directUrl = safeTrim(parsedContent.url);
  const directMagnetRaw = safeTrim(parsedContent.magnet);

  const normalizeMagnetCandidate = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed.toLowerCase().startsWith("magnet:?")) {
      return trimmed;
    }
    const extracted = magnetFromText(trimmed);
    return extracted ? extracted.trim() : "";
  };

  let magnet = normalizeMagnetCandidate(directMagnetRaw);
  let rawMagnet = magnet ? directMagnetRaw : "";

  if (!magnet && ACCEPT_LEGACY_V1) {
    const inlineMagnet = normalizeMagnetCandidate(rawContent);
    if (inlineMagnet) {
      magnet = inlineMagnet;
    }

    if (!magnet) {
      outer: for (const tag of tags) {
        if (!Array.isArray(tag) || tag.length < 2) {
          continue;
        }

        const key =
          typeof tag[0] === "string" ? tag[0].trim().toLowerCase() : "";

        const startIndex = key === "magnet" ? 1 : 0;
        for (let i = startIndex; i < tag.length; i += 1) {
          const candidate = normalizeMagnetCandidate(tag[i]);
          if (candidate) {
            magnet = candidate;
            break outer;
          }
        }
      }
    }

    if (!magnet) {
      const recoveredFromRaw = magnetFromText(rawContent);
      if (recoveredFromRaw) {
        magnet = safeTrim(recoveredFromRaw);
      }
    }
  }

  if (!rawMagnet && magnet) {
    rawMagnet = magnet;
  }

  const url = directUrl;

  if (!url && !magnet) {
    return { id: event.id, invalid: true, reason: "missing playable source" };
  }

  const thumbnail = safeTrim(parsedContent.thumbnail);
  const description = safeTrim(parsedContent.description);
  const rawMode = safeTrim(parsedContent.mode);
  const mode = rawMode || "live";
  const deleted = parsedContent.deleted === true;
  const isPrivate = parsedContent.isPrivate === true;
  const videoRootId = safeTrim(parsedContent.videoRootId) || event.id;
  const wsField = safeTrim(parsedContent.ws);
  const xsField = safeTrim(parsedContent.xs);
  const enableComments =
    parsedContent.enableComments === false ? false : true;

  let infoHash = "";
  const pushInfoHash = (candidate) => {
    if (typeof candidate !== "string") {
      return false;
    }
    const normalized = candidate.trim().toLowerCase();
    if (/^[0-9a-f]{40}$/.test(normalized)) {
      infoHash = normalized;
      return true;
    }
    return false;
  };

  pushInfoHash(parsedContent.infoHash);

  if (!infoHash && magnet) {
    const match = magnet.match(/xt=urn:btih:([0-9a-z]+)/i);
    if (match && match[1]) {
      pushInfoHash(match[1]);
    }
  }

  const searchInfoHashInString = (value) => {
    if (infoHash || typeof value !== "string") {
      return;
    }
    const match = value.match(/[0-9a-f]{40}/i);
    if (match && match[0]) {
      pushInfoHash(match[0]);
    }
  };

  if (!infoHash && ACCEPT_LEGACY_V1) {
    searchInfoHashInString(rawContent);
    for (const tag of tags) {
      if (infoHash) {
        break;
      }
      if (!Array.isArray(tag)) {
        continue;
      }
      for (let i = 0; i < tag.length; i += 1) {
        searchInfoHashInString(tag[i]);
        if (infoHash) {
          break;
        }
      }
    }
  }

  const declaredTitle = safeTrim(parsedContent.title);
  const derivedTitle = deriveTitleFromEvent({
    parsedContent,
    tags,
    primaryTitle: declaredTitle,
  });

  let title = safeTrim(derivedTitle);
  if (!title && ACCEPT_LEGACY_V1 && (magnet || infoHash)) {
    title = infoHash
      ? `Legacy Video ${infoHash.slice(0, 8)}`
      : "Legacy BitTorrent Video";
  }

  if (!title) {
    const reason = parseError
      ? "missing title (json parse error)"
      : "missing title";
    return { id: event.id, invalid: true, reason };
  }

  const rawVersion = parsedContent.version;
  let version = rawVersion === undefined ? 2 : Number(rawVersion);
  if (!Number.isFinite(version)) {
    version = rawVersion === undefined ? 2 : 1;
  }

  if (version < 2 && !ACCEPT_LEGACY_V1) {
    return {
      id: event.id,
      invalid: true,
      reason: `unsupported version ${version}`,
    };
  }

  const magnetHints = magnet
    ? extractMagnetHints(magnet)
    : { ws: "", xs: "" };
  const ws = wsField || magnetHints.ws || "";
  const xs = xsField || magnetHints.xs || "";

  return {
    id: event.id,
    videoRootId,
    version,
    isPrivate,
    title,
    url,
    magnet,
    rawMagnet,
    infoHash,
    thumbnail,
    description,
    mode,
    deleted,
    ws,
    xs,
    enableComments,
    pubkey: event.pubkey,
    created_at: event.created_at,
    tags,
    invalid: false,
  };
}

/**
 * If the video has videoRootId => use that as the “group key”.
 * Otherwise fallback to (pubkey + dTag), or if no dTag => “LEGACY:id”
 */
function getActiveKey(video) {
  if (video.videoRootId) {
    return `ROOT:${video.videoRootId}`;
  }
  const dTag = video.tags?.find((t) => t[0] === "d");
  if (dTag) {
    return `${video.pubkey}:${dTag[1]}`;
  }
  return `LEGACY:${video.id}`;
}

export { convertEventToVideo };

class NostrClient {
  constructor() {
    this.pool = null;
    this.pubkey = null;
    this.relays = RELAY_URLS;

    // Store all events so older links still work
    this.allEvents = new Map();

    // “activeMap” holds only the newest version for each root
    this.activeMap = new Map();

    this.hasRestoredLocalData = false;

    this.sessionActor = null;
    this.watchHistoryCache = new Map();
    this.watchHistoryStorage = null;
  }

  restoreLocalData() {
    if (this.hasRestoredLocalData) {
      return this.allEvents.size > 0;
    }

    this.hasRestoredLocalData = true;

    if (typeof localStorage === "undefined") {
      return false;
    }

    const now = Date.now();
    const parsePayload = (raw) => {
      if (!raw) {
        return null;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch (err) {
        if (isDevMode) {
          console.warn("[nostr] Failed to parse cached events:", err);
        }
      }
      return null;
    };

    let payload = parsePayload(localStorage.getItem(EVENTS_CACHE_STORAGE_KEY));

    if (!payload) {
      const legacyRaw = localStorage.getItem(LEGACY_EVENTS_STORAGE_KEY);
      const legacyParsed = parsePayload(legacyRaw);
      if (legacyParsed) {
        payload = {
          version: 1,
          savedAt: now,
          events: legacyParsed,
        };
      }
      if (legacyRaw) {
        try {
          localStorage.removeItem(LEGACY_EVENTS_STORAGE_KEY);
        } catch (err) {
          if (isDevMode) {
            console.warn("[nostr] Failed to remove legacy cache:", err);
          }
        }
      }
    }

    if (!payload || payload.version !== 1) {
      return false;
    }

    if (
      typeof payload.savedAt !== "number" ||
      payload.savedAt <= 0 ||
      now - payload.savedAt > EVENTS_CACHE_TTL_MS
    ) {
      try {
        localStorage.removeItem(EVENTS_CACHE_STORAGE_KEY);
      } catch (err) {
        if (isDevMode) {
          console.warn("[nostr] Failed to clear expired cache:", err);
        }
      }
      return false;
    }

    const events = payload.events;
    if (!events || typeof events !== "object") {
      return false;
    }

    this.allEvents.clear();
    this.activeMap.clear();

    for (const [id, video] of Object.entries(events)) {
      if (!id || !video || typeof video !== "object") {
        continue;
      }

      this.allEvents.set(id, video);
      if (video.deleted) {
        continue;
      }

      const activeKey = getActiveKey(video);
      const existing = this.activeMap.get(activeKey);
      if (!existing || video.created_at > existing.created_at) {
        this.activeMap.set(activeKey, video);
      }
    }

    return this.allEvents.size > 0;
  }

  /**
   * Load watch history cache payload from localStorage.
   */
  getWatchHistoryStorage() {
    if (this.watchHistoryStorage) {
      return this.watchHistoryStorage;
    }

    const base = { version: 1, actors: {} };

    if (typeof localStorage === "undefined") {
      this.watchHistoryStorage = base;
      return this.watchHistoryStorage;
    }

    let parsed = base;
    try {
      const raw = localStorage.getItem(WATCH_HISTORY_CACHE_STORAGE_KEY);
      if (raw) {
        const candidate = JSON.parse(raw);
        if (
          candidate &&
          typeof candidate === "object" &&
          candidate.version === 1 &&
          candidate.actors &&
          typeof candidate.actors === "object"
        ) {
          parsed = { version: 1, actors: candidate.actors };
        }
      }
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to parse watch history cache:", error);
      }
    }

    const now = Date.now();
    let mutated = false;
    for (const [actor, info] of Object.entries(parsed.actors || {})) {
      if (
        !info ||
        typeof info !== "object" ||
        typeof info.savedAt !== "number" ||
        now - info.savedAt > WATCH_HISTORY_CACHE_TTL_MS
      ) {
        delete parsed.actors[actor];
        mutated = true;
      }
    }

    const actors = { ...(parsed.actors || {}) };
    this.watchHistoryStorage = { version: 1, actors };

    if (mutated) {
      try {
        localStorage.setItem(
          WATCH_HISTORY_CACHE_STORAGE_KEY,
          JSON.stringify(this.watchHistoryStorage)
        );
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[nostr] Failed to persist cleaned watch history cache:",
            error
          );
        }
      }
    }

    return this.watchHistoryStorage;
  }

  createWatchHistoryEntry(pointerEvent, items, savedAt, previousEntry = null) {
    const normalizedItems = [];
    const seen = new Set();

    if (Array.isArray(items)) {
      for (const raw of items) {
        const pointer = normalizePointerInput(raw);
        if (!pointer) {
          continue;
        }
        const key = pointerKey(pointer);
        if (!key || seen.has(key)) {
          continue;
        }
        seen.add(key);
        normalizedItems.push(pointer);
      }
    }

    const entry = {
      pointerEvent: pointerEvent ? cloneEventForCache(pointerEvent) : null,
      items: normalizedItems,
      savedAt: typeof savedAt === "number" ? savedAt : Date.now(),
      resolved: previousEntry?.resolved
        ? new Map(previousEntry.resolved)
        : new Map(),
      resolving: previousEntry?.resolving
        ? new Set(previousEntry.resolving)
        : new Set(),
    };

    const validKeys = new Set(entry.items.map((item) => pointerKey(item)));
    for (const key of entry.resolved.keys()) {
      if (!validKeys.has(key)) {
        entry.resolved.delete(key);
      }
    }
    for (const key of [...entry.resolving]) {
      if (!validKeys.has(key)) {
        entry.resolving.delete(key);
      }
    }

    return entry;
  }

  persistWatchHistoryEntry(actor, entry) {
    if (typeof localStorage === "undefined" || !actor) {
      return;
    }

    const storage = this.getWatchHistoryStorage();
    storage.actors[actor] = {
      pointerEvent: entry.pointerEvent ? cloneEventForCache(entry.pointerEvent) : null,
      items: entry.items.map((item) => ({
        type: item.type,
        value: item.value,
        relay: item.relay || null,
      })),
      savedAt: entry.savedAt,
    };

    try {
      localStorage.setItem(
        WATCH_HISTORY_CACHE_STORAGE_KEY,
        JSON.stringify(storage)
      );
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to persist watch history cache:", error);
      }
    }
  }

  async ensureSessionActor(forceSession = false) {
    const loggedInPubkey =
      typeof this.pubkey === "string" && this.pubkey.trim()
        ? this.pubkey.trim()
        : "";

    if (!forceSession && loggedInPubkey) {
      return loggedInPubkey;
    }

    if (
      this.sessionActor &&
      typeof this.sessionActor.pubkey === "string" &&
      this.sessionActor.pubkey
    ) {
      return this.sessionActor.pubkey;
    }

    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(SESSION_ACTOR_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            typeof parsed === "object" &&
            typeof parsed.pubkey === "string" &&
            parsed.pubkey &&
            typeof parsed.privkey === "string" &&
            parsed.privkey
          ) {
            this.sessionActor = {
              pubkey: parsed.pubkey,
              privateKey: parsed.privkey,
            };
            return this.sessionActor.pubkey;
          }
        }
      } catch (error) {
        if (isDevMode) {
          console.warn("[nostr] Failed to restore session actor:", error);
        }
      }
    }

    if (
      !window?.NostrTools?.generatePrivateKey ||
      typeof window.NostrTools.getPublicKey !== "function"
    ) {
      if (isDevMode) {
        console.warn(
          "[nostr] Unable to generate session actor: missing NostrTools helpers."
        );
      }
      return "";
    }

    const privateKey = window.NostrTools.generatePrivateKey();
    const pubkey = window.NostrTools.getPublicKey(privateKey);

    this.sessionActor = { pubkey, privateKey };

    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(
          SESSION_ACTOR_STORAGE_KEY,
          JSON.stringify({ pubkey, privkey: privateKey, savedAt: Date.now() })
        );
      } catch (error) {
        if (isDevMode) {
          console.warn("[nostr] Failed to persist session actor:", error);
        }
      }
    }

    return pubkey;
  }

  async publishViewEvent(videoPointer, options = {}) {
    if (!this.pool) {
      return { ok: false, error: "nostr-uninitialized" };
    }

    const pointer = normalizePointerInput(videoPointer);
    if (!pointer) {
      return { ok: false, error: "invalid-pointer" };
    }

    const actorPubkey = await this.ensureSessionActor();
    if (!actorPubkey) {
      return { ok: false, error: "missing-actor" };
    }

    const createdAt =
      typeof options.created_at === "number" && options.created_at > 0
        ? Math.floor(options.created_at)
        : Math.floor(Date.now() / 1000);

    const additionalTags = Array.isArray(options.additionalTags)
      ? options.additionalTags.filter(
          (tag) => Array.isArray(tag) && typeof tag[0] === "string"
        )
      : [];

    const tags = [
      ["t", "view"],
      ["video", pointer.value],
      ...additionalTags,
    ];

    const content =
      typeof options.content === "string" ? options.content : "";

    const event = {
      kind: WATCH_HISTORY_KIND,
      pubkey: actorPubkey,
      created_at: createdAt,
      tags,
      content,
    };

    let signedEvent = null;
    const normalizedActor = actorPubkey.toLowerCase();
    const normalizedLogged =
      typeof this.pubkey === "string" ? this.pubkey.toLowerCase() : "";

    if (
      normalizedActor &&
      normalizedActor === normalizedLogged &&
      window?.nostr &&
      typeof window.nostr.signEvent === "function"
    ) {
      try {
        signedEvent = await window.nostr.signEvent(event);
      } catch (error) {
        console.warn("[nostr] Failed to sign view event with extension:", error);
        return { ok: false, error: "signing-failed", details: error };
      }
    } else {
      try {
        if (!this.sessionActor || this.sessionActor.pubkey !== actorPubkey) {
          await this.ensureSessionActor(true);
        }
        if (!this.sessionActor || this.sessionActor.pubkey !== actorPubkey) {
          throw new Error("session-actor-mismatch");
        }
        const privateKey = this.sessionActor.privateKey;
        signedEvent = signEventWithPrivateKey(event, privateKey);
      } catch (error) {
        console.warn("[nostr] Failed to sign view event with session key:", error);
        return { ok: false, error: "signing-failed", details: error };
      }
    }

    const relayList =
      Array.isArray(options.relays) && options.relays.length
        ? options.relays
        : this.relays;
    const relays =
      Array.isArray(relayList) && relayList.length ? relayList : RELAY_URLS;

    const publishResults = await Promise.all(
      relays.map((url) => publishEventToRelay(this.pool, url, signedEvent))
    );

    const success = publishResults.some((result) => result.success);
    if (!success) {
      console.warn("[nostr] View event rejected by relays:", publishResults);
    }

    return { ok: success, event: signedEvent, results: publishResults };
  }

  async updateWatchHistoryList(pointer) {
    if (!this.pool) {
      return { ok: false, error: "nostr-uninitialized" };
    }

    const normalizedPointer = normalizePointerInput(pointer);
    if (!normalizedPointer) {
      return { ok: false, error: "invalid-pointer" };
    }

    const actorPubkey = await this.ensureSessionActor();
    if (!actorPubkey) {
      return { ok: false, error: "missing-actor" };
    }

    await this.fetchWatchHistory(actorPubkey);

    const existingEntry =
      this.watchHistoryCache.get(actorPubkey) ||
      this.createWatchHistoryEntry(null, [], Date.now());

    const dedupe = new Map();
    const nextItems = [];
    const pushPointer = (item) => {
      const candidate = normalizePointerInput(item);
      if (!candidate) {
        return;
      }
      const key = pointerKey(candidate);
      if (!key || dedupe.has(key)) {
        return;
      }
      dedupe.set(key, true);
      nextItems.push(candidate);
    };

    pushPointer(normalizedPointer);
    for (const item of existingEntry.items) {
      pushPointer(item);
      if (nextItems.length >= WATCH_HISTORY_MAX_ITEMS) {
        break;
      }
    }

    const trimmedItems =
      nextItems.length > WATCH_HISTORY_MAX_ITEMS
        ? nextItems.slice(0, WATCH_HISTORY_MAX_ITEMS)
        : nextItems;

    const tags = [["d", WATCH_HISTORY_LIST_IDENTIFIER]];
    for (const item of trimmedItems) {
      const tag = pointerToTag(item);
      if (tag) {
        tags.push(tag);
      }
    }

    const event = {
      kind: WATCH_HISTORY_KIND,
      pubkey: actorPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: "",
    };

    let signedEvent;
    const normalizedActor = actorPubkey.toLowerCase();
    const normalizedLogged =
      typeof this.pubkey === "string" ? this.pubkey.toLowerCase() : "";

    if (
      normalizedActor &&
      normalizedActor === normalizedLogged &&
      window?.nostr &&
      typeof window.nostr.signEvent === "function"
    ) {
      try {
        signedEvent = await window.nostr.signEvent(event);
      } catch (error) {
        console.warn(
          "[nostr] Failed to sign watch history list with extension:",
          error
        );
        return { ok: false, error: "signing-failed", details: error };
      }
    } else {
      try {
        if (!this.sessionActor || this.sessionActor.pubkey !== actorPubkey) {
          await this.ensureSessionActor(true);
        }
        if (!this.sessionActor || this.sessionActor.pubkey !== actorPubkey) {
          throw new Error("session-actor-mismatch");
        }
        const privateKey = this.sessionActor.privateKey;
        signedEvent = signEventWithPrivateKey(event, privateKey);
      } catch (error) {
        console.warn(
          "[nostr] Failed to sign watch history list with session key:",
          error
        );
        return { ok: false, error: "signing-failed", details: error };
      }
    }

    const relays =
      Array.isArray(this.relays) && this.relays.length ? this.relays : RELAY_URLS;

    const publishResults = await Promise.all(
      relays.map((url) => publishEventToRelay(this.pool, url, signedEvent))
    );
    const success = publishResults.some((result) => result.success);
    if (!success) {
      console.warn(
        "[nostr] Failed to publish watch history list:",
        publishResults
      );
    }

    const newEntry = this.createWatchHistoryEntry(
      signedEvent,
      trimmedItems,
      Date.now(),
      existingEntry
    );

    this.watchHistoryCache.set(actorPubkey, newEntry);
    this.persistWatchHistoryEntry(actorPubkey, newEntry);

    return {
      ok: success,
      event: signedEvent,
      items: newEntry.items.map((item) => clonePointerItem(item)).filter(Boolean),
    };
  }

  async fetchWatchHistory(pubkeyOrSession) {
    let actor =
      typeof pubkeyOrSession === "string" && pubkeyOrSession.trim()
        ? pubkeyOrSession.trim()
        : "";

    if (!actor) {
      actor = await this.ensureSessionActor();
    }

    if (!actor) {
      return { pointerEvent: null, items: [] };
    }

    const now = Date.now();
    const cached = this.watchHistoryCache.get(actor);
    if (cached && now - cached.savedAt < WATCH_HISTORY_CACHE_TTL_MS) {
      return {
        pointerEvent: cached.pointerEvent
          ? cloneEventForCache(cached.pointerEvent)
          : null,
        items: cached.items
          .map((item) => clonePointerItem(item))
          .filter(Boolean),
      };
    }

    if (typeof localStorage !== "undefined") {
      const storage = this.getWatchHistoryStorage();
      const stored = storage.actors?.[actor];
      if (
        stored &&
        typeof stored.savedAt === "number" &&
        now - stored.savedAt < WATCH_HISTORY_CACHE_TTL_MS
      ) {
        const entry = this.createWatchHistoryEntry(
          stored.pointerEvent,
          Array.isArray(stored.items) ? stored.items : [],
          stored.savedAt,
          this.watchHistoryCache.get(actor) || null
        );
        this.watchHistoryCache.set(actor, entry);
        return {
          pointerEvent: entry.pointerEvent
            ? cloneEventForCache(entry.pointerEvent)
            : null,
          items: entry.items
            .map((item) => clonePointerItem(item))
            .filter(Boolean),
        };
      }
    }

    if (!this.pool) {
      const fallbackEntry = this.createWatchHistoryEntry(
        null,
        [],
        Date.now(),
        this.watchHistoryCache.get(actor) || null
      );
      this.watchHistoryCache.set(actor, fallbackEntry);
      return { pointerEvent: null, items: [] };
    }

    const relayList =
      Array.isArray(this.relays) && this.relays.length ? this.relays : RELAY_URLS;

    const filter = {
      kinds: [WATCH_HISTORY_KIND],
      authors: [actor],
      "#d": [WATCH_HISTORY_LIST_IDENTIFIER],
      limit: 1,
    };

    let pointerEvent = null;
    try {
      const perRelay = await Promise.all(
        relayList.map(async (url) => {
          try {
            const evt = await this.pool.get([url], filter);
            return evt || null;
          } catch (err) {
            if (isDevMode) {
              console.warn(
                `[nostr] Failed to fetch watch history from ${url}:`,
                err
              );
            }
            return null;
          }
        })
      );

      const events = perRelay.filter(Boolean);
      if (events.length) {
        pointerEvent = events.reduce((latest, candidate) => {
          if (!latest) {
            return candidate;
          }
          const latestCreated =
            typeof latest.created_at === "number" ? latest.created_at : 0;
          const candidateCreated =
            typeof candidate.created_at === "number" ? candidate.created_at : 0;
          return candidateCreated > latestCreated ? candidate : latest;
        }, null);
      }
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to fetch watch history list:", error);
      }
    }

    const items = pointerEvent ? extractPointerItemsFromEvent(pointerEvent) : [];
    const entry = this.createWatchHistoryEntry(
      pointerEvent,
      items,
      Date.now(),
      this.watchHistoryCache.get(actor) || null
    );

    this.watchHistoryCache.set(actor, entry);
    this.persistWatchHistoryEntry(actor, entry);

    return {
      pointerEvent: entry.pointerEvent
        ? cloneEventForCache(entry.pointerEvent)
        : null,
      items: entry.items
        .map((item) => clonePointerItem(item))
        .filter(Boolean),
    };
  }

  async resolveWatchHistory(batchSize = 20) {
    if (!this.pool) {
      return [];
    }

    const actor = await this.ensureSessionActor();
    if (!actor) {
      return [];
    }

    await this.fetchWatchHistory(actor);
    const entry = this.watchHistoryCache.get(actor);
    if (!entry) {
      return [];
    }

    const parsedBatchSize = Number(batchSize);
    const normalizedBatchSize =
      Number.isFinite(parsedBatchSize) && parsedBatchSize > 0
        ? Math.floor(parsedBatchSize)
        : 20;
    const effectiveBatchSize = WATCH_HISTORY_BATCH_RESOLVE
      ? Math.max(1, normalizedBatchSize)
      : 1;

    const available = entry.items.filter((item) => {
      const key = pointerKey(item);
      if (!key) {
        return false;
      }
      if (entry.resolved.has(key)) {
        return false;
      }
      if (entry.resolving.has(key)) {
        return false;
      }
      return true;
    });

    const batch = available.slice(0, effectiveBatchSize);
    if (!batch.length) {
      return [];
    }

    batch.forEach((item) => entry.resolving.add(pointerKey(item)));

    const relaySet = new Set(
      Array.isArray(this.relays) && this.relays.length ? this.relays : RELAY_URLS
    );
    const filters = [];

    for (const pointer of batch) {
      if (pointer.relay) {
        relaySet.add(pointer.relay);
      }
      if (pointer.type === "e") {
        filters.push({ ids: [pointer.value] });
      } else if (pointer.type === "a") {
        const [kindStr, pubkey, identifier] = pointer.value.split(":");
        const kind = Number(kindStr);
        if (Number.isFinite(kind) && pubkey) {
          const filter = { kinds: [kind], authors: [pubkey] };
          if (identifier) {
            filter["#d"] = [identifier];
          }
          filters.push(filter);
        }
      }
    }

    if (!filters.length) {
      batch.forEach((item) => entry.resolving.delete(pointerKey(item)));
      return [];
    }

    let events = [];
    try {
      events = await this.pool.list(Array.from(relaySet), filters);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to resolve watch history batch:", error);
      }
    }

    const resolvedVideos = [];
    const pointerMatches = new Map();

    for (const evt of events || []) {
      if (!evt || typeof evt !== "object") {
        continue;
      }
      if (typeof evt.id === "string" && evt.id) {
        pointerMatches.set(
          pointerKey({ type: "e", value: evt.id }),
          evt
        );
      }
      const addressPointer = eventToAddressPointer(evt);
      if (addressPointer) {
        pointerMatches.set(
          pointerKey({ type: "a", value: addressPointer }),
          evt
        );
      }
    }

    for (const pointer of batch) {
      const key = pointerKey(pointer);
      const event = pointerMatches.get(key);
      if (event) {
        try {
          const video = convertEventToVideo(event);
          if (!video.invalid) {
            this.allEvents.set(event.id, video);
            if (!video.deleted) {
              const activeKey = getActiveKey(video);
              const existing = this.activeMap.get(activeKey);
              if (!existing || video.created_at > existing.created_at) {
                this.activeMap.set(activeKey, video);
              }
            }
            entry.resolved.set(key, video);
            resolvedVideos.push(video);
          }
        } catch (err) {
          if (isDevMode) {
            console.warn("[nostr] Failed to convert watch history event:", err);
          }
        }
      }
      entry.resolving.delete(key);
    }

    return resolvedVideos;
  }

  async recordVideoView(videoPointer, options = {}) {
    const pointer = normalizePointerInput(videoPointer);
    if (!pointer) {
      return {
        ok: false,
        error: "invalid-pointer",
        view: { ok: false, error: "invalid-pointer" },
        history: { ok: false, error: "invalid-pointer" },
      };
    }

    const view = await this.publishViewEvent(pointer, options);
    const history = await this.updateWatchHistoryList(pointer);

    return {
      ok: view.ok && history.ok,
      view,
      history,
    };
  }

  /**
   * Connect to the configured relays
   */
  async init() {
    if (isDevMode) console.log("Connecting to relays...");

    this.restoreLocalData();

    try {
      this.pool = new window.NostrTools.SimplePool();
      const results = await this.connectToRelays();
      const successfulRelays = results
        .filter((r) => r.success)
        .map((r) => r.url);
      if (successfulRelays.length === 0) {
        throw new Error("No relays connected");
      }
      if (isDevMode) {
        console.log(`Connected to ${successfulRelays.length} relay(s)`);
      }
    } catch (err) {
      console.error("Nostr init failed:", err);
      throw err;
    }
  }

  // We subscribe to kind `0` purely as a liveness probe because almost every
  // relay can answer it quickly. Either an `event` or `eose` signals success,
  // while the 5s timer guards against relays that never respond. We immediately
  // `unsub` to avoid leaking subscriptions. Note: any future change must still
  // provide a lightweight readiness check with similar timeout semantics.
  async connectToRelays() {
    return Promise.all(
      this.relays.map(
        (url) =>
          new Promise((resolve) => {
            const sub = this.pool.sub([url], [{ kinds: [0], limit: 1 }]);
            const timeout = setTimeout(() => {
              sub.unsub();
              resolve({ url, success: false });
            }, 5000);

            const succeed = () => {
              clearTimeout(timeout);
              sub.unsub();
              resolve({ url, success: true });
            };
            sub.on("event", succeed);
            sub.on("eose", succeed);
          })
      )
    );
  }

  /**
   * Attempt login with a Nostr extension
   */
  async login(options = {}) {
    try {
      const extension = window.nostr;
      if (!extension) {
        console.log("No Nostr extension found");
        throw new Error(
          "Please install a Nostr extension (Alby, nos2x, etc.)."
        );
      }

      const { allowAccountSelection = false, expectPubkey } =
        typeof options === "object" && options !== null ? options : {};
      const normalizedExpectedPubkey =
        typeof expectPubkey === "string" && expectPubkey.trim()
          ? expectPubkey.trim().toLowerCase()
          : null;

      if (typeof extension.getPublicKey !== "function") {
        throw new Error(
          "This NIP-07 extension is missing getPublicKey support. Please update the extension."
        );
      }

      if (typeof extension.enable === "function") {
        if (isDevMode) {
          console.log("Requesting permissions from NIP-07 extension...");
        }
        try {
          await extension.enable();
        } catch (enableErr) {
          throw new Error(
            enableErr && enableErr.message
              ? enableErr.message
              : "The NIP-07 extension denied the permission request."
          );
        }
      }

      if (allowAccountSelection && typeof extension.selectAccounts === "function") {
        try {
          const selection = await extension.selectAccounts(
            expectPubkey ? [expectPubkey] : undefined
          );

          const didCancelSelection =
            selection === undefined ||
            selection === null ||
            selection === false ||
            (Array.isArray(selection) && selection.length === 0);

          if (didCancelSelection) {
            throw new Error("Account selection was cancelled.");
          }
        } catch (selectionErr) {
          const message =
            selectionErr && typeof selectionErr.message === "string"
              ? selectionErr.message
              : "Account selection was cancelled.";
          throw new Error(message);
        }
      }

      let timeoutId;
      const pubkey = await Promise.race([
        extension.getPublicKey(),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new Error(
                "Timed out waiting for the NIP-07 extension. Check the extension prompt and try again."
              )
            );
          }, NIP07_LOGIN_TIMEOUT_MS);
        }),
      ]).finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });
      if (!pubkey || typeof pubkey !== "string") {
        throw new Error(
          "The NIP-07 extension did not return a public key. Please try again."
        );
      }

      if (
        normalizedExpectedPubkey &&
        pubkey.toLowerCase() !== normalizedExpectedPubkey
      ) {
        throw new Error(
          "The selected account doesn't match the expected profile. Please try again."
        );
      }
      const npub = window.NostrTools.nip19.npubEncode(pubkey);

      if (isDevMode) {
        console.log("Got pubkey:", pubkey);
        console.log("Converted to npub:", npub);
        console.log("Whitelist:", accessControl.getWhitelist());
        console.log("Blacklist:", accessControl.getBlacklist());
      }
      // Access control
      if (!accessControl.canAccess(npub)) {
        if (accessControl.isBlacklisted(npub)) {
          throw new Error("Your account has been blocked on this platform.");
        } else {
          throw new Error("Access restricted to whitelisted users only.");
        }
      }
      this.pubkey = pubkey;
      if (isDevMode) {
        console.log("Logged in with extension. Pubkey:", this.pubkey);
      }
      return this.pubkey;
    } catch (err) {
      console.error("Login error:", err);
      throw err;
    }
  }

  logout() {
    this.pubkey = null;
    if (isDevMode) console.log("User logged out.");
  }

  async sendDirectMessage(targetNpub, message, actorPubkeyOverride = null) {
    const trimmedTarget = typeof targetNpub === "string" ? targetNpub.trim() : "";
    const trimmedMessage = typeof message === "string" ? message.trim() : "";

    if (!trimmedTarget) {
      return { ok: false, error: "invalid-target" };
    }

    if (!trimmedMessage) {
      return { ok: false, error: "empty-message" };
    }

    if (!this.pool) {
      return { ok: false, error: "nostr-uninitialized" };
    }

    const extension = window?.nostr;
    if (!extension) {
      return { ok: false, error: "nostr-extension-missing" };
    }

    const nip04 = extension.nip04;
    if (!nip04 || typeof nip04.encrypt !== "function") {
      return { ok: false, error: "nip04-unavailable" };
    }

    if (typeof extension.signEvent !== "function") {
      return { ok: false, error: "sign-event-unavailable" };
    }

    let actorHex =
      typeof actorPubkeyOverride === "string" && actorPubkeyOverride.trim()
        ? actorPubkeyOverride.trim()
        : "";

    if (!actorHex && typeof this.pubkey === "string") {
      actorHex = this.pubkey.trim();
    }

    if (!actorHex && typeof extension.getPublicKey === "function") {
      try {
        actorHex = await extension.getPublicKey();
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[nostr] Failed to fetch actor pubkey from extension:",
            error
          );
        }
      }
    }

    if (!actorHex) {
      return { ok: false, error: "missing-actor-pubkey" };
    }

    const targetHex = decodeNpubToHex(trimmedTarget);
    if (!targetHex) {
      return { ok: false, error: "invalid-target" };
    }

    let ciphertext = "";
    try {
      ciphertext = await nip04.encrypt(targetHex, trimmedMessage);
    } catch (error) {
      return { ok: false, error: "encryption-failed", details: error };
    }

    const event = {
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", targetHex]],
      content: ciphertext,
      pubkey: actorHex,
    };

    let signedEvent;
    try {
      signedEvent = await extension.signEvent(event);
    } catch (error) {
      return { ok: false, error: "signature-failed", details: error };
    }

    const relays =
      Array.isArray(this.relays) && this.relays.length ? this.relays : RELAY_URLS;

    const publishResults = await Promise.all(
      relays.map((url) => publishEventToRelay(this.pool, url, signedEvent))
    );

    const success = publishResults.some((result) => result.success);
    if (!success) {
      return {
        ok: false,
        error: "publish-failed",
        details: publishResults.filter((result) => !result.success),
      };
    }

    return { ok: true };
  }

  /**
   * Publish a new video using the v3 content schema.
   */
  async publishVideo(videoData, pubkey) {
    if (!pubkey) throw new Error("Not logged in to publish video.");

    if (isDevMode) {
      console.log("Publishing new video with data:", videoData);
    }

    const rawMagnet = typeof videoData.magnet === "string" ? videoData.magnet : "";
    let finalMagnet = rawMagnet.trim();
    if (videoData.isPrivate && finalMagnet) {
      finalMagnet = fakeEncrypt(finalMagnet);
    }
    const finalUrl =
      typeof videoData.url === "string" ? videoData.url.trim() : "";
    const finalThumbnail =
      typeof videoData.thumbnail === "string" ? videoData.thumbnail.trim() : "";
    const finalDescription =
      typeof videoData.description === "string"
        ? videoData.description.trim()
        : "";
    const finalTitle =
      typeof videoData.title === "string" ? videoData.title.trim() : "";
    const providedMimeType =
      typeof videoData.mimeType === "string"
        ? videoData.mimeType.trim()
        : "";

    const createdAt = Math.floor(Date.now() / 1000);

    // brand-new root & d
    const videoRootId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dTagValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const finalEnableComments =
      videoData.enableComments === false ? false : true;
    const finalWs =
      typeof videoData.ws === "string" ? videoData.ws.trim() : "";
    const finalXs =
      typeof videoData.xs === "string" ? videoData.xs.trim() : "";

    const contentObject = {
      version: 3,
      title: finalTitle,
      url: finalUrl,
      magnet: finalMagnet,
      thumbnail: finalThumbnail,
      description: finalDescription,
      mode: videoData.mode || "live",
      videoRootId,
      deleted: false,
      isPrivate: videoData.isPrivate ?? false,
      enableComments: finalEnableComments,
    };

    if (finalWs) {
      contentObject.ws = finalWs;
    }

    if (finalXs) {
      contentObject.xs = finalXs;
    }

    const event = {
      kind: 30078,
      pubkey,
      created_at: createdAt,
      tags: [
        ["t", "video"],
        ["d", dTagValue],
      ],
      content: JSON.stringify(contentObject),
    };

    if (isDevMode) {
      console.log("Publish event with brand-new root:", videoRootId);
      console.log("Event content:", event.content);
    }

    try {
      const signedEvent = await window.nostr.signEvent(event);
      if (isDevMode) console.log("Signed event:", signedEvent);

      await Promise.all(
        this.relays.map(async (url) => {
          try {
            await this.pool.publish([url], signedEvent);
            if (isDevMode) console.log(`Video published to ${url}`);
          } catch (err) {
            if (isDevMode) console.error(`Failed to publish: ${url}`, err);
          }
        })
      );

      if (finalUrl) {
        const inferredMimeType = inferMimeTypeFromUrl(finalUrl);
        const mimeType =
          providedMimeType || inferredMimeType || "application/octet-stream";

        const mirrorTags = [
          ["url", finalUrl],
          ["m", mimeType],
        ];

        if (finalThumbnail) {
          mirrorTags.push(["thumb", finalThumbnail]);
        }

        const altText = finalDescription || finalTitle || "";
        if (altText) {
          mirrorTags.push(["alt", altText]);
        }

        if (!contentObject.isPrivate && finalMagnet) {
          mirrorTags.push(["magnet", finalMagnet]);
        }

        const mirrorEvent = {
          kind: 1063,
          pubkey,
          created_at: createdAt,
          tags: mirrorTags,
          content: altText,
        };

        if (isDevMode) {
          console.log("Prepared NIP-94 mirror event:", mirrorEvent);
        }

        try {
          const signedMirrorEvent = await window.nostr.signEvent(mirrorEvent);
          if (isDevMode) {
            console.log("Signed NIP-94 mirror event:", signedMirrorEvent);
          }

          await Promise.all(
            this.relays.map(async (url) => {
              try {
                await this.pool.publish([url], signedMirrorEvent);
                if (isDevMode) {
                  console.log(`NIP-94 mirror published to ${url}`);
                }
              } catch (mirrorErr) {
                if (isDevMode) {
                  console.error(
                    `Failed to publish NIP-94 mirror to ${url}`,
                    mirrorErr
                  );
                }
              }
            })
          );

          if (isDevMode) {
            console.log(
              "NIP-94 mirror dispatched for hosted URL:",
              finalUrl
            );
          }
        } catch (mirrorError) {
          if (isDevMode) {
            console.error(
              "Failed to sign/publish NIP-94 mirror event:",
              mirrorError
            );
          }
        }
      } else if (isDevMode) {
        console.log("Skipping NIP-94 mirror: no hosted URL provided.");
      }
      return signedEvent;
    } catch (err) {
      if (isDevMode) console.error("Failed to sign/publish:", err);
      throw err;
    }
  }

  /**
   * Edits a video by creating a *new event* with a brand-new d tag,
   * but reuses the same videoRootId as the original.
   *
   * This version forces version=2 for the original note and uses
   * lowercase comparison for public keys.
   */
  async editVideo(originalEventStub, updatedData, userPubkey) {
    if (!userPubkey) {
      throw new Error("Not logged in to edit.");
    }

    // Convert the provided pubkey to lowercase
    const userPubkeyLower = userPubkey.toLowerCase();

    // Use getEventById to fetch the full original event details
    const baseEvent = await this.getEventById(originalEventStub.id);
    if (!baseEvent) {
      throw new Error("Could not retrieve the original event to edit.");
    }

    // Check that the original event is version 2 or higher
    if (baseEvent.version < 2) {
      throw new Error(
        "This video is not in the supported version for editing."
      );
    }

    // Ownership check (compare lowercase hex public keys)
    if (
      !baseEvent.pubkey ||
      baseEvent.pubkey.toLowerCase() !== userPubkeyLower
    ) {
      throw new Error("You do not own this video (pubkey mismatch).");
    }

    // Decrypt the old magnet if the note is private
    let oldPlainMagnet = baseEvent.magnet || "";
    if (baseEvent.isPrivate && oldPlainMagnet) {
      oldPlainMagnet = fakeDecrypt(oldPlainMagnet);
    }

    const oldUrl = baseEvent.url || "";

    // Determine if the updated note should be private
    const wantPrivate = updatedData.isPrivate ?? baseEvent.isPrivate ?? false;

    // Use the new magnet if provided; otherwise, fall back to the decrypted old magnet
    const magnetEdited = updatedData.magnetEdited === true;
    const newMagnetValue =
      typeof updatedData.magnet === "string" ? updatedData.magnet.trim() : "";
    let finalPlainMagnet = magnetEdited ? newMagnetValue : oldPlainMagnet;
    let finalMagnet =
      wantPrivate && finalPlainMagnet
        ? fakeEncrypt(finalPlainMagnet)
        : finalPlainMagnet;

    const urlEdited = updatedData.urlEdited === true;
    const newUrlValue =
      typeof updatedData.url === "string" ? updatedData.url.trim() : "";
    const finalUrl = urlEdited ? newUrlValue : oldUrl;

    const wsEdited = updatedData.wsEdited === true;
    const xsEdited = updatedData.xsEdited === true;
    const newWsValue =
      typeof updatedData.ws === "string" ? updatedData.ws.trim() : "";
    const newXsValue =
      typeof updatedData.xs === "string" ? updatedData.xs.trim() : "";
    const baseWs =
      typeof baseEvent.ws === "string" ? baseEvent.ws.trim() : "";
    const baseXs =
      typeof baseEvent.xs === "string" ? baseEvent.xs.trim() : "";
    const finalWs = wsEdited ? newWsValue : baseWs;
    const finalXs = xsEdited ? newXsValue : baseXs;
    const finalEnableComments =
      typeof updatedData.enableComments === "boolean"
        ? updatedData.enableComments
        : baseEvent.enableComments === false
          ? false
          : true;

    // Use the existing videoRootId (or fall back to the base event's ID)
    const oldRootId = baseEvent.videoRootId || baseEvent.id;

    // Generate a new d-tag so that the edit gets its own share link
    const newD = `${Date.now()}-edit-${Math.random().toString(36).slice(2)}`;

    // Build the updated content object
    const contentObject = {
      videoRootId: oldRootId,
      version: updatedData.version ?? baseEvent.version ?? 2,
      deleted: false,
      isPrivate: wantPrivate,
      title: updatedData.title ?? baseEvent.title,
      url: finalUrl,
      magnet: finalMagnet,
      thumbnail: updatedData.thumbnail ?? baseEvent.thumbnail,
      description: updatedData.description ?? baseEvent.description,
      mode: updatedData.mode ?? baseEvent.mode ?? "live",
      enableComments: finalEnableComments,
    };

    if (finalWs) {
      contentObject.ws = finalWs;
    }

    if (finalXs) {
      contentObject.xs = finalXs;
    }

    const event = {
      kind: 30078,
      // Use the provided userPubkey (or you can also force it to lowercase here if desired)
      pubkey: userPubkeyLower,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "video"],
        ["d", newD], // new share link tag
      ],
      content: JSON.stringify(contentObject),
    };

    if (isDevMode) {
      console.log("Creating edited event with root ID:", oldRootId);
      console.log("Event content:", event.content);
    }

    try {
      const signedEvent = await window.nostr.signEvent(event);
      if (isDevMode) {
        console.log("Signed edited event:", signedEvent);
      }

      await Promise.all(
        this.relays.map(async (url) => {
          try {
            await this.pool.publish([url], signedEvent);
            if (isDevMode) {
              console.log(`Edited video published to ${url}`);
            }
          } catch (err) {
            if (isDevMode) {
              console.error(`Publish failed to ${url}`, err);
            }
          }
        })
      );

      return signedEvent;
    } catch (err) {
      console.error("Edit failed:", err);
      throw err;
    }
  }

  /**
   * revertVideo => old style
   */
  async revertVideo(originalEvent, pubkey) {
    if (!pubkey) {
      throw new Error("Not logged in to revert.");
    }
    if (originalEvent.pubkey !== pubkey) {
      throw new Error("Not your event (pubkey mismatch).");
    }

    let baseEvent = originalEvent;
    if (!baseEvent.tags || !Array.isArray(baseEvent.tags)) {
      const fetched = await this.getEventById(originalEvent.id);
      if (!fetched) {
        throw new Error("Could not fetch the original event for reverting.");
      }
      baseEvent = {
        id: fetched.id,
        pubkey: fetched.pubkey,
        content: JSON.stringify({
          version: fetched.version,
          deleted: fetched.deleted,
          isPrivate: fetched.isPrivate,
          title: fetched.title,
          url: fetched.url,
          magnet: fetched.magnet,
          thumbnail: fetched.thumbnail,
          description: fetched.description,
          mode: fetched.mode,
        }),
        tags: fetched.tags,
      };
    }

    const safeTags = Array.isArray(baseEvent.tags) ? baseEvent.tags : [];
    const dTag = safeTags.find((t) => t[0] === "d");
    const existingD = dTag ? dTag[1] : null;

    let oldContent = {};
    try {
      oldContent = JSON.parse(baseEvent.content || "{}");
    } catch (err) {
      if (isDevMode) {
        console.warn("[nostr] Failed to parse baseEvent.content while reverting:", err);
      }
      oldContent = {};
    }
    const oldVersion = oldContent.version ?? 1;

    const finalRootId =
      oldContent.videoRootId ||
      (existingD
        ? `LEGACY:${baseEvent.pubkey}:${existingD}`
        : baseEvent.id);

    const contentObject = {
      videoRootId: finalRootId,
      version: oldVersion,
      deleted: true,
      isPrivate: oldContent.isPrivate ?? false,
      title: oldContent.title || "",
      url: "",
      magnet: "",
      thumbnail: "",
      description: "This version was reverted by the creator.",
      mode: oldContent.mode || "live",
    };

    const tags = [["t", "video"]];
    if (existingD) {
      tags.push(["d", existingD]);
    }

    const event = {
      kind: 30078,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: JSON.stringify(contentObject),
    };

    const signedEvent = await window.nostr.signEvent(event);
    await Promise.all(
      this.relays.map(async (url) => {
        try {
          await this.pool.publish([url], signedEvent);
        } catch (err) {
          if (isDevMode) console.error(`Failed to revert on ${url}`, err);
        }
      })
    );

    return signedEvent;
  }

  /**
   * "Deleting" => Mark all content with the same videoRootId as {deleted:true}
   * and blank out magnet/desc.
   *
   * This version now asks for confirmation before proceeding.
   */
  async deleteAllVersions(videoRootId, pubkey) {
    if (!pubkey) {
      throw new Error("Not logged in to delete all versions.");
    }

    // Ask for confirmation before proceeding
    if (
      !window.confirm(
        "Are you sure you want to delete all versions of this video? This action cannot be undone."
      )
    ) {
      console.log("Deletion cancelled by user.");
      return null; // Cancel deletion if user clicks "Cancel"
    }

    // 1) Find all events in our local allEvents that share the same root.
    const matchingEvents = [];
    for (const [id, vid] of this.allEvents.entries()) {
      if (
        vid.videoRootId === videoRootId &&
        vid.pubkey === pubkey &&
        !vid.deleted
      ) {
        matchingEvents.push(vid);
      }
    }
    if (!matchingEvents.length) {
      throw new Error("No existing events found for that root.");
    }

    // 2) For each event, create a "revert" event to mark it as deleted.
    // This will prompt the user (via the extension) to sign the deletion.
    for (const vid of matchingEvents) {
      await this.revertVideo(
        {
          id: vid.id,
          pubkey: vid.pubkey,
          content: JSON.stringify({
            version: vid.version,
            deleted: vid.deleted,
            isPrivate: vid.isPrivate,
            title: vid.title,
            url: vid.url,
            magnet: vid.magnet,
            thumbnail: vid.thumbnail,
            description: vid.description,
            mode: vid.mode,
          }),
          tags: vid.tags,
        },
        pubkey
      );
    }

    return true;
  }

  /**
 * Saves all known events to localStorage (or a different storage if you prefer).
 */
  saveLocalData() {
    if (typeof localStorage === "undefined") {
      return;
    }

    const payload = {
      version: 1,
      savedAt: Date.now(),
      events: {},
    };

    for (const [id, vid] of this.allEvents.entries()) {
      payload.events[id] = vid;
    }

    try {
      localStorage.setItem(EVENTS_CACHE_STORAGE_KEY, JSON.stringify(payload));
      localStorage.removeItem(LEGACY_EVENTS_STORAGE_KEY);
    } catch (err) {
      if (isDevMode) {
        console.warn("[nostr] Failed to persist events cache:", err);
      }
    }
  }

  /**
   * Subscribe to *all* videos (old and new) with a single subscription,
   * buffering incoming events to avoid excessive DOM updates.
   */
  subscribeVideos(onVideo) {
    const filter = {
      kinds: [30078],
      "#t": ["video"],
      // Adjust limit/time as desired
      limit: 500,
      since: 0,
    };

    if (isDevMode) {
      console.log("[subscribeVideos] Subscribing with filter:", filter);
    }

    const sub = this.pool.sub(this.relays, [filter]);
    const invalidDuringSub = [];

    // We'll collect events here instead of processing them instantly
    let eventBuffer = [];

    // 1) On each incoming event, just push to the buffer
    sub.on("event", (event) => {
      eventBuffer.push(event);
    });

    // 2) Process buffered events on a setInterval (e.g., every second)
    const processInterval = setInterval(() => {
      if (eventBuffer.length > 0) {
        // Copy and clear the buffer
        const toProcess = eventBuffer.slice();
        eventBuffer = [];

        // Now handle each event
        for (const evt of toProcess) {
          try {
            const video = convertEventToVideo(evt);

            if (video.invalid) {
              invalidDuringSub.push({ id: video.id, reason: video.reason });
              continue;
            }

            // Store in allEvents
            this.allEvents.set(evt.id, video);

            // If it's a "deleted" note, remove from activeMap
            if (video.deleted) {
              const activeKey = getActiveKey(video);
              this.activeMap.delete(activeKey);
              continue;
            }

            // Otherwise, if it's newer than what we have, update activeMap
            const activeKey = getActiveKey(video);
            const prevActive = this.activeMap.get(activeKey);
            if (!prevActive || video.created_at > prevActive.created_at) {
              this.activeMap.set(activeKey, video);
              onVideo(video); // Trigger the callback that re-renders
            }
          } catch (err) {
            if (isDevMode) {
              console.error("[subscribeVideos] Error processing event:", err);
            }
          }
        }

        // Optionally, save data to local storage after processing the batch
        this.saveLocalData();
      }
    }, 1000);

    // You can still use sub.on("eose") if needed
    sub.on("eose", () => {
      if (isDevMode && invalidDuringSub.length > 0) {
        console.warn(
          `[subscribeVideos] found ${invalidDuringSub.length} invalid video notes (with reasons):`,
          invalidDuringSub
        );
      }
      if (isDevMode) {
        console.log(
          "[subscribeVideos] Reached EOSE for all relays (historical load done)"
        );
      }
    });

    // Return the subscription object if you need to unsub manually later
    const originalUnsub =
      typeof sub.unsub === "function" ? sub.unsub.bind(sub) : () => {};
    let unsubscribed = false;
    sub.unsub = () => {
      if (unsubscribed) {
        return;
      }
      unsubscribed = true;
      clearInterval(processInterval);
      try {
        return originalUnsub();
      } catch (err) {
        console.error("[subscribeVideos] Failed to unsub from pool:", err);
        return undefined;
      }
    };

    return sub;
  }

  /**
   * fetchVideos => old approach
   */
  async fetchVideos() {
    const filter = {
      kinds: [30078],
      "#t": ["video"],
      limit: 300,
      since: 0,
    };

    const localAll = new Map();
    // NEW: track invalid
    const invalidNotes = [];

    try {
      await Promise.all(
        this.relays.map(async (url) => {
          const events = await this.pool.list([url], [filter]);
          for (const evt of events) {
            const vid = convertEventToVideo(evt);
            if (vid.invalid) {
              // Accumulate if invalid
              invalidNotes.push({ id: vid.id, reason: vid.reason });
            } else {
              // Only add if good
              localAll.set(evt.id, vid);
            }
          }
        })
      );

      // Merge into allEvents
      for (const [id, vid] of localAll.entries()) {
        this.allEvents.set(id, vid);
      }

      // Rebuild activeMap
      this.activeMap.clear();
      for (const [id, video] of this.allEvents.entries()) {
        if (video.deleted) continue;
        const activeKey = getActiveKey(video);
        const existing = this.activeMap.get(activeKey);

        if (!existing || video.created_at > existing.created_at) {
          this.activeMap.set(activeKey, video);
        }
      }

      // OPTIONAL: Log invalid stats
      if (invalidNotes.length > 0 && isDevMode) {
        console.warn(
          `Skipped ${invalidNotes.length} invalid video notes:\n`,
          invalidNotes.map((n) => `${n.id.slice(0, 8)}.. => ${n.reason}`)
        );
      }

      const activeVideos = Array.from(this.activeMap.values()).sort(
        (a, b) => b.created_at - a.created_at
      );
      return activeVideos;
    } catch (err) {
      console.error("fetchVideos error:", err);
      return [];
    }
  }

  /**
   * getEventById => old approach
   */
  async getEventById(eventId) {
    const local = this.allEvents.get(eventId);
    if (local) {
      return local;
    }
    try {
      for (const url of this.relays) {
        const maybeEvt = await this.pool.get([url], { ids: [eventId] });
        if (maybeEvt && maybeEvt.id === eventId) {
          const video = convertEventToVideo(maybeEvt);
          this.allEvents.set(eventId, video);
          return video;
        }
      }
    } catch (err) {
      if (isDevMode) {
        console.error("getEventById direct fetch error:", err);
      }
    }
    return null;
  }

  /**
   * Ensure we have every historical revision for a given video in memory and
   * return the complete set sorted newest-first. We primarily group revisions
   * by their shared `videoRootId`, but fall back to the NIP-33 `d` tag when
   * working with legacy notes. The explicit `d` tag fetch is important because
   * relays cannot be queried by values that only exist inside the JSON
   * content. Without this pass, the UI would occasionally miss mid-history
   * edits that were published from other devices.
   */
  async hydrateVideoHistory(video) {
    if (!video || typeof video !== "object") {
      return [];
    }

    const targetRoot = typeof video.videoRootId === "string" ? video.videoRootId : "";
    const targetPubkey = typeof video.pubkey === "string" ? video.pubkey.toLowerCase() : "";
    const findDTagValue = (tags = []) => {
      if (!Array.isArray(tags)) {
        return "";
      }
      for (const tag of tags) {
        if (!Array.isArray(tag) || tag.length < 2) {
          continue;
        }
        if (tag[0] === "d" && typeof tag[1] === "string") {
          return tag[1];
        }
      }
      return "";
    };

    const targetDTag = findDTagValue(video.tags);

    const collectLocalMatches = () => {
      const seen = new Set();
      const matches = [];
      for (const candidate of this.allEvents.values()) {
        if (!candidate || typeof candidate !== "object") {
          continue;
        }
        if (targetPubkey) {
          const candidatePubkey = typeof candidate.pubkey === "string"
            ? candidate.pubkey.toLowerCase()
            : "";
          if (candidatePubkey !== targetPubkey) {
            continue;
          }
        }

        const candidateRoot =
          typeof candidate.videoRootId === "string" ? candidate.videoRootId : "";
        const candidateDTag = findDTagValue(candidate.tags);

        const sameRoot = targetRoot && candidateRoot === targetRoot;
        const sameD = targetDTag && candidateDTag === targetDTag;

        // Legacy fallbacks: some old posts reused only the "d" tag without a
        // canonical videoRootId. If neither identifier exists we at least keep
        // the active event so the caller can surface an informative message.
        const sameLegacyRoot =
          !targetRoot && candidateRoot && candidateRoot === video.id;

        if (sameRoot || sameD || sameLegacyRoot || candidate.id === video.id) {
          if (!seen.has(candidate.id)) {
            seen.add(candidate.id);
            matches.push(candidate);
          }
        }
      }
      return matches;
    };

    let localMatches = collectLocalMatches();

    const shouldFetchFromRelays =
      localMatches.filter((entry) => !entry.deleted).length <= 1 && targetDTag;

    if (shouldFetchFromRelays && this.pool) {
      const filter = {
        kinds: [30078],
        "#t": ["video"],
        "#d": [targetDTag],
        limit: 200,
      };
      if (targetPubkey) {
        filter.authors = [video.pubkey];
      }

      try {
        const perRelay = await Promise.all(
          this.relays.map(async (url) => {
            try {
              const events = await this.pool.list([url], [filter]);
              return events || [];
            } catch (err) {
              if (isDevMode) {
                console.warn(`[nostr] History fetch failed on ${url}:`, err);
              }
              return [];
            }
          })
        );

        const merged = perRelay.flat();
        for (const evt of merged) {
          try {
            const parsed = convertEventToVideo(evt);
            if (!parsed.invalid) {
              this.allEvents.set(evt.id, parsed);
            }
          } catch (err) {
            if (isDevMode) {
              console.warn("[nostr] Failed to convert historical event:", err);
            }
          }
        }
      } catch (err) {
        if (isDevMode) {
          console.warn("[nostr] hydrateVideoHistory relay fetch error:", err);
        }
      }

      localMatches = collectLocalMatches();
    }

    return localMatches.sort((a, b) => b.created_at - a.created_at);
  }

  getActiveVideos() {
    return Array.from(this.activeMap.values()).sort(
      (a, b) => b.created_at - a.created_at
    );
  }
}

export const nostrClient = new NostrClient();
