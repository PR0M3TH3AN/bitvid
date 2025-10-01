// js/nostr.js

import {
  isDevMode,
  WATCH_HISTORY_KIND,
  WATCH_HISTORY_LIST_IDENTIFIER,
  WATCH_HISTORY_MAX_ITEMS,
  WATCH_HISTORY_BATCH_RESOLVE,
  WATCH_HISTORY_PAYLOAD_MAX_BYTES,
  WATCH_HISTORY_FETCH_EVENT_LIMIT,
  WATCH_HISTORY_CACHE_TTL_MS,
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
const NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE =
  "Timed out waiting for the NIP-07 extension. Check the extension prompt and try again.";
const SESSION_ACTOR_STORAGE_KEY = "bitvid:sessionActor:v1";
const WATCH_HISTORY_CACHE_STORAGE_KEY = "bitvid:watchHistoryCache:v1";

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

function withNip07Timeout(operation) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE));
    }, NIP07_LOGIN_TIMEOUT_MS);
  });

  let operationResult;
  try {
    operationResult = operation();
  } catch (err) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    throw err;
  }

  const operationPromise = Promise.resolve(operationResult);

  return Promise.race([operationPromise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function withRequestTimeout(promise, timeoutMs, onTimeout, message = "Request timed out") {
  const resolvedTimeout = Number(timeoutMs);
  const effectiveTimeout =
    Number.isFinite(resolvedTimeout) && resolvedTimeout > 0
      ? Math.floor(resolvedTimeout)
      : 4000;

  let timeoutId = null;
  let settled = false;

  return new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      if (typeof onTimeout === "function") {
        try {
          onTimeout();
        } catch (cleanupError) {
          if (isDevMode) {
            console.warn("[nostr] COUNT timeout cleanup failed:", cleanupError);
          }
        }
      }
      reject(new Error(message));
    }, effectiveTimeout);

    Promise.resolve(promise)
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(value);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      });
  });
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
  const watchedAtRaw = Number.isFinite(pointer.watchedAt)
    ? pointer.watchedAt
    : null;
  const watchedAt =
    watchedAtRaw !== null ? Math.max(0, Math.floor(watchedAtRaw)) : null;

  const cloned = { type, value, relay };
  if (watchedAt !== null) {
    cloned.watchedAt = watchedAt;
  }

  return cloned;
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

function resolveVideoViewPointerValue(pointer) {
  const normalized = normalizePointerInput(pointer);
  if (!normalized || typeof normalized.value !== "string") {
    throw new Error("Invalid video pointer supplied for view lookup.");
  }

  const value = normalized.value.trim();
  if (!value) {
    throw new Error("Invalid video pointer supplied for view lookup.");
  }

  return value;
}

function createVideoViewEventFilter(pointer) {
  const pointerValue = resolveVideoViewPointerValue(pointer);
  return {
    kinds: [WATCH_HISTORY_KIND],
    "#t": ["view"],
    "#video": [pointerValue],
  };
}

function isVideoViewEvent(event, pointerValue) {
  if (!event || typeof event !== "object") {
    return false;
  }

  if (Number(event.kind) !== WATCH_HISTORY_KIND) {
    return false;
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  let hasViewTag = false;
  let hasVideoTag = false;

  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }

    const label = typeof tag[0] === "string" ? tag[0] : "";
    const value = typeof tag[1] === "string" ? tag[1].trim() : "";

    if (!label) {
      continue;
    }

    if (!hasViewTag && label === "t" && value === "view") {
      hasViewTag = true;
    } else if (!hasVideoTag && label === "video" && value === pointerValue) {
      hasVideoTag = true;
    }

    if (hasViewTag && hasVideoTag) {
      return true;
    }
  }

  return false;
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
    const snapshot =
      typeof parsed.snapshot === "string" ? parsed.snapshot : "";
    const chunkIndex = Number.isFinite(parsed.chunkIndex)
      ? Math.max(0, Math.floor(parsed.chunkIndex))
      : 0;
    const totalChunks = Number.isFinite(parsed.totalChunks)
      ? Math.max(1, Math.floor(parsed.totalChunks))
      : 1;
    return { version, items, snapshot, chunkIndex, totalChunks };
  } catch (error) {
    if (isDevMode) {
      console.warn("[nostr] Failed to parse watch history payload:", error);
    }
    return {
      version: 0,
      items: [],
      snapshot: "",
      chunkIndex: 0,
      totalChunks: 1,
    };
  }
}

function chunkWatchHistoryPayloadItems(payloadItems, snapshotId, maxBytes) {
  const items = Array.isArray(payloadItems) ? payloadItems : [];
  const safeMax = Math.max(128, Math.floor(maxBytes || 0));
  const measurementLimit = Math.max(64, safeMax - 32);
  const normalizedSnapshot =
    typeof snapshotId === "string" ? snapshotId : "";

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
      } else {
        skipped.push(item);
      }
      continue;
    }

    const chunkIndex = chunks.length;
    const candidate = [...current, item];
    const size = estimateLength(candidate, chunkIndex, chunkIndex + 1);
    if (size <= measurementLimit) {
      current = candidate;
      continue;
    }

    chunks.push(current);
    current = [];

    const nextIndex = chunks.length;
    const soloSize = estimateLength([item], nextIndex, nextIndex + 1);
    if (soloSize <= measurementLimit) {
      current = [item];
    } else {
      skipped.push(item);
    }
  }

  if (current.length || chunks.length === 0) {
    chunks.push(current);
  }

  let needsRebalance = true;
  while (needsRebalance) {
    needsRebalance = false;
    for (let index = 0; index < chunks.length; index++) {
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
    this.watchHistoryRepublishTimers = new Map();
    this.watchHistoryCacheTtlMs = WATCH_HISTORY_CACHE_TTL_MS;
    this.countRequestCounter = 0;
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
   * Resolve the effective TTL for watch-history cache entries.
   */
  getWatchHistoryCacheTtlMs() {
    const candidate = this.watchHistoryCacheTtlMs;
    if (Number.isFinite(candidate) && candidate >= 0) {
      return candidate;
    }
    return WATCH_HISTORY_CACHE_TTL_MS;
  }

  /**
   * Load watch history cache payload from localStorage.
   */
  getWatchHistoryStorage() {
    const base = { version: 1, actors: {} };

    if (!this.watchHistoryStorage) {
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

      const actors = { ...(parsed.actors || {}) };
      this.watchHistoryStorage = { version: 1, actors };
    }

    const now = Date.now();
    const ttl = this.getWatchHistoryCacheTtlMs();
    let mutated = false;
    const actors = this.watchHistoryStorage.actors || {};
    for (const actor of Object.keys(actors)) {
      const info = actors[actor];
      if (
        !info ||
        typeof info !== "object" ||
        typeof info.savedAt !== "number" ||
        now - info.savedAt > ttl
      ) {
        delete actors[actor];
        mutated = true;
      }
    }

    if (mutated && typeof localStorage !== "undefined") {
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
        const watchedAtRaw = Number.isFinite(pointer.watchedAt)
          ? pointer.watchedAt
          : null;
        const watchedAt =
          watchedAtRaw !== null ? Math.max(0, Math.floor(watchedAtRaw)) : 0;
        normalizedItems.push({ ...pointer, watchedAt });
      }
    }

    const entry = {
      pointerEvent: pointerEvent ? cloneEventForCache(pointerEvent) : null,
      items: normalizedItems,
      savedAt: typeof savedAt === "number" ? savedAt : Date.now(),
      resolved: previousEntry?.resolved
        ? new Map(previousEntry.resolved)
        : new Map(),
      resolvedVideos: previousEntry?.resolvedVideos
        ? new Map(previousEntry.resolvedVideos)
        : new Map(),
      resolving: previousEntry?.resolving
        ? new Set(previousEntry.resolving)
        : new Set(),
      delivered: previousEntry?.delivered instanceof Set
        ? new Set(previousEntry.delivered)
        : new Set(),
    };

    const validKeys = new Set(entry.items.map((item) => pointerKey(item)));
    for (const key of entry.resolved.keys()) {
      if (!validKeys.has(key)) {
        entry.resolved.delete(key);
      }
    }
    for (const key of entry.resolvedVideos.keys()) {
      if (!validKeys.has(key)) {
        entry.resolvedVideos.delete(key);
      }
    }
    for (const key of [...entry.resolving]) {
      if (!validKeys.has(key)) {
        entry.resolving.delete(key);
      }
    }
    for (const key of [...entry.delivered]) {
      if (!validKeys.has(key)) {
        entry.delivered.delete(key);
      }
    }

    const previousChunkPointers = previousEntry?.chunkPointers;
    const headPointer = previousChunkPointers?.head
      ? clonePointerItem(previousChunkPointers.head)
      : null;
    const chunkPointerList = Array.isArray(previousChunkPointers?.chunks)
      ? previousChunkPointers.chunks
          .map((pointer) => clonePointerItem(pointer))
          .filter(Boolean)
      : [];

    entry.chunkPointers = {
      head: headPointer,
      chunks: chunkPointerList,
    };

    entry.chunkEvents = new Map();
    if (previousEntry?.chunkEvents instanceof Map) {
      for (const [key, value] of previousEntry.chunkEvents.entries()) {
        const clonedEvent = cloneEventForCache(value);
        if (clonedEvent) {
          entry.chunkEvents.set(key, clonedEvent);
        }
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
        watchedAt: Number.isFinite(item.watchedAt)
          ? Math.max(0, Math.floor(item.watchedAt))
          : 0,
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

  getWatchHistoryFingerprint(pubkeyOrSession) {
    let actor =
      typeof pubkeyOrSession === "string" && pubkeyOrSession.trim()
        ? pubkeyOrSession.trim()
        : "";

    if (!actor) {
      if (this.sessionActor?.pubkey) {
        actor = this.sessionActor.pubkey.trim();
      } else if (typeof this.pubkey === "string" && this.pubkey.trim()) {
        actor = this.pubkey.trim();
      }
    }

    if (!actor) {
      return "";
    }

    const entry = this.watchHistoryCache.get(actor);
    if (!entry) {
      return "";
    }

    const pointerId =
      entry.pointerEvent && typeof entry.pointerEvent.id === "string"
        ? entry.pointerEvent.id
        : "";
    const pointerCreated =
      entry.pointerEvent && Number.isFinite(entry.pointerEvent.created_at)
        ? entry.pointerEvent.created_at
        : 0;
    const itemKeys = entry.items
      .map((item) => pointerKey(item))
      .filter(Boolean)
      .join("|");

    return `${pointerId}:${pointerCreated}:${itemKeys}`;
  }

  resetWatchHistoryProgress(pubkeyOrSession = null) {
    let actor =
      typeof pubkeyOrSession === "string" && pubkeyOrSession.trim()
        ? pubkeyOrSession.trim()
        : "";

    if (!actor) {
      if (this.sessionActor?.pubkey) {
        actor = this.sessionActor.pubkey.trim();
      } else if (typeof this.pubkey === "string" && this.pubkey.trim()) {
        actor = this.pubkey.trim();
      }
    }

    if (!actor) {
      return;
    }

    const entry = this.watchHistoryCache.get(actor);
    if (!entry) {
      return;
    }

    if (!(entry.delivered instanceof Set)) {
      entry.delivered = new Set();
    } else {
      entry.delivered.clear();
    }

    if (entry.resolving instanceof Set) {
      entry.resolving.clear();
    }
  }

  async encryptWatchHistoryPayload(actorPubkey, payload) {
    const normalizedActor =
      typeof actorPubkey === "string" && actorPubkey.trim()
        ? actorPubkey.trim().toLowerCase()
        : "";
    if (!normalizedActor) {
      return { ok: false, error: "invalid-actor" };
    }

    let normalizedPayload = payload;
    if (!normalizedPayload || typeof normalizedPayload !== "object") {
      normalizedPayload = {};
    }

    const items = Array.isArray(normalizedPayload.items)
      ? normalizedPayload.items
      : [];

    const version = Number.isFinite(normalizedPayload.version)
      ? normalizedPayload.version
      : 1;

    const prepared = {
      version,
      items,
    };

    if (version >= 2) {
      prepared.snapshot =
        typeof normalizedPayload.snapshot === "string"
          ? normalizedPayload.snapshot
          : "";
      prepared.chunkIndex = Number.isFinite(normalizedPayload.chunkIndex)
        ? Math.max(0, Math.floor(normalizedPayload.chunkIndex))
        : 0;
      prepared.totalChunks = Number.isFinite(normalizedPayload.totalChunks)
        ? Math.max(1, Math.floor(normalizedPayload.totalChunks))
        : 1;
    }

    const plaintext = JSON.stringify(prepared);

    let ciphertext = "";
    const normalizedLogged =
      typeof this.pubkey === "string" ? this.pubkey.toLowerCase() : "";

    if (
      normalizedActor &&
      normalizedActor === normalizedLogged &&
      window?.nostr?.nip04?.encrypt
    ) {
      try {
        ciphertext = await window.nostr.nip04.encrypt(
          normalizedActor,
          plaintext
        );
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[nostr] Failed to encrypt watch history with extension:",
            error
          );
        }
      }
    }

    if (!ciphertext) {
      try {
        if (!this.sessionActor || this.sessionActor.pubkey !== normalizedActor) {
          await this.ensureSessionActor(true);
        }
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[nostr] Failed to ensure session actor while encrypting watch history:",
            error
          );
        }
      }

      const privateKey = this.sessionActor?.privateKey;
      if (privateKey && window?.NostrTools?.nip04?.encrypt) {
        try {
          ciphertext = await window.NostrTools.nip04.encrypt(
            privateKey,
            normalizedActor,
            plaintext
          );
        } catch (error) {
          if (isDevMode) {
            console.warn(
              "[nostr] Failed to encrypt watch history with session key:",
              error
            );
          }
        }
      }
    }

    if (!ciphertext) {
      return { ok: false, error: "encryption-unavailable" };
    }

    return { ok: true, ciphertext };
  }

  async decryptWatchHistoryEvent(pointerEvent, actorPubkey) {
    const fallbackItems = extractPointerItemsFromEvent(pointerEvent);
    const fallbackPayload = {
      version: 0,
      items: fallbackItems,
      snapshot: "",
      chunkIndex: 0,
      totalChunks: 1,
    };

    const normalizedActor =
      typeof actorPubkey === "string" && actorPubkey.trim()
        ? actorPubkey.trim().toLowerCase()
        : "";
    if (!normalizedActor) {
      return fallbackPayload;
    }

    const ciphertext =
      pointerEvent && typeof pointerEvent.content === "string"
        ? pointerEvent.content.trim()
        : "";

    if (!ciphertext) {
      return fallbackPayload;
    }

    const normalizedLogged =
      typeof this.pubkey === "string" ? this.pubkey.toLowerCase() : "";

    if (
      normalizedActor &&
      normalizedActor === normalizedLogged &&
      window?.nostr?.nip04?.decrypt
    ) {
      try {
        const plaintext = await window.nostr.nip04.decrypt(
          normalizedActor,
          ciphertext
        );
        const parsed = parseWatchHistoryPayload(plaintext);
        if (parsed.items.length || fallbackItems.length === 0) {
          return parsed;
        }
        return { ...parsed, items: fallbackItems };
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[nostr] Failed to decrypt watch history with extension:",
            error
          );
        }
      }
    }

    try {
      if (!this.sessionActor || this.sessionActor.pubkey !== normalizedActor) {
        await this.ensureSessionActor(true);
      }
    } catch (error) {
      if (isDevMode) {
        console.warn(
          "[nostr] Failed to ensure session actor while decrypting watch history:",
          error
        );
      }
    }

    const privateKey = this.sessionActor?.privateKey;
    if (privateKey && window?.NostrTools?.nip04?.decrypt) {
      try {
        const plaintext = await window.NostrTools.nip04.decrypt(
          privateKey,
          normalizedActor,
          ciphertext
        );
        const parsed = parseWatchHistoryPayload(plaintext);
        if (parsed.items.length || fallbackItems.length === 0) {
          return parsed;
        }
        return { ...parsed, items: fallbackItems };
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[nostr] Failed to decrypt watch history with session key:",
            error
          );
        }
      }
    }

    return fallbackPayload;
  }

  cancelWatchHistoryRepublish(actor) {
    const key =
      typeof actor === "string" && actor.trim()
        ? actor.trim().toLowerCase()
        : "";
    if (!key) {
      return;
    }

    const timer = this.watchHistoryRepublishTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.watchHistoryRepublishTimers.delete(key);
    }
  }

  scheduleWatchHistoryRepublish(actor, items) {
    if (!this.pool) {
      return;
    }

    const key =
      typeof actor === "string" && actor.trim()
        ? actor.trim().toLowerCase()
        : "";
    if (!key || this.watchHistoryRepublishTimers.has(key)) {
      return;
    }

    const clonedItems = Array.isArray(items)
      ? items
          .map((item) => clonePointerItem(item))
          .filter((candidate) => !!candidate)
      : [];

    if (!clonedItems.length) {
      return;
    }

    const timer = setTimeout(() => {
      this.watchHistoryRepublishTimers.delete(key);
      this.publishWatchHistorySnapshot(actor, clonedItems, this.watchHistoryCache.get(actor) || null, {
        allowRetry: false,
      }).catch((error) => {
        if (isDevMode) {
          console.warn(
            `[nostr] Failed to republish watch history list for ${key}:`,
            error
          );
        }
      });
    }, 2000);

    this.watchHistoryRepublishTimers.set(key, timer);
  }

  async publishWatchHistorySnapshot(
    actorPubkey,
    candidateItems,
    existingEntry = null,
    options = {}
  ) {
    if (!this.pool) {
      return { ok: false, error: "nostr-uninitialized" };
    }

    const normalizedActor =
      typeof actorPubkey === "string" && actorPubkey.trim()
        ? actorPubkey.trim()
        : "";
    if (!normalizedActor) {
      return { ok: false, error: "missing-actor" };
    }

    const allowRetry = options?.allowRetry !== false;

    const dedupe = new Map();
    const normalizedItems = [];
    const pushItem = (item) => {
      const pointer = normalizePointerInput(item);
      if (!pointer) {
        return;
      }
      const key = pointerKey(pointer);
      if (!key || dedupe.has(key)) {
        return;
      }
      dedupe.set(key, true);
      normalizedItems.push(pointer);
    };

    if (Array.isArray(candidateItems)) {
      candidateItems.forEach((item) => pushItem(item));
    } else if (candidateItems) {
      pushItem(candidateItems);
    }

    const trimmedItems =
      normalizedItems.length > WATCH_HISTORY_MAX_ITEMS
        ? normalizedItems.slice(0, WATCH_HISTORY_MAX_ITEMS)
        : normalizedItems;

    const payloadItems = trimmedItems.map((item) => ({
      type: item.type,
      value: item.value,
      relay: item.relay || null,
      watchedAt: Number.isFinite(item.watchedAt)
        ? Math.max(0, Math.floor(item.watchedAt))
        : 0,
    }));

    const maxBytesCandidate = Number.isFinite(this.watchHistoryPayloadMaxBytes)
      ? this.watchHistoryPayloadMaxBytes
      : WATCH_HISTORY_PAYLOAD_MAX_BYTES;
    const maxPayloadBytes = Math.max(64, Math.floor(maxBytesCandidate));
    const snapshotId = `${Math.floor(Date.now() / 1000)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    const chunkInfo = chunkWatchHistoryPayloadItems(
      payloadItems,
      snapshotId,
      maxPayloadBytes
    );
    const chunkItemsList = chunkInfo.chunks || [];
    const skippedKeys = new Set(
      (chunkInfo.skipped || [])
        .map((item) => pointerKey(item))
        .filter((key) => !!key)
    );

    const persistedItems = trimmedItems.filter((item) => {
      const key = pointerKey(item);
      return key && !skippedKeys.has(key);
    });

    if (chunkInfo.skipped?.length && isDevMode) {
      console.warn(
        `[nostr] Skipped ${chunkInfo.skipped.length} oversized watch history entries while chunking.`
      );
    }

    const relays =
      Array.isArray(this.relays) && this.relays.length ? this.relays : RELAY_URLS;

    const normalizedLogged =
      typeof this.pubkey === "string" ? this.pubkey.toLowerCase() : "";
    const normalizedActorLower = normalizedActor.toLowerCase();
    const useExtension =
      normalizedActorLower === normalizedLogged &&
      window?.nostr &&
      typeof window.nostr.signEvent === "function";

    if (!useExtension) {
      try {
        if (!this.sessionActor || this.sessionActor.pubkey !== normalizedActor) {
          await this.ensureSessionActor(true);
        }
        if (!this.sessionActor || this.sessionActor.pubkey !== normalizedActor) {
          throw new Error("session-actor-mismatch");
        }
      } catch (error) {
        console.warn(
          "[nostr] Failed to prepare signing key for watch history chunks:",
          error
        );
        return { ok: false, error: "signing-failed", details: error };
      }
    }

    const totalChunks = chunkItemsList.length || 1;
    const chunkIdentifiers = chunkItemsList.map((_, index) =>
      index === 0
        ? WATCH_HISTORY_LIST_IDENTIFIER
        : `watch-history:${snapshotId}:${index}`
    );
    const chunkAddresses = chunkIdentifiers.map(
      (identifier) => `${WATCH_HISTORY_KIND}:${normalizedActor}:${identifier}`
    );

    const nowSeconds = Math.floor(Date.now() / 1000);
    let lastCreatedAt = 0;

    const pointerCandidates = [];
    if (existingEntry?.pointerEvent) {
      pointerCandidates.push(existingEntry.pointerEvent);
    }

    const cachedPointerEvent = this.watchHistoryCache.get(normalizedActor)?.pointerEvent;
    if (cachedPointerEvent) {
      pointerCandidates.push(cachedPointerEvent);
    }

    for (const candidate of pointerCandidates) {
      if (!candidate || typeof candidate !== "object") {
        continue;
      }
      const createdAt = Number.isFinite(candidate.created_at)
        ? Math.floor(candidate.created_at)
        : null;
      if (createdAt !== null && createdAt > lastCreatedAt) {
        lastCreatedAt = createdAt;
      }
    }

    const baseTimestamp = Math.max(nowSeconds, lastCreatedAt + totalChunks);
    const chunkResults = [];
    let overallSuccess = true;

    for (let index = 0; index < totalChunks; index++) {
      const chunkItems = Array.isArray(chunkItemsList[index])
        ? chunkItemsList[index]
        : [];

      const payload = {
        version: 2,
        snapshot: snapshotId,
        chunkIndex: index,
        totalChunks,
        items: chunkItems,
      };

      const encryptionResult = await this.encryptWatchHistoryPayload(
        normalizedActor,
        payload
      );
      if (!encryptionResult.ok) {
        if (isDevMode) {
          console.warn(
            "[nostr] Unable to encrypt watch history chunk:",
            encryptionResult.error
          );
        }
        return encryptionResult;
      }

      const pointerTags = chunkItems.map((item) => {
        const tag = [item.type, item.value];
        if (item.relay) {
          tag.push(item.relay);
        }
        return tag;
      });

      const chunkIdentifier = chunkIdentifiers[index] || WATCH_HISTORY_LIST_IDENTIFIER;

      const tags = [
        ["d", chunkIdentifier],
        ["encrypted", "nip04"],
        ["snapshot", snapshotId],
        ["chunk", String(index), String(totalChunks)],
        ...pointerTags,
      ];
      if (index === 0) {
        tags.splice(2, 0, ["head", "1"]);
        const pointerTagsForChunks = chunkAddresses
          .map((address) =>
            typeof address === "string" && address
              ? ["a", address]
              : null
          )
          .filter(Boolean);
        tags.push(...pointerTagsForChunks);
      }

      // Ensure created_at stays monotonic so chunk 0 always outranks prior snapshots
      // even when multiple publishes land within the same wall-clock second.
      const event = {
        kind: WATCH_HISTORY_KIND,
        pubkey: normalizedActor,
        created_at: baseTimestamp + (totalChunks - index - 1),
        tags,
        content: encryptionResult.ciphertext,
      };

      let signedEvent;
      if (useExtension) {
        try {
          signedEvent = await window.nostr.signEvent(event);
        } catch (error) {
          console.warn(
            "[nostr] Failed to sign watch history chunk with extension:",
            error
          );
          return { ok: false, error: "signing-failed", details: error };
        }
      } else {
        try {
          signedEvent = signEventWithPrivateKey(
            event,
            this.sessionActor.privateKey
          );
        } catch (error) {
          console.warn(
            "[nostr] Failed to sign watch history chunk with session key:",
            error
          );
          return { ok: false, error: "signing-failed", details: error };
        }
      }

      const publishResults = await Promise.all(
        relays.map((url) => publishEventToRelay(this.pool, url, signedEvent))
      );

      const chunkSuccess = publishResults.some((result) => result.success);
      if (!chunkSuccess) {
        overallSuccess = false;
        console.warn(
          "[nostr] Failed to publish watch history chunk:",
          publishResults
        );
      }

      chunkResults.push({
        chunkIndex: index,
        event: signedEvent,
        results: publishResults,
        success: chunkSuccess,
      });
    }

    if (overallSuccess) {
      this.cancelWatchHistoryRepublish(normalizedActor);
    } else if (allowRetry && persistedItems.length) {
      this.scheduleWatchHistoryRepublish(normalizedActor, persistedItems);
    }

    const baselineEntry =
      existingEntry || this.watchHistoryCache.get(normalizedActor) || null;

    const headEvent = chunkResults[0]?.event || null;
    const newEntry = this.createWatchHistoryEntry(
      headEvent,
      persistedItems,
      Date.now(),
      baselineEntry
    );

    this.watchHistoryCache.set(normalizedActor, newEntry);
    this.persistWatchHistoryEntry(normalizedActor, newEntry);

    return {
      ok: overallSuccess,
      event: headEvent,
      events: chunkResults.map((chunk) => chunk.event),
      chunks: chunkResults,
      results: chunkResults.map((chunk) => chunk.results),
      snapshot: snapshotId,
      items: newEntry.items
        .map((item) => clonePointerItem(item))
        .filter(Boolean),
    };
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

    const nostrTools = window?.NostrTools || {};
    const keyGenerator =
      typeof nostrTools.generatePrivateKey === "function"
        ? nostrTools.generatePrivateKey
        : typeof nostrTools.generateSecretKey === "function"
        ? nostrTools.generateSecretKey
        : null;
    const pubkeyDeriver =
      typeof nostrTools.getPublicKey === "function"
        ? nostrTools.getPublicKey
        : null;

    if (!keyGenerator || !pubkeyDeriver) {
      if (isDevMode) {
        console.warn(
          "[nostr] Unable to generate session actor: missing NostrTools helpers."
        );
      }
      return "";
    }

    let privateKey = keyGenerator();
    if (privateKey && typeof privateKey !== "string") {
      const hasLength =
        typeof privateKey === "object" &&
        privateKey !== null &&
        typeof privateKey.length === "number";
      if (nostrTools.utils?.bytesToHex && hasLength) {
        try {
          privateKey = nostrTools.utils.bytesToHex(privateKey);
        } catch (error) {
          if (isDevMode) {
            console.warn(
              "[nostr] Failed to normalize generated private key:",
              error
            );
          }
          privateKey = "";
        }
      } else {
        privateKey = "";
      }
    }

    if (typeof privateKey !== "string" || !privateKey) {
      if (isDevMode) {
        console.warn(
          "[nostr] Unable to generate session actor: invalid private key output."
        );
      }
      return "";
    }

    let pubkey = pubkeyDeriver(privateKey);
    if (pubkey && typeof pubkey !== "string") {
      const hasLength =
        typeof pubkey === "object" &&
        pubkey !== null &&
        typeof pubkey.length === "number";
      if (nostrTools.utils?.bytesToHex && hasLength) {
        try {
          pubkey = nostrTools.utils.bytesToHex(pubkey);
        } catch (error) {
          if (isDevMode) {
            console.warn(
              "[nostr] Failed to normalize generated public key:",
              error
            );
          }
          pubkey = "";
        }
      } else {
        pubkey = "";
      }
    }

    if (typeof pubkey !== "string" || !pubkey) {
      if (isDevMode) {
        console.warn(
          "[nostr] Unable to generate session actor: invalid public key output."
        );
      }
      return "";
    }

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

    const normalizedActor =
      typeof actorPubkey === "string" ? actorPubkey.toLowerCase() : "";
    const normalizedLogged =
      typeof this.pubkey === "string" ? this.pubkey.toLowerCase() : "";
    const usingSessionActor =
      normalizedActor && normalizedActor !== normalizedLogged;

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

    if (
      usingSessionActor &&
      !tags.some((tag) => tag[0] === "session" && tag[1] === "true")
    ) {
      tags.push(["session", "true"]);
    }
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

  async listVideoViewEvents(pointer, options = {}) {
    if (!this.pool) {
      return [];
    }

    const filter = createVideoViewEventFilter(pointer);
    const pointerValue = filter["#video"][0];
    const { since, until, limit, relays } = options || {};

    if (Number.isFinite(since)) {
      filter.since = Math.floor(since);
    }

    if (Number.isFinite(until)) {
      filter.until = Math.floor(until);
    }

    if (Number.isFinite(limit) && limit > 0) {
      filter.limit = Math.floor(limit);
    }

    const relayList = Array.isArray(relays) && relays.length
      ? relays
      : Array.isArray(this.relays) && this.relays.length
      ? this.relays
      : RELAY_URLS;

    let rawResults;
    try {
      rawResults = await this.pool.list(relayList, [filter]);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to list video view events:", error);
      }
      return [];
    }

    const flattenResults = (input) => {
      if (!Array.isArray(input)) {
        return [];
      }

      const flat = [];
      for (const chunk of input) {
        if (Array.isArray(chunk)) {
          for (const item of chunk) {
            if (item && typeof item === "object") {
              flat.push(item);
            }
          }
        } else if (chunk && typeof chunk === "object") {
          flat.push(chunk);
        }
      }
      return flat;
    };

    const flattened = flattenResults(rawResults);
    const dedupe = new Map();
    const order = [];

    for (const event of flattened) {
      if (!isVideoViewEvent(event, pointerValue)) {
        continue;
      }

      const eventId = typeof event.id === "string" ? event.id : null;
      if (!eventId) {
        order.push({ type: "raw", event });
        continue;
      }

      const existing = dedupe.get(eventId);
      if (!existing) {
        dedupe.set(eventId, event);
        order.push({ type: "id", key: eventId });
        continue;
      }

      const existingCreated = Number.isFinite(existing?.created_at)
        ? existing.created_at
        : 0;
      const incomingCreated = Number.isFinite(event.created_at)
        ? event.created_at
        : 0;
      if (incomingCreated > existingCreated) {
        dedupe.set(eventId, event);
      }
    }

    return order
      .map((entry) => {
        if (!entry) {
          return null;
        }
        if (entry.type === "raw") {
          return entry.event || null;
        }
        if (entry.type === "id") {
          return dedupe.get(entry.key) || null;
        }
        return null;
      })
      .filter(Boolean);
  }

  subscribeVideoViewEvents(pointer, options = {}) {
    if (!this.pool) {
      if (isDevMode) {
        console.warn("[nostr] Unable to subscribe to view events: pool missing.");
      }
      return () => {};
    }

    const filter = createVideoViewEventFilter(pointer);
    const pointerValue = filter["#video"][0];

    if (Number.isFinite(options?.since)) {
      filter.since = Math.floor(options.since);
    }

    const relayList = Array.isArray(options?.relays) && options.relays.length
      ? options.relays
      : Array.isArray(this.relays) && this.relays.length
      ? this.relays
      : RELAY_URLS;

    const onEvent = typeof options?.onEvent === "function" ? options.onEvent : null;

    let subscription;
    try {
      subscription = this.pool.sub(relayList, [filter]);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to open video view subscription:", error);
      }
      return () => {};
    }

    if (onEvent) {
      subscription.on("event", (event) => {
        if (isVideoViewEvent(event, pointerValue)) {
          try {
            onEvent(event);
          } catch (error) {
            if (isDevMode) {
              console.warn("[nostr] Video view event handler threw:", error);
            }
          }
        }
      });
    }

    const originalUnsub =
      typeof subscription.unsub === "function"
        ? subscription.unsub.bind(subscription)
        : null;

    let unsubscribed = false;
    return () => {
      if (unsubscribed) {
        return;
      }
      unsubscribed = true;
      if (originalUnsub) {
        try {
          originalUnsub();
        } catch (error) {
          if (isDevMode) {
            console.warn(
              "[nostr] Failed to unsubscribe from video view events:",
              error
            );
          }
        }
      }
    };
  }

  async countVideoViewEvents(pointer, options = {}) {
    if (!this.pool) {
      const events = await this.listVideoViewEvents(pointer, options);
      return {
        total: Array.isArray(events) ? events.length : 0,
        perRelay: [],
        fallback: true,
      };
    }

    const filter = createVideoViewEventFilter(pointer);
    const relayList = Array.isArray(options?.relays) && options.relays.length
      ? options.relays
      : undefined;

    const signal = options?.signal;
    const normalizeAbortError = () => {
      if (signal?.reason instanceof Error) {
        return signal.reason;
      }
      if (typeof DOMException === "function") {
        return new DOMException("Operation aborted", "AbortError");
      }
      const error = new Error("Operation aborted");
      error.name = "AbortError";
      return error;
    };
    if (signal?.aborted) {
      throw normalizeAbortError();
    }

    try {
      const result = await this.countEventsAcrossRelays([filter], {
        relays: relayList,
        timeoutMs: options?.timeoutMs,
      });

      if (result?.perRelay?.some((entry) => entry && entry.ok)) {
        return { ...result, fallback: false };
      }
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] COUNT view request failed:", error);
      }
    }

    if (signal?.aborted) {
      throw normalizeAbortError();
    }

    const abortPromise =
      signal &&
      typeof signal === "object" &&
      typeof signal.addEventListener === "function"
        ? new Promise((_, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                reject(normalizeAbortError());
              },
              { once: true }
            );
          })
        : null;

    const listPromise = this.listVideoViewEvents(pointer, {
      relays: relayList,
    });

    const events = abortPromise
      ? await Promise.race([listPromise, abortPromise])
      : await listPromise;

    return {
      total: Array.isArray(events) ? events.length : 0,
      perRelay: [],
      fallback: true,
    };
  }

  async updateWatchHistoryList(pointer) {
    if (!this.pool) {
      return { ok: false, error: "nostr-uninitialized" };
    }

    const normalizedPointer = normalizePointerInput(pointer);
    if (!normalizedPointer) {
      return { ok: false, error: "invalid-pointer" };
    }

    if (Number.isFinite(normalizedPointer.watchedAt)) {
      normalizedPointer.watchedAt = Math.max(
        0,
        Math.floor(normalizedPointer.watchedAt)
      );
    } else {
      normalizedPointer.watchedAt = Date.now();
    }

    const actorPubkey = await this.ensureSessionActor();
    if (!actorPubkey) {
      return { ok: false, error: "missing-actor" };
    }

    await this.fetchWatchHistory(actorPubkey);

    const existingEntry =
      this.watchHistoryCache.get(actorPubkey) ||
      this.createWatchHistoryEntry(null, [], Date.now());

    const candidates = [normalizedPointer, ...(existingEntry.items || [])];
    return this.publishWatchHistorySnapshot(actorPubkey, candidates, existingEntry);
  }

  async removeWatchHistoryItem(pointerOrKey) {
    if (!this.pool) {
      return { ok: false, error: "nostr-uninitialized" };
    }

    const actorPubkey = await this.ensureSessionActor();
    if (!actorPubkey) {
      return { ok: false, error: "missing-actor" };
    }

    await this.fetchWatchHistory(actorPubkey);

    const entry = this.watchHistoryCache.get(actorPubkey);
    if (!entry) {
      return { ok: false, error: "missing-entry" };
    }

    let targetKey = "";
    if (typeof pointerOrKey === "string" && pointerOrKey.trim()) {
      targetKey = pointerOrKey.trim().toLowerCase();
    } else if (pointerOrKey) {
      const normalizedPointer = normalizePointerInput(pointerOrKey);
      targetKey = pointerKey(normalizedPointer);
    }

    if (!targetKey) {
      return { ok: false, error: "invalid-pointer" };
    }

    const filteredItems = entry.items.filter((item) => {
      const key = pointerKey(item);
      return key && key !== targetKey;
    });

    if (filteredItems.length === entry.items.length) {
      return { ok: false, error: "pointer-not-found" };
    }

    const result = await this.publishWatchHistorySnapshot(
      actorPubkey,
      filteredItems,
      entry
    );

    if (!result.ok) {
      return result;
    }

    return { ...result, removedKey: targetKey };
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
    const ttl = this.getWatchHistoryCacheTtlMs();
    const cached = this.watchHistoryCache.get(actor);
    if (cached) {
      if (now - cached.savedAt < ttl) {
        return {
          pointerEvent: cached.pointerEvent
            ? cloneEventForCache(cached.pointerEvent)
            : null,
          items: cached.items
            .map((item) => clonePointerItem(item))
            .filter(Boolean),
        };
      }
      this.watchHistoryCache.delete(actor);
    }

    let storage = null;
    let stored = null;
    if (typeof localStorage !== "undefined") {
      storage = this.getWatchHistoryStorage();
      stored = storage.actors?.[actor];
      if (
        stored &&
        typeof stored.savedAt === "number" &&
        now - stored.savedAt < ttl
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

    const fetchLimitCandidate = Number.isFinite(this.watchHistoryFetchEventLimit)
      ? this.watchHistoryFetchEventLimit
      : WATCH_HISTORY_FETCH_EVENT_LIMIT;
    const fetchLimit = Math.max(1, Math.floor(fetchLimitCandidate));

    const filter = {
      kinds: [WATCH_HISTORY_KIND],
      authors: [actor],
      "#d": [WATCH_HISTORY_LIST_IDENTIFIER],
      limit: fetchLimit,
    };

    let fetchedHeadEvents = [];
    try {
      const events = await this.pool.list(relayList, [filter]);
      if (Array.isArray(events)) {
        const dedupe = new Map();
        for (const evt of events) {
          if (!evt || typeof evt !== "object") {
            continue;
          }
          const id = typeof evt.id === "string" ? evt.id : null;
          if (!id) {
            continue;
          }
          const existing = dedupe.get(id);
          if (
            !existing ||
            (typeof evt.created_at === "number" ? evt.created_at : 0) >
              (typeof existing.created_at === "number" ? existing.created_at : 0)
          ) {
            dedupe.set(id, evt);
          }
        }
        fetchedHeadEvents = Array.from(dedupe.values());
      }
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to fetch watch history list:", error);
      }
    }

    fetchedHeadEvents.sort((a, b) => {
      const aCreated = typeof a?.created_at === "number" ? a.created_at : 0;
      const bCreated = typeof b?.created_at === "number" ? b.created_at : 0;
      return bCreated - aCreated;
    });

    const chunkIdentifiers = new Set();
    const snapshotIds = new Set();

    for (const event of fetchedHeadEvents) {
      if (!event || typeof event !== "object") {
        continue;
      }

      const tags = Array.isArray(event.tags) ? event.tags : [];
      for (const tag of tags) {
        if (!Array.isArray(tag) || tag.length < 2) {
          continue;
        }
        if (tag[0] === "snapshot" && typeof tag[1] === "string" && tag[1]) {
          snapshotIds.add(tag[1]);
        } else if (tag[0] === "a") {
          const pointer = normalizePointerTag(tag);
          if (pointer?.type === "a") {
            const [kindStr, pubkey, identifier] = pointer.value.split(":");
            const kind = Number.parseInt(kindStr, 10);
            if (
              Number.isFinite(kind) &&
              kind === WATCH_HISTORY_KIND &&
              typeof pubkey === "string" &&
              pubkey === actor &&
              typeof identifier === "string" &&
              identifier &&
              identifier !== WATCH_HISTORY_LIST_IDENTIFIER
            ) {
              chunkIdentifiers.add(identifier);
            }
          }
        }
      }
    }

    const chunkFilters = [];
    const chunkFetchLimit = Math.max(
      fetchLimit,
      chunkIdentifiers.size ? chunkIdentifiers.size + 1 : 0,
      snapshotIds.size ? snapshotIds.size * 2 : 0
    );

    if (chunkIdentifiers.size) {
      chunkFilters.push({
        kinds: [WATCH_HISTORY_KIND],
        authors: [actor],
        "#d": Array.from(chunkIdentifiers),
        limit: chunkFetchLimit,
      });
    }

    if (snapshotIds.size) {
      chunkFilters.push({
        kinds: [WATCH_HISTORY_KIND],
        authors: [actor],
        "#snapshot": Array.from(snapshotIds),
        limit: chunkFetchLimit,
      });
    }

    let fetchedChunkEvents = [];
    if (chunkFilters.length) {
      try {
        const events = await this.pool.list(relayList, chunkFilters);
        if (Array.isArray(events)) {
          fetchedChunkEvents = events;
        }
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[nostr] Failed to fetch watch history chunks:",
            error
          );
        }
      }
    }

    const eventDedupe = new Map();
    const registerEvent = (evt) => {
      if (!evt || typeof evt !== "object") {
        return;
      }
      const id = typeof evt.id === "string" ? evt.id : null;
      if (!id) {
        return;
      }
      const existing = eventDedupe.get(id);
      if (
        !existing ||
        (typeof evt.created_at === "number" ? evt.created_at : 0) >
          (typeof existing.created_at === "number" ? existing.created_at : 0)
      ) {
        eventDedupe.set(id, evt);
      }
    };

    fetchedHeadEvents.forEach(registerEvent);
    fetchedChunkEvents.forEach(registerEvent);

    const fetchedEvents = Array.from(eventDedupe.values());

    fetchedEvents.sort((a, b) => {
      const aCreated = typeof a?.created_at === "number" ? a.created_at : 0;
      const bCreated = typeof b?.created_at === "number" ? b.created_at : 0;
      return bCreated - aCreated;
    });

    const snapshotMap = new Map();

    for (const event of fetchedEvents) {
      if (!event || typeof event !== "object") {
        continue;
      }

      const tags = Array.isArray(event.tags) ? event.tags : [];
      let taggedSnapshotId = "";
      let taggedChunkIndex = null;
      let taggedTotalChunks = null;

      for (const tag of tags) {
        if (!Array.isArray(tag) || tag.length < 2) {
          continue;
        }
        if (tag[0] === "snapshot" && typeof tag[1] === "string") {
          taggedSnapshotId = tag[1];
        } else if (tag[0] === "chunk") {
          const index = Number.parseInt(tag[1], 10);
          const total = Number.parseInt(tag[2], 10);
          if (Number.isFinite(index)) {
            taggedChunkIndex = Math.max(0, index);
          }
          if (Number.isFinite(total) && total > 0) {
            taggedTotalChunks = total;
          }
        }
      }

      const payload = await this.decryptWatchHistoryEvent(event, actor);
      let snapshotId =
        (typeof payload.snapshot === "string" && payload.snapshot) ||
        taggedSnapshotId;
      if (!snapshotId) {
        const createdAt =
          typeof event.created_at === "number" ? event.created_at : 0;
        const fallbackId =
          typeof event.id === "string" && event.id
            ? event.id
            : `${createdAt}:${Math.random().toString(36).slice(2, 10)}`;
        snapshotId = fallbackId;
      }

      let chunkIndex = Number.isFinite(payload.chunkIndex)
        ? Math.max(0, Math.floor(payload.chunkIndex))
        : 0;
      let totalChunks = Number.isFinite(payload.totalChunks)
        ? Math.max(1, Math.floor(payload.totalChunks))
        : 1;

      if (Number.isFinite(taggedChunkIndex)) {
        chunkIndex = Math.max(0, Math.floor(taggedChunkIndex));
      }
      if (Number.isFinite(taggedTotalChunks)) {
        totalChunks = Math.max(1, Math.floor(taggedTotalChunks));
      }

      const bucket = snapshotMap.get(snapshotId) || {
        snapshotId,
        chunks: new Map(),
        expectedChunks: totalChunks,
        latestCreatedAt:
          typeof event.created_at === "number" ? event.created_at : 0,
        version: payload.version || 0,
      };

      bucket.chunks.set(chunkIndex, {
        event,
        payload: {
          ...payload,
          snapshot: snapshotId,
          chunkIndex,
          totalChunks,
        },
        created_at: typeof event.created_at === "number" ? event.created_at : 0,
      });
      bucket.expectedChunks = Math.max(bucket.expectedChunks, totalChunks);
      const createdAt =
        typeof event.created_at === "number" ? event.created_at : 0;
      if (createdAt > bucket.latestCreatedAt) {
        bucket.latestCreatedAt = createdAt;
      }
      bucket.version = Math.max(bucket.version, payload.version || 0);
      snapshotMap.set(snapshotId, bucket);
    }

    const snapshotBuckets = Array.from(snapshotMap.values()).sort(
      (a, b) => b.latestCreatedAt - a.latestCreatedAt
    );

    let selectedSnapshot = null;
    let fallbackSnapshot = null;

    for (const bucket of snapshotBuckets) {
      const chunkIndices = Array.from(bucket.chunks.keys()).sort(
        (a, b) => a - b
      );
      const seenKeys = new Set();
      const combinedItems = [];
      let pointerCandidate = null;

      for (const index of chunkIndices) {
        const chunk = bucket.chunks.get(index);
        if (!chunk) {
          continue;
        }
        if (!pointerCandidate && chunk.payload.chunkIndex === 0) {
          pointerCandidate = chunk.event;
        }
        const items = Array.isArray(chunk.payload.items)
          ? chunk.payload.items
          : [];
        for (const pointer of items) {
          const key = pointerKey(pointer);
          if (!key || seenKeys.has(key)) {
            continue;
          }
          seenKeys.add(key);
          combinedItems.push(pointer);
        }
      }

      if (!pointerCandidate && chunkIndices.length) {
        const firstChunk = bucket.chunks.get(chunkIndices[0]);
        pointerCandidate = firstChunk?.event || null;
      }

      const snapshot = {
        snapshotId: bucket.snapshotId,
        items: combinedItems,
        pointerEvent: pointerCandidate || null,
        version: bucket.version,
        chunkCount: chunkIndices.length,
        expectedChunks: Math.max(bucket.expectedChunks, chunkIndices.length || 1),
      };

      if (!fallbackSnapshot) {
        fallbackSnapshot = snapshot;
      }

      if (snapshot.chunkCount >= snapshot.expectedChunks) {
        selectedSnapshot = snapshot;
        break;
      }

      if (!selectedSnapshot) {
        selectedSnapshot = snapshot;
      }
    }

    const effectiveSnapshot = selectedSnapshot || fallbackSnapshot || null;

    const previousEntry = this.watchHistoryCache.get(actor) || null;
    const storedItems = Array.isArray(stored?.items) ? stored.items : [];
    const storedPointerEvent = stored?.pointerEvent || null;

    const remoteItems = Array.isArray(effectiveSnapshot?.items)
      ? effectiveSnapshot.items
      : [];

    let pointerForEntry = effectiveSnapshot?.pointerEvent || null;
    if (!pointerForEntry) {
      if (previousEntry?.pointerEvent) {
        pointerForEntry = previousEntry.pointerEvent;
      } else if (storedPointerEvent) {
        pointerForEntry = storedPointerEvent;
      }
    }

    let items = remoteItems;
    let usedFallback = false;
    const remoteVersion = effectiveSnapshot?.version ?? 0;

    if (!effectiveSnapshot || (remoteVersion === 0 && !remoteItems.length)) {
      if (previousEntry?.items?.length) {
        items = previousEntry.items;
        usedFallback = true;
      } else if (storedItems.length) {
        items = storedItems;
        usedFallback = true;
      }
    }

    const entry = this.createWatchHistoryEntry(
      pointerForEntry,
      items,
      Date.now(),
      previousEntry
    );

    if (!(entry.chunkEvents instanceof Map)) {
      entry.chunkEvents = new Map();
    } else {
      entry.chunkEvents.clear();
    }

    const chunkPointerItemsForEntry = [];
    let headPointerForEntry = null;
    const chunkPointerKeys = new Set();

    if (effectiveSnapshot?.snapshotId) {
      const bucketForEntry = snapshotMap.get(effectiveSnapshot.snapshotId);
      if (bucketForEntry) {
        const chunkEntries = Array.from(bucketForEntry.chunks.values()).sort(
          (a, b) => a.payload.chunkIndex - b.payload.chunkIndex
        );
        for (const chunk of chunkEntries) {
          if (!chunk?.event) {
            continue;
          }
          const addressValue = eventToAddressPointer(chunk.event);
          if (!addressValue) {
            continue;
          }
          const pointer = clonePointerItem({
            type: "a",
            value: addressValue,
            relay: null,
          });
          if (!pointer) {
            continue;
          }
          const key = pointerKey(pointer);
          if (!key) {
            continue;
          }
          const clonedChunkEvent = cloneEventForCache(chunk.event);
          if (clonedChunkEvent) {
            entry.chunkEvents.set(key, clonedChunkEvent);
          }
          chunkPointerKeys.add(key);
          if (chunk.payload?.chunkIndex === 0) {
            headPointerForEntry = pointer;
          } else {
            chunkPointerItemsForEntry.push(pointer);
          }
        }
      }
    }

    entry.chunkPointers = {
      head: headPointerForEntry,
      chunks: chunkPointerItemsForEntry,
    };

    const headPointerKey = headPointerForEntry ? pointerKey(headPointerForEntry) : "";
    if (headPointerKey) {
      chunkPointerKeys.add(headPointerKey);
      if (entry.pointerEvent) {
        entry.chunkEvents.set(headPointerKey, cloneEventForCache(entry.pointerEvent));
      }
    }

    for (const key of Array.from(entry.resolved.keys())) {
      if (
        !key ||
        !key.startsWith(`a:${WATCH_HISTORY_KIND}:`)
      ) {
        continue;
      }
      if (!chunkPointerKeys.has(key)) {
        entry.resolved.delete(key);
      }
    }

    for (const key of chunkPointerKeys) {
      const eventForKey = entry.chunkEvents.get(key);
      if (eventForKey) {
        entry.resolved.set(key, cloneEventForCache(eventForKey));
      }
    }

    this.watchHistoryCache.set(actor, entry);
    this.persistWatchHistoryEntry(actor, entry);

    if (
      (!effectiveSnapshot || !effectiveSnapshot.pointerEvent) &&
      usedFallback &&
      entry.items.length
    ) {
      this.scheduleWatchHistoryRepublish(actor, entry.items);
    }

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

    if (!(entry.resolvedVideos instanceof Map)) {
      entry.resolvedVideos = new Map();
    }
    if (!(entry.delivered instanceof Set)) {
      entry.delivered = new Set();
    }

    const parsedBatchSize = Number(batchSize);
    const normalizedBatchSize =
      Number.isFinite(parsedBatchSize) && parsedBatchSize > 0
        ? Math.floor(parsedBatchSize)
        : 20;
    const effectiveBatchSize = WATCH_HISTORY_BATCH_RESOLVE
      ? Math.max(1, normalizedBatchSize)
      : 1;

    const classifyWatchHistoryPointer = (pointer, ownerPubkey) => {
      if (!pointer || pointer.type !== "a") {
        return "none";
      }
      const value =
        typeof pointer.value === "string" ? pointer.value.trim() : "";
      if (!value) {
        return "none";
      }
      const parts = value.split(":");
      if (parts.length < 3) {
        return "none";
      }
      const [kindStr, pubkeyRaw, ...identifierParts] = parts;
      const kind = Number.parseInt(kindStr, 10);
      if (!Number.isFinite(kind) || kind !== WATCH_HISTORY_KIND) {
        return "none";
      }
      const identifier = identifierParts.join(":");
      const normalizedIdentifier =
        typeof identifier === "string" ? identifier.trim() : "";
      if (!normalizedIdentifier) {
        return "none";
      }
      const normalizedIdentifierLower = normalizedIdentifier.toLowerCase();
      if (normalizedIdentifierLower === WATCH_HISTORY_LIST_IDENTIFIER) {
        return "head";
      }
      if (!normalizedIdentifierLower.startsWith("watch-history:")) {
        return "none";
      }
      const normalizedOwner =
        typeof ownerPubkey === "string" && ownerPubkey.trim()
          ? ownerPubkey.trim().toLowerCase()
          : "";
      const normalizedPubkey =
        typeof pubkeyRaw === "string" && pubkeyRaw.trim()
          ? pubkeyRaw.trim().toLowerCase()
          : "";
      if (!normalizedOwner || !normalizedPubkey || normalizedOwner === normalizedPubkey) {
        return "chunk";
      }
      return "none";
    };

    const addPointerToMap = (pointer, map) => {
      const normalized = clonePointerItem(pointer);
      if (!normalized) {
        return null;
      }
      const key = pointerKey(normalized);
      if (!key) {
        return null;
      }
      map.set(key, normalized);
      return normalized;
    };

    const headPointerMap = new Map();
    const chunkPointerMap = new Map();
    const videoCandidates = [];

    if (entry.chunkPointers?.head) {
      addPointerToMap(entry.chunkPointers.head, headPointerMap);
    }
    if (Array.isArray(entry.chunkPointers?.chunks)) {
      for (const chunkPointer of entry.chunkPointers.chunks) {
        addPointerToMap(chunkPointer, chunkPointerMap);
      }
    }

    for (const item of entry.items) {
      const pointer = clonePointerItem(item);
      if (!pointer) {
        continue;
      }
      const pointerType = classifyWatchHistoryPointer(pointer, actor);
      if (pointerType === "head") {
        addPointerToMap(pointer, headPointerMap);
        continue;
      }
      if (pointerType === "chunk") {
        addPointerToMap(pointer, chunkPointerMap);
        continue;
      }
      videoCandidates.push(pointer);
    }

    const pointerEventClone = entry.pointerEvent
      ? cloneEventForCache(entry.pointerEvent)
      : null;
    for (const pointer of headPointerMap.values()) {
      const key = pointerKey(pointer);
      if (!key) {
        continue;
      }
      if (pointerEventClone) {
        entry.resolved.set(key, pointerEventClone);
        if (entry.chunkEvents instanceof Map) {
          entry.chunkEvents.set(key, pointerEventClone);
        }
      } else if (!entry.resolved.has(key)) {
        entry.resolved.set(key, null);
      }
      entry.resolving.delete(key);
    }

    const available = videoCandidates.filter((item) => {
      const key = pointerKey(item);
      if (!key) {
        return false;
      }
      if (entry.delivered.has(key)) {
        return false;
      }
      if (entry.resolving.has(key)) {
        return false;
      }
      if (entry.resolvedVideos.has(key)) {
        const cachedVideo = entry.resolvedVideos.get(key);
        if (cachedVideo && typeof cachedVideo === "object" && cachedVideo.id) {
          return false;
        }
      }
      return true;
    });

    const chunkAvailable = [];
    for (const [key, pointer] of chunkPointerMap.entries()) {
      if (!key) {
        continue;
      }
      if (entry.resolved.has(key)) {
        continue;
      }
      if (entry.resolving.has(key)) {
        continue;
      }
      const cachedChunk = entry.chunkEvents?.get?.(key);
      if (cachedChunk) {
        const cloned = cloneEventForCache(cachedChunk);
        if (cloned) {
          entry.chunkEvents.set(key, cloned);
          entry.resolved.set(key, cloned);
        } else {
          entry.resolved.set(key, cachedChunk);
        }
        continue;
      }
      chunkAvailable.push(pointer);
    }

    const videoBatch = available.slice(0, effectiveBatchSize);
    const batch = [...videoBatch, ...chunkAvailable];

    const relaySet = new Set(
      Array.isArray(this.relays) && this.relays.length ? this.relays : RELAY_URLS
    );
    const filters = [];

    if (batch.length) {
      batch.forEach((item) => {
        const key = pointerKey(item);
        if (key) {
          entry.resolving.add(key);
        }
      });

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
    }

    let events = [];
    if (filters.length) {
      try {
        events = await this.pool.list(Array.from(relaySet), filters);
      } catch (error) {
        if (isDevMode) {
          console.warn("[nostr] Failed to resolve watch history batch:", error);
        }
      }
    } else if (batch.length) {
      batch.forEach((item) => entry.resolving.delete(pointerKey(item)));
    }

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
      if (!key) {
        continue;
      }
      const pointerType = classifyWatchHistoryPointer(pointer, actor);
      const event = pointerMatches.get(key);
      if (pointerType === "chunk" || pointerType === "head") {
        if (event) {
          const cloned = cloneEventForCache(event) || event;
          if (!entry.chunkEvents) {
            entry.chunkEvents = new Map();
          }
          entry.chunkEvents.set(key, cloned);
          entry.resolved.set(key, cloned);
        }
        entry.resolving.delete(key);
        continue;
      }

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
            entry.resolvedVideos.set(key, video);
          }
        } catch (err) {
          if (isDevMode) {
            console.warn("[nostr] Failed to convert watch history event:", err);
          }
        }
      }
      entry.resolving.delete(key);
    }

    const deliverableVideos = [];
    for (const pointer of videoCandidates) {
      if (deliverableVideos.length >= effectiveBatchSize) {
        break;
      }
      const key = pointerKey(pointer);
      if (!key || entry.delivered.has(key)) {
        continue;
      }
      const cachedVideo = entry.resolvedVideos.get(key);
      if (cachedVideo && typeof cachedVideo === "object" && cachedVideo.id) {
        const pointerClone = clonePointerItem(pointer);
        const watchedAt = Number.isFinite(pointerClone?.watchedAt)
          ? pointerClone.watchedAt
          : 0;
        const videoWithHistory = {
          ...cachedVideo,
          watchHistory: {
            key,
            watchedAt,
            pointer:
              pointerClone || {
                type: pointer.type,
                value: pointer.value,
                relay: pointer.relay || null,
                watchedAt,
              },
          },
        };
        deliverableVideos.push(videoWithHistory);
        entry.delivered.add(key);
      }
    }

    return deliverableVideos;
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
          await withNip07Timeout(() => extension.enable());
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
          const selection = await withNip07Timeout(() =>
            extension.selectAccounts(expectPubkey ? [expectPubkey] : undefined)
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
      const pubkey = await withNip07Timeout(() => extension.getPublicKey());
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
    for (const timer of this.watchHistoryRepublishTimers.values()) {
      clearTimeout(timer);
    }
    this.watchHistoryRepublishTimers.clear();
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

  getRequestTimeoutMs(timeoutMs) {
    const candidate = Number(timeoutMs);
    if (Number.isFinite(candidate) && candidate > 0) {
      return Math.floor(candidate);
    }
    const poolTimeout = Number(this.pool?.getTimeout);
    if (Number.isFinite(poolTimeout) && poolTimeout > 0) {
      return Math.floor(poolTimeout);
    }
    return 3400;
  }

  normalizeCountFilter(filter) {
    if (!filter || typeof filter !== "object") {
      return null;
    }

    const normalized = {};

    const toStringArray = (value) => {
      if (value === undefined || value === null) {
        return [];
      }
      const source = Array.isArray(value) ? value : [value];
      const collected = [];
      for (const item of source) {
        if (typeof item !== "string") {
          continue;
        }
        const trimmed = item.trim();
        if (!trimmed || collected.includes(trimmed)) {
          continue;
        }
        collected.push(trimmed);
      }
      return collected;
    };

    if (filter.kinds !== undefined) {
      const kindsSource = Array.isArray(filter.kinds)
        ? filter.kinds
        : [filter.kinds];
      const normalizedKinds = [];
      const seenKinds = new Set();
      for (const candidate of kindsSource) {
        const parsed = Number(candidate);
        if (!Number.isFinite(parsed)) {
          continue;
        }
        const normalizedValue = Math.floor(parsed);
        if (seenKinds.has(normalizedValue)) {
          continue;
        }
        seenKinds.add(normalizedValue);
        normalizedKinds.push(normalizedValue);
      }
      if (normalizedKinds.length) {
        normalized.kinds = normalizedKinds;
      }
    }

    const ids = toStringArray(filter.ids);
    if (ids.length) {
      normalized.ids = ids;
    }

    const authors = toStringArray(filter.authors);
    if (authors.length) {
      normalized.authors = authors;
    }

    for (const [key, value] of Object.entries(filter)) {
      if (!key.startsWith("#")) {
        continue;
      }
      const tagValues = toStringArray(value);
      if (tagValues.length) {
        normalized[key] = tagValues;
      }
    }

    if (filter.since !== undefined) {
      const parsedSince = Number(filter.since);
      if (Number.isFinite(parsedSince)) {
        normalized.since = Math.floor(parsedSince);
      }
    }

    if (filter.until !== undefined) {
      const parsedUntil = Number(filter.until);
      if (Number.isFinite(parsedUntil)) {
        normalized.until = Math.floor(parsedUntil);
      }
    }

    if (filter.limit !== undefined) {
      const parsedLimit = Number(filter.limit);
      if (Number.isFinite(parsedLimit) && parsedLimit >= 0) {
        normalized.limit = Math.floor(parsedLimit);
      }
    }

    return Object.keys(normalized).length ? normalized : null;
  }

  normalizeCountFilters(filters) {
    if (!filters) {
      return [];
    }

    const list = Array.isArray(filters) ? filters : [filters];
    const normalized = [];

    for (const candidate of list) {
      const normalizedFilter = this.normalizeCountFilter(candidate);
      if (normalizedFilter) {
        normalized.push(normalizedFilter);
      }
    }

    return normalized;
  }

  generateCountRequestId(prefix = "count") {
    this.countRequestCounter += 1;
    if (this.countRequestCounter > Number.MAX_SAFE_INTEGER - 1) {
      this.countRequestCounter = 1;
    }
    const normalizedPrefix =
      typeof prefix === "string" && prefix.trim() ? prefix.trim() : "count";
    const timestamp = Date.now().toString(36);
    const counter = this.countRequestCounter.toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${normalizedPrefix}:${timestamp}:${counter}${random}`;
  }

  extractCountValue(payload) {
    if (typeof payload === "number") {
      const value = Math.floor(payload);
      return value >= 0 ? value : 0;
    }

    if (payload && typeof payload === "object") {
      const candidate =
        typeof payload.count === "number"
          ? payload.count
          : Number(payload.count);
      if (Number.isFinite(candidate)) {
        const value = Math.floor(candidate);
        return value >= 0 ? value : 0;
      }
    }

    const parsed = Number(payload);
    if (Number.isFinite(parsed)) {
      const value = Math.floor(parsed);
      return value >= 0 ? value : 0;
    }

    return 0;
  }

  async sendRawCountFrame(relayUrl, filters, options = {}) {
    if (!this.pool) {
      throw new Error(
        "Nostr pool not initialized. Call nostrClient.init() before requesting counts."
      );
    }

    const normalizedUrl =
      typeof relayUrl === "string" ? relayUrl.trim() : "";
    if (!normalizedUrl) {
      throw new Error("Invalid relay URL for COUNT request.");
    }

    const normalizedFilters = this.normalizeCountFilters(filters);
    if (!normalizedFilters.length) {
      throw new Error("At least one filter is required for a COUNT request.");
    }

    const requestId =
      typeof options.subId === "string" && options.subId.trim()
        ? options.subId.trim()
        : this.generateCountRequestId();

    let relay;
    try {
      relay = await this.pool.ensureRelay(normalizedUrl);
    } catch (error) {
      throw new Error(`Failed to connect to relay ${normalizedUrl}`);
    }

    if (!relay) {
      throw new Error(
        `Relay ${normalizedUrl} is unavailable for COUNT requests.`
      );
    }

    const frame = ["COUNT", requestId, ...normalizedFilters];
    let countPromise;

    if (
      relay.openCountRequests instanceof Map &&
      typeof relay.send === "function"
    ) {
      countPromise = new Promise((resolve, reject) => {
        const cleanup = () => {
          if (relay.openCountRequests instanceof Map) {
            relay.openCountRequests.delete(requestId);
          }
        };

        relay.openCountRequests.set(requestId, {
          resolve: (value) => {
            cleanup();
            resolve(value);
          },
          reject: (error) => {
            cleanup();
            reject(error);
          },
        });

        let sendResult;
        try {
          sendResult = relay.send(JSON.stringify(frame));
        } catch (error) {
          cleanup();
          reject(error);
          return;
        }

        if (sendResult && typeof sendResult.catch === "function") {
          sendResult.catch((error) => {
            cleanup();
            reject(error);
          });
        }
      });
    } else if (typeof relay.count === "function") {
      countPromise = relay.count(normalizedFilters, { id: requestId });
    } else {
      throw new Error(
        `[nostr] Relay ${normalizedUrl} does not support COUNT frames.`
      );
    }

    const timeoutMs = this.getRequestTimeoutMs(options.timeoutMs);
    const rawResult = await withRequestTimeout(
      countPromise,
      timeoutMs,
      () => {
        if (relay?.openCountRequests instanceof Map) {
          relay.openCountRequests.delete(requestId);
        }
      },
      `COUNT request timed out after ${timeoutMs}ms`
    );

    const countValue = this.extractCountValue(rawResult);
    return ["COUNT", requestId, { count: countValue }];
  }

  async countEventsAcrossRelays(filters, options = {}) {
    const normalizedFilters = this.normalizeCountFilters(filters);
    if (!normalizedFilters.length) {
      return { total: 0, perRelay: [] };
    }

    const relayList =
      Array.isArray(options.relays) && options.relays.length
        ? options.relays
        : Array.isArray(this.relays) && this.relays.length
        ? this.relays
        : RELAY_URLS;

    const perRelay = await Promise.all(
      relayList.map(async (url) => {
        try {
          const frame = await this.sendRawCountFrame(url, normalizedFilters, {
            timeoutMs: options.timeoutMs,
          });
          const count = this.extractCountValue(frame?.[2]);
          return { url, ok: true, frame, count };
        } catch (error) {
          if (isDevMode) {
            console.warn(`[nostr] COUNT request failed on ${url}:`, error);
          }
          return { url, ok: false, error };
        }
      })
    );

    const total = perRelay.reduce((sum, entry) => {
      if (!entry || !entry.ok) {
        return sum;
      }
      const value = Number(entry.count);
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0);

    return { total, perRelay };
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

export const recordVideoView = (...args) =>
  nostrClient.recordVideoView(...args);

export const updateWatchHistoryList = (...args) =>
  nostrClient.updateWatchHistoryList(...args);

export const removeWatchHistoryItem = (...args) =>
  nostrClient.removeWatchHistoryItem(...args);

export const listVideoViewEvents = (...args) => {
  if (typeof nostrClient.listVideoViewEvents !== "function") {
    throw new Error("Video view listing is unavailable in this build.");
  }
  return nostrClient.listVideoViewEvents(...args);
};

export const subscribeVideoViewEvents = (...args) => {
  if (typeof nostrClient.subscribeVideoViewEvents !== "function") {
    throw new Error("Video view subscriptions are unavailable in this build.");
  }
  return nostrClient.subscribeVideoViewEvents(...args);
};

export const countVideoViewEvents = (...args) => {
  if (typeof nostrClient.countVideoViewEvents !== "function") {
    throw new Error("Video view counting is unavailable in this build.");
  }
  return nostrClient.countVideoViewEvents(...args);
};
