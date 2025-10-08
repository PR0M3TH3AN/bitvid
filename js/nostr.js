// js/nostr.js

import {
  isDevMode,
  VIEW_COUNT_DEDUPE_WINDOW_SECONDS,
  VIEW_COUNT_BACKFILL_MAX_DAYS,
  WATCH_HISTORY_KIND,
  WATCH_HISTORY_LIST_IDENTIFIER,
  WATCH_HISTORY_LEGACY_LIST_IDENTIFIERS,
  WATCH_HISTORY_MAX_ITEMS,
  WATCH_HISTORY_BATCH_RESOLVE,
  WATCH_HISTORY_BATCH_PAGE_SIZE,
  WATCH_HISTORY_PAYLOAD_MAX_BYTES,
  WATCH_HISTORY_FETCH_EVENT_LIMIT,
  WATCH_HISTORY_CACHE_TTL_MS,
} from "./config.js";
import {
  ACCEPT_LEGACY_V1,
  FEATURE_PUBLISH_NIP71,
  VIEW_FILTER_INCLUDE_LEGACY_VIDEO,
} from "./constants.js";
import { accessControl } from "./accessControl.js";
// 🔧 merged conflicting changes from codex/update-video-publishing-and-parsing-logic vs unstable
import { deriveTitleFromEvent, magnetFromText } from "./videoEventUtils.js";
import { extractMagnetHints } from "./magnet.js";
import {
  buildVideoPostEvent,
  buildVideoMirrorEvent,
  buildViewEvent,
  buildWatchHistoryIndexEvent,
  buildWatchHistoryChunkEvent,
  getNostrEventSchema,
  NOTE_TYPES,
} from "./nostrEventSchemas.js";
import {
  publishEventToRelay,
  publishEventToRelays,
  assertAnyRelayAccepted,
} from "./nostrPublish.js";
import { nostrToolsReady } from "./nostrToolsBootstrap.js";

/**
 * The default relay set BitVid bootstraps with before loading a user's
 * preferences.
 */
export const DEFAULT_RELAY_URLS = Object.freeze([
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
]);

const RELAY_URLS = Array.from(DEFAULT_RELAY_URLS);

const EVENTS_CACHE_STORAGE_KEY = "bitvid:eventsCache:v1";
const LEGACY_EVENTS_STORAGE_KEY = "bitvidEvents";
const EVENTS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const NIP07_LOGIN_TIMEOUT_MS = 15_000; // 15 seconds
const NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE =
  "Timed out waiting for the NIP-07 extension. Check the extension prompt and try again.";
const SESSION_ACTOR_STORAGE_KEY = "bitvid:sessionActor:v1";
const VIEW_EVENT_GUARD_PREFIX = "bitvid:viewed";

const WATCH_HISTORY_STORAGE_KEY = "bitvid:watch-history:v2";
const WATCH_HISTORY_STORAGE_VERSION = 2;
const WATCH_HISTORY_REPUBLISH_BASE_DELAY_MS = 2000;
const WATCH_HISTORY_REPUBLISH_MAX_DELAY_MS = 5 * 60 * 1000;
const WATCH_HISTORY_REPUBLISH_MAX_ATTEMPTS = 8;
const WATCH_HISTORY_REPUBLISH_JITTER = 0.25;

const viewEventPublishMemory = new Map();

const VIEW_EVENT_SCHEMA = getNostrEventSchema(NOTE_TYPES.VIEW_EVENT);
const VIEW_EVENT_KIND = Number.isFinite(VIEW_EVENT_SCHEMA?.kind)
  ? VIEW_EVENT_SCHEMA.kind
  : 30079;

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

const __nostrToolsBootstrapResult = await (async () => {
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

let cachedNostrTools = __nostrToolsBootstrapResult.toolkit || null;
const nostrToolsBootstrapFailure = __nostrToolsBootstrapResult.failure || null;

if (!cachedNostrTools && nostrToolsBootstrapFailure && isDevMode) {
  console.warn(
    "[nostr] nostr-tools helpers unavailable after bootstrap.",
    nostrToolsBootstrapFailure
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
    if (isDevMode) {
      console.warn("[nostr] Failed to resolve nostr-tools helpers.", error);
    }
  }

  if (!cachedNostrTools) {
    rememberNostrTools(readToolkitFromScope());
  }

  return cachedNostrTools || null;
}

function isSimplePoolConstructor(candidate) {
  if (typeof candidate !== "function") {
    return false;
  }

  const prototype = candidate.prototype;
  if (!prototype || typeof prototype !== "object") {
    return false;
  }

  return typeof prototype.sub === "function" && typeof prototype.close === "function";
}

function unwrapSimplePool(candidate) {
  if (!candidate) {
    return null;
  }

  if (isSimplePoolConstructor(candidate)) {
    return candidate;
  }

  if (typeof candidate === "object") {
    if (isSimplePoolConstructor(candidate.SimplePool)) {
      return candidate.SimplePool;
    }
    if (isSimplePoolConstructor(candidate.default)) {
      return candidate.default;
    }
  }

  return null;
}

function resolveSimplePoolConstructor(tools, scope = globalScope) {
  const candidates = [
    tools?.SimplePool,
    tools?.pool?.SimplePool,
    tools?.pool,
    tools?.SimplePool?.SimplePool,
    tools?.SimplePool?.default,
    tools?.pool?.default,
    tools?.default?.SimplePool,
    tools?.default?.pool?.SimplePool,
    tools?.default?.pool,
  ];

  if (scope && typeof scope === "object") {
    candidates.push(scope?.SimplePool);
    candidates.push(scope?.pool?.SimplePool);
    candidates.push(scope?.pool);
    const scopedTools =
      scope?.NostrTools && scope.NostrTools !== tools ? scope.NostrTools : null;
    if (scopedTools) {
      candidates.push(scopedTools.SimplePool);
      candidates.push(scopedTools.pool?.SimplePool);
      candidates.push(scopedTools.pool);
    }
  }

  for (const candidate of candidates) {
    const resolved = unwrapSimplePool(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

let ingestLocalViewEventRef = null;

async function loadIngestLocalViewEvent() {
  if (typeof ingestLocalViewEventRef === "function") {
    return ingestLocalViewEventRef;
  }
  try {
    const module = await import("./viewCounter.js");
    if (typeof module?.ingestLocalViewEvent === "function") {
      ingestLocalViewEventRef = module.ingestLocalViewEvent;
      return ingestLocalViewEventRef;
    }
  } catch (error) {
    if (isDevMode) {
      console.warn(
        "[nostr] Failed to load view counter ingest helper:",
        error
      );
    }
  }
  return null;
}

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

function withNip07Timeout(
  operation,
  {
    timeoutMs = NIP07_LOGIN_TIMEOUT_MS,
    message = NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
  } = {},
) {
  const numericTimeout = Number(timeoutMs);
  const effectiveTimeout =
    Number.isFinite(numericTimeout) && numericTimeout > 0
      ? numericTimeout
      : NIP07_LOGIN_TIMEOUT_MS;

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, effectiveTimeout);
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

async function runNip07WithRetry(
  operation,
  {
    label = "NIP-07 operation",
    timeoutMs = NIP07_LOGIN_TIMEOUT_MS,
    retryMultiplier = 2,
  } = {},
) {
  try {
    return await withNip07Timeout(operation, {
      timeoutMs,
      message: NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
    });
  } catch (error) {
    const isTimeoutError =
      error instanceof Error &&
      error.message === NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE;

    if (!isTimeoutError || retryMultiplier <= 1) {
      throw error;
    }

    const extendedTimeout = Math.max(
      timeoutMs,
      Math.round(timeoutMs * retryMultiplier),
    );

    if (isDevMode) {
      console.warn(
        `[nostr] ${label} timed out after ${timeoutMs}ms. Retrying once with ${extendedTimeout}ms timeout.`,
      );
    }

    return withNip07Timeout(operation, {
      timeoutMs: extendedTimeout,
      message: NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
    });
  }
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

function stringFromInput(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value).trim();
}

function normalizeUnixSeconds(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = value > 1e12 ? value / 1000 : value;
    return String(Math.floor(normalized));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const normalized = numeric > 1e12 ? numeric / 1000 : numeric;
      return String(Math.floor(normalized));
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return String(Math.floor(parsed / 1000));
    }
  }
  return "";
}

function normalizeDurationSeconds(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.max(0, Math.floor(value)));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return String(Math.max(0, Math.floor(numeric)));
    }
  }
  return "";
}

function normalizeNip71Kind(value) {
  const numeric =
    typeof value === "string"
      ? Number(value.trim())
      : typeof value === "number"
        ? value
        : Number.NaN;
  if (numeric === 22) {
    return 22;
  }
  return 21;
}

function trimTrailingEmpty(values) {
  const trimmed = [...values];
  while (trimmed.length && !trimmed[trimmed.length - 1]) {
    trimmed.pop();
  }
  return trimmed;
}

function buildImetaTags(variants) {
  if (!Array.isArray(variants)) {
    return [];
  }
  const tags = [];
  for (const variant of variants) {
    if (!variant || typeof variant !== "object") {
      continue;
    }
    const entries = ["imeta"];
    const dim = stringFromInput(variant.dim);
    if (dim) {
      entries.push(`dim ${dim}`);
    }
    const url = stringFromInput(variant.url);
    if (url) {
      entries.push(`url ${url}`);
    }
    const x = stringFromInput(variant.x);
    if (x) {
      entries.push(`x ${x}`);
    }
    const mime = stringFromInput(variant.m);
    if (mime) {
      entries.push(`m ${mime}`);
    }
    if (Array.isArray(variant.image)) {
      variant.image
        .map(stringFromInput)
        .filter(Boolean)
        .forEach((imageUrl) => {
          entries.push(`image ${imageUrl}`);
        });
    }
    if (Array.isArray(variant.fallback)) {
      variant.fallback
        .map(stringFromInput)
        .filter(Boolean)
        .forEach((fallbackUrl) => {
          entries.push(`fallback ${fallbackUrl}`);
        });
    }
    if (Array.isArray(variant.service)) {
      variant.service
        .map(stringFromInput)
        .filter(Boolean)
        .forEach((service) => {
          entries.push(`service ${service}`);
        });
    }
    if (entries.length > 1) {
      tags.push(entries);
    }
  }
  return tags;
}

function buildTextTrackTag(track) {
  if (!track || typeof track !== "object") {
    return null;
  }
  const url = stringFromInput(track.url);
  const type = stringFromInput(track.type);
  const language = stringFromInput(track.language);
  if (!url && !type && !language) {
    return null;
  }
  const values = trimTrailingEmpty([url, type, language]);
  return ["text-track", ...values];
}

function buildSegmentTag(segment) {
  if (!segment || typeof segment !== "object") {
    return null;
  }
  const start = stringFromInput(segment.start);
  const end = stringFromInput(segment.end);
  const title = stringFromInput(segment.title);
  const thumbnail = stringFromInput(segment.thumbnail);
  if (!start && !end && !title && !thumbnail) {
    return null;
  }
  const values = trimTrailingEmpty([start, end, title, thumbnail]);
  return ["segment", ...values];
}

function buildParticipantTag(participant) {
  if (!participant || typeof participant !== "object") {
    return null;
  }
  const pubkey = stringFromInput(participant.pubkey);
  if (!pubkey) {
    return null;
  }
  const relay = stringFromInput(participant.relay);
  const values = ["p", pubkey];
  if (relay) {
    values.push(relay);
  }
  return values;
}

function extractVideoPublishPayload(rawPayload) {
  let videoData = rawPayload;
  let nip71Metadata = null;

  if (rawPayload && typeof rawPayload === "object") {
    if (rawPayload.nip71 && typeof rawPayload.nip71 === "object") {
      nip71Metadata = rawPayload.nip71;
    }
    if (
      rawPayload.legacyFormData &&
      typeof rawPayload.legacyFormData === "object"
    ) {
      videoData = rawPayload.legacyFormData;
    } else if (
      Object.prototype.hasOwnProperty.call(rawPayload, "legacyFormData")
    ) {
      videoData = rawPayload.legacyFormData || {};
    }
  }

  if (!videoData || typeof videoData !== "object") {
    videoData = {};
  }

  return { videoData, nip71Metadata };
}

function buildVideoPointerValue(pubkey, videoRootId) {
  const normalizedRoot = stringFromInput(videoRootId);
  const normalizedPubkey = stringFromInput(pubkey).toLowerCase();
  if (!normalizedRoot || !normalizedPubkey) {
    return "";
  }
  return `30078:${normalizedPubkey}:${normalizedRoot}`;
}

function buildNip71PointerTags({
  pubkey = "",
  videoRootId = "",
  videoEventId = "",
  dTag = "",
} = {}) {
  const pointerTags = [];

  const normalizedRoot = stringFromInput(videoRootId);
  const normalizedEventId = stringFromInput(videoEventId);
  const normalizedDTag = stringFromInput(dTag);

  if (normalizedRoot) {
    const pointerValue = buildVideoPointerValue(pubkey, normalizedRoot);
    if (pointerValue) {
      pointerTags.push(["a", pointerValue]);
    }
    pointerTags.push(["video-root", normalizedRoot]);
  }

  if (normalizedEventId) {
    pointerTags.push(["e", normalizedEventId]);
  }

  if (normalizedDTag) {
    pointerTags.push(["d", normalizedDTag]);
  }

  return pointerTags;
}

export function buildNip71VideoEvent({
  metadata,
  pubkey = "",
  title,
  summaryFallback = "",
  createdAt = Math.floor(Date.now() / 1000),
  pointerIdentifiers = {},
} = {}) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const normalizedTitle = stringFromInput(title);
  if (!normalizedTitle) {
    return null;
  }

  const summaryCandidates = [
    stringFromInput(metadata.summary),
    stringFromInput(summaryFallback),
    normalizedTitle,
  ];
  const summary = summaryCandidates.find((value) => Boolean(value)) || "";

  const tags = [];
  tags.push(["title", normalizedTitle]);

  const publishedAt = normalizeUnixSeconds(metadata.publishedAt);
  if (publishedAt) {
    tags.push(["published_at", publishedAt]);
  }

  const alt = stringFromInput(metadata.alt);
  if (alt) {
    tags.push(["alt", alt]);
  }

  const imetaTags = buildImetaTags(metadata.imeta);
  if (imetaTags.length) {
    tags.push(...imetaTags);
  }

  const duration = normalizeDurationSeconds(metadata.duration);
  if (duration) {
    tags.push(["duration", duration]);
  }

  if (Array.isArray(metadata.textTracks)) {
    metadata.textTracks.forEach((track) => {
      const tag = buildTextTrackTag(track);
      if (tag) {
        tags.push(tag);
      }
    });
  }

  const contentWarning = stringFromInput(metadata.contentWarning);
  if (contentWarning) {
    tags.push(["content-warning", contentWarning]);
  }

  if (Array.isArray(metadata.segments)) {
    metadata.segments.forEach((segment) => {
      const tag = buildSegmentTag(segment);
      if (tag) {
        tags.push(tag);
      }
    });
  }

  if (Array.isArray(metadata.hashtags)) {
    metadata.hashtags
      .map(stringFromInput)
      .filter(Boolean)
      .forEach((value) => {
        tags.push(["t", value]);
      });
  }

  if (Array.isArray(metadata.participants)) {
    metadata.participants.forEach((participant) => {
      const tag = buildParticipantTag(participant);
      if (tag) {
        tags.push(tag);
      }
    });
  }

  if (Array.isArray(metadata.references)) {
    metadata.references
      .map(stringFromInput)
      .filter(Boolean)
      .forEach((url) => {
        tags.push(["r", url]);
      });
  }

  if (!tags.length) {
    return null;
  }

  const normalizedPubkey = stringFromInput(pubkey);
  const timestamp = Number.isFinite(createdAt)
    ? Math.floor(createdAt)
    : Math.floor(Date.now() / 1000);

  const pointerTags = buildNip71PointerTags({
    pubkey,
    videoRootId: pointerIdentifiers.videoRootId,
    videoEventId: pointerIdentifiers.eventId,
    dTag: pointerIdentifiers.dTag,
  });

  if (pointerTags.length) {
    tags.push(...pointerTags);
  }

  return {
    kind: normalizeNip71Kind(metadata.kind),
    pubkey: normalizedPubkey,
    created_at: timestamp,
    tags,
    content: summary,
  };
}

function parseKeyValuePair(entry) {
  if (typeof entry !== "string") {
    return null;
  }
  const trimmed = entry.trim();
  if (!trimmed) {
    return null;
  }
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return null;
  }
  const key = trimmed.slice(0, spaceIndex).trim().toLowerCase();
  const value = trimmed.slice(spaceIndex + 1).trim();
  if (!key || !value) {
    return null;
  }
  return { key, value };
}

function parseImetaTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "imeta") {
    return null;
  }

  const variant = {
    image: [],
    fallback: [],
    service: [],
  };

  for (let i = 1; i < tag.length; i += 1) {
    const parsed = parseKeyValuePair(tag[i]);
    if (!parsed) {
      continue;
    }

    switch (parsed.key) {
      case "dim":
        variant.dim = parsed.value;
        break;
      case "url":
        variant.url = parsed.value;
        break;
      case "x":
        variant.x = parsed.value;
        break;
      case "m":
        variant.m = parsed.value;
        break;
      case "image":
        variant.image.push(parsed.value);
        break;
      case "fallback":
        variant.fallback.push(parsed.value);
        break;
      case "service":
        variant.service.push(parsed.value);
        break;
      default:
        break;
    }
  }

  const hasContent =
    Boolean(variant.dim) ||
    Boolean(variant.url) ||
    Boolean(variant.x) ||
    Boolean(variant.m) ||
    variant.image.length > 0 ||
    variant.fallback.length > 0 ||
    variant.service.length > 0;

  if (!hasContent) {
    return null;
  }

  if (!variant.image.length) {
    delete variant.image;
  }
  if (!variant.fallback.length) {
    delete variant.fallback;
  }
  if (!variant.service.length) {
    delete variant.service;
  }

  return variant;
}

function parseTextTrackTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "text-track") {
    return null;
  }
  const url = stringFromInput(tag[1]);
  const type = stringFromInput(tag[2]);
  const language = stringFromInput(tag[3]);
  if (!url && !type && !language) {
    return null;
  }
  const track = {};
  if (url) {
    track.url = url;
  }
  if (type) {
    track.type = type;
  }
  if (language) {
    track.language = language;
  }
  return track;
}

function parseSegmentTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "segment") {
    return null;
  }

  const values = [];
  for (let i = 1; i < tag.length; i += 1) {
    const value = stringFromInput(tag[i]);
    values.push(value);
  }

  while (values.length < 4) {
    values.push("");
  }

  const [start, end, title, thumbnail] = values;
  const hasContent = start || end || title || thumbnail;
  if (!hasContent) {
    return null;
  }
  const segment = {};
  if (start) {
    segment.start = start;
  }
  if (end) {
    segment.end = end;
  }
  if (title) {
    segment.title = title;
  }
  if (thumbnail) {
    segment.thumbnail = thumbnail;
  }
  return segment;
}

function parseParticipantTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "p") {
    return null;
  }
  const pubkey = stringFromInput(tag[1]);
  if (!pubkey) {
    return null;
  }
  const participant = { pubkey };
  const relay = stringFromInput(tag[2]);
  if (relay) {
    participant.relay = relay;
  }
  return participant;
}

function parseReferenceTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "r") {
    return null;
  }
  const url = stringFromInput(tag[1]);
  return url ? url : null;
}

function parseHashtagTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "t") {
    return null;
  }
  const value = stringFromInput(tag[1]);
  return value || null;
}

export function extractNip71MetadataFromTags(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  const metadata = { kind: normalizeNip71Kind(event.kind) };

  const summary = stringFromInput(event.content);
  if (summary) {
    metadata.summary = summary;
  }

  const imeta = [];
  const textTracks = [];
  const segments = [];
  const hashtags = [];
  const participants = [];
  const references = [];

  const pointerValues = new Set();
  const videoRootIds = new Set();
  const videoEventIds = new Set();
  const dTags = new Set();

  tags.forEach((tag) => {
    if (!Array.isArray(tag) || tag.length < 2) {
      return;
    }

    const name = tag[0];
    switch (name) {
      case "title": {
        const value = stringFromInput(tag[1]);
        if (value) {
          metadata.title = value;
        }
        break;
      }
      case "published_at": {
        const value = stringFromInput(tag[1]);
        if (value) {
          metadata.publishedAt = value;
        }
        break;
      }
      case "alt": {
        const value = stringFromInput(tag[1]);
        if (value) {
          metadata.alt = value;
        }
        break;
      }
      case "duration": {
        const value = stringFromInput(tag[1]);
        if (value) {
          const parsed = Number(value);
          metadata.duration = Number.isFinite(parsed) ? parsed : value;
        }
        break;
      }
      case "content-warning": {
        const value = stringFromInput(tag[1]);
        if (value) {
          metadata.contentWarning = value;
        }
        break;
      }
      case "imeta": {
        const variant = parseImetaTag(tag);
        if (variant) {
          imeta.push(variant);
        }
        break;
      }
      case "text-track": {
        const track = parseTextTrackTag(tag);
        if (track) {
          textTracks.push(track);
        }
        break;
      }
      case "segment": {
        const segment = parseSegmentTag(tag);
        if (segment) {
          segments.push(segment);
        }
        break;
      }
      case "t": {
        const hashtag = parseHashtagTag(tag);
        if (hashtag) {
          hashtags.push(hashtag);
        }
        break;
      }
      case "p": {
        const participant = parseParticipantTag(tag);
        if (participant) {
          participants.push(participant);
        }
        break;
      }
      case "r": {
        const reference = parseReferenceTag(tag);
        if (reference) {
          references.push(reference);
        }
        break;
      }
      case "a": {
        const pointerValue = stringFromInput(tag[1]).toLowerCase();
        if (pointerValue) {
          pointerValues.add(pointerValue);
          const parts = pointerValue.split(":");
          if (parts.length === 3 && parts[0] === "30078") {
            const root = parts[2];
            if (root) {
              videoRootIds.add(root);
            }
          }
        }
        break;
      }
      case "video-root": {
        const value = stringFromInput(tag[1]);
        if (value) {
          videoRootIds.add(value);
        }
        break;
      }
      case "e": {
        const value = stringFromInput(tag[1]);
        if (value) {
          videoEventIds.add(value);
        }
        break;
      }
      case "d": {
        const value = stringFromInput(tag[1]);
        if (value) {
          dTags.add(value);
        }
        break;
      }
      default:
        break;
    }
  });

  if (imeta.length) {
    metadata.imeta = imeta;
  }
  if (textTracks.length) {
    metadata.textTracks = textTracks;
  }
  if (segments.length) {
    metadata.segments = segments;
  }
  if (hashtags.length) {
    metadata.hashtags = hashtags;
    metadata.t = hashtags;
  }
  if (participants.length) {
    metadata.participants = participants;
  }
  if (references.length) {
    metadata.references = references;
  }

  return {
    metadata,
    pointers: {
      pointerValues,
      videoRootIds,
      videoEventIds,
      dTags,
    },
    source: {
      id: typeof event.id === "string" ? event.id : "",
      created_at: Number.isFinite(event.created_at) ? event.created_at : null,
      kind: Number.isFinite(event.kind) ? event.kind : normalizeNip71Kind(event.kind),
    },
  };
}

function cloneNip71Metadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch (error) {
    if (isDevMode) {
      console.warn("[nostr] Failed to clone NIP-71 metadata", error);
    }
    return { ...metadata };
  }
}

function getDTagValueFromTags(tags) {
  if (!Array.isArray(tags)) {
    return "";
  }
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag[0] !== "d") {
      continue;
    }
    if (typeof tag[1] === "string" && tag[1]) {
      return tag[1];
    }
  }
  return "";
}

function sanitizeRelayList(list) {
  const seen = new Set();
  const sanitized = [];
  if (!Array.isArray(list)) {
    return sanitized;
  }

  list.forEach((value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (!/^wss?:\/\//i.test(trimmed)) {
      return;
    }
    if (/\s/.test(trimmed)) {
      return;
    }

    let normalized = trimmed.replace(/\/+$/, "");
    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname) {
        return;
      }
      const pathname = parsed.pathname.replace(/\/+$/, "");
      normalized = `${parsed.protocol}//${parsed.host}${pathname}${parsed.search || ""}`;
    } catch (error) {
      // Ignore URL parsing failures and fall back to the trimmed string.
    }

    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    sanitized.push(normalized);
  });

  return sanitized;
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

  if (pointer.session === true) {
    cloned.session = true;
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
    } catch (err) {
      if (isDevMode) {
        console.warn(`[nostr] Failed to decode pointer ${trimmed}:`, err);
      }
    }
  }

  const type = trimmed.includes(":") ? "a" : "e";
  return { type, value: trimmed, relay: null };
}

function resolveVideoViewPointer(pointer) {
  const normalized = normalizePointerInput(pointer);
  if (!normalized || typeof normalized.value !== "string") {
    throw new Error("Invalid video pointer supplied for view lookup.");
  }

  const value = normalized.value.trim();
  if (!value) {
    throw new Error("Invalid video pointer supplied for view lookup.");
  }

  const type = normalized.type === "a" ? "a" : "e";
  const descriptor = { type, value };

  if (typeof normalized.relay === "string" && normalized.relay.trim()) {
    descriptor.relay = normalized.relay.trim();
  }

  return descriptor;
}

function createVideoViewEventFilters(pointer) {
  let resolved;

  if (
    pointer &&
    typeof pointer === "object" &&
    (pointer.type === "a" || pointer.type === "e") &&
    typeof pointer.value === "string"
  ) {
    const value = pointer.value.trim();
    if (!value) {
      throw new Error("Invalid video pointer supplied for view lookup.");
    }
    resolved = { type: pointer.type === "a" ? "a" : "e", value };
    if (typeof pointer.relay === "string" && pointer.relay.trim()) {
      resolved.relay = pointer.relay.trim();
    }
  } else {
    resolved = resolveVideoViewPointer(pointer);
  }

  const pointerFilter = {
    kinds: [VIEW_EVENT_KIND],
    "#t": ["view"],
  };

  if (resolved.type === "a") {
    pointerFilter["#a"] = [resolved.value];
  } else {
    pointerFilter["#e"] = [resolved.value];
  }

  const filters = [pointerFilter];

  if (VIEW_FILTER_INCLUDE_LEGACY_VIDEO) {
    filters.push({
      kinds: [VIEW_EVENT_KIND],
      "#t": ["view"],
      "#video": [resolved.value],
    });
  }

  return { pointer: resolved, filters };
}

function deriveViewEventBucketIndex(createdAtSeconds) {
  const timestamp = Number.isFinite(createdAtSeconds)
    ? Math.floor(createdAtSeconds)
    : Math.floor(Date.now() / 1000);
  const windowSize = Math.max(
    1,
    Number(VIEW_COUNT_DEDUPE_WINDOW_SECONDS) || 0
  );
  return Math.floor(timestamp / windowSize);
}

function getViewEventGuardWindowMs() {
  const windowSeconds = Math.max(
    1,
    Number(VIEW_COUNT_DEDUPE_WINDOW_SECONDS) || 0
  );
  return windowSeconds * 1000;
}

function deriveViewEventPointerScope(pointer) {
  const pointerValue =
    typeof pointer?.value === "string" ? pointer.value.trim().toLowerCase() : "";
  if (!pointerValue) {
    return "";
  }
  const pointerType = pointer?.type === "a" ? "a" : "e";
  return `${pointerType}:${pointerValue}`;
}

function generateViewEventEntropy() {
  const cryptoRef =
    (typeof globalThis !== "undefined" &&
      /** @type {Crypto | undefined} */ (globalThis.crypto)) ||
    null;

  if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
    try {
      const buffer = new Uint32Array(2);
      cryptoRef.getRandomValues(buffer);
      return Array.from(buffer, (value) =>
        value.toString(16).padStart(8, "0")
      ).join("");
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to gather crypto entropy for view event:", error);
      }
    }
  }

  const fallbackA = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  const fallbackB = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `${fallbackA}${fallbackB}`;
}

function generateViewEventDedupeTag(actorPubkey, pointer, createdAtSeconds) {
  const scope = deriveViewEventPointerScope(pointer) || "unknown";
  const normalizedActor =
    typeof actorPubkey === "string" && actorPubkey.trim()
      ? actorPubkey.trim().toLowerCase()
      : "anon";
  const timestamp = Number.isFinite(createdAtSeconds)
    ? Math.max(0, Math.floor(createdAtSeconds))
    : Math.floor(Date.now() / 1000);
  const entropy = generateViewEventEntropy();
  return `${scope}:${normalizedActor}:${timestamp}:${entropy}`;
}

function hasRecentViewPublish(scope, bucketIndex) {
  if (!scope || !Number.isFinite(bucketIndex)) {
    return false;
  }

  const windowMs = getViewEventGuardWindowMs();
  const now = Date.now();
  const entry = viewEventPublishMemory.get(scope);

  if (entry) {
    const age = now - Number(entry.seenAt);
    if (!Number.isFinite(entry.seenAt) || age >= windowMs) {
      viewEventPublishMemory.delete(scope);
    } else if (Number(entry.bucket) === bucketIndex) {
      return true;
    }
  }

  if (typeof localStorage === "undefined") {
    return false;
  }

  const storageKey = `${VIEW_EVENT_GUARD_PREFIX}:${scope}`;
  let rawValue = null;
  try {
    rawValue = localStorage.getItem(storageKey);
  } catch (error) {
    if (isDevMode) {
      console.warn("[nostr] Failed to read view guard entry:", error);
    }
    return false;
  }

  if (typeof rawValue !== "string" || !rawValue) {
    return false;
  }

  const [storedBucketRaw, storedSeenRaw] = rawValue.split(":", 2);
  const storedBucket = Number(storedBucketRaw);
  const storedSeenAt = Number(storedSeenRaw);

  if (!Number.isFinite(storedBucket) || !Number.isFinite(storedSeenAt)) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to clear corrupt view guard entry:", error);
      }
    }
    return false;
  }

  if (now - storedSeenAt >= windowMs) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to remove expired view guard entry:", error);
      }
    }
    return false;
  }

  viewEventPublishMemory.set(scope, {
    bucket: storedBucket,
    seenAt: storedSeenAt,
  });

  return storedBucket === bucketIndex;
}

function rememberViewPublish(scope, bucketIndex) {
  if (!scope || !Number.isFinite(bucketIndex)) {
    return;
  }

  const now = Date.now();
  const windowMs = getViewEventGuardWindowMs();
  const entry = viewEventPublishMemory.get(scope);
  if (entry && Number.isFinite(entry.seenAt) && now - entry.seenAt >= windowMs) {
    viewEventPublishMemory.delete(scope);
  }

  viewEventPublishMemory.set(scope, {
    bucket: bucketIndex,
    seenAt: now,
  });

  if (typeof localStorage === "undefined") {
    return;
  }

  const storageKey = `${VIEW_EVENT_GUARD_PREFIX}:${scope}`;
  try {
    localStorage.setItem(storageKey, `${bucketIndex}:${now}`);
  } catch (error) {
    if (isDevMode) {
      console.warn("[nostr] Failed to persist view guard entry:", error);
    }
  }
}

function isVideoViewEvent(event, pointer) {
  if (!event || typeof event !== "object") {
    return false;
  }

  if (!Number.isFinite(event.kind) || event.kind !== VIEW_EVENT_KIND) {
    return false;
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  let hasViewTag = false;
  let matchesPointer = false;

  const pointerValueRaw =
    typeof pointer?.value === "string" ? pointer.value.trim() : "";
  const pointerValueLower = pointerValueRaw.toLowerCase();
  const pointerType = pointer?.type === "a" ? "a" : "e";

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
      continue;
    }

    if (matchesPointer || !pointerValueLower) {
      continue;
    }

    if (
      VIEW_FILTER_INCLUDE_LEGACY_VIDEO &&
      label === "video" &&
      value.toLowerCase() === pointerValueLower
    ) {
      matchesPointer = true;
      continue;
    }

    const pointerTag = normalizePointerTag(tag);
    if (!pointerTag) {
      continue;
    }

    const tagValueLower =
      typeof pointerTag.value === "string"
        ? pointerTag.value.trim().toLowerCase()
        : "";

    if (!tagValueLower || tagValueLower !== pointerValueLower) {
      continue;
    }

    if (pointerTag.type === pointerType) {
      matchesPointer = true;
      continue;
    }
  }

  return hasViewTag && matchesPointer;
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

function normalizeActorKey(actor) {
  if (typeof actor !== "string") {
    return "";
  }
  const trimmed = actor.trim();
  return trimmed ? trimmed.toLowerCase() : "";
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
      const currentWatched = Number.isFinite(existing.watchedAt)
        ? existing.watchedAt
        : 0;
      const incomingWatched = Number.isFinite(pointer.watchedAt)
        ? pointer.watchedAt
        : 0;
      if (incomingWatched > currentWatched) {
        seen.set(key, pointer);
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
    if (isDevMode) {
      console.warn("[nostr] Failed to sanitize watch history metadata:", error);
    }
    return {};
  }
}

function serializeWatchHistoryItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "[]";
  }

  const normalized = items.map((item) => {
    const type = item?.type === "a" ? "a" : "e";
    const value = typeof item?.value === "string" ? item.value : "";
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
    return payload;
  });

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
      if (isDevMode) {
        console.warn("[nostr] Failed to hash watch history fingerprint:", error);
      }
    }
  }

  return `fallback:${serialized}`;
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
  const tools = getCachedNostrTools();
  if (
    !privateKey ||
    typeof privateKey !== "string" ||
    !tools?.getEventHash ||
    typeof tools.signEvent !== "function"
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
  const id = tools.getEventHash(prepared);
  const sig = tools.signEvent(prepared, privateKey);

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

function decodeNpubToHex(npub) {
  if (typeof npub !== "string" || !npub.trim()) {
    return "";
  }

  const tools = getCachedNostrTools();
  if (!tools?.nip19 || typeof tools.nip19.decode !== "function") {
    return "";
  }

  try {
    const decoded = tools.nip19.decode(npub.trim());
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
    this.poolPromise = null;
    this.pubkey = null;
    this.relays = sanitizeRelayList(Array.from(DEFAULT_RELAY_URLS));
    this.readRelays = Array.from(this.relays);
    this.writeRelays = Array.from(this.relays);

    // Store all events so older links still work
    this.allEvents = new Map();

    // “activeMap” holds only the newest version for each root
    this.activeMap = new Map();

    this.hasRestoredLocalData = false;

    this.sessionActor = null;
    this.nip71Cache = new Map();
    this.watchHistoryCache = new Map();
    this.watchHistoryStorage = null;
    this.watchHistoryRepublishTimers = new Map();
    this.watchHistoryRefreshPromises = new Map();
    this.watchHistoryCacheTtlMs = 0;
    this.watchHistoryFingerprints = new Map();
    this.watchHistoryLastCreatedAt = 0;
    this.countRequestCounter = 0;
    this.countUnsupportedRelays = new Set();
  }

  restoreSessionActorFromStorage() {
    if (typeof localStorage === "undefined") {
      return null;
    }

    let raw = null;
    try {
      raw = localStorage.getItem(SESSION_ACTOR_STORAGE_KEY);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to read session actor from storage:", error);
      }
      return null;
    }

    if (!raw || typeof raw !== "string") {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      const pubkey =
        typeof parsed?.pubkey === "string" ? parsed.pubkey.trim() : "";
      const privateKey =
        typeof parsed?.privateKey === "string"
          ? parsed.privateKey.trim()
          : "";

      if (!pubkey || !privateKey) {
        return null;
      }

      return {
        pubkey,
        privateKey,
        createdAt: Number.isFinite(parsed?.createdAt)
          ? parsed.createdAt
          : Date.now(),
      };
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to parse stored session actor:", error);
      }
      try {
        localStorage.removeItem(SESSION_ACTOR_STORAGE_KEY);
      } catch (cleanupError) {
        if (isDevMode) {
          console.warn(
            "[nostr] Failed to clear corrupt session actor entry:",
            cleanupError
          );
        }
      }
    }

    return null;
  }

  persistSessionActor(actor) {
    if (typeof localStorage === "undefined") {
      return;
    }

    if (
      !actor ||
      typeof actor.pubkey !== "string" ||
      !actor.pubkey ||
      typeof actor.privateKey !== "string" ||
      !actor.privateKey
    ) {
      return;
    }

    const payload = {
      pubkey: actor.pubkey,
      privateKey: actor.privateKey,
      createdAt: Number.isFinite(actor.createdAt)
        ? actor.createdAt
        : Date.now(),
    };

    try {
      localStorage.setItem(
        SESSION_ACTOR_STORAGE_KEY,
        JSON.stringify(payload)
      );
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to persist session actor:", error);
      }
    }
  }

  clearStoredSessionActor() {
    if (typeof localStorage === "undefined") {
      return;
    }
    try {
      localStorage.removeItem(SESSION_ACTOR_STORAGE_KEY);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to clear stored session actor:", error);
      }
    }
  }

  mintSessionActor() {
    const tools = getCachedNostrTools();
    if (!tools) {
      if (isDevMode) {
        console.warn("[nostr] Cannot mint session actor without NostrTools.");
      }
      return null;
    }

    const getPublicKey =
      typeof tools.getPublicKey === "function" ? tools.getPublicKey : null;
    if (!getPublicKey) {
      if (isDevMode) {
        console.warn(
          "[nostr] Cannot mint session actor: missing getPublicKey helper."
        );
      }
      return null;
    }

    let privateKey = "";
    try {
      if (typeof tools.generatePrivateKey === "function") {
        privateKey = tools.generatePrivateKey();
      } else if (window?.crypto?.getRandomValues) {
        const randomBytes = new Uint8Array(32);
        window.crypto.getRandomValues(randomBytes);
        privateKey = Array.from(randomBytes)
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      }
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to mint session private key:", error);
      }
      privateKey = "";
    }

    if (!privateKey || typeof privateKey !== "string") {
      return null;
    }

    const normalizedPrivateKey = privateKey.trim();
    if (!normalizedPrivateKey) {
      return null;
    }

    let pubkey = "";
    try {
      pubkey = getPublicKey(normalizedPrivateKey);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to derive session pubkey:", error);
      }
      return null;
    }

    const normalizedPubkey =
      typeof pubkey === "string" ? pubkey.trim() : "";
    if (!normalizedPubkey) {
      return null;
    }

    return {
      pubkey: normalizedPubkey,
      privateKey: normalizedPrivateKey,
      createdAt: Date.now(),
    };
  }

  async ensureSessionActor(forceRenew = false) {
    const normalizedLogged =
      typeof this.pubkey === "string" && this.pubkey
        ? this.pubkey.toLowerCase()
        : "";
    const extension = window?.nostr;
    const canSignWithExtension =
      !!normalizedLogged &&
      extension &&
      typeof extension.signEvent === "function";

    if (!forceRenew && canSignWithExtension) {
      return normalizedLogged;
    }

    if (forceRenew) {
      this.sessionActor = null;
      this.clearStoredSessionActor();
    } else if (
      this.sessionActor &&
      typeof this.sessionActor.pubkey === "string" &&
      this.sessionActor.pubkey &&
      typeof this.sessionActor.privateKey === "string" &&
      this.sessionActor.privateKey
    ) {
      return this.sessionActor.pubkey;
    }

    if (!forceRenew) {
      const restored = this.restoreSessionActorFromStorage();
      if (restored) {
        this.sessionActor = restored;
        return restored.pubkey;
      }
    }

    const minted = this.mintSessionActor();
    if (minted) {
      this.sessionActor = minted;
      this.persistSessionActor(minted);
      return minted.pubkey;
    }

    if (canSignWithExtension) {
      return normalizedLogged;
    }

    return null;
  }

  makeCountUnsupportedError(relayUrl) {
    const normalizedUrl =
      typeof relayUrl === "string" && relayUrl.trim()
        ? relayUrl.trim()
        : "";
    const error = new Error(
      `[nostr] Relay ${normalizedUrl} does not support COUNT frames.`
    );
    error.code = "count-unsupported";
    error.relay = normalizedUrl;
    error.unsupported = true;
    return error;
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

  applyRelayPreferences(preferences = {}) {
    const normalizedPrefs =
      preferences && typeof preferences === "object" ? preferences : {};
    const sanitizedAll = sanitizeRelayList(
      Array.isArray(normalizedPrefs.all)
        ? normalizedPrefs.all
        : this.relays
    );
    const effectiveAll =
      sanitizedAll.length > 0
        ? sanitizedAll
        : sanitizeRelayList(Array.from(DEFAULT_RELAY_URLS));

    const sanitizedRead = sanitizeRelayList(
      Array.isArray(normalizedPrefs.read)
        ? normalizedPrefs.read
        : effectiveAll
    );
    const sanitizedWrite = sanitizeRelayList(
      Array.isArray(normalizedPrefs.write)
        ? normalizedPrefs.write
        : effectiveAll
    );

    this.relays = effectiveAll.length ? effectiveAll : Array.from(RELAY_URLS);
    this.readRelays = sanitizedRead.length ? sanitizedRead : Array.from(this.relays);
    this.writeRelays = sanitizedWrite.length ? sanitizedWrite : Array.from(this.relays);
  }

  getWatchHistoryCacheTtlMs() {
    if (Number.isFinite(this.watchHistoryCacheTtlMs) && this.watchHistoryCacheTtlMs > 0) {
      return this.watchHistoryCacheTtlMs;
    }

    const configured = Number(WATCH_HISTORY_CACHE_TTL_MS);
    const resolved =
      Number.isFinite(configured) && configured > 0
        ? Math.floor(configured)
        : 24 * 60 * 60 * 1000;

    this.watchHistoryCacheTtlMs = resolved;
    return resolved;
  }

  getWatchHistoryStorage() {
    if (this.watchHistoryStorage && this.watchHistoryStorage.version === WATCH_HISTORY_STORAGE_VERSION) {
      return this.watchHistoryStorage;
    }

    const emptyStorage = { version: WATCH_HISTORY_STORAGE_VERSION, actors: {} };

    if (typeof localStorage === "undefined") {
      this.watchHistoryStorage = emptyStorage;
      return this.watchHistoryStorage;
    }

    let raw = null;
    try {
      raw = localStorage.getItem(WATCH_HISTORY_STORAGE_KEY);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to read watch history storage:", error);
      }
      this.watchHistoryStorage = emptyStorage;
      return this.watchHistoryStorage;
    }

    if (!raw || typeof raw !== "string") {
      this.watchHistoryStorage = emptyStorage;
      return this.watchHistoryStorage;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to parse watch history storage:", error);
      }
      this.watchHistoryStorage = emptyStorage;
      return this.watchHistoryStorage;
    }

    const now = Date.now();
    const ttl = this.getWatchHistoryCacheTtlMs();
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
        if (isDevMode) {
          console.warn("[nostr] Failed to rewrite watch history storage:", error);
        }
      }
    }

    this.watchHistoryStorage = storage;
    return this.watchHistoryStorage;
  }

  persistWatchHistoryEntry(actorInput, entry) {
    const actorKey = normalizeActorKey(actorInput);
    if (!actorKey) {
      return;
    }

    const storage = this.getWatchHistoryStorage();
    const actors = { ...storage.actors };
    const now = Date.now();
    const ttl = this.getWatchHistoryCacheTtlMs();
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

    this.watchHistoryStorage = payload;

    if (!mutated || typeof localStorage === "undefined") {
      return;
    }

    try {
      localStorage.setItem(WATCH_HISTORY_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to persist watch history entry:", error);
      }
    }
  }

  cancelWatchHistoryRepublish(snapshotId = null) {
    if (!snapshotId) {
      for (const entry of this.watchHistoryRepublishTimers.values()) {
        if (entry && typeof entry.timer === "number") {
          clearTimeout(entry.timer);
        } else if (entry && entry.timer) {
          clearTimeout(entry.timer);
        } else if (typeof entry === "number") {
          clearTimeout(entry);
        }
      }
      this.watchHistoryRepublishTimers.clear();
      return;
    }

    const key = typeof snapshotId === "string" ? snapshotId.trim() : "";
    if (!key) {
      return;
    }

    const entry = this.watchHistoryRepublishTimers.get(key);
    if (entry && typeof entry.timer === "number") {
      clearTimeout(entry.timer);
    } else if (entry && entry.timer) {
      clearTimeout(entry.timer);
    } else if (typeof entry === "number") {
      clearTimeout(entry);
    }
    this.watchHistoryRepublishTimers.delete(key);
  }

  scheduleWatchHistoryRepublish(snapshotId, operation, options = {}) {
    const key = typeof snapshotId === "string" ? snapshotId.trim() : "";
    if (!key || typeof operation !== "function") {
      return;
    }

    const onSchedule =
      typeof options?.onSchedule === "function" ? options.onSchedule : null;
    const previous = this.watchHistoryRepublishTimers.get(key);
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
        if (isDevMode) {
          console.warn(
            `[nostr] Failed to notify watch history republish schedule for ${key}:`,
            error,
          );
        }
      }
    }

    const timer = setTimeout(async () => {
      this.watchHistoryRepublishTimers.delete(key);
      try {
        const result = await operation(attempt + 1);
        if (!result || result.ok !== true) {
          if (attempt + 1 <= WATCH_HISTORY_REPUBLISH_MAX_ATTEMPTS) {
            this.scheduleWatchHistoryRepublish(key, operation, {
              attempt: attempt + 1,
              onSchedule,
            });
          } else if (isDevMode) {
            console.warn(
              `[nostr] Watch history republish aborted for ${key}: max attempts reached.`,
            );
          }
        } else {
          this.cancelWatchHistoryRepublish(key);
        }
      } catch (error) {
        if (isDevMode) {
          console.warn("[nostr] Watch history republish attempt failed:", error);
        }
        if (attempt + 1 <= WATCH_HISTORY_REPUBLISH_MAX_ATTEMPTS) {
          this.scheduleWatchHistoryRepublish(key, operation, {
            attempt: attempt + 1,
            onSchedule,
          });
        }
      }
    }, delay);

    this.watchHistoryRepublishTimers.set(key, {
      timer,
      attempt,
      operation,
    });

    return { attempt: attempt + 1, delay };
  }

  async getWatchHistoryFingerprint(actorInput, itemsOverride = null) {
    const resolvedActor =
      typeof actorInput === "string" && actorInput.trim()
        ? actorInput.trim()
        : typeof this.pubkey === "string" && this.pubkey.trim()
        ? this.pubkey.trim()
        : "";
    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return "";
    }

    const items = Array.isArray(itemsOverride)
      ? canonicalizeWatchHistoryItems(itemsOverride, WATCH_HISTORY_MAX_ITEMS)
      : (() => {
          const cacheEntry =
            this.watchHistoryCache.get(actorKey) ||
            this.getWatchHistoryStorage().actors?.[actorKey];
          return Array.isArray(cacheEntry?.items)
            ? canonicalizeWatchHistoryItems(cacheEntry.items, WATCH_HISTORY_MAX_ITEMS)
            : [];
        })();

    const fingerprint = await computeWatchHistoryFingerprintForItems(items);
    const previous = this.watchHistoryFingerprints.get(actorKey);
    if (previous && previous !== fingerprint) {
      console.info(`[nostr] Watch history fingerprint changed for ${actorKey}.`);
    }
    this.watchHistoryFingerprints.set(actorKey, fingerprint);
    return fingerprint;
  }

  ensureWatchHistoryBackgroundRefresh(actorInput = null) {
    const resolvedActor =
      typeof actorInput === "string" && actorInput.trim()
        ? actorInput.trim()
        : typeof this.pubkey === "string" && this.pubkey.trim()
        ? this.pubkey.trim()
        : this.sessionActor?.pubkey || "";
    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return Promise.resolve({ pointerEvent: null, items: [], snapshotId: "" });
    }

    if (this.watchHistoryRefreshPromises.has(actorKey)) {
      return this.watchHistoryRefreshPromises.get(actorKey);
    }

    const promise = (async () => {
      const fetchResult = await this.fetchWatchHistory(resolvedActor, {
        forceRefresh: true,
      });

      if (fetchResult.pointerEvent) {
        return fetchResult;
      }

      const storageEntry = this.getWatchHistoryStorage().actors?.[actorKey];
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

      const publishResult = await this.publishWatchHistorySnapshot(items, {
        actorPubkey: resolvedActor,
        snapshotId: storageEntry?.snapshotId,
        source: "background-refresh",
      });

      const fingerprint = await this.getWatchHistoryFingerprint(resolvedActor, items);
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

      this.watchHistoryCache.set(actorKey, entry);
      this.persistWatchHistoryEntry(actorKey, entry);

      if (!publishResult.ok && publishResult.retryable) {
        const retrySnapshot = entry.snapshotId || publishResult.snapshotId;
        if (retrySnapshot) {
          this.scheduleWatchHistoryRepublish(retrySnapshot, async (attempt) =>
            this.publishWatchHistorySnapshot(entry.items, {
              actorPubkey: resolvedActor,
              snapshotId: retrySnapshot,
              attempt,
              source: "background-refresh",
            }),
          );
        }
      } else if (publishResult.ok && entry.snapshotId) {
        this.cancelWatchHistoryRepublish(entry.snapshotId);
      }

      return {
        pointerEvent: entry.pointerEvent,
        items: entry.items,
        snapshotId: entry.snapshotId,
      };
    })()
      .catch((error) => {
        if (isDevMode) {
          console.warn("[nostr] Watch history background refresh failed:", error);
        }
        throw error;
      })
      .finally(() => {
        this.watchHistoryRefreshPromises.delete(actorKey);
      });

    this.watchHistoryRefreshPromises.set(actorKey, promise);
    return promise;
  }

  async publishWatchHistorySnapshot(rawItems, options = {}) {
    if (!this.pool) {
      return { ok: false, error: "nostr-uninitialized", retryable: false };
    }

    const resolvedActor =
      typeof options.actorPubkey === "string" && options.actorPubkey.trim()
        ? options.actorPubkey.trim()
        : typeof this.pubkey === "string" && this.pubkey.trim()
        ? this.pubkey.trim()
        : await this.ensureSessionActor();

    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return { ok: false, error: "missing-actor", retryable: false };
    }

    const actorPubkey = resolvedActor || actorKey;
    const extension = window?.nostr;
    const extensionActorKey = normalizeActorKey(this.pubkey);
    const canUseExtensionSign =
      extension &&
      typeof extension.signEvent === "function" &&
      actorKey === extensionActorKey;

    const useExtensionEncrypt =
      canUseExtensionSign &&
      extension &&
      extension.nip04 &&
      typeof extension.nip04.encrypt === "function";

    let privateKey = "";
    if (!canUseExtensionSign) {
      if (!this.sessionActor || this.sessionActor.pubkey !== actorKey) {
        const ensured = await this.ensureSessionActor();
        if (normalizeActorKey(ensured) !== actorKey) {
          return { ok: false, error: "session-actor-mismatch", retryable: false };
        }
      }
      if (!this.sessionActor || this.sessionActor.pubkey !== actorKey) {
        return { ok: false, error: "session-actor-missing", retryable: false };
      }
      privateKey = this.sessionActor.privateKey;
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
      console.warn(
        `[nostr] Watch history snapshot skipped ${skipped.length} oversize entr${
          skipped.length === 1 ? "y" : "ies"
        }.`,
      );
    }

    let relays = sanitizeRelayList(
      Array.isArray(options.relays) && options.relays.length
        ? options.relays
        : Array.isArray(this.writeRelays) && this.writeRelays.length
        ? this.writeRelays
        : Array.isArray(this.relays) && this.relays.length
        ? this.relays
        : RELAY_URLS,
    );

    if (!Array.isArray(relays) || relays.length === 0) {
      relays = Array.from(RELAY_URLS);
    }

    console.info(
      "[nostr] Preparing to publish watch history snapshot.",
      {
        actor: actorKey,
        snapshotId,
        itemCount: canonicalItems.length,
        chunkCount: chunks.length,
        relaysRequested: relays,
        attempt: options.attempt || 0,
        source: options.source || "unknown",
      }
    );

    const createdAtBase = Math.max(
      Math.floor(Date.now() / 1000),
      this.watchHistoryLastCreatedAt + 1,
    );

    let cachedNip04Tools = null;
    const ensureNip04Tools = async () => {
      if (cachedNip04Tools) {
        return cachedNip04Tools;
      }
      const tools = await ensureNostrTools();
      if (tools?.nip04 && typeof tools.nip04.encrypt === "function") {
        cachedNip04Tools = tools;
        return cachedNip04Tools;
      }
      return null;
    };

    const encryptChunk = async (plaintext) => {
      if (useExtensionEncrypt) {
        return extension.nip04.encrypt(actorPubkey, plaintext);
      }
      const tools = await ensureNip04Tools();
      if (!tools?.nip04 || typeof tools.nip04.encrypt !== "function") {
        throw new Error("nip04-unavailable");
      }
      return tools.nip04.encrypt(privateKey, actorPubkey, plaintext);
    };

    const signEvent = async (event) => {
      if (canUseExtensionSign) {
        return extension.signEvent(event);
      }
      return signEventWithPrivateKey(event, privateKey);
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

      console.info(
        "[nostr] Publishing watch history chunk.",
        {
          actor: actorKey,
          snapshotId,
          chunkIndex: index,
          chunkSize: chunkItems.length,
          relays,
        }
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
        console.warn("[nostr] Failed to encrypt watch history chunk:", error);
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
        console.warn("[nostr] Failed to sign watch history chunk:", error);
        return { ok: false, error: "signing-failed", retryable: false };
      }

      const publishResults = await publishEventToRelays(
        this.pool,
        relays,
        signedEvent,
      );
      const relayStatus = formatRelayStatus(publishResults);
      const acceptedCount = relayStatus.filter((entry) => entry.success).length;

      if (acceptedCount === 0) {
        anyChunkRejected = true;
        console.warn(
          `[nostr] Watch history chunk ${index} rejected by all relays:`,
          publishResults,
        );
      } else {
        const logMessage =
          acceptedCount === relays.length
            ? "accepted"
            : "partially accepted";
        if (acceptedCount === relays.length) {
          console.info(
            `[nostr] Watch history chunk ${index} accepted by ${acceptedCount}/${relays.length} relay(s).`,
          );
        } else {
          anyChunkPartial = true;
          console.warn(
            `[nostr] Watch history chunk ${index} ${logMessage} by ${acceptedCount}/${relays.length} relay(s).`,
            publishResults,
          );
        }
      }

      const address = eventToAddressPointer(signedEvent);
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
      console.warn("[nostr] Failed to sign watch history pointer event:", error);
      return { ok: false, error: "signing-failed", retryable: false };
    }

    console.info(
      "[nostr] Publishing watch history pointer event.",
      {
        actor: actorKey,
        snapshotId,
        relays,
      }
    );

    const pointerResults = await publishEventToRelays(
      this.pool,
      relays,
      signedPointerEvent,
    );
    const pointerRelayStatus = formatRelayStatus(pointerResults);
    const pointerAcceptedCount = pointerRelayStatus.filter((entry) => entry.success)
      .length;
    const pointerAccepted = pointerAcceptedCount > 0;

    if (pointerAcceptedCount === relays.length) {
      console.info(
        `[nostr] Watch history pointer accepted by ${pointerAcceptedCount}/${relays.length} relay(s).`,
      );
    } else if (pointerAccepted) {
      console.warn(
        `[nostr] Watch history pointer partially accepted by ${pointerAcceptedCount}/${relays.length} relay(s).`,
        pointerResults,
      );
    } else {
      console.warn(
        "[nostr] Watch history pointer rejected by all relays:",
        pointerResults,
      );
    }

    this.watchHistoryLastCreatedAt = createdAtCursor;

    const chunkStatuses = chunkResults.map((entry) => entry.relayStatus);
    const chunkAcceptedEverywhere = chunkResults.every(
      (entry) => entry.acceptedCount === relays.length,
    );
    const chunkRejectedEverywhere = chunkResults.some(
      (entry) => entry.acceptedCount === 0,
    );
    const pointerRejectedEverywhere = pointerAcceptedCount === 0;
    const pointerPartial =
      pointerAccepted && pointerAcceptedCount < relays.length;
    const partialAcceptance = pointerPartial || anyChunkPartial;
    const success =
      !pointerRejectedEverywhere && pointerAcceptedCount === relays.length &&
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

    console.info("[nostr] Watch history snapshot publish result.", {
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

  async updateWatchHistoryList(rawItems = [], options = {}) {
    const resolvedActor =
      typeof options.actorPubkey === "string" && options.actorPubkey.trim()
        ? options.actorPubkey.trim()
        : typeof this.pubkey === "string" && this.pubkey.trim()
        ? this.pubkey.trim()
        : await this.ensureSessionActor();

    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return { ok: false, error: "missing-actor" };
    }

    const storage = this.getWatchHistoryStorage();
    const cachedEntry =
      this.watchHistoryCache.get(actorKey) || storage.actors?.[actorKey] || {};

    const existingItems = Array.isArray(cachedEntry.items)
      ? canonicalizeWatchHistoryItems(cachedEntry.items, WATCH_HISTORY_MAX_ITEMS)
      : [];
    const incomingItems = Array.isArray(rawItems) ? rawItems : [];

    const combined =
      options.replace === true
        ? incomingItems
        : [...incomingItems, ...existingItems];

    const canonicalItems = canonicalizeWatchHistoryItems(
      combined,
      WATCH_HISTORY_MAX_ITEMS,
    );

    const fingerprint = await this.getWatchHistoryFingerprint(
      resolvedActor,
      canonicalItems,
    );

    console.info("[nostr] Updating watch history list.", {
      actor: resolvedActor,
      incomingItemCount: incomingItems.length,
      finalItemCount: canonicalItems.length,
      replace: options.replace === true,
    });

    const publishResult = await this.publishWatchHistorySnapshot(
      canonicalItems,
      {
        actorPubkey: resolvedActor,
        snapshotId: options.snapshotId || cachedEntry.snapshotId,
        attempt: options.attempt || 0,
      },
    );

    console.info("[nostr] Watch history list publish attempt finished.", {
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

    this.watchHistoryCache.set(actorKey, entry);
    this.persistWatchHistoryEntry(actorKey, entry);

    if (!publishResult.ok && publishResult.retryable && entry.snapshotId) {
      this.scheduleWatchHistoryRepublish(entry.snapshotId, async (attempt) =>
        this.publishWatchHistorySnapshot(entry.items, {
          actorPubkey: resolvedActor,
          snapshotId: entry.snapshotId,
          attempt,
        }),
      );
    } else if (publishResult.ok && entry.snapshotId) {
      this.cancelWatchHistoryRepublish(entry.snapshotId);
    }

    return publishResult;
  }

  async removeWatchHistoryItem(pointerInput, options = {}) {
    const pointer = normalizePointerInput(pointerInput);
    if (!pointer) {
      return { ok: false, error: "invalid-pointer" };
    }

    const resolvedActor =
      typeof options.actorPubkey === "string" && options.actorPubkey.trim()
        ? options.actorPubkey.trim()
        : typeof this.pubkey === "string" && this.pubkey.trim()
        ? this.pubkey.trim()
        : await this.ensureSessionActor();

    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return { ok: false, error: "missing-actor" };
    }

    const existingEntry =
      this.watchHistoryCache.get(actorKey) ||
      this.getWatchHistoryStorage().actors?.[actorKey] ||
      {};
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

    return this.updateWatchHistoryList(filtered, {
      ...options,
      actorPubkey: resolvedActor,
      replace: true,
    });
  }

  async fetchWatchHistory(actorInput, options = {}) {
    const resolvedActor =
      typeof actorInput === "string" && actorInput.trim()
        ? actorInput.trim()
        : typeof this.pubkey === "string" && this.pubkey.trim()
        ? this.pubkey.trim()
        : this.sessionActor?.pubkey || "";

    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return { pointerEvent: null, items: [], snapshotId: "" };
    }

    console.info("[nostr] Fetching watch history from relays.", {
      actor: resolvedActor,
      forceRefresh: options.forceRefresh === true,
    });

    const extension = window?.nostr;

    const existingEntry = this.watchHistoryCache.get(actorKey);
    const now = Date.now();
    const ttl = this.getWatchHistoryCacheTtlMs();

    if (
      !options.forceRefresh &&
      existingEntry &&
      Number.isFinite(existingEntry.savedAt) &&
      now - existingEntry.savedAt < ttl
    ) {
      console.info("[nostr] Using cached watch history entry.", {
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

    if (!this.pool) {
      console.warn("[nostr] Cannot fetch watch history because relay pool is unavailable. Returning cached values.");
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

    let readRelays = sanitizeRelayList(
      Array.isArray(this.readRelays) && this.readRelays.length
        ? this.readRelays
        : Array.isArray(this.relays) && this.relays.length
        ? this.relays
        : RELAY_URLS,
    );

    if (!Array.isArray(readRelays) || readRelays.length === 0) {
      readRelays = Array.from(RELAY_URLS);
    }

    let pointerEvents = [];
    try {
      const filters = [
        {
          kinds: [WATCH_HISTORY_KIND],
          authors: [resolvedActor],
          "#d": identifiers,
          limit,
        },
      ];
      const results = await this.pool.list(readRelays, filters);
      pointerEvents = Array.isArray(results)
        ? results
            .flat()
            .filter((event) => event && typeof event === "object")
        : [];
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to fetch watch history pointer:", error);
      }
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
      console.info(
        "[nostr] No watch history pointer event found on relays. Falling back to storage.",
        {
          actor: resolvedActor,
        }
      );
      const storageEntry = this.getWatchHistoryStorage().actors?.[actorKey];
      const items = Array.isArray(storageEntry?.items)
        ? canonicalizeWatchHistoryItems(storageEntry.items, WATCH_HISTORY_MAX_ITEMS)
        : [];
      const fingerprint = typeof storageEntry?.fingerprint === "string"
        ? storageEntry.fingerprint
        : await this.getWatchHistoryFingerprint(resolvedActor, items);
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
      this.watchHistoryCache.set(actorKey, entry);
      this.persistWatchHistoryEntry(actorKey, entry);
      return { pointerEvent: null, items, snapshotId: entry.snapshotId };
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
        authors: [resolvedActor],
        "#d": chunkIdentifiers,
        limit: Math.max(chunkIdentifiers.length * 2, limit),
      });
    } else if (snapshotId) {
      chunkFilters.push({
        kinds: [WATCH_HISTORY_KIND],
        authors: [resolvedActor],
        "#snapshot": [snapshotId],
        limit,
      });
    }

    let chunkEvents = [];
    if (chunkFilters.length) {
      try {
        const results = await this.pool.list(readRelays, chunkFilters);
        chunkEvents = Array.isArray(results)
          ? results
              .flat()
              .filter((event) => event && typeof event === "object")
          : [];
      } catch (error) {
        if (isDevMode) {
          console.warn("[nostr] Failed to fetch watch history chunks:", error);
        }
      }
    }

    const latestChunks = new Map();
    for (const event of chunkEvents) {
      if (!event || typeof event !== "object") {
        continue;
      }
      const tags = Array.isArray(event.tags) ? event.tags : [];
      let identifier = "";
      for (const tag of tags) {
        if (Array.isArray(tag) && tag[0] === "d" && typeof tag[1] === "string") {
          identifier = tag[1];
          break;
        }
      }
      if (!identifier) {
        continue;
      }
      const createdAt = Number.isFinite(event.created_at) ? event.created_at : 0;
      const existing = latestChunks.get(identifier);
      if (!existing || createdAt > existing.created_at) {
        latestChunks.set(identifier, event);
      }
    }

    const decryptErrors = [];
    const collectedItems = [];

    let cachedDecryptTools = null;
    const ensureDecryptTools = async () => {
      if (cachedDecryptTools) {
        return cachedDecryptTools;
      }
      const tools = await ensureNostrTools();
      if (tools?.nip04 && typeof tools.nip04.decrypt === "function") {
        cachedDecryptTools = tools;
        return cachedDecryptTools;
      }
      return null;
    };

    const decryptChunk = async (ciphertext) => {
      if (!ciphertext || typeof ciphertext !== "string") {
        throw new Error("empty-ciphertext");
      }
      const extensionDecrypt =
        extension &&
        typeof extension?.nip04?.decrypt === "function" &&
        normalizeActorKey(this.pubkey) === actorKey;
      if (extensionDecrypt) {
        return extension.nip04.decrypt(resolvedActor, ciphertext);
      }
      if (!this.sessionActor || this.sessionActor.pubkey !== actorKey) {
        await this.ensureSessionActor();
      }
      if (!this.sessionActor || this.sessionActor.pubkey !== actorKey) {
        throw new Error("missing-session-key");
      }
      const tools = await ensureDecryptTools();
      if (!tools?.nip04 || typeof tools.nip04.decrypt !== "function") {
        throw new Error("nip04-unavailable");
      }
      return tools.nip04.decrypt(
        this.sessionActor.privateKey,
        resolvedActor,
        ciphertext,
      );
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
      let payload;
      if (isNip04EncryptedWatchHistoryEvent(event, ciphertext)) {
        try {
          const plaintext = await decryptChunk(ciphertext);
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
          payload = {
            version: 0,
            items: fallbackPointers,
          };
        }
      } else {
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
      console.warn(
        `[nostr] Failed to decrypt ${decryptErrors.length} watch history chunk(s) for ${actorKey}. Using fallback pointers.`,
      );
    }

    const mergedItems = collectedItems.length ? collectedItems : pointerPayload.items;
    const canonicalItems = canonicalizeWatchHistoryItems(
      mergedItems,
      WATCH_HISTORY_MAX_ITEMS,
    );

    const fingerprint = await this.getWatchHistoryFingerprint(
      resolvedActor,
      canonicalItems,
    );

    const metadata = sanitizeWatchHistoryMetadata(
      this.getWatchHistoryStorage().actors?.[actorKey]?.metadata,
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

    this.watchHistoryCache.set(actorKey, entry);
    this.persistWatchHistoryEntry(actorKey, entry);

    return { pointerEvent, items: canonicalItems, snapshotId };
  }

  async resolveWatchHistory(actorInput, options = {}) {
    const resolvedActor =
      typeof actorInput === "string" && actorInput.trim()
        ? actorInput.trim()
        : typeof this.pubkey === "string" && this.pubkey.trim()
        ? this.pubkey.trim()
        : await this.ensureSessionActor();

    const actorKey = normalizeActorKey(resolvedActor);
    if (!actorKey) {
      return [];
    }

    console.info("[nostr] Resolving watch history for actor.", {
      actor: resolvedActor,
      forceRefresh: options.forceRefresh === true,
    });

    const storage = this.getWatchHistoryStorage();
    const fallbackItems = Array.isArray(storage.actors?.[actorKey]?.items)
      ? canonicalizeWatchHistoryItems(
          storage.actors[actorKey].items,
          WATCH_HISTORY_MAX_ITEMS,
        )
      : [];

    const fetchResult = await this.fetchWatchHistory(resolvedActor, {
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

    const fingerprint = await this.getWatchHistoryFingerprint(
      resolvedActor,
      canonicalItems,
    );

    console.info("[nostr] Watch history fetch complete.", {
      actor: resolvedActor,
      snapshotId: fetchResult.snapshotId || null,
      pointerFound: !!fetchResult.pointerEvent,
      itemCount: canonicalItems.length,
    });

    console.info("[nostr] Watch history resolved and cached.", {
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

    this.watchHistoryCache.set(actorKey, entry);
    this.persistWatchHistoryEntry(actorKey, entry);

    return canonicalItems;
  }

  async listVideoViewEvents(pointer, options = {}) {
    if (!this.pool) {
      return [];
    }

    const { pointer: pointerDescriptor, filters } = createVideoViewEventFilters(
      pointer
    );
    const { since, until, limit, relays } = options || {};

    for (const filter of filters) {
      if (!filter || typeof filter !== "object") {
        continue;
      }
      if (Number.isFinite(since)) {
        filter.since = Math.floor(since);
      }
      if (Number.isFinite(until)) {
        filter.until = Math.floor(until);
      }
      if (Number.isFinite(limit) && limit > 0) {
        filter.limit = Math.floor(limit);
      }
    }

    const relayList = Array.isArray(relays) && relays.length
      ? relays
      : Array.isArray(this.relays) && this.relays.length
      ? this.relays
      : RELAY_URLS;

    let rawResults;
    try {
      rawResults = await this.pool.list(relayList, filters);
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
      if (!isVideoViewEvent(event, pointerDescriptor)) {
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

    const { pointer: pointerDescriptor, filters } = createVideoViewEventFilters(
      pointer
    );

    if (Number.isFinite(options?.since)) {
      for (const filter of filters) {
        if (filter && typeof filter === "object") {
          filter.since = Math.floor(options.since);
        }
      }
    }

    const relayList = Array.isArray(options?.relays) && options.relays.length
      ? options.relays
      : Array.isArray(this.relays) && this.relays.length
      ? this.relays
      : RELAY_URLS;

    const onEvent = typeof options?.onEvent === "function" ? options.onEvent : null;

    let subscription;
    try {
      subscription = this.pool.sub(relayList, filters);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to open video view subscription:", error);
      }
      return () => {};
    }

    if (onEvent) {
      subscription.on("event", (event) => {
        if (isVideoViewEvent(event, pointerDescriptor)) {
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
    const relayList =
      Array.isArray(options?.relays) && options.relays.length
        ? options.relays
        : undefined;

    const fallbackListOptions = (() => {
      const listOptions = {};

      if (relayList) {
        listOptions.relays = relayList;
      }

      if (Number.isFinite(options?.since)) {
        listOptions.since = Math.floor(options.since);
      } else {
        const horizonDaysRaw = Number(VIEW_COUNT_BACKFILL_MAX_DAYS);
        const horizonDays = Number.isFinite(horizonDaysRaw)
          ? Math.max(0, Math.floor(horizonDaysRaw))
          : 0;
        if (horizonDays > 0) {
          const secondsPerDay = 86_400;
          const nowSeconds = Math.floor(Date.now() / 1000);
          const fallbackSinceSeconds = Math.max(
            0,
            nowSeconds - horizonDays * secondsPerDay
          );
          listOptions.since = Math.floor(fallbackSinceSeconds);
        }
      }

      if (Number.isFinite(options?.until)) {
        listOptions.until = Math.floor(options.until);
      }

      if (Number.isFinite(options?.limit) && options.limit > 0) {
        listOptions.limit = Math.floor(options.limit);
      }

      return listOptions;
    })();

    if (!this.pool) {
      const events = await this.listVideoViewEvents(pointer, {
        ...fallbackListOptions,
      });
      return {
        total: Array.isArray(events) ? events.length : 0,
        perRelay: [],
        best: null,
        fallback: true,
      };
    }

    const { filters } = createVideoViewEventFilters(pointer);
    const pointerFilter = Array.isArray(filters) && filters.length ? filters[0] : null;
    if (!pointerFilter || typeof pointerFilter !== "object") {
      throw new Error("Invalid video pointer supplied for view lookup.");
    }

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
      const result = await this.countEventsAcrossRelays([pointerFilter], {
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
      ...fallbackListOptions,
    });

    const events = abortPromise
      ? await Promise.race([listPromise, abortPromise])
      : await listPromise;

    const uniqueCount = Array.isArray(events)
      ? (() => {
          const withIds = events
            .filter((event) => event && typeof event.id === "string")
            .map((event) => event.id);
          if (withIds.length === 0) {
            return events.length;
          }
          return new Set(withIds).size;
        })()
      : 0;

    return {
      total: uniqueCount,
      perRelay: [],
      best: null,
      fallback: true,
    };
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

    const guardScope = deriveViewEventPointerScope(pointer);
    const guardBucket = deriveViewEventBucketIndex(createdAt);
    if (guardScope && hasRecentViewPublish(guardScope, guardBucket)) {
      if (isDevMode) {
        console.info("[nostr] Skipping duplicate view publish for scope", guardScope);
      }
      return {
        ok: true,
        duplicate: true,
        event: null,
        results: [],
        acceptedRelays: [],
      };
    }

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

    const pointerTag =
      pointer.type === "a"
        ? pointer.relay
          ? ["a", pointer.value, pointer.relay]
          : ["a", pointer.value]
        : pointer.relay
        ? ["e", pointer.value, pointer.relay]
        : ["e", pointer.value];

    let content = "";
    if (typeof options.content === "string") {
      content = options.content;
    } else if (
      options.content &&
      typeof options.content === "object" &&
      !Array.isArray(options.content)
    ) {
      try {
        content = JSON.stringify(options.content);
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[nostr] Failed to serialize custom view event content:",
            error
          );
        }
        content = "";
      }
    }

    if (!content) {
      const payload = {
        target: {
          type: pointer.type,
          value: pointer.value,
        },
        created_at: createdAt,
      };
      if (pointer.relay) {
        payload.target.relay = pointer.relay;
      }
      try {
        content = JSON.stringify(payload);
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[nostr] Failed to serialize default view event content:",
            error
          );
        }
        content = "";
      }
    }

    const event = buildViewEvent({
      pubkey: actorPubkey,
      created_at: createdAt,
      pointerValue: pointer.value,
      pointerTag,
      includeSessionTag: usingSessionActor,
      additionalTags,
      content,
    });

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

    const acceptedRelays = publishResults
      .filter((result) => result.success)
      .map((result) => result.url)
      .filter((url) => typeof url === "string" && url);
    const success = acceptedRelays.length > 0;
    if (success) {
      if (guardScope) {
        rememberViewPublish(guardScope, guardBucket);
      }
      console.info(
        `[nostr] View event accepted by ${acceptedRelays.length} relay(s):`,
        acceptedRelays.join(", ")
      );
    } else {
      console.warn("[nostr] View event rejected by relays:", publishResults);
    }

    return {
      ok: success,
      event: signedEvent,
      results: publishResults,
      acceptedRelays,
    };
  }

  async recordVideoView(videoPointer, options = {}) {
    const pointer = normalizePointerInput(videoPointer);
    if (!pointer) {
      return { ok: false, error: "invalid-pointer" };
    }

    const view = await this.publishViewEvent(pointer, options);

    if (view?.ok && view.event) {
      try {
        const ingest = await loadIngestLocalViewEvent();
        if (typeof ingest === "function") {
          ingest({ event: view.event, pointer });
        }
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[nostr] Failed to ingest optimistic view event:",
            error
          );
        }
      }
    }

    return view;
  }

  /**
   * Connect to the configured relays
   */
  async init() {
    if (isDevMode) console.log("Connecting to relays...");

    this.restoreLocalData();

    try {
      await this.ensurePool();
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

  async ensurePool() {
    if (this.pool) {
      return this.pool;
    }

    if (this.poolPromise) {
      return this.poolPromise;
    }

    const tools = await ensureNostrTools();
    const SimplePool = resolveSimplePoolConstructor(tools);

    if (typeof SimplePool !== "function") {
      if (isDevMode) {
        if (tools && typeof tools === "object") {
          const availableKeys = Object.keys(tools).join(", ");
          console.warn(
            "[nostr] NostrTools helpers did not expose SimplePool. Available keys:",
            availableKeys
          );
        } else {
          console.warn(
            "[nostr] NostrTools helpers were unavailable. Check that nostr-tools bundles can load on this domain."
          );
        }
        if (nostrToolsBootstrapFailure) {
          console.warn(
            "[nostr] nostr-tools bootstrap failure details:",
            nostrToolsBootstrapFailure
          );
        }
      }
      const error = new Error(
        "NostrTools SimplePool is unavailable. Verify that nostr-tools resources can load on this domain."
      );

      error.code = "nostr-simplepool-unavailable";
      if (nostrToolsBootstrapFailure) {
        error.bootstrapFailure = nostrToolsBootstrapFailure;
      }
      this.poolPromise = null;
      throw error;
    }

    const creation = Promise.resolve().then(() => {
      const instance = new SimplePool();
      this.pool = instance;
      return instance;
    });

    const shared = creation
      .then((instance) => {
        this.poolPromise = Promise.resolve(instance);
        return instance;
      })
      .catch((error) => {
        this.poolPromise = null;
        throw error;
      });

    this.poolPromise = shared;
    return shared;
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
          await runNip07WithRetry(() => extension.enable(), {
            label: "extension.enable",
          });
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
          const selection = await runNip07WithRetry(
            () => extension.selectAccounts(expectPubkey ? [expectPubkey] : undefined),
            { label: "extension.selectAccounts" }
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
      const pubkey = await runNip07WithRetry(() => extension.getPublicKey(), {
        label: "extension.getPublicKey",
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
      const nip19Tools = await ensureNostrTools();
      const npubEncode = nip19Tools?.nip19?.npubEncode;
      if (typeof npubEncode !== "function") {
        throw new Error("NostrTools nip19 encoder is unavailable.");
      }
      const npub = npubEncode(pubkey);

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
      if (timer && typeof timer.timer === "number") {
        clearTimeout(timer.timer);
      } else if (timer && timer.timer) {
        clearTimeout(timer.timer);
      } else if (typeof timer === "number") {
        clearTimeout(timer);
      }
    }
    this.watchHistoryRepublishTimers.clear();
    this.watchHistoryCache.clear();
    this.watchHistoryFingerprints.clear();
    this.watchHistoryRefreshPromises.clear();
    this.watchHistoryLastCreatedAt = 0;
    this.watchHistoryStorage = null;
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
  async signAndPublishEvent(
    event,
    {
      context = "event",
      logName = context,
      devLogLabel = logName,
      rejectionLogLevel = "error",
    } = {}
  ) {
    const signedEvent = await window.nostr.signEvent(event);
    if (isDevMode) {
      console.log(`Signed ${devLogLabel} event:`, signedEvent);
    }

    const publishResults = await publishEventToRelays(
      this.pool,
      this.relays,
      signedEvent
    );

    let publishSummary;
    try {
      publishSummary = assertAnyRelayAccepted(publishResults, { context });
    } catch (publishError) {
      if (publishError?.relayFailures?.length) {
        const logLevel = rejectionLogLevel === "warn" ? "warn" : "error";
        publishError.relayFailures.forEach(
          ({ url, error: relayError, reason }) => {
            console[logLevel](
              `[nostr] ${logName} rejected by ${url}: ${reason}`,
              relayError || reason
            );
          }
        );
      }
      throw publishError;
    }

    if (isDevMode) {
      publishSummary.accepted.forEach(({ url }) => {
        console.log(`${logName} published to ${url}`);
      });
    }

    if (publishSummary.failed.length) {
      publishSummary.failed.forEach(({ url, error: relayError }) => {
        const reason =
          relayError instanceof Error
            ? relayError.message
            : relayError
            ? String(relayError)
            : "publish failed";
        console.warn(
          `[nostr] ${logName} not accepted by ${url}: ${reason}`,
          relayError
        );
      });
    }

    return { signedEvent, summary: publishSummary };
  }

  async publishVideo(videoPayload, pubkey) {
    if (!pubkey) throw new Error("Not logged in to publish video.");

    const { videoData, nip71Metadata } = extractVideoPublishPayload(videoPayload);

    // NOTE: Keep the Upload, Edit, and Revert flows synchronized when
    // updating shared fields. Changes here must be reflected in the modal
    // controllers and revert helpers so all paths stay in lockstep.
    if (isDevMode) {
      console.log("Publishing new video with data:", videoData);
      if (nip71Metadata) {
        console.log("Including NIP-71 metadata:", nip71Metadata);
      }
    }

    const rawMagnet = typeof videoData.magnet === "string" ? videoData.magnet : "";
    const finalMagnet = rawMagnet.trim();
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

    const event = buildVideoPostEvent({
      pubkey,
      created_at: createdAt,
      dTagValue,
      content: contentObject,
    });

    if (isDevMode) {
      console.log("Publish event with brand-new root:", videoRootId);
      console.log("Event content:", event.content);
    }

    try {
      const { signedEvent } = await this.signAndPublishEvent(event, {
        context: "video note",
        logName: "Video note",
        devLogLabel: "video note",
      });

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

        const mirrorEvent = buildVideoMirrorEvent({
          pubkey,
          created_at: createdAt,
          tags: mirrorTags,
          content: altText,
        });

        if (isDevMode) {
          console.log("Prepared NIP-94 mirror event:", mirrorEvent);
        }

        try {
          await this.signAndPublishEvent(mirrorEvent, {
            context: "NIP-94 mirror",
            logName: "NIP-94 mirror",
            devLogLabel: "NIP-94 mirror",
            rejectionLogLevel: "warn",
          });

          if (isDevMode) {
            console.log(
              "NIP-94 mirror dispatched for hosted URL:",
              finalUrl
            );
          }
        } catch (mirrorError) {
          if (isDevMode) {
            console.warn(
              "[nostr] NIP-94 mirror rejected by all relays:",
              mirrorError
            );
          }
        }
      } else if (isDevMode) {
        console.log("Skipping NIP-94 mirror: no hosted URL provided.");
      }
      const hasMetadataObject =
        nip71Metadata && typeof nip71Metadata === "object";
      const metadataWasEdited =
        nip71EditedFlag === true ||
        (nip71EditedFlag == null && hasMetadataObject);
      const shouldAttemptNip71 = !wantPrivate && metadataWasEdited;

      if (shouldAttemptNip71) {
        const metadataLegacyFormData = {
          title: contentObject.title,
          description: contentObject.description,
          url: contentObject.url,
          magnet: contentObject.magnet,
          thumbnail: contentObject.thumbnail,
          mode: contentObject.mode,
          isPrivate: contentObject.isPrivate,
        };

        if (contentObject.ws) {
          metadataLegacyFormData.ws = contentObject.ws;
        }

        if (contentObject.xs) {
          metadataLegacyFormData.xs = contentObject.xs;
        }

        try {
          await this.publishNip71Video(
            {
              nip71: nip71Metadata,
              legacyFormData: metadataLegacyFormData,
            },
            userPubkeyLower,
            {
              videoRootId: oldRootId,
              dTag: newD,
              eventId: signedEvent.id,
            }
          );
        } catch (nip71Error) {
          console.warn(
            "[nostr] Failed to publish NIP-71 metadata for edit:",
            nip71Error
          );
        }
      }

      return signedEvent;
    } catch (err) {
      if (isDevMode) console.error("Failed to sign/publish:", err);
      throw err;
    }
  }

  async publishNip71Video(videoPayload, pubkey, pointerOptions = {}) {
    if (!FEATURE_PUBLISH_NIP71) {
      return null;
    }

    if (!pubkey) {
      throw new Error("Not logged in to publish video.");
    }

    const { videoData, nip71Metadata } = extractVideoPublishPayload(videoPayload);

    if (!nip71Metadata || typeof nip71Metadata !== "object") {
      if (isDevMode) {
        console.log("[nostr] Skipping NIP-71 publish: metadata missing.");
      }
      return null;
    }

    const title = stringFromInput(videoData?.title);
    const description = stringFromInput(videoData?.description);

    const pointerIdentifiers =
      pointerOptions && typeof pointerOptions === "object"
        ? pointerOptions
        : {};

    const event = buildNip71VideoEvent({
      metadata: nip71Metadata,
      pubkey,
      title,
      summaryFallback: description,
      pointerIdentifiers: {
        videoRootId: pointerIdentifiers.videoRootId,
        dTag: pointerIdentifiers.dTag,
        eventId: pointerIdentifiers.eventId,
      },
      createdAt: Math.floor(Date.now() / 1000),
    });

    if (!event) {
      if (isDevMode) {
        console.warn("[nostr] Skipping NIP-71 publish: builder produced no event.");
      }
      return null;
    }

    if (isDevMode) {
      console.log("Prepared NIP-71 video event:", event);
    }

    const { signedEvent } = await this.signAndPublishEvent(event, {
      context: "NIP-71 video",
      logName: "NIP-71 video",
      devLogLabel: "NIP-71 video",
      rejectionLogLevel: "warn",
    });

    const pointerMap = new Map();
    if (pointerIdentifiers.videoRootId) {
      const pointerValue = buildVideoPointerValue(
        pubkey,
        pointerIdentifiers.videoRootId
      );
      if (pointerValue) {
        pointerMap.set(pointerValue, {
          videoRootId: pointerIdentifiers.videoRootId,
          pointerValue,
          videoEventIds: new Set(
            pointerIdentifiers.eventId ? [pointerIdentifiers.eventId] : []
          ),
          dTags: new Set(pointerIdentifiers.dTag ? [pointerIdentifiers.dTag] : []),
        });
      }
    }

    this.processNip71Events([signedEvent], pointerMap);

    return signedEvent;
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

    // NOTE: Keep the Upload, Edit, and Revert flows synchronized when
    // adjusting validation or persisted fields.
    // Convert the provided pubkey to lowercase
    const userPubkeyLower = userPubkey.toLowerCase();

    const nip71Metadata =
      updatedData && typeof updatedData === "object" ? updatedData.nip71 : null;
    const nip71EditedFlag =
      updatedData && typeof updatedData === "object"
        ? updatedData.nip71Edited
        : null;

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

    const oldMagnet =
      typeof baseEvent.rawMagnet === "string" && baseEvent.rawMagnet.trim()
        ? baseEvent.rawMagnet.trim()
        : typeof baseEvent.magnet === "string"
        ? baseEvent.magnet.trim()
        : "";
    const oldUrl = baseEvent.url || "";

    // Determine if the updated note should be private
    const wantPrivate = updatedData.isPrivate ?? baseEvent.isPrivate ?? false;

    // Use the new magnet if provided; otherwise, fall back to the decrypted old magnet
    const magnetEdited = updatedData.magnetEdited === true;
    const newMagnetValue =
      typeof updatedData.magnet === "string" ? updatedData.magnet.trim() : "";
    const finalMagnet = magnetEdited ? newMagnetValue : oldMagnet;

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

      const publishResults = await publishEventToRelays(
        this.pool,
        this.relays,
        signedEvent
      );

      let publishSummary;
      try {
        publishSummary = assertAnyRelayAccepted(publishResults, {
          context: "edited video note",
        });
      } catch (publishError) {
        if (publishError?.relayFailures?.length) {
          publishError.relayFailures.forEach(
            ({ url, error: relayError, reason }) => {
              console.error(
                `[nostr] Edited video rejected by ${url}: ${reason}`,
                relayError || reason
              );
            }
          );
        }
        throw publishError;
      }

      if (isDevMode) {
        publishSummary.accepted.forEach(({ url }) =>
          console.log(`Edited video published to ${url}`)
        );
      }

      if (publishSummary.failed.length) {
        publishSummary.failed.forEach(({ url, error: relayError }) => {
          const reason =
            relayError instanceof Error
              ? relayError.message
              : relayError
              ? String(relayError)
              : "publish failed";
          console.warn(
            `[nostr] Edited video not accepted by ${url}: ${reason}`,
            relayError
          );
        });
      }

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
    const publishResults = await publishEventToRelays(
      this.pool,
      this.relays,
      signedEvent
    );

    let publishSummary;
    try {
      publishSummary = assertAnyRelayAccepted(publishResults, {
        context: "video revert",
      });
    } catch (publishError) {
      if (publishError?.relayFailures?.length) {
        publishError.relayFailures.forEach(
          ({ url, error: relayError, reason }) => {
            console.error(
              `[nostr] Video revert rejected by ${url}: ${reason}`,
              relayError || reason
            );
          }
        );
      }
      throw publishError;
    }

    if (isDevMode) {
      publishSummary.accepted.forEach(({ url }) =>
        console.log(`Revert event published to ${url}`)
      );
    }

    if (publishSummary.failed.length) {
      publishSummary.failed.forEach(({ url, error: relayError }) => {
        const reason =
          relayError instanceof Error
            ? relayError.message
            : relayError
            ? String(relayError)
            : "publish failed";
        console.warn(
          `[nostr] Video revert not accepted by ${url}: ${reason}`,
          relayError
        );
      });
    }

    return signedEvent;
  }

  /**
   * "Deleting" => Mark all content with the same videoRootId as {deleted:true}
   * and blank out magnet/desc.
   *
   * This version now asks for confirmation before proceeding.
   */
  async deleteAllVersions(videoRootId, pubkey, options = {}) {
    if (!pubkey) {
      throw new Error("Not logged in to delete all versions.");
    }

    const shouldConfirm = options?.confirm !== false;
    let confirmed = true;

    if (shouldConfirm && typeof window?.confirm === "function") {
      confirmed = window.confirm(
        "Are you sure you want to delete all versions of this video? This action cannot be undone."
      );
    }

    if (!confirmed) {
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

            this.mergeNip71MetadataIntoVideo(video);

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
              this.populateNip71MetadataForVideos([video]).catch((error) => {
                if (isDevMode) {
                  console.warn(
                    "[nostr] Failed to hydrate NIP-71 metadata for live video:",
                    error
                  );
                }
              });
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

  collectNip71PointerRequests(videos = []) {
    const pointerMap = new Map();
    if (!Array.isArray(videos)) {
      return pointerMap;
    }

    videos.forEach((video) => {
      if (!video || typeof video !== "object") {
        return;
      }

      const rootId = typeof video.videoRootId === "string" ? video.videoRootId : "";
      const pubkey =
        typeof video.pubkey === "string" ? video.pubkey.toLowerCase() : "";
      if (!rootId || !pubkey) {
        return;
      }

      const pointerValue = buildVideoPointerValue(pubkey, rootId);
      if (!pointerValue) {
        return;
      }

      let info = pointerMap.get(pointerValue);
      if (!info) {
        info = {
          videoRootId: rootId,
          pointerValue,
          videoEventIds: new Set(),
          dTags: new Set(),
        };
        pointerMap.set(pointerValue, info);
      }

      if (typeof video.id === "string" && video.id) {
        info.videoEventIds.add(video.id);
      }

      const dTag = getDTagValueFromTags(video.tags);
      if (dTag) {
        info.dTags.add(dTag);
      }
    });

    return pointerMap;
  }

  ensureNip71CacheEntry(videoRootId) {
    const rootId = typeof videoRootId === "string" ? videoRootId : "";
    if (!rootId) {
      return null;
    }

    let entry = this.nip71Cache.get(rootId);
    if (!entry) {
      entry = {
        byVideoEventId: new Map(),
        byDTag: new Map(),
        fallback: null,
        fetchedPointers: new Set(),
      };
      this.nip71Cache.set(rootId, entry);
    }
    return entry;
  }

  storeNip71RecordForRoot(videoRootId, parsedRecord) {
    const entry = this.ensureNip71CacheEntry(videoRootId);
    if (!entry || !parsedRecord || !parsedRecord.metadata) {
      return;
    }

    const storedRecord = {
      metadata: cloneNip71Metadata(parsedRecord.metadata),
      nip71EventId: parsedRecord.source?.id || "",
      created_at: parsedRecord.source?.created_at || 0,
      pointerValues: new Set(parsedRecord.pointers?.pointerValues || []),
      videoEventIds: new Set(parsedRecord.pointers?.videoEventIds || []),
      dTags: new Set(parsedRecord.pointers?.dTags || []),
    };

    if (!storedRecord.metadata) {
      return;
    }

    storedRecord.pointerValues.forEach((pointerValue) => {
      if (pointerValue) {
        entry.fetchedPointers.add(pointerValue);
      }
    });

    storedRecord.videoEventIds.forEach((eventId) => {
      if (eventId) {
        entry.byVideoEventId.set(eventId, storedRecord);
      }
    });

    storedRecord.dTags.forEach((dTag) => {
      if (dTag) {
        entry.byDTag.set(dTag, storedRecord);
      }
    });

    if (
      !entry.fallback ||
      (storedRecord.created_at || 0) >= (entry.fallback.created_at || 0)
    ) {
      entry.fallback = storedRecord;
    }
  }

  processNip71Events(events, pointerMap = null) {
    if (!Array.isArray(events) || !events.length) {
      return;
    }

    events.forEach((event) => {
      const parsed = extractNip71MetadataFromTags(event);
      if (!parsed || !parsed.metadata) {
        return;
      }

      const rootIds = new Set(parsed.pointers?.videoRootIds || []);
      if (!rootIds.size && pointerMap instanceof Map) {
        parsed.pointers?.pointerValues?.forEach?.((pointerValue) => {
          const info = pointerMap.get(pointerValue);
          if (info?.videoRootId) {
            rootIds.add(info.videoRootId);
          }
        });
      }

      if (!rootIds.size) {
        return;
      }

      rootIds.forEach((rootId) => {
        this.storeNip71RecordForRoot(rootId, parsed);
      });
    });
  }

  mergeNip71MetadataIntoVideo(video) {
    if (!video || typeof video !== "object") {
      return video;
    }

    const rootId = typeof video.videoRootId === "string" ? video.videoRootId : "";
    if (!rootId) {
      return video;
    }

    const cacheEntry = this.nip71Cache.get(rootId);
    if (!cacheEntry) {
      return video;
    }

    let record = null;
    const eventId = typeof video.id === "string" ? video.id : "";
    if (eventId && cacheEntry.byVideoEventId.has(eventId)) {
      record = cacheEntry.byVideoEventId.get(eventId);
    }

    if (!record) {
      const dTag = getDTagValueFromTags(video.tags);
      if (dTag && cacheEntry.byDTag.has(dTag)) {
        record = cacheEntry.byDTag.get(dTag);
      }
    }

    if (!record && cacheEntry.fallback) {
      record = cacheEntry.fallback;
    }

    if (!record?.metadata) {
      if (video.nip71) {
        delete video.nip71;
      }
      if (video.nip71Source) {
        delete video.nip71Source;
      }
      return video;
    }

    const cloned = cloneNip71Metadata(record.metadata);
    if (cloned) {
      video.nip71 = cloned;
      video.nip71Source = {
        eventId: record.nip71EventId || "",
        created_at: record.created_at || 0,
      };
    }

    return video;
  }

  async fetchAndCacheNip71Metadata(pointerMap, pointerValues) {
    if (!Array.isArray(pointerValues) || !pointerValues.length) {
      return;
    }

    if (!this.pool || !Array.isArray(this.relays) || !this.relays.length) {
      pointerValues.forEach((pointerValue) => {
        const info = pointerMap.get(pointerValue);
        if (!info) {
          return;
        }
        const entry = this.ensureNip71CacheEntry(info.videoRootId);
        if (entry) {
          entry.fetchedPointers.add(pointerValue);
        }
      });
      return;
    }

    const filter = {
      kinds: [21, 22],
      "#a": pointerValues,
    };

    try {
      const responses = await Promise.all(
        this.relays.map(async (url) => {
          try {
            const events = await this.pool.list([url], [filter]);
            return Array.isArray(events) ? events : [];
          } catch (error) {
            if (isDevMode) {
              console.warn(`[nostr] NIP-71 fetch failed on ${url}:`, error);
            }
            return [];
          }
        })
      );

      const deduped = new Map();
      responses.flat().forEach((event) => {
        if (event?.id && !deduped.has(event.id)) {
          deduped.set(event.id, event);
        }
      });

      this.processNip71Events(Array.from(deduped.values()), pointerMap);
    } catch (error) {
      if (isDevMode) {
        console.warn("[nostr] Failed to fetch NIP-71 metadata:", error);
      }
    } finally {
      pointerValues.forEach((pointerValue) => {
        const info = pointerMap.get(pointerValue);
        if (!info) {
          return;
        }
        const entry = this.ensureNip71CacheEntry(info.videoRootId);
        if (entry) {
          entry.fetchedPointers.add(pointerValue);
        }
      });
    }
  }

  async populateNip71MetadataForVideos(videos = []) {
    if (!Array.isArray(videos) || !videos.length) {
      return;
    }

    const pointerMap = this.collectNip71PointerRequests(videos);
    const pointersToFetch = [];

    pointerMap.forEach((info, pointerValue) => {
      const entry = this.ensureNip71CacheEntry(info.videoRootId);
      if (!entry) {
        return;
      }

      let needsFetch = false;

      info.videoEventIds.forEach((eventId) => {
        if (eventId && !entry.byVideoEventId.has(eventId)) {
          needsFetch = true;
        }
      });

      if (!needsFetch) {
        info.dTags.forEach((dTag) => {
          if (dTag && !entry.byDTag.has(dTag)) {
            needsFetch = true;
          }
        });
      }

      if (!needsFetch && !entry.fallback) {
        needsFetch = true;
      }

      if (needsFetch && !entry.fetchedPointers.has(pointerValue)) {
        pointersToFetch.push(pointerValue);
      } else {
        entry.fetchedPointers.add(pointerValue);
      }
    });

    if (pointersToFetch.length) {
      await this.fetchAndCacheNip71Metadata(pointerMap, pointersToFetch);
    }

    videos.forEach((video) => {
      this.mergeNip71MetadataIntoVideo(video);
    });
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
      await this.populateNip71MetadataForVideos(activeVideos);
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

    if (this.countUnsupportedRelays.has(normalizedUrl)) {
      throw this.makeCountUnsupportedError(normalizedUrl);
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
      this.countUnsupportedRelays.add(normalizedUrl);
      throw this.makeCountUnsupportedError(normalizedUrl);
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
      return { total: 0, best: null, perRelay: [] };
    }

    const relayList =
      Array.isArray(options.relays) && options.relays.length
        ? options.relays
        : Array.isArray(this.relays) && this.relays.length
        ? this.relays
        : RELAY_URLS;

    const normalizedRelayList = relayList
      .map((url) => (typeof url === "string" ? url.trim() : ""))
      .filter(Boolean);

    const activeRelays = [];
    const precomputedEntries = [];

    for (const url of normalizedRelayList) {
      if (this.countUnsupportedRelays.has(url)) {
        const error = this.makeCountUnsupportedError(url);
        precomputedEntries.push({
          url,
          ok: false,
          error,
          unsupported: true,
        });
        continue;
      }
      activeRelays.push(url);
    }

    const activeResults = await Promise.all(
      activeRelays.map(async (url) => {
        try {
          const frame = await this.sendRawCountFrame(url, normalizedFilters, {
            timeoutMs: options.timeoutMs,
          });
          const count = this.extractCountValue(frame?.[2]);
          return { url, ok: true, frame, count };
        } catch (error) {
          const isUnsupported = error?.code === "count-unsupported";
          if (isUnsupported) {
            this.countUnsupportedRelays.add(url);
          } else if (isDevMode) {
            console.warn(`[nostr] COUNT request failed on ${url}:`, error);
          }
          return { url, ok: false, error, unsupported: isUnsupported };
        }
      })
    );

    const resultsByUrl = new Map();
    for (const entry of [...precomputedEntries, ...activeResults]) {
      if (entry && typeof entry.url === "string") {
        resultsByUrl.set(entry.url, entry);
      }
    }

    const perRelayResults = normalizedRelayList.map((url) => {
      if (resultsByUrl.has(url)) {
        return resultsByUrl.get(url);
      }
      return { url, ok: false };
    });

    let bestEstimate = null;
    const perRelay = perRelayResults.map((entry) => {
      if (!entry || !entry.ok) {
        return entry;
      }

      const numericValue = Number(entry.count);
      const normalizedCount =
        Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : 0;

      const normalizedEntry = {
        ...entry,
        count: normalizedCount,
      };

      if (!Number.isFinite(numericValue) || numericValue < 0) {
        normalizedEntry.rawCount = entry.count;
      }

      if (
        !bestEstimate ||
        normalizedCount > bestEstimate.count ||
        (bestEstimate && normalizedCount === bestEstimate.count && !bestEstimate.frame)
      ) {
        bestEstimate = {
          relay: normalizedEntry.url,
          count: normalizedCount,
          frame: normalizedEntry.frame,
        };
      }

      return normalizedEntry;
    });

    const total = bestEstimate ? bestEstimate.count : 0;

    return {
      total,
      best: bestEstimate,
      perRelay,
    };
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

    const targetDTag = getDTagValueFromTags(video.tags);

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
        const candidateDTag = getDTagValueFromTags(candidate.tags);

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

    localMatches.sort((a, b) => b.created_at - a.created_at);
    await this.populateNip71MetadataForVideos(localMatches);
    return localMatches;
  }

  getActiveVideos() {
    return Array.from(this.activeMap.values()).sort(
      (a, b) => b.created_at - a.created_at
    );
  }
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

function parseWatchHistoryContentWithFallback(
  content,
  fallbackItems,
  fallbackPayload
) {
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

function isNip04EncryptedWatchHistoryEvent(pointerEvent, ciphertext) {
  if (!pointerEvent || typeof pointerEvent !== "object") {
    return false;
  }

  const tags = Array.isArray(pointerEvent.tags) ? pointerEvent.tags : [];
  const normalizedCiphertext =
    typeof ciphertext === "string" ? ciphertext.trim() : "";

  if (!normalizedCiphertext) {
    return false;
  }

  const hasEncryptionTag = tags.some((tag) => {
    if (!Array.isArray(tag) || tag.length < 2) {
      return false;
    }
    const label =
      typeof tag[0] === "string" ? tag[0].trim().toLowerCase() : "";
    if (label !== "encrypted") {
      return false;
    }
    const value =
      typeof tag[1] === "string" ? tag[1].trim().toLowerCase() : "";
    return value === "nip04" || value === "nip-04";
  });

  if (hasEncryptionTag) {
    return !looksLikeJsonStructure(normalizedCiphertext);
  }

  if (looksLikeJsonStructure(normalizedCiphertext)) {
    return false;
  }

  const ivIndex = normalizedCiphertext.indexOf("?iv=");
  const baseSegment =
    ivIndex >= 0
      ? normalizedCiphertext.slice(0, ivIndex)
      : normalizedCiphertext;
  const ivSegment =
    ivIndex >= 0 ? normalizedCiphertext.slice(ivIndex + 4) : "";

  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!baseSegment || !base64Regex.test(baseSegment)) {
    return false;
  }

  if (ivSegment && !base64Regex.test(ivSegment)) {
    return false;
  }

  return true;
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

export { normalizePointerInput, pointerKey, chunkWatchHistoryPayloadItems, normalizeActorKey };
