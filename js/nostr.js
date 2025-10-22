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
  ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS,
} from "./config.js";
import {
  ACCEPT_LEGACY_V1,
  FEATURE_PUBLISH_NIP71,
  VIEW_FILTER_INCLUDE_LEGACY_VIDEO,
} from "./constants.js";
import { accessControl } from "./accessControl.js";
import {
  registerNostrClient,
  requestDefaultExtensionPermissions as requestRegisteredPermissions,
} from "./nostrClientRegistry.js";
// 🔧 merged conflicting changes from codex/update-video-publishing-and-parsing-logic vs unstable
import { deriveTitleFromEvent, magnetFromText } from "./videoEventUtils.js";
import { extractMagnetHints } from "./magnet.js";
import {
  buildVideoPostEvent,
  buildVideoMirrorEvent,
  buildRepostEvent,
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
  summarizePublishResults,
} from "./nostrPublish.js";
import { nostrToolsReady } from "./nostrToolsBootstrap.js";
import { devLogger, userLogger } from "./utils/logger.js";

/**
 * The default relay set bitvid bootstraps with before loading a user's
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

let activeSigner = null;

const EVENTS_CACHE_STORAGE_KEY = "bitvid:eventsCache:v1";
const LEGACY_EVENTS_STORAGE_KEY = "bitvidEvents";
const EVENTS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const NIP07_LOGIN_TIMEOUT_MS = 60_000; // 60 seconds
const NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE =
  "Timed out waiting for the NIP-07 extension. Confirm the extension prompt in your browser toolbar and try again.";
const NIP07_PERMISSIONS_STORAGE_KEY = "bitvid:nip07:permissions";

// Give the NIP-07 extension enough time to surface its approval prompt and let
// users unlock/authorize it. Seven seconds proved too aggressive once vendors
// started requiring an unlock step, so we extend the window substantially while
// still allowing manual overrides via __BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__.
const DEFAULT_ENABLE_VARIANT_TIMEOUT_MS = 45_000;

function getEnableVariantTimeoutMs() {
  const overrideValue =
    typeof globalThis !== "undefined" &&
    globalThis !== null &&
    Number.isFinite(globalThis.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__)
      ? Math.floor(globalThis.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__)
      : null;

  if (overrideValue !== null && overrideValue > 0) {
    return Math.max(50, overrideValue);
  }

  return DEFAULT_ENABLE_VARIANT_TIMEOUT_MS;
}

function normalizePermissionMethod(method) {
  return typeof method === "string" && method.trim() ? method.trim() : "";
}

function getNip07PermissionStorage() {
  const scope =
    typeof globalThis !== "undefined" && globalThis ? globalThis : undefined;
  const browserWindow =
    typeof window !== "undefined" && window ? window : undefined;

  if (browserWindow?.localStorage) {
    return browserWindow.localStorage;
  }

  if (scope?.localStorage) {
    return scope.localStorage;
  }

  return null;
}

function readStoredNip07Permissions() {
  const storage = getNip07PermissionStorage();
  if (!storage) {
    return new Set();
  }

  let rawValue = null;
  try {
    rawValue = storage.getItem(NIP07_PERMISSIONS_STORAGE_KEY);
  } catch (error) {
    return new Set();
  }

  if (!rawValue) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(rawValue);
    const storedMethods = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.grantedMethods)
        ? parsed.grantedMethods
        : Array.isArray(parsed?.methods)
          ? parsed.methods
          : [];
    return new Set(
      storedMethods
        .map((method) => normalizePermissionMethod(method))
        .filter(Boolean),
    );
  } catch (error) {
    clearStoredNip07Permissions();
    return new Set();
  }
}

function writeStoredNip07Permissions(methods) {
  const storage = getNip07PermissionStorage();
  if (!storage) {
    return;
  }

  const normalized = Array.from(
    new Set(
      Array.from(methods || [])
        .map((method) => normalizePermissionMethod(method))
        .filter(Boolean),
    ),
  );

  try {
    if (!normalized.length) {
      storage.removeItem(NIP07_PERMISSIONS_STORAGE_KEY);
      return;
    }

    storage.setItem(
      NIP07_PERMISSIONS_STORAGE_KEY,
      JSON.stringify({ grantedMethods: normalized }),
    );
  } catch (error) {
    // ignore persistence failures
  }
}

function clearStoredNip07Permissions() {
  const storage = getNip07PermissionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(NIP07_PERMISSIONS_STORAGE_KEY);
  } catch (error) {
    // ignore cleanup issues
  }
}
const NIP46_RPC_KIND = 24_133;
const NIP46_SESSION_STORAGE_KEY = "bitvid:nip46:session:v1";
const NIP46_PUBLISH_TIMEOUT_MS = 8_000;
const NIP46_RESPONSE_TIMEOUT_MS = 15_000;
const NIP46_SIGN_EVENT_TIMEOUT_MS = 20_000;
const NIP46_MAX_RETRIES = 1;
const NIP46_HANDSHAKE_TIMEOUT_MS = 60_000;
const NIP46_AUTH_CHALLENGE_MAX_ATTEMPTS = 5;

function getNip46Storage() {
  if (typeof localStorage !== "undefined" && localStorage) {
    return localStorage;
  }

  if (typeof globalThis !== "undefined" && globalThis?.localStorage) {
    return globalThis.localStorage;
  }

  return null;
}

function sanitizeStoredNip46Session(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const version = Number(candidate.version) || 0;
  if (version !== 1) {
    return null;
  }

  const clientPrivateKey =
    typeof candidate.clientPrivateKey === "string" && HEX64_REGEX.test(candidate.clientPrivateKey)
      ? candidate.clientPrivateKey.toLowerCase()
      : "";
  const clientPublicKey =
    typeof candidate.clientPublicKey === "string" && candidate.clientPublicKey.trim()
      ? candidate.clientPublicKey.trim().toLowerCase()
      : "";
  const remotePubkey =
    typeof candidate.remotePubkey === "string" && candidate.remotePubkey.trim()
      ? candidate.remotePubkey.trim().toLowerCase()
      : "";

  if (!clientPrivateKey || !remotePubkey) {
    return null;
  }

  const relays = Array.isArray(candidate.relays)
    ? candidate.relays
        .map((relay) => (typeof relay === "string" ? relay.trim() : ""))
        .filter(Boolean)
    : [];

  const metadata =
    candidate.metadata && typeof candidate.metadata === "object"
      ? {
          name:
            typeof candidate.metadata.name === "string"
              ? candidate.metadata.name.trim()
              : "",
          url:
            typeof candidate.metadata.url === "string"
              ? candidate.metadata.url.trim()
              : "",
          image:
            typeof candidate.metadata.image === "string"
              ? candidate.metadata.image.trim()
              : "",
        }
      : {};

  return {
    version: 1,
    clientPrivateKey,
    clientPublicKey,
    remotePubkey,
    relays,
    secret:
      typeof candidate.secret === "string" && candidate.secret.trim()
        ? candidate.secret.trim()
        : "",
    permissions:
      typeof candidate.permissions === "string" && candidate.permissions.trim()
        ? candidate.permissions.trim()
        : "",
    metadata,
    userPubkey:
      typeof candidate.userPubkey === "string" && candidate.userPubkey.trim()
        ? candidate.userPubkey.trim().toLowerCase()
        : "",
    lastConnectedAt: Number.isFinite(candidate.lastConnectedAt)
      ? candidate.lastConnectedAt
      : Date.now(),
  };
}

function readStoredNip46Session() {
  const storage = getNip46Storage();
  if (!storage) {
    return null;
  }

  let raw = null;
  try {
    raw = storage.getItem(NIP46_SESSION_STORAGE_KEY);
  } catch (error) {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return sanitizeStoredNip46Session(parsed);
  } catch (error) {
    try {
      storage.removeItem(NIP46_SESSION_STORAGE_KEY);
    } catch (cleanupError) {
      devLogger.warn(
        "[nostr] Failed to clear corrupt NIP-46 session entry:",
        cleanupError,
      );
    }
    return null;
  }
}

function writeStoredNip46Session(payload) {
  const storage = getNip46Storage();
  if (!storage) {
    return;
  }

  const normalized = sanitizeStoredNip46Session(payload);
  if (!normalized) {
    try {
      storage.removeItem(NIP46_SESSION_STORAGE_KEY);
    } catch (error) {
      // ignore cleanup failures
    }
    return;
  }

  try {
    storage.setItem(NIP46_SESSION_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // ignore persistence failures
  }
}

function clearStoredNip46Session() {
  const storage = getNip46Storage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(NIP46_SESSION_STORAGE_KEY);
  } catch (error) {
    // ignore cleanup issues
  }
}
const SESSION_ACTOR_STORAGE_KEY = "bitvid:sessionActor:v1";
const SESSION_ACTOR_ENCRYPTION_VERSION = 1;
const SESSION_ACTOR_KDF_ITERATIONS = 250_000;
const SESSION_ACTOR_KDF_HASH = "SHA-256";
const SESSION_ACTOR_ENCRYPTION_ALGORITHM = "AES-GCM";
const SESSION_ACTOR_SALT_BYTES = 16;
const SESSION_ACTOR_IV_BYTES = 12;
const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const VIEW_EVENT_GUARD_PREFIX = "bitvid:viewed";
const REBROADCAST_GUARD_PREFIX = "bitvid:rebroadcast:v1";

const WATCH_HISTORY_STORAGE_KEY = "bitvid:watch-history:v2";
const WATCH_HISTORY_STORAGE_VERSION = 2;
const WATCH_HISTORY_REPUBLISH_BASE_DELAY_MS = 2000;
const WATCH_HISTORY_REPUBLISH_MAX_DELAY_MS = 5 * 60 * 1000;
const WATCH_HISTORY_REPUBLISH_MAX_ATTEMPTS = 8;
const WATCH_HISTORY_REPUBLISH_JITTER = 0.25;

export const DEFAULT_NIP07_ENCRYPTION_METHODS = Object.freeze([
  // Encryption helpers — request both legacy NIP-04 and modern NIP-44 upfront
  "nip04.encrypt",
  "nip04.decrypt",
  "nip44.encrypt",
  "nip44.decrypt",
  "nip44.v2.encrypt",
  "nip44.v2.decrypt",
]);

export const DEFAULT_NIP07_PERMISSION_METHODS = Object.freeze([
  // Core auth + relay metadata
  "get_public_key",
  "sign_event",
  "read_relays",
  "write_relays",
  ...DEFAULT_NIP07_ENCRYPTION_METHODS,
]);

const viewEventPublishMemory = new Map();
const rebroadcastAttemptMemory = new Map();

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
  userLogger.warn(
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
    devLogger.warn("[nostr] Failed to resolve nostr-tools helpers.", error);
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
    devLogger.warn(
      "[nostr] Failed to load view counter ingest helper:",
      error
    );
  }
  return null;
}

// To limit error spam
let errorLogCount = 0;
const MAX_ERROR_LOGS = 100;
function logErrorOnce(message, eventContent = null) {
  if (errorLogCount < MAX_ERROR_LOGS) {
    userLogger.error(message);
    if (eventContent) {
      devLogger.log(`Event Content: ${eventContent}`);
    }
    errorLogCount++;
  }
  if (errorLogCount === MAX_ERROR_LOGS) {
    userLogger.error(
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
  let hasStarted = false;
  let cachedPromise = null;

  const getOrStartOperation = () => {
    if (!hasStarted) {
      hasStarted = true;
      try {
        cachedPromise = Promise.resolve(operation());
      } catch (error) {
        hasStarted = false;
        cachedPromise = null;
        throw error;
      }
    }

    return cachedPromise;
  };

  try {
    return await withNip07Timeout(getOrStartOperation, {
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

    devLogger.warn(
    `[nostr] ${label} taking longer than ${timeoutMs}ms. Waiting up to ${extendedTimeout}ms for extension response.`,
    );

    return withNip07Timeout(getOrStartOperation, {
      timeoutMs: extendedTimeout,
      message: NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
    });
  }
}

export const __testExports = {
  runNip07WithRetry,
  DEFAULT_NIP07_ENCRYPTION_METHODS,
};

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
          devLogger.warn("[nostr] COUNT timeout cleanup failed:", cleanupError);
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

export function buildNip71MetadataTags(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const tags = [];

  const normalizedTitle = stringFromInput(metadata.title);
  if (normalizedTitle) {
    tags.push(["title", normalizedTitle]);
  }

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

  return tags;
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

  const normalizedVideoData = { ...videoData };
  const isNsfw = videoData.isNsfw === true;
  normalizedVideoData.isNsfw = isNsfw;
  normalizedVideoData.isForKids =
    videoData.isForKids === true && !isNsfw;

  return { videoData: normalizedVideoData, nip71Metadata };
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

  const tags = buildNip71MetadataTags({
    ...metadata,
    title: normalizedTitle,
  });

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
    devLogger.warn("[nostr] Failed to clone NIP-71 metadata", error);
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

function cloneVideoMetadata(video) {
  if (!video || typeof video !== "object") {
    return null;
  }

  const createdAt = Number.isFinite(video.created_at)
    ? Math.floor(video.created_at)
    : null;

  return {
    id: typeof video.id === "string" ? video.id : "",
    title: typeof video.title === "string" ? video.title : "",
    thumbnail: typeof video.thumbnail === "string" ? video.thumbnail : "",
    pubkey: typeof video.pubkey === "string" ? video.pubkey : "",
    created_at: createdAt,
    url: typeof video.url === "string" ? video.url : "",
    magnet: typeof video.magnet === "string" ? video.magnet : "",
    infoHash: typeof video.infoHash === "string" ? video.infoHash : "",
    legacyInfoHash:
      typeof video.legacyInfoHash === "string" ? video.legacyInfoHash : "",
  };
}

function cloneProfileMetadata(profile) {
  if (!profile || typeof profile !== "object") {
    return null;
  }

  return {
    pubkey: typeof profile.pubkey === "string" ? profile.pubkey : "",
    name: typeof profile.name === "string" ? profile.name : "",
    display_name:
      typeof profile.display_name === "string" ? profile.display_name : "",
    picture: typeof profile.picture === "string" ? profile.picture : "",
    nip05: typeof profile.nip05 === "string" ? profile.nip05 : "",
  };
}

function clonePointerMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const cloned = {};
  const video = cloneVideoMetadata(metadata.video);
  if (video) {
    cloned.video = video;
  }

  const profile = cloneProfileMetadata(metadata.profile);
  if (profile) {
    cloned.profile = profile;
  }

  if (Number.isFinite(metadata.resumeAt)) {
    cloned.resumeAt = Math.max(0, Math.floor(metadata.resumeAt));
  }

  if (metadata.completed === true) {
    cloned.completed = true;
  }

  if (Number.isFinite(metadata.watchedAt)) {
    cloned.watchedAt = Math.max(0, Math.floor(metadata.watchedAt));
  }

  return Object.keys(cloned).length ? cloned : null;
}

function mergePointerDetails(target, source) {
  if (!target || !source) {
    return;
  }

  if (!target.metadata && source.metadata) {
    target.metadata = clonePointerMetadata(source.metadata);
  } else if (target.metadata && source.metadata) {
    const merged = clonePointerMetadata(target.metadata) || {};
    const additional = clonePointerMetadata(source.metadata) || {};
    if (!merged.video && additional.video) {
      merged.video = additional.video;
    }
    if (!merged.profile && additional.profile) {
      merged.profile = additional.profile;
    }
    if (!Number.isFinite(merged.resumeAt) && Number.isFinite(additional.resumeAt)) {
      merged.resumeAt = additional.resumeAt;
    }
    if (additional.completed === true) {
      merged.completed = true;
    }
    if (!Number.isFinite(merged.watchedAt) && Number.isFinite(additional.watchedAt)) {
      merged.watchedAt = additional.watchedAt;
    }
    target.metadata = Object.keys(merged).length ? merged : undefined;
  }

  if (!target.video && source.video) {
    target.video = cloneVideoMetadata(source.video);
  }

  if (!target.profile && source.profile) {
    target.profile = cloneProfileMetadata(source.profile);
  }

  if (!Number.isFinite(target.resumeAt) && Number.isFinite(source.resumeAt)) {
    target.resumeAt = Math.max(0, Math.floor(source.resumeAt));
  }

  if (source.completed === true) {
    target.completed = true;
  }
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

  if (Number.isFinite(pointer.resumeAt)) {
    cloned.resumeAt = Math.max(0, Math.floor(pointer.resumeAt));
  } else if (Number.isFinite(metadata?.resumeAt)) {
    cloned.resumeAt = metadata.resumeAt;
  }

  if (pointer.completed === true || metadata?.completed === true) {
    cloned.completed = true;
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
      devLogger.warn(`[nostr] Failed to decode pointer ${trimmed}:`, err);
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
      devLogger.warn("[nostr] Failed to gather crypto entropy for view event:", error);
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
    devLogger.warn("[nostr] Failed to read view guard entry:", error);
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
      devLogger.warn("[nostr] Failed to clear corrupt view guard entry:", error);
    }
    return false;
  }

  if (now - storedSeenAt >= windowMs) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      devLogger.warn("[nostr] Failed to remove expired view guard entry:", error);
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
    devLogger.warn("[nostr] Failed to persist view guard entry:", error);
  }
}

function deriveRebroadcastBucketIndex(referenceSeconds = null) {
  const windowSeconds = Math.max(
    1,
    Number(ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS) || 0
  );
  const baseSeconds = Number.isFinite(referenceSeconds)
    ? Math.max(0, Math.floor(referenceSeconds))
    : Math.floor(Date.now() / 1000);
  return Math.floor(baseSeconds / windowSeconds);
}

function getRebroadcastCooldownWindowMs() {
  const windowSeconds = Math.max(
    1,
    Number(ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS) || 0
  );
  return windowSeconds * 1000;
}

function deriveRebroadcastScope(pubkey, eventId) {
  const normalizedPubkey =
    typeof pubkey === "string" && pubkey.trim()
      ? pubkey.trim().toLowerCase()
      : "";
  const normalizedEventId =
    typeof eventId === "string" && eventId.trim()
      ? eventId.trim().toLowerCase()
      : "";
  if (!normalizedPubkey || !normalizedEventId) {
    return "";
  }
  return `${normalizedPubkey}:${normalizedEventId}`;
}

function readRebroadcastGuardEntry(scope) {
  if (!scope) {
    return null;
  }

  const windowMs = getRebroadcastCooldownWindowMs();
  const now = Date.now();
  const entry = rebroadcastAttemptMemory.get(scope);

  if (entry) {
    const age = now - Number(entry.seenAt);
    if (!Number.isFinite(entry.seenAt) || age >= windowMs) {
      rebroadcastAttemptMemory.delete(scope);
    } else {
      return entry;
    }
  }

  if (typeof localStorage === "undefined") {
    return null;
  }

  const storageKey = `${REBROADCAST_GUARD_PREFIX}:${scope}`;
  let rawValue = null;
  try {
    rawValue = localStorage.getItem(storageKey);
  } catch (error) {
    devLogger.warn("[nostr] Failed to read rebroadcast guard entry:", error);
    return null;
  }

  if (typeof rawValue !== "string" || !rawValue) {
    return null;
  }

  const [storedBucketRaw, storedSeenRaw] = rawValue.split(":", 2);
  const storedBucket = Number(storedBucketRaw);
  const storedSeenAt = Number(storedSeenRaw);

  if (!Number.isFinite(storedBucket) || !Number.isFinite(storedSeenAt)) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      devLogger.warn("[nostr] Failed to clear corrupt rebroadcast guard entry:", error);
    }
    return null;
  }

  if (now - storedSeenAt >= windowMs) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      devLogger.warn("[nostr] Failed to remove expired rebroadcast guard entry:", error);
    }
    return null;
  }

  const normalizedEntry = {
    bucket: storedBucket,
    seenAt: storedSeenAt,
  };
  rebroadcastAttemptMemory.set(scope, normalizedEntry);
  return normalizedEntry;
}

function hasRecentRebroadcastAttempt(scope, bucketIndex) {
  if (!scope || !Number.isFinite(bucketIndex)) {
    return false;
  }

  const entry = readRebroadcastGuardEntry(scope);
  return entry ? Number(entry.bucket) === bucketIndex : false;
}

function rememberRebroadcastAttempt(scope, bucketIndex) {
  if (!scope || !Number.isFinite(bucketIndex)) {
    return;
  }

  const now = Date.now();
  const windowMs = getRebroadcastCooldownWindowMs();
  const entry = rebroadcastAttemptMemory.get(scope);
  if (entry && Number.isFinite(entry.seenAt) && now - entry.seenAt >= windowMs) {
    rebroadcastAttemptMemory.delete(scope);
  }

  const normalizedEntry = { bucket: bucketIndex, seenAt: now };
  rebroadcastAttemptMemory.set(scope, normalizedEntry);

  if (typeof localStorage === "undefined") {
    return;
  }

  const storageKey = `${REBROADCAST_GUARD_PREFIX}:${scope}`;
  try {
    localStorage.setItem(storageKey, `${bucketIndex}:${now}`);
  } catch (error) {
    devLogger.warn("[nostr] Failed to persist rebroadcast guard entry:", error);
  }
}

function getRebroadcastCooldownState(scope) {
  if (!scope) {
    return null;
  }
  const entry = readRebroadcastGuardEntry(scope);
  if (!entry || !Number.isFinite(entry.seenAt)) {
    return null;
  }
  const windowMs = getRebroadcastCooldownWindowMs();
  const expiresAt = entry.seenAt + windowMs;
  const remainingMs = Math.max(0, expiresAt - Date.now());
  if (remainingMs <= 0) {
    return null;
  }
  return {
    scope,
    seenAt: entry.seenAt,
    bucket: entry.bucket,
    expiresAt,
    remainingMs,
  };
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
  if (!trimmed) {
    return "";
  }

  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const decodedHex = decodeNpubToHex(trimmed);
  if (decodedHex) {
    return decodedHex.toLowerCase();
  }

  return trimmed.toLowerCase();
}

export function getActiveSigner() {
  return activeSigner;
}

export function clearActiveSigner() {
  activeSigner = null;
  return activeSigner;
}

export function setActiveSigner(candidate = null) {
  if (!candidate || typeof candidate !== "object") {
    activeSigner = null;
    return activeSigner;
  }

  const pubkeyInput =
    typeof candidate.pubkey === "string"
      ? candidate.pubkey
      : typeof candidate.pubKey === "string"
        ? candidate.pubKey
        : "";
  const normalizedPubkey = normalizeActorKey(pubkeyInput);

  let signEvent = null;
  if (typeof candidate.signEvent === "function") {
    signEvent = candidate.signEvent;
  }

  let nip04Encrypt = null;
  if (typeof candidate.nip04Encrypt === "function") {
    nip04Encrypt = candidate.nip04Encrypt;
  } else if (candidate.nip04 && typeof candidate.nip04.encrypt === "function") {
    nip04Encrypt = candidate.nip04.encrypt.bind(candidate.nip04);
  }

  let nip04Decrypt = null;
  if (typeof candidate.nip04Decrypt === "function") {
    nip04Decrypt = candidate.nip04Decrypt;
  } else if (candidate.nip04 && typeof candidate.nip04.decrypt === "function") {
    nip04Decrypt = candidate.nip04.decrypt.bind(candidate.nip04);
  }

  let nip44Encrypt = null;
  if (typeof candidate.nip44Encrypt === "function") {
    nip44Encrypt = candidate.nip44Encrypt;
  } else if (candidate.nip44 && typeof candidate.nip44.encrypt === "function") {
    nip44Encrypt = candidate.nip44.encrypt.bind(candidate.nip44);
  } else if (
    candidate.nip44?.v2 &&
    typeof candidate.nip44.v2.encrypt === "function"
  ) {
    nip44Encrypt = candidate.nip44.v2.encrypt.bind(candidate.nip44.v2);
  }

  let nip44Decrypt = null;
  if (typeof candidate.nip44Decrypt === "function") {
    nip44Decrypt = candidate.nip44Decrypt;
  } else if (candidate.nip44 && typeof candidate.nip44.decrypt === "function") {
    nip44Decrypt = candidate.nip44.decrypt.bind(candidate.nip44);
  } else if (
    candidate.nip44?.v2 &&
    typeof candidate.nip44.v2.decrypt === "function"
  ) {
    nip44Decrypt = candidate.nip44.v2.decrypt.bind(candidate.nip44.v2);
  }

  const signerType =
    typeof candidate.type === "string" && candidate.type.trim()
      ? candidate.type.trim()
      : null;

  activeSigner = {
    type: signerType,
    pubkey: normalizedPubkey,
    signEvent,
    nip04Encrypt,
    nip04Decrypt,
    nip44Encrypt,
    nip44Decrypt,
  };

  return activeSigner;
}

function resolveActiveSigner(targetActor) {
  const signer = getActiveSigner();
  if (!signer) {
    return null;
  }

  const normalizedTarget = normalizeActorKey(targetActor);
  const normalizedSigner = normalizeActorKey(signer.pubkey);
  if (normalizedTarget && normalizedSigner && normalizedTarget !== normalizedSigner) {
    return null;
  }

  if (
    typeof signer.signEvent !== "function" &&
    typeof signer.nip04Encrypt !== "function" &&
    typeof signer.nip04Decrypt !== "function" &&
    typeof signer.nip44Encrypt !== "function" &&
    typeof signer.nip44Decrypt !== "function"
  ) {
    return null;
  }

  return signer;
}

function shouldRequestExtensionPermissions(signer) {
  return signer?.type === "extension";
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
        mergePointerDetails(pointer, existing);
        pointer.watchedAt = incomingWatched;
        pointer.session = existing.session === true || pointer.session === true;
        seen.set(key, pointer);
        continue;
      }

      if (incomingWatched === currentWatched) {
        mergePointerDetails(existing, pointer);
      } else {
        mergePointerDetails(existing, pointer);
      }

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

function arrayBufferToBase64(buffer) {
  if (!buffer) {
    return "";
  }

  let view;
  if (buffer instanceof ArrayBuffer) {
    view = new Uint8Array(buffer);
  } else if (ArrayBuffer.isView(buffer)) {
    view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else {
    return "";
  }

  if (typeof globalThis?.btoa === "function") {
    let binary = "";
    for (let index = 0; index < view.length; index += 1) {
      binary += String.fromCharCode(view[index]);
    }
    return globalThis.btoa(binary);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(view).toString("base64");
  }

  return "";
}

function base64ToUint8Array(base64) {
  if (typeof base64 !== "string" || !base64.trim()) {
    return null;
  }

  let binary;
  try {
    if (typeof globalThis?.atob === "function") {
      binary = globalThis.atob(base64);
    } else if (typeof Buffer !== "undefined") {
      binary = Buffer.from(base64, "base64").toString("binary");
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function generateRandomBytes(length) {
  const size = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
  if (size <= 0) {
    return new Uint8Array(0);
  }

  if (globalThis?.crypto?.getRandomValues) {
    const array = new Uint8Array(size);
    globalThis.crypto.getRandomValues(array);
    return array;
  }

  throw new Error("secure-random-unavailable");
}

function isSubtleCryptoAvailable() {
  return !!(
    globalThis?.crypto?.subtle &&
    typeof globalThis.crypto.subtle.importKey === "function"
  );
}

async function deriveSessionEncryptionKey(passphrase, saltBytes, iterations, hash) {
  if (!isSubtleCryptoAvailable()) {
    throw new Error("webcrypto-unavailable");
  }

  if (!(saltBytes instanceof Uint8Array)) {
    throw new Error("invalid-salt");
  }

  const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
  if (!encoder) {
    throw new Error("text-encoder-unavailable");
  }

  const passphraseBytes = encoder.encode(passphrase);

  const baseKey = await globalThis.crypto.subtle.importKey(
    "raw",
    passphraseBytes,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const normalizedIterations = Number.isFinite(iterations)
    ? Math.max(1, Math.floor(iterations))
    : SESSION_ACTOR_KDF_ITERATIONS;
  const normalizedHash = typeof hash === "string" && hash.trim()
    ? hash.trim()
    : SESSION_ACTOR_KDF_HASH;

  return globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: normalizedIterations,
      hash: normalizedHash,
    },
    baseKey,
    { name: SESSION_ACTOR_ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptSessionPrivateKey(privateKey, passphrase) {
  if (typeof privateKey !== "string" || !privateKey.trim()) {
    throw new Error("invalid-private-key");
  }

  if (typeof passphrase !== "string" || !passphrase.trim()) {
    throw new Error("passphrase-required");
  }

  if (!isSubtleCryptoAvailable()) {
    throw new Error("webcrypto-unavailable");
  }

  const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
  if (!encoder) {
    throw new Error("text-encoder-unavailable");
  }

  const payload = encoder.encode(privateKey);
  const salt = generateRandomBytes(SESSION_ACTOR_SALT_BYTES);
  const iv = generateRandomBytes(SESSION_ACTOR_IV_BYTES);
  const key = await deriveSessionEncryptionKey(
    passphrase,
    salt,
    SESSION_ACTOR_KDF_ITERATIONS,
    SESSION_ACTOR_KDF_HASH,
  );

  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: SESSION_ACTOR_ENCRYPTION_ALGORITHM, iv },
    key,
    payload,
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
    iterations: SESSION_ACTOR_KDF_ITERATIONS,
    hash: SESSION_ACTOR_KDF_HASH,
    algorithm: SESSION_ACTOR_ENCRYPTION_ALGORITHM,
    version: SESSION_ACTOR_ENCRYPTION_VERSION,
  };
}

function normalizeStoredEncryptionMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const salt = typeof metadata.salt === "string" ? metadata.salt.trim() : "";
  const iv = typeof metadata.iv === "string" ? metadata.iv.trim() : "";
  if (!salt || !iv) {
    return null;
  }

  const iterations = Number.isFinite(metadata.iterations)
    ? Math.max(1, Math.floor(metadata.iterations))
    : SESSION_ACTOR_KDF_ITERATIONS;
  const version = Number.isFinite(metadata.version)
    ? Math.max(1, Math.floor(metadata.version))
    : SESSION_ACTOR_ENCRYPTION_VERSION;
  const algorithm =
    typeof metadata.algorithm === "string" && metadata.algorithm.trim()
      ? metadata.algorithm.trim()
      : SESSION_ACTOR_ENCRYPTION_ALGORITHM;
  const hash =
    typeof metadata.hash === "string" && metadata.hash.trim()
      ? metadata.hash.trim()
      : SESSION_ACTOR_KDF_HASH;

  return { version, algorithm, salt, iv, iterations, hash };
}

async function decryptSessionPrivateKey(payload, passphrase) {
  if (!payload || typeof payload !== "object") {
    throw new Error("encrypted-session-invalid");
  }

  if (typeof passphrase !== "string" || !passphrase.trim()) {
    throw new Error("passphrase-required");
  }

  if (!isSubtleCryptoAvailable()) {
    throw new Error("webcrypto-unavailable");
  }

  const ciphertext =
    typeof payload.privateKeyEncrypted === "string"
      ? payload.privateKeyEncrypted.trim()
      : "";
  const encryption = normalizeStoredEncryptionMetadata(payload.encryption);

  if (!ciphertext || !encryption) {
    throw new Error("encrypted-session-invalid");
  }

  const cipherBytes = base64ToUint8Array(ciphertext);
  const saltBytes = base64ToUint8Array(encryption.salt);
  const ivBytes = base64ToUint8Array(encryption.iv);
  if (!cipherBytes || !saltBytes || !ivBytes) {
    throw new Error("encrypted-session-invalid");
  }

  const key = await deriveSessionEncryptionKey(
    passphrase,
    saltBytes,
    encryption.iterations,
    encryption.hash,
  );

  let decrypted;
  try {
    decrypted = await globalThis.crypto.subtle.decrypt(
      { name: encryption.algorithm || SESSION_ACTOR_ENCRYPTION_ALGORITHM, iv: ivBytes },
      key,
      cipherBytes,
    );
  } catch (error) {
    const failure = new Error("Failed to decrypt the stored private key.");
    failure.code = "decrypt-failed";
    failure.cause = error;
    throw failure;
  }

  const decoder = typeof TextDecoder === "function" ? new TextDecoder() : null;
  if (!decoder) {
    throw new Error("text-decoder-unavailable");
  }

  return decoder.decode(decrypted);
}

function readStoredSessionActorEntry() {
  if (typeof localStorage === "undefined") {
    return null;
  }

  let raw = null;
  try {
    raw = localStorage.getItem(SESSION_ACTOR_STORAGE_KEY);
  } catch (error) {
    devLogger.warn("[nostr] Failed to read session actor from storage:", error);
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
      typeof parsed?.privateKey === "string" ? parsed.privateKey.trim() : "";
    const privateKeyEncrypted =
      typeof parsed?.privateKeyEncrypted === "string"
        ? parsed.privateKeyEncrypted.trim()
        : "";
    const encryption = normalizeStoredEncryptionMetadata(parsed?.encryption);
    const createdAt = Number.isFinite(parsed?.createdAt)
      ? parsed.createdAt
      : Date.now();

    return {
      pubkey,
      privateKey,
      privateKeyEncrypted,
      encryption,
      createdAt,
    };
  } catch (error) {
    devLogger.warn("[nostr] Failed to parse stored session actor:", error);
    try {
      localStorage.removeItem(SESSION_ACTOR_STORAGE_KEY);
    } catch (cleanupError) {
      devLogger.warn(
        "[nostr] Failed to clear corrupt session actor entry:",
        cleanupError,
      );
    }
  }

  return null;
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

function createNip46RequestId() {
  try {
    if (typeof crypto !== "undefined" && crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch (error) {
    // fall through to timestamp-based id
  }

  const timestamp = Date.now().toString(16);
  const entropy = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `${timestamp}${entropy}`;
}

function normalizeNostrPubkey(candidate) {
  if (typeof candidate !== "string") {
    return "";
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return "";
  }

  if (HEX64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const decoded = decodeNpubToHex(trimmed);
  if (decoded && HEX64_REGEX.test(decoded)) {
    return decoded.toLowerCase();
  }

  return trimmed.toLowerCase();
}

function resolveNip46Relays(relays, fallbackRelays = []) {
  const primary = sanitizeRelayList(Array.isArray(relays) ? relays : []);
  if (primary.length) {
    return primary;
  }

  const fallback = sanitizeRelayList(Array.isArray(fallbackRelays) ? fallbackRelays : []);
  if (fallback.length) {
    return fallback;
  }

  return Array.from(DEFAULT_RELAY_URLS);
}

function parseNip46ConnectionString(uri) {
  const value = typeof uri === "string" ? uri.trim() : "";
  if (!value) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    return null;
  }

  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  const params = parsed.searchParams || new URLSearchParams();

  const relays = params
    .getAll("relay")
    .map((relay) => {
      if (typeof relay !== "string") {
        return "";
      }
      try {
        return decodeURIComponent(relay.trim());
      } catch (error) {
        return relay.trim();
      }
    })
    .filter(Boolean);

  const permissionsParam = params.get("perms") || params.get("permissions") || "";
  const metadata = {
    name: "",
    url: "",
    image: "",
  };

  for (const key of ["name", "url", "image"]) {
    const raw = params.get(key);
    if (typeof raw === "string" && raw.trim()) {
      try {
        metadata[key] = decodeURIComponent(raw.trim());
      } catch (error) {
        metadata[key] = raw.trim();
      }
    }
  }

  let remotePubkey = "";
  let clientPubkey = "";

  if (scheme === "bunker") {
    remotePubkey = parsed.hostname || "";
    if (!remotePubkey && parsed.pathname && parsed.pathname !== "/") {
      remotePubkey = parsed.pathname.replace(/^\/+/, "");
    }
  } else if (scheme === "nostrconnect" || scheme === "web+nostrconnect") {
    clientPubkey = parsed.hostname || "";
    if (!clientPubkey && parsed.pathname && parsed.pathname !== "/") {
      clientPubkey = parsed.pathname.replace(/^\/+/, "");
    }
    remotePubkey =
      params.get("remote") ||
      params.get("remotePubkey") ||
      params.get("signer") ||
      "";
  }

  const secretParam = params.get("secret") || "";

  return {
    scheme,
    type: scheme === "bunker" ? "remote" : "client",
    remotePubkey: normalizeNostrPubkey(remotePubkey),
    clientPubkey: normalizeNostrPubkey(clientPubkey),
    relays,
    secret: typeof secretParam === "string" ? secretParam.trim() : "",
    permissions: typeof permissionsParam === "string" ? permissionsParam.trim() : "",
    metadata,
  };
}

function generateNip46Secret(length = 16) {
  const size = Number.isFinite(length) && length > 0 ? Math.min(64, Math.max(8, Math.floor(length))) : 16;
  try {
    if (typeof crypto !== "undefined" && crypto?.getRandomValues) {
      const bytes = new Uint8Array(size);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch (error) {
    // fall through to Math.random fallback
  }

  let secret = "";
  for (let i = 0; i < size; i += 1) {
    secret += Math.floor(Math.random() * 16).toString(16);
  }
  return secret;
}

function sanitizeNip46Metadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  const normalized = {};
  for (const key of ["name", "url", "image"]) {
    if (typeof metadata[key] === "string" && metadata[key].trim()) {
      normalized[key] = metadata[key].trim();
    }
  }
  return normalized;
}

async function decryptNip46PayloadWithKeys(privateKey, remotePubkey, ciphertext) {
  const tools = (await ensureNostrTools()) || getCachedNostrTools();
  if (!tools) {
    throw new Error("NostrTools helpers are unavailable for NIP-46 payload decryption.");
  }

  let decrypt = null;
  if (tools?.nip44?.v2?.decrypt) {
    decrypt = (priv, pub, payload) => tools.nip44.v2.decrypt(priv, pub, payload);
  } else if (tools?.nip44?.decrypt) {
    decrypt = (priv, pub, payload) => tools.nip44.decrypt(priv, pub, payload);
  } else if (tools?.nip04?.decrypt) {
    decrypt = (priv, pub, payload) => tools.nip04.decrypt(priv, pub, payload);
  }

  if (!decrypt) {
    throw new Error("Remote signer encryption helpers are unavailable.");
  }

  return decrypt(privateKey, remotePubkey, ciphertext);
}

class Nip46RpcClient {
  constructor({
    nostrClient,
    clientPrivateKey,
    clientPublicKey,
    remotePubkey,
    relays,
    secret,
    permissions,
    metadata,
  } = {}) {
    this.nostrClient = nostrClient || null;
    this.clientPrivateKey =
      typeof clientPrivateKey === "string" && HEX64_REGEX.test(clientPrivateKey)
        ? clientPrivateKey.toLowerCase()
        : "";
    this.clientPublicKey = normalizeNostrPubkey(clientPublicKey);
    this.remotePubkey = normalizeNostrPubkey(remotePubkey);
    this.relays = resolveNip46Relays(relays, nostrClient?.relays || []);
    this.secret = typeof secret === "string" ? secret.trim() : "";
    this.permissions = typeof permissions === "string" ? permissions.trim() : "";
    this.metadata = metadata && typeof metadata === "object" ? { ...metadata } : {};

    if (!this.clientPrivateKey) {
      throw new Error("A NIP-46 client private key is required.");
    }

    if (!this.clientPublicKey) {
      const tools = getCachedNostrTools();
      if (!tools || typeof tools.getPublicKey !== "function") {
        throw new Error("Public key derivation is unavailable.");
      }
      this.clientPublicKey = tools.getPublicKey(this.clientPrivateKey);
      if (!this.clientPublicKey || !HEX64_REGEX.test(this.clientPublicKey)) {
        throw new Error("Failed to derive a valid public key for the remote signer session.");
      }
      this.clientPublicKey = this.clientPublicKey.toLowerCase();
    }

    if (!this.remotePubkey) {
      throw new Error("A remote signer pubkey is required.");
    }

    this.pendingRequests = new Map();
    this.subscription = null;
    this.destroyed = false;
    this.cipher = null;
    this.lastSeen = 0;
    this.userPubkey = "";
    this.activeSignerCache = null;
  }

  get pool() {
    return this.nostrClient?.pool || null;
  }

  async ensurePool() {
    if (this.pool) {
      return this.pool;
    }

    if (!this.nostrClient || typeof this.nostrClient.ensurePool !== "function") {
      throw new Error("Remote signer requires a nostr client pool.");
    }

    await this.nostrClient.ensurePool();
    return this.pool;
  }

  async ensureCipher() {
    if (this.cipher) {
      return this.cipher;
    }

    const tools = (await ensureNostrTools()) || getCachedNostrTools();
    if (!tools) {
      throw new Error("NostrTools helpers are unavailable for remote signing.");
    }

    let encrypt = null;
    let decrypt = null;

    const nip44v2GetConversationKey =
      typeof tools?.nip44?.v2?.getConversationKey === "function"
        ? tools.nip44.v2.getConversationKey
        : typeof tools?.nip44?.v2?.utils?.getConversationKey === "function"
          ? tools.nip44.v2.utils.getConversationKey
          : null;

    if (
      tools?.nip44?.v2?.encrypt &&
      tools?.nip44?.v2?.decrypt &&
      nip44v2GetConversationKey
    ) {
      const conversationKey = nip44v2GetConversationKey(
        this.clientPrivateKey,
        this.remotePubkey,
      );

      if (!conversationKey) {
        throw new Error("Failed to derive a nip44 conversation key for remote signing.");
      }

      encrypt = (plaintext, nonce) =>
        typeof nonce === "string"
          ? tools.nip44.v2.encrypt(plaintext, conversationKey, nonce)
          : tools.nip44.v2.encrypt(plaintext, conversationKey);
      decrypt = (ciphertext) => tools.nip44.v2.decrypt(ciphertext, conversationKey);
    } else if (
      tools?.nip44?.encrypt &&
      tools?.nip44?.decrypt &&
      typeof tools?.nip44?.getConversationKey === "function"
    ) {
      const conversationKey = tools.nip44.getConversationKey(
        this.clientPrivateKey,
        this.remotePubkey,
      );

      if (!conversationKey) {
        throw new Error("Failed to derive a nip44 conversation key for remote signing.");
      }

      encrypt = (plaintext, nonce) =>
        typeof nonce === "string"
          ? tools.nip44.encrypt(plaintext, conversationKey, nonce)
          : tools.nip44.encrypt(plaintext, conversationKey);
      decrypt = (ciphertext) => tools.nip44.decrypt(ciphertext, conversationKey);
    } else if (tools?.nip04?.encrypt && tools?.nip04?.decrypt) {
      const privateKey = this.clientPrivateKey;
      const remotePubkey = this.remotePubkey;
      encrypt = (plaintext) => tools.nip04.encrypt(privateKey, remotePubkey, plaintext);
      decrypt = (ciphertext) => tools.nip04.decrypt(privateKey, remotePubkey, ciphertext);
    }

    if (!encrypt || !decrypt) {
      throw new Error("Remote signer encryption helpers are unavailable.");
    }

    this.cipher = { encrypt, decrypt };
    return this.cipher;
  }

  async encryptPayload(payload) {
    const { encrypt } = await this.ensureCipher();
    const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
    return encrypt(serialized);
  }

  async decryptPayload(ciphertext) {
    const { decrypt } = await this.ensureCipher();
    return decrypt(ciphertext);
  }

  async ensureSubscription() {
    if (this.subscription) {
      return this.subscription;
    }

    const pool = await this.ensurePool();
    const filters = [
      {
        kinds: [NIP46_RPC_KIND],
        authors: [this.remotePubkey],
        "#p": [this.clientPublicKey],
      },
    ];

    const relays = this.relays.length ? this.relays : resolveNip46Relays([], this.nostrClient?.relays || []);

    const sub = pool.sub(relays, filters);
    sub.on("event", (event) => {
      this.handleEvent(event);
    });
    sub.on("eose", () => {
      // no-op; responses are push-based
    });
    this.subscription = sub;
    return sub;
  }

  handleEvent(event) {
    if (this.destroyed) {
      return;
    }

    if (!event || event.kind !== NIP46_RPC_KIND) {
      return;
    }

    if (typeof event.pubkey !== "string" || normalizeNostrPubkey(event.pubkey) !== this.remotePubkey) {
      return;
    }

    const tags = Array.isArray(event.tags) ? event.tags : [];
    const targetsClient = tags.some(
      (tag) =>
        Array.isArray(tag) &&
        tag[0] === "p" &&
        typeof tag[1] === "string" &&
        normalizeNostrPubkey(tag[1]) === this.clientPublicKey,
    );

    if (!targetsClient) {
      return;
    }

    Promise.resolve()
      .then(() => this.decryptPayload(event.content))
      .then((payload) => {
        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch (error) {
          devLogger.warn("[nostr] Remote signer returned malformed payload:", error);
          return;
        }

        if (!parsed || typeof parsed !== "object") {
          return;
        }

        const requestId = typeof parsed.id === "string" ? parsed.id : "";
        if (!requestId || !this.pendingRequests.has(requestId)) {
          return;
        }

        const pending = this.pendingRequests.get(requestId);
        this.pendingRequests.delete(requestId);
        clearTimeout(pending.timeoutId);

        this.lastSeen = Date.now();

        if (
          parsed.result === "auth_url" &&
          typeof parsed.error === "string" &&
          parsed.error.trim()
        ) {
          const authError = new Error("Remote signer requires additional authentication.");
          authError.code = "auth-challenge";
          authError.authUrl = parsed.error.trim();
          pending.reject(authError);
          return;
        }

        if (typeof parsed.error === "string" && parsed.error.trim()) {
          const err = new Error(parsed.error.trim());
          err.code = "nip46-error";
          pending.reject(err);
          return;
        }

        pending.resolve(parsed.result ?? null);
      })
      .catch((error) => {
        devLogger.warn("[nostr] Failed to decrypt NIP-46 payload:", error);
      });
  }

  rejectAllPending(error) {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeoutId);
      try {
        pending.reject(error);
      } catch (rejectError) {
        devLogger.warn("[nostr] Pending NIP-46 promise reject failed for", id, rejectError);
      }
    }
    this.pendingRequests.clear();
  }

  async sendRpc(method, params = [], options = {}) {
    if (this.destroyed) {
      throw new Error("Remote signer session has been disposed.");
    }

    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : NIP46_RESPONSE_TIMEOUT_MS;
    const retries = Number.isFinite(options.retries) && options.retries >= 0
      ? options.retries
      : NIP46_MAX_RETRIES;

    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      await this.ensureSubscription();

      const requestId = createNip46RequestId();
      const message = {
        id: requestId,
        method,
        params: Array.isArray(params) ? params : [],
      };

      let event;
      try {
        const content = await this.encryptPayload(message);
        event = signEventWithPrivateKey(
          {
            kind: NIP46_RPC_KIND,
            pubkey: this.clientPublicKey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["p", this.remotePubkey]],
            content,
          },
          this.clientPrivateKey,
        );
      } catch (error) {
        lastError = error;
        break;
      }

      const responsePromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          const timeoutError = new Error(
            `Timed out waiting for remote signer response to ${method}.`,
          );
          timeoutError.code = "nip46-timeout";
          reject(timeoutError);
        }, timeoutMs);

        this.pendingRequests.set(requestId, {
          resolve,
          reject,
          timeoutId,
          method,
        });
      });

      try {
        const publishResults = await publishEventToRelays(
          await this.ensurePool(),
          this.relays,
          event,
          { timeoutMs: NIP46_PUBLISH_TIMEOUT_MS },
        );
        assertAnyRelayAccepted(publishResults, { context: method });
      } catch (error) {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pendingRequests.delete(requestId);
        }
        lastError = error;
        continue;
      }

      try {
        const result = await responsePromise;
        return result;
      } catch (error) {
        lastError = error;
        if (error?.code === "auth-challenge") {
          throw error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`Remote signer request for ${method} failed.`);
  }

  async connect({ permissions } = {}) {
    const params = [this.remotePubkey];
    const requestedPermissions = permissions || this.permissions || "";

    if (this.secret || requestedPermissions) {
      params.push(this.secret || "");
    }
    if (requestedPermissions) {
      params.push(requestedPermissions);
    }

    const result = await this.sendRpc("connect", params, {
      timeoutMs: Math.max(NIP46_RESPONSE_TIMEOUT_MS, 12_000),
      retries: 0,
    });

    if (this.secret) {
      const normalizedResult = typeof result === "string" ? result.trim() : "";
      if (!normalizedResult || normalizedResult !== this.secret) {
        const error = new Error("Remote signer secret mismatch. Rejecting connection.");
        error.code = "nip46-secret-mismatch";
        throw error;
      }
    }

    return result;
  }

  async getUserPubkey() {
    const result = await this.sendRpc("get_public_key", [], {
      timeoutMs: NIP46_RESPONSE_TIMEOUT_MS,
      retries: 0,
    });
    const pubkey = typeof result === "string" ? result.trim() : "";
    if (!pubkey) {
      const error = new Error("Remote signer did not return a public key.");
      error.code = "nip46-empty-pubkey";
      throw error;
    }
    this.userPubkey = normalizeNostrPubkey(pubkey);
    return this.userPubkey;
  }

  async ping() {
    try {
      const result = await this.sendRpc("ping", [], {
        timeoutMs: 5000,
        retries: 0,
      });
      return typeof result === "string" && result.trim().toLowerCase() === "pong";
    } catch (error) {
      return false;
    }
  }

  async signEvent(event, options = {}) {
    if (!event || typeof event !== "object") {
      throw new Error("A Nostr event is required for remote signing.");
    }

    const unsigned = {
      kind: event.kind,
      created_at: event.created_at,
      content: typeof event.content === "string" ? event.content : "",
      tags: Array.isArray(event.tags)
        ? event.tags.map((tag) => (Array.isArray(tag) ? [...tag] : tag))
        : [],
      pubkey:
        typeof event.pubkey === "string" && event.pubkey.trim()
          ? event.pubkey.trim()
          : this.userPubkey,
    };

    const result = await this.sendRpc(
      "sign_event",
      [JSON.stringify(unsigned)],
      {
        timeoutMs: Number.isFinite(options.timeoutMs)
          ? options.timeoutMs
          : NIP46_SIGN_EVENT_TIMEOUT_MS,
        retries: Number.isFinite(options.retries) ? options.retries : NIP46_MAX_RETRIES,
      },
    );

    if (!result) {
      const error = new Error("Remote signer returned an empty response.");
      error.code = "nip46-empty-response";
      throw error;
    }

    if (typeof result === "object") {
      return result;
    }

    try {
      return JSON.parse(result);
    } catch (error) {
      const failure = new Error("Remote signer returned malformed signed event.");
      failure.code = "nip46-invalid-response";
      failure.cause = error;
      throw failure;
    }
  }

  getActiveSigner() {
    if (!this.userPubkey) {
      return null;
    }

    if (!this.activeSignerCache) {
      this.activeSignerCache = {
        type: "nip46",
        pubkey: this.userPubkey,
        signEvent: (event) => this.signEvent(event),
      };
    }

    return this.activeSignerCache;
  }

  async destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    if (this.subscription && typeof this.subscription.unsub === "function") {
      try {
        this.subscription.unsub();
      } catch (error) {
        devLogger.warn("[nostr] Failed to unsubscribe remote signer session:", error);
      }
    }
    this.subscription = null;

    this.rejectAllPending(new Error("Remote signer session closed."));
  }
}

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CHARSET_MAP = (() => {
  const map = new Map();
  for (let index = 0; index < BECH32_CHARSET.length; index += 1) {
    map.set(BECH32_CHARSET[index], index);
  }
  return map;
})();

const BECH32_GENERATORS = [
  0x3b6a57b2,
  0x26508e6d,
  0x1ea119fa,
  0x3d4233dd,
  0x2a1462b3,
];

function bech32Polymod(values) {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let bit = 0; bit < BECH32_GENERATORS.length; bit += 1) {
      if ((top >>> bit) & 1) {
        chk ^= BECH32_GENERATORS[bit];
      }
    }
  }
  return chk;
}

function bech32HrpExpand(hrp) {
  const expansion = [];
  for (let i = 0; i < hrp.length; i += 1) {
    expansion.push(hrp.charCodeAt(i) >>> 5);
  }
  expansion.push(0);
  for (let i = 0; i < hrp.length; i += 1) {
    expansion.push(hrp.charCodeAt(i) & 31);
  }
  return expansion;
}

function bech32VerifyChecksum(hrp, values) {
  return bech32Polymod([...bech32HrpExpand(hrp), ...values]) === 1;
}

function convertBits(data, fromBits, toBits) {
  let acc = 0;
  let bits = 0;
  const maxValue = (1 << toBits) - 1;
  const result = [];

  for (const value of data) {
    if (value < 0 || value >>> fromBits !== 0) {
      return null;
    }
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >>> bits) & maxValue);
    }
  }

  if (bits > 0) {
    if ((acc << (toBits - bits)) & maxValue) {
      return null;
    }
  }

  return result;
}

function decodeBech32Npub(value) {
  if (typeof value !== "string") {
    return "";
  }

  const hasMixedCase = value !== value.toLowerCase() && value !== value.toUpperCase();
  if (hasMixedCase) {
    return "";
  }

  const normalized = value.toLowerCase();
  const separatorIndex = normalized.lastIndexOf("1");
  if (separatorIndex <= 0 || separatorIndex + 7 > normalized.length) {
    return "";
  }

  const hrp = normalized.slice(0, separatorIndex);
  if (hrp !== "npub") {
    return "";
  }

  const dataPart = normalized.slice(separatorIndex + 1);
  const values = [];
  for (let i = 0; i < dataPart.length; i += 1) {
    const mapped = BECH32_CHARSET_MAP.get(dataPart[i]);
    if (typeof mapped !== "number") {
      return "";
    }
    values.push(mapped);
  }

  if (values.length < 7 || !bech32VerifyChecksum(hrp, values)) {
    return "";
  }

  const words = values.slice(0, -6);
  const bytes = convertBits(words, 5, 8);
  if (!bytes || bytes.length !== 32) {
    return "";
  }

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function decodeNpubToHex(npub) {
  if (typeof npub !== "string") {
    return "";
  }

  const trimmed = npub.trim();
  if (!trimmed) {
    return "";
  }

  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const lower = trimmed.toLowerCase();
  const hasNpubPrefix = lower.startsWith("npub1");
  if (!hasNpubPrefix) {
    return "";
  }

  const warnableNpub = /^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/i.test(
    trimmed
  );

  let tools = cachedNostrTools;
  if (!tools || typeof tools?.nip19?.decode !== "function") {
    const fallbackTools = readToolkitFromScope();
    if (fallbackTools) {
      tools = fallbackTools;
    }
  }

  let decodeError = null;
  if (tools?.nip19 && typeof tools.nip19.decode === "function") {
    try {
      const decoded = tools.nip19.decode(trimmed);
      if (decoded?.type === "npub" && typeof decoded.data === "string") {
        return decoded.data;
      }
    } catch (error) {
      decodeError = error;
    }
  }

  const manualDecoded = decodeBech32Npub(trimmed);
  if (manualDecoded) {
    return manualDecoded;
  }

  if (isDevMode && warnableNpub) {
    userLogger.warn(
      `[nostr] Failed to decode npub: ${trimmed}`,
      decodeError || new Error("invalid-npub"),
    );
  }

  return "";
}

function encodeHexToNpub(pubkey) {
  if (typeof pubkey !== "string") {
    return "";
  }

  const normalized = pubkey.trim().toLowerCase();
  if (!normalized || !HEX64_REGEX.test(normalized)) {
    return "";
  }

  let toolkit = getCachedNostrTools();
  if (!toolkit || typeof toolkit?.nip19?.npubEncode !== "function") {
    const fallbackToolkit = readToolkitFromScope();
    if (fallbackToolkit?.nip19?.npubEncode) {
      toolkit = fallbackToolkit;
    }
  }

  const encoder = toolkit?.nip19?.npubEncode;
  if (typeof encoder !== "function") {
    return "";
  }

  try {
    return encoder(normalized);
  } catch (error) {
    if (isDevMode) {
      devLogger.warn("[nostr] Failed to encode npub:", error);
    }
    return "";
  }
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
 * Convert a raw Nostr event into bitvid's canonical "video" object.
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
  const isNsfw = parsedContent.isNsfw === true;
  const isForKids = parsedContent.isForKids === true && !isNsfw;
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
    isNsfw,
    isForKids,
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

export { convertEventToVideo, Nip46RpcClient };

export class NostrClient {
  constructor() {
    this.pool = null;
    this.poolPromise = null;
    this.pubkey = null;
    this.relays = sanitizeRelayList(Array.from(DEFAULT_RELAY_URLS));
    this.readRelays = Array.from(this.relays);
    this.writeRelays = Array.from(this.relays);

    // Store all events so older links still work
    this.allEvents = new Map();

    // Keep a separate cache of raw events so we can republish the exact payload
    this.rawEvents = new Map();

    // “activeMap” holds only the newest version for each root
    this.activeMap = new Map();

    // Track the newest deletion timestamp for each active key
    this.tombstones = new Map();

    this.rootCreatedAtByRoot = new Map();

    this.hasRestoredLocalData = false;

    this.sessionActor = null;
    this.lockedSessionActor = null;
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
    this.nip46Client = null;
    this.remoteSignerListeners = new Set();
    const storedRemoteSigner = this.getStoredNip46Metadata();
    this.remoteSignerStatus = {
      state: storedRemoteSigner.hasSession ? "stored" : "idle",
      remotePubkey: storedRemoteSigner.remotePubkey || "",
      remoteNpub: storedRemoteSigner.remoteNpub || "",
      userPubkey: storedRemoteSigner.userPubkey || "",
      userNpub: storedRemoteSigner.userNpub || "",
      relays: storedRemoteSigner.relays || [],
      metadata: storedRemoteSigner.metadata || {},
      label:
        (storedRemoteSigner.metadata && storedRemoteSigner.metadata.name) || "",
      message: null,
      error: null,
      hasStoredSession: storedRemoteSigner.hasSession,
    };
    this.pendingRemoteSignerRestore = null;
    let storedPermissions = null;
    const hasLocalStorage =
      (typeof window !== "undefined" &&
        window &&
        typeof window.localStorage !== "undefined") ||
      (typeof globalThis !== "undefined" &&
        globalThis &&
        typeof globalThis.localStorage !== "undefined");

    if (hasLocalStorage) {
      try {
        storedPermissions = readStoredNip07Permissions();
      } catch (error) {
        storedPermissions = null;
      }
    }

    this.extensionPermissionCache =
      storedPermissions instanceof Set ? storedPermissions : new Set();
  }

  getStoredNip46Metadata() {
    const stored = readStoredNip46Session();
    if (!stored) {
      return { hasSession: false };
    }

    const remotePubkey = stored.remotePubkey || "";
    const userPubkey = stored.userPubkey || "";

    return {
      hasSession: true,
      remotePubkey,
      remoteNpub: encodeHexToNpub(remotePubkey),
      clientPublicKey: stored.clientPublicKey || "",
      relays: Array.isArray(stored.relays) ? [...stored.relays] : [],
      metadata: stored.metadata || {},
      userPubkey,
      userNpub: encodeHexToNpub(userPubkey),
    };
  }

  getRemoteSignerStatus() {
    return { ...this.remoteSignerStatus };
  }

  emitRemoteSignerChange(status = {}) {
    const stored = this.getStoredNip46Metadata();
    const nextState =
      typeof status.state === "string" && status.state.trim()
        ? status.state.trim()
        : this.nip46Client
        ? "connected"
        : stored.hasSession
        ? "stored"
        : "idle";

    const remotePubkey =
      (typeof status.remotePubkey === "string" && status.remotePubkey.trim()) ||
      this.nip46Client?.remotePubkey ||
      stored.remotePubkey ||
      "";
    const userPubkey =
      (typeof status.userPubkey === "string" && status.userPubkey.trim()) ||
      this.nip46Client?.userPubkey ||
      stored.userPubkey ||
      "";

    const metadataCandidate =
      status.metadata || this.nip46Client?.metadata || stored.metadata || {};
    const metadata =
      metadataCandidate && typeof metadataCandidate === "object"
        ? { ...metadataCandidate }
        : {};
    const relays = Array.isArray(status.relays)
      ? status.relays.slice()
      : (this.nip46Client?.relays || stored.relays || []).slice();

    const snapshot = {
      state: nextState,
      remotePubkey,
      userPubkey,
      relays,
      metadata,
      label:
        status.label ||
        metadata?.name ||
        this.nip46Client?.metadata?.name ||
        stored.metadata?.name ||
        "",
      remoteNpub:
        (typeof status.remoteNpub === "string" && status.remoteNpub.trim()) ||
        encodeHexToNpub(remotePubkey) ||
        stored.remoteNpub ||
        "",
      userNpub:
        (typeof status.userNpub === "string" && status.userNpub.trim()) ||
        encodeHexToNpub(userPubkey) ||
        stored.userNpub ||
        "",
      message: status.message || null,
      error: status.error || null,
      hasStoredSession: stored.hasSession,
    };

    this.remoteSignerStatus = snapshot;

    for (const listener of Array.from(this.remoteSignerListeners)) {
      try {
        listener(snapshot);
      } catch (error) {
        devLogger.warn("[nostr] Remote signer listener threw:", error);
      }
    }

    return snapshot;
  }

  onRemoteSignerChange(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    this.remoteSignerListeners.add(listener);
    return () => {
      this.remoteSignerListeners.delete(listener);
    };
  }

  async createNip46KeyPair(existingPrivateKey = "", existingPublicKey = "") {
    let privateKey =
      typeof existingPrivateKey === "string" && existingPrivateKey.trim()
        ? existingPrivateKey.trim().toLowerCase()
        : "";

    if (privateKey && !HEX64_REGEX.test(privateKey)) {
      const error = new Error("Invalid remote signer private key.");
      error.code = "invalid-private-key";
      throw error;
    }

    if (!privateKey) {
      const tools = (await ensureNostrTools()) || getCachedNostrTools();
      if (!tools) {
        throw new Error("Unable to generate a remote signer key pair.");
      }

      let generated = null;
      if (typeof tools.generateSecretKey === "function") {
        generated = tools.generateSecretKey();
      }

      if (generated instanceof Uint8Array) {
        privateKey = bytesToHex(generated);
      } else if (Array.isArray(generated)) {
        privateKey = bytesToHex(Uint8Array.from(generated));
      } else if (typeof generated === "string") {
        privateKey = generated.trim().toLowerCase();
      }

      if (!privateKey || !HEX64_REGEX.test(privateKey)) {
        throw new Error("Generated remote signer key is invalid.");
      }

      privateKey = privateKey.toLowerCase();
    }

    let publicKey =
      typeof existingPublicKey === "string" && existingPublicKey.trim()
        ? existingPublicKey.trim().toLowerCase()
        : "";

    if (!publicKey) {
      const tools = (await ensureNostrTools()) || getCachedNostrTools();
      if (!tools || typeof tools.getPublicKey !== "function") {
        throw new Error("Public key derivation is unavailable for remote signing.");
      }
      publicKey = tools.getPublicKey(privateKey);
    }

    if (!publicKey || !HEX64_REGEX.test(publicKey)) {
      throw new Error("Derived remote signer public key is invalid.");
    }

    return { privateKey, publicKey: publicKey.toLowerCase() };
  }

  async prepareRemoteSignerHandshake({ metadata, relays, secret, permissions } = {}) {
    const keyPair = await this.createNip46KeyPair();
    const sanitizedMetadata = sanitizeNip46Metadata(metadata);
    const requestedPermissions =
      typeof permissions === "string" && permissions.trim() ? permissions.trim() : "";

    const resolvedRelays = resolveNip46Relays(relays, this.relays);
    const handshakeSecret =
      typeof secret === "string" && secret.trim() ? secret.trim() : generateNip46Secret();

    const params = [];
    for (const relay of resolvedRelays) {
      params.push(`relay=${encodeURIComponent(relay)}`);
    }
    if (handshakeSecret) {
      params.push(`secret=${encodeURIComponent(handshakeSecret)}`);
    }
    if (requestedPermissions) {
      params.push(`perms=${encodeURIComponent(requestedPermissions)}`);
    }
    for (const [key, value] of Object.entries(sanitizedMetadata)) {
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }

    const query = params.length ? `?${params.join("&")}` : "";
    const uri = `nostrconnect://${keyPair.publicKey}${query}`;

    return {
      type: "client",
      connectionString: uri,
      uri,
      clientPrivateKey: keyPair.privateKey,
      clientPublicKey: keyPair.publicKey,
      relays: resolvedRelays,
      secret: handshakeSecret,
      permissions: requestedPermissions,
      metadata: sanitizedMetadata,
    };
  }

  installNip46Client(client, { userPubkey } = {}) {
    if (this.nip46Client && this.nip46Client !== client) {
      try {
        this.nip46Client.destroy();
      } catch (error) {
        devLogger.warn("[nostr] Failed to dispose previous remote signer client:", error);
      }
    }

    this.nip46Client = client;
    if (userPubkey) {
      this.nip46Client.userPubkey = userPubkey;
    }

    const signer = client.getActiveSigner();
    if (signer) {
      setActiveSigner(signer);
    }

    return signer;
  }

  async waitForRemoteSignerHandshake({
    clientPrivateKey,
    clientPublicKey,
    relays,
    secret,
    onAuthUrl,
    onStatus,
    timeoutMs,
  } = {}) {
    const normalizedClientPublicKey = normalizeNostrPubkey(clientPublicKey);
    if (!normalizedClientPublicKey) {
      throw new Error("A client public key is required to await the remote signer handshake.");
    }

    if (!clientPrivateKey || typeof clientPrivateKey !== "string" || !HEX64_REGEX.test(clientPrivateKey)) {
      throw new Error("A client private key is required to await the remote signer handshake.");
    }

    const resolvedRelays = resolveNip46Relays(relays, this.relays);
    if (!resolvedRelays.length) {
      throw new Error("No relays available to complete the remote signer handshake.");
    }

    const pool = await this.ensurePool();
    const filters = [
      {
        kinds: [NIP46_RPC_KIND],
        "#p": [normalizedClientPublicKey],
      },
    ];

    const waitTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : NIP46_HANDSHAKE_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          subscription?.unsub?.();
        } catch (error) {
          // ignore subscription cleanup failures
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        const error = new Error("Timed out waiting for the remote signer to acknowledge the connection.");
        error.code = "nip46-handshake-timeout";
        reject(error);
      }, waitTimeout);

      let subscription;
      try {
        subscription = pool.sub(resolvedRelays, filters);
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }

      subscription.on("event", (event) => {
        if (settled) {
          return;
        }

        if (!event || event.kind !== NIP46_RPC_KIND) {
          return;
        }

        const remotePubkey = normalizeNostrPubkey(event.pubkey);
        if (!remotePubkey) {
          return;
        }

        Promise.resolve()
          .then(() => decryptNip46PayloadWithKeys(clientPrivateKey, remotePubkey, event.content))
          .then((payload) => {
            let parsed;
            try {
              parsed = JSON.parse(payload);
            } catch (error) {
              devLogger.warn("[nostr] Failed to parse remote signer handshake payload:", error);
              return;
            }

            const resultValue = typeof parsed?.result === "string" ? parsed.result.trim() : "";
            const errorValue = typeof parsed?.error === "string" ? parsed.error.trim() : "";

            if (resultValue === "auth_url" && errorValue) {
              if (typeof onAuthUrl === "function") {
                try {
                  onAuthUrl(errorValue, {
                    phase: "handshake",
                    remotePubkey,
                    requestId: typeof parsed?.id === "string" ? parsed.id : "",
                  });
                } catch (callbackError) {
                  devLogger.warn("[nostr] Handshake auth_url callback threw:", callbackError);
                }
              }
              return;
            }

            if (secret) {
              if (!resultValue || resultValue !== secret) {
                return;
              }
            }

            if (!secret && resultValue) {
              const normalized = resultValue.toLowerCase();
              if (!["ack", "ok", "success"].includes(normalized)) {
                return;
              }
            }

            cleanup();

            if (typeof onStatus === "function") {
              try {
                onStatus({
                  phase: "handshake",
                  state: "acknowledged",
                  message: "Remote signer acknowledged the connect request.",
                  remotePubkey,
                });
              } catch (callbackError) {
                devLogger.warn("[nostr] Handshake status callback threw:", callbackError);
              }
            }

            resolve({
              remotePubkey,
              response: parsed,
            });
          })
          .catch((error) => {
            devLogger.warn("[nostr] Failed to decrypt remote signer handshake payload:", error);
          });
      });

      subscription.on("eose", () => {
        // no-op: handshake responses are push-based
      });
    });
  }

  async connectRemoteSigner({
    connectionString,
    remember = true,
    clientPrivateKey: providedClientPrivateKey = "",
    clientPublicKey: providedClientPublicKey = "",
    relays: providedRelays = [],
    secret: providedSecret = "",
    permissions: providedPermissions = "",
    metadata: providedMetadata = {},
    onAuthUrl,
    onStatus,
    handshakeTimeoutMs,
  } = {}) {
    const parsed = parseNip46ConnectionString(connectionString);
    if (!parsed) {
      const error = new Error(
        "Unsupported NIP-46 URI. Provide a nostrconnect:// handshake or bunker:// pointer.",
      );
      error.code = "invalid-connection-string";
      throw error;
    }

    const baseMetadata = sanitizeNip46Metadata(parsed.metadata);
    const overrideMetadata = sanitizeNip46Metadata(providedMetadata);
    const metadata = { ...baseMetadata, ...overrideMetadata };

    const handleStatus = (status) => {
      if (typeof onStatus !== "function") {
        return;
      }
      try {
        onStatus(status);
      } catch (error) {
        devLogger.warn("[nostr] Remote signer status callback threw:", error);
      }
    };

    const handleAuthChallenge = async (url, context = {}) => {
      if (typeof onAuthUrl !== "function" || !url) {
        return;
      }
      try {
        const result = onAuthUrl(url, context);
        if (result && typeof result.then === "function") {
          await result.catch((error) => {
            devLogger.warn("[nostr] Auth challenge callback promise rejected:", error);
          });
        }
      } catch (error) {
        devLogger.warn("[nostr] Remote signer auth callback threw:", error);
      }
    };

    const mergedRelaysSource = parsed.relays.length ? parsed.relays : providedRelays;
    const relays = resolveNip46Relays(mergedRelaysSource, this.relays);

    let secret = typeof providedSecret === "string" && providedSecret.trim() ? providedSecret.trim() : parsed.secret;
    let permissions =
      typeof providedPermissions === "string" && providedPermissions.trim()
        ? providedPermissions.trim()
        : parsed.permissions;

    let clientPrivateKey = "";
    let clientPublicKey = "";
    let remotePubkey = normalizeNostrPubkey(parsed.remotePubkey);

    if (parsed.type === "client") {
      clientPrivateKey =
        typeof providedClientPrivateKey === "string" && providedClientPrivateKey.trim()
          ? providedClientPrivateKey.trim().toLowerCase()
          : "";

      if (!clientPrivateKey || !HEX64_REGEX.test(clientPrivateKey)) {
        const error = new Error(
          "Remote signer handshake requires the generated client private key.",
        );
        error.code = "missing-client-private-key";
        throw error;
      }

      clientPublicKey = normalizeNostrPubkey(providedClientPublicKey) || parsed.clientPubkey;
      if (!clientPublicKey) {
        const tools = (await ensureNostrTools()) || getCachedNostrTools();
        if (!tools || typeof tools.getPublicKey !== "function") {
          throw new Error("Public key derivation is unavailable for the remote signer handshake.");
        }
        clientPublicKey = normalizeNostrPubkey(tools.getPublicKey(clientPrivateKey));
      }

      if (!clientPublicKey || !HEX64_REGEX.test(clientPublicKey)) {
        const error = new Error("Invalid client public key for the remote signer handshake.");
        error.code = "invalid-client-public-key";
        throw error;
      }

      if (parsed.clientPubkey && normalizeNostrPubkey(parsed.clientPubkey) !== clientPublicKey) {
        const error = new Error("Handshake public key mismatch detected.");
        error.code = "client-public-key-mismatch";
        throw error;
      }

      if (!secret) {
        secret = generateNip46Secret();
      }

      handleStatus({
        phase: "handshake",
        state: "waiting",
        message: "Waiting for the signer to acknowledge the connection…",
        relays,
      });

      this.emitRemoteSignerChange({
        state: "connecting",
        relays,
        metadata,
        message: "Waiting for the signer to acknowledge the connection.",
      });

      let handshakeResult;
      try {
        handshakeResult = await this.waitForRemoteSignerHandshake({
          clientPrivateKey,
          clientPublicKey,
          relays,
          secret,
          onAuthUrl: (url, context) => handleAuthChallenge(url, context),
          onStatus: handleStatus,
          timeoutMs: handshakeTimeoutMs,
        });
      } catch (error) {
        this.emitRemoteSignerChange({
          state: "error",
          relays,
          metadata,
          message: error?.message || "Remote signer handshake failed.",
          error,
        });
        throw error;
      }

      remotePubkey = normalizeNostrPubkey(handshakeResult?.remotePubkey);
      if (!remotePubkey) {
        const error = new Error("Remote signer did not return a valid public key.");
        error.code = "missing-remote-pubkey";
        throw error;
      }
    } else {
      const keyPair = await this.createNip46KeyPair(
        providedClientPrivateKey,
        providedClientPublicKey,
      );
      clientPrivateKey = keyPair.privateKey;
      clientPublicKey = keyPair.publicKey;

      this.emitRemoteSignerChange({
        state: "connecting",
        remotePubkey,
        relays,
        metadata,
      });
    }

    if (!remotePubkey) {
      remotePubkey = normalizeNostrPubkey(parsed.remotePubkey);
    }

    if (!remotePubkey) {
      const error = new Error("Remote signer pubkey is required to establish the session.");
      error.code = "missing-remote-pubkey";
      throw error;
    }

    const client = new Nip46RpcClient({
      nostrClient: this,
      clientPrivateKey,
      clientPublicKey,
      remotePubkey,
      relays,
      secret,
      permissions,
      metadata,
    });

    try {
      await client.ensureSubscription();

      handleStatus({
        phase: "connect",
        state: "request",
        message: "Requesting approval from the remote signer…",
        remotePubkey,
      });

      let attempts = 0;
      // Attempt the connect RPC, handling auth challenges when provided.
      for (;;) {
        try {
          await client.connect({ permissions });
          break;
        } catch (error) {
          if (error?.code === "auth-challenge" && error.authUrl) {
            attempts += 1;
            handleStatus({
              phase: "auth",
              state: "waiting",
              message: "Complete the authentication challenge in your signer…",
              remotePubkey,
              attempt: attempts,
            });
            await handleAuthChallenge(error.authUrl, {
              phase: "connect",
              remotePubkey,
              attempt: attempts,
            });

            if (attempts >= NIP46_AUTH_CHALLENGE_MAX_ATTEMPTS) {
              throw error;
            }
            continue;
          }
          throw error;
        }
      }

      const userPubkey = await client.getUserPubkey();
      client.metadata = metadata;
      const signer = this.installNip46Client(client, { userPubkey });

      if (remember) {
        writeStoredNip46Session({
          version: 1,
          clientPrivateKey,
          clientPublicKey,
          remotePubkey,
          relays,
          secret,
          permissions,
          metadata,
          userPubkey,
          lastConnectedAt: Date.now(),
        });
      } else {
        clearStoredNip46Session();
      }

      this.emitRemoteSignerChange({
        state: "connected",
        remotePubkey,
        userPubkey,
        relays,
        metadata,
      });

      handleStatus({
        phase: "connected",
        state: "ready",
        message: "Remote signer connected successfully.",
        remotePubkey,
        userPubkey,
      });

      return { pubkey: userPubkey, signer };
    } catch (error) {
      await client.destroy().catch(() => {});
      this.nip46Client = null;
      if (!remember) {
        clearStoredNip46Session();
      }
      this.emitRemoteSignerChange({
        state: "error",
        remotePubkey,
        relays,
        metadata,
        message: error?.message || "Remote signer connection failed.",
        error,
      });
      throw error;
    }
  }

  async useStoredRemoteSigner(options = {}) {
    const normalizedOptions =
      options && typeof options === "object" ? options : {};
    const silent = normalizedOptions.silent === true;
    const forgetOnError = normalizedOptions.forgetOnError === true;

    const stored = readStoredNip46Session();
    if (!stored) {
      const error = new Error("No remote signer session is stored on this device.");
      error.code = "no-stored-session";
      throw error;
    }

    const relays = resolveNip46Relays(stored.relays, this.relays);

    this.emitRemoteSignerChange({
      state: "connecting",
      remotePubkey: stored.remotePubkey,
      relays,
      metadata: stored.metadata,
    });

    const client = new Nip46RpcClient({
      nostrClient: this,
      clientPrivateKey: stored.clientPrivateKey,
      clientPublicKey: stored.clientPublicKey,
      remotePubkey: stored.remotePubkey,
      relays,
      secret: stored.secret,
      permissions: stored.permissions,
      metadata: stored.metadata,
    });

    try {
      await client.ensureSubscription();
      await client.connect({ permissions: stored.permissions });
      const userPubkey = await client.getUserPubkey();
      client.metadata = stored.metadata;
      const signer = this.installNip46Client(client, { userPubkey });

      writeStoredNip46Session({
        ...stored,
        userPubkey,
        lastConnectedAt: Date.now(),
      });

      this.emitRemoteSignerChange({
        state: "connected",
        remotePubkey: stored.remotePubkey,
        userPubkey,
        relays,
        metadata: stored.metadata,
      });

      return { pubkey: userPubkey, signer };
    } catch (error) {
      await client.destroy().catch(() => {});
      this.nip46Client = null;
      const fatalCodes = new Set([
        "nip46-secret-mismatch",
        "invalid-private-key",
        "invalid-connection-string",
      ]);
      const shouldForgetStored = forgetOnError || fatalCodes.has(error?.code);
      if (shouldForgetStored) {
        clearStoredNip46Session();
      }

      const status = {
        state: shouldForgetStored ? "idle" : silent ? "stored" : "error",
        remotePubkey: stored.remotePubkey,
        relays,
        metadata: stored.metadata,
      };

      if (!silent || shouldForgetStored) {
        status.message =
          error?.message || "Failed to reconnect to the remote signer.";
      }
      status.error = error;

      this.emitRemoteSignerChange(status);

      if (silent) {
        devLogger.log("[nostr] Silent remote signer restore failed:", error);
      } else {
        devLogger.warn(
          "[nostr] Stored remote signer reconnection failed:",
          error,
        );
      }
      throw error;
    }
  }

  scheduleStoredRemoteSignerRestore() {
    if (this.nip46Client) {
      return this.pendingRemoteSignerRestore || null;
    }

    if (this.pendingRemoteSignerRestore) {
      return this.pendingRemoteSignerRestore;
    }

    const stored = this.getStoredNip46Metadata();
    if (!stored.hasSession) {
      return null;
    }

    const attempt = this.useStoredRemoteSigner({ silent: true })
      .catch(() => null)
      .finally(() => {
        this.pendingRemoteSignerRestore = null;
      });

    this.pendingRemoteSignerRestore = attempt;
    return attempt;
  }

  async disconnectRemoteSigner({ keepStored = true } = {}) {
    this.pendingRemoteSignerRestore = null;
    if (this.nip46Client) {
      try {
        await this.nip46Client.destroy();
      } catch (error) {
        devLogger.warn("[nostr] Failed to tear down remote signer client:", error);
      }
      this.nip46Client = null;
    }

    const activeSigner = getActiveSigner();
    if (activeSigner?.type === "nip46") {
      clearActiveSigner();
    }

    if (!keepStored) {
      clearStoredNip46Session();
    }

    const stored = keepStored ? this.getStoredNip46Metadata() : { hasSession: false };
    this.emitRemoteSignerChange({
      state: stored.hasSession ? "stored" : "idle",
      remotePubkey: stored.remotePubkey || "",
      userPubkey: stored.userPubkey || "",
      relays: stored.relays || [],
      metadata: stored.metadata || {},
    });
  }

  recordTombstone(activeKey, createdAt) {
    const key = typeof activeKey === "string" ? activeKey.trim() : "";
    if (!key) {
      return;
    }

    let timestamp = Number(createdAt);
    if (!Number.isFinite(timestamp)) {
      return;
    }
    timestamp = Math.max(0, Math.floor(timestamp));
    if (timestamp <= 0) {
      return;
    }

    const previous = this.tombstones.get(key);
    const previousTimestamp = Number.isFinite(previous)
      ? Math.max(0, Math.floor(previous))
      : 0;
    if (previousTimestamp >= timestamp) {
      return;
    }

    this.tombstones.set(key, timestamp);

    const activeVideo = this.activeMap.get(key);
    if (activeVideo) {
      const activeCreated = Number.isFinite(activeVideo?.created_at)
        ? Math.floor(activeVideo.created_at)
        : 0;
      if (activeCreated && activeCreated <= timestamp) {
        activeVideo.deleted = true;
        this.activeMap.delete(key);
      }
    }

    for (const video of this.allEvents.values()) {
      if (!video || typeof video !== "object") {
        continue;
      }
      if (getActiveKey(video) !== key) {
        continue;
      }
      const createdAtValue = Number.isFinite(video?.created_at)
        ? Math.floor(video.created_at)
        : 0;
      if (createdAtValue && createdAtValue <= timestamp) {
        video.deleted = true;
      }
    }
  }

  isOlderThanTombstone(video) {
    if (!video || typeof video !== "object") {
      return false;
    }

    const activeKey = getActiveKey(video);
    if (!activeKey) {
      return false;
    }

    const tombstone = this.tombstones.get(activeKey);
    if (!Number.isFinite(tombstone)) {
      return false;
    }

    const normalizedTombstone = Math.max(0, Math.floor(tombstone));
    const createdAtValue = Number.isFinite(video?.created_at)
      ? Math.floor(video.created_at)
      : 0;

    return createdAtValue > 0 && createdAtValue <= normalizedTombstone;
  }

  applyTombstoneGuard(video) {
    if (!video || typeof video !== "object") {
      return false;
    }

    const isGuarded = this.isOlderThanTombstone(video);
    if (isGuarded) {
      video.deleted = true;
    }
    return isGuarded;
  }

  markExtensionPermissions(methods = []) {
    if (!this.extensionPermissionCache) {
      this.extensionPermissionCache = new Set();
    }

    if (!Array.isArray(methods)) {
      return;
    }

    let didChange = false;
    for (const method of methods) {
      const normalized = normalizePermissionMethod(method);
      if (!normalized) {
        continue;
      }
      if (!this.extensionPermissionCache.has(normalized)) {
        didChange = true;
      }
      this.extensionPermissionCache.add(normalized);
    }

    if (didChange) {
      try {
        writeStoredNip07Permissions(this.extensionPermissionCache);
      } catch (error) {
        // Ignore storage persistence issues in non-browser environments
      }
    }
  }

  async ensureExtensionPermissions(methods = DEFAULT_NIP07_PERMISSION_METHODS) {
    if (!Array.isArray(methods)) {
      methods = [];
    }

    const normalized = Array.from(
      new Set(
        methods
          .map((method) =>
            typeof method === "string" && method.trim() ? method.trim() : "",
          )
          .filter(Boolean),
      ),
    );

    if (!normalized.length) {
      return { ok: true };
    }

    const outstanding = normalized.filter((method) =>
      this.extensionPermissionCache ? !this.extensionPermissionCache.has(method) : true,
    );

    if (!outstanding.length) {
      return { ok: true };
    }

    const extension = typeof window !== "undefined" ? window.nostr : null;
    if (!extension) {
      return { ok: false, error: new Error("extension-unavailable") };
    }

    if (typeof extension.enable !== "function") {
      this.markExtensionPermissions(outstanding);
      return { ok: true, code: "enable-unavailable" };
    }

    // Always request the full set of methods first so extensions surface the
    // "All Access" prompt instead of defaulting to "Get Public Key" only.
    const permissionVariants = [];
    if (outstanding.length) {
      permissionVariants.push({
        permissions: outstanding.map((method) => ({ method })),
      });
      permissionVariants.push({ permissions: outstanding });
    }
    permissionVariants.push(null);

    let lastError = null;
    for (const options of permissionVariants) {
      const variantTimeoutOverrides = options
        ? {
            timeoutMs: Math.min(
              NIP07_LOGIN_TIMEOUT_MS,
              getEnableVariantTimeoutMs(),
            ),
            retryMultiplier: 1,
          }
        : { retryMultiplier: 1 };

      try {
        await runNip07WithRetry(
          () => (options ? extension.enable(options) : extension.enable()),
          { label: "extension.enable", ...variantTimeoutOverrides },
        );
        this.markExtensionPermissions(outstanding);
        return { ok: true };
      } catch (error) {
        lastError = error;
        if (options && isDevMode) {
          userLogger.warn(
            "[nostr] extension.enable request with explicit permissions failed:",
            error,
          );
        }
      }
    }

    return {
      ok: false,
      error: lastError || new Error("permission-denied"),
    };
  }

  applyRootCreatedAt(video) {
    if (!video || typeof video !== "object") {
      return null;
    }

    const rootId =
      typeof video.videoRootId === "string" && video.videoRootId
        ? video.videoRootId
        : typeof video.id === "string"
          ? video.id
          : "";

    if (!rootId) {
      if ("rootCreatedAt" in video) {
        delete video.rootCreatedAt;
      }
      return null;
    }

    const candidates = [];

    const declaredRoot = Number.isFinite(video.rootCreatedAt)
      ? Math.floor(video.rootCreatedAt)
      : null;
    if (declaredRoot !== null) {
      candidates.push(declaredRoot);
    }

    const nip71Created = Number.isFinite(video?.nip71Source?.created_at)
      ? Math.floor(video.nip71Source.created_at)
      : null;
    if (nip71Created !== null) {
      candidates.push(nip71Created);
    }

    const createdAt = Number.isFinite(video.created_at)
      ? Math.floor(video.created_at)
      : null;
    if (createdAt !== null) {
      candidates.push(createdAt);
    }

    const existingValue = this.rootCreatedAtByRoot.get(rootId);
    if (Number.isFinite(existingValue)) {
      candidates.push(Math.floor(existingValue));
    }

    let earliest = null;
    for (const candidate of candidates) {
      if (!Number.isFinite(candidate)) {
        continue;
      }
      if (earliest === null || candidate < earliest) {
        earliest = candidate;
      }
    }

    if (earliest !== null) {
      this.rootCreatedAtByRoot.set(rootId, earliest);
      video.rootCreatedAt = earliest;
    } else if ("rootCreatedAt" in video) {
      delete video.rootCreatedAt;
    }

    const activeKey = getActiveKey(video);
    const activeVideo = this.activeMap.get(activeKey);
    if (activeVideo && activeVideo !== video && earliest !== null) {
      activeVideo.rootCreatedAt = earliest;
    }

    return earliest;
  }

  restoreSessionActorFromStorage() {
    const entry = readStoredSessionActorEntry();
    if (!entry) {
      this.lockedSessionActor = null;
      return null;
    }

    const { pubkey, privateKey, privateKeyEncrypted, encryption, createdAt } = entry;
    if (privateKey && HEX64_REGEX.test(privateKey)) {
      return {
        pubkey,
        privateKey: privateKey.toLowerCase(),
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      };
    }

    if (privateKeyEncrypted && encryption) {
      this.lockedSessionActor = {
        pubkey,
        privateKeyEncrypted,
        encryption,
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      };
    } else {
      this.lockedSessionActor = null;
    }

    return null;
  }

  getStoredSessionActorMetadata() {
    const entry = readStoredSessionActorEntry();
    if (!entry) {
      this.lockedSessionActor = null;
      return null;
    }

    const { pubkey, privateKeyEncrypted, encryption, createdAt, privateKey } = entry;
    const normalizedCreatedAt = Number.isFinite(createdAt)
      ? createdAt
      : Date.now();

    if (privateKeyEncrypted && encryption) {
      this.lockedSessionActor = {
        pubkey,
        privateKeyEncrypted,
        encryption,
        createdAt: normalizedCreatedAt,
      };
      return {
        pubkey,
        hasEncryptedKey: true,
        createdAt: normalizedCreatedAt,
      };
    }

    this.lockedSessionActor = null;

    if (privateKey) {
      return {
        pubkey,
        hasEncryptedKey: false,
        createdAt: normalizedCreatedAt,
      };
    }

    if (pubkey) {
      return {
        pubkey,
        hasEncryptedKey: false,
        createdAt: normalizedCreatedAt,
      };
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
      ((typeof actor.privateKey !== "string" || !actor.privateKey) &&
        (typeof actor.privateKeyEncrypted !== "string" ||
          !actor.privateKeyEncrypted))
    ) {
      return;
    }

    const createdAt = Number.isFinite(actor.createdAt)
      ? actor.createdAt
      : Date.now();

    const payload = {
      pubkey: actor.pubkey,
      createdAt,
    };

    if (typeof actor.privateKey === "string" && actor.privateKey) {
      payload.privateKey = actor.privateKey;
    } else if (
      typeof actor.privateKeyEncrypted === "string" &&
      actor.privateKeyEncrypted &&
      actor.encryption &&
      typeof actor.encryption === "object"
    ) {
      const normalizedEncryption = normalizeStoredEncryptionMetadata(
        actor.encryption,
      );
      if (!normalizedEncryption) {
        return;
      }
      payload.privateKeyEncrypted = actor.privateKeyEncrypted;
      payload.encryption = normalizedEncryption;
    } else {
      return;
    }

    try {
      localStorage.setItem(
        SESSION_ACTOR_STORAGE_KEY,
        JSON.stringify(payload)
      );
    } catch (error) {
      devLogger.warn("[nostr] Failed to persist session actor:", error);
    }
  }

  clearStoredSessionActor() {
    if (typeof localStorage === "undefined") {
      return;
    }
    try {
      localStorage.removeItem(SESSION_ACTOR_STORAGE_KEY);
    } catch (error) {
      devLogger.warn("[nostr] Failed to clear stored session actor:", error);
    }
  }

  mintSessionActor() {
    const tools = getCachedNostrTools();
    if (!tools) {
      devLogger.warn("[nostr] Cannot mint session actor without NostrTools.");
      return null;
    }

    const getPublicKey =
      typeof tools.getPublicKey === "function" ? tools.getPublicKey : null;
    if (!getPublicKey) {
      devLogger.warn(
        "[nostr] Cannot mint session actor: missing getPublicKey helper."
      );
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
      devLogger.warn("[nostr] Failed to mint session private key:", error);
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
      devLogger.warn("[nostr] Failed to derive session pubkey:", error);
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

  async derivePrivateKeyFromSecret(secret) {
    const trimmed = typeof secret === "string" ? secret.trim() : "";
    if (!trimmed) {
      throw new Error("A private key is required.");
    }

    const tools = (await ensureNostrTools()) || getCachedNostrTools();
    if (!tools) {
      throw new Error("Key derivation helpers are unavailable.");
    }

    let privateKey = "";
    const normalizedInput = trimmed.toLowerCase();

    if (HEX64_REGEX.test(trimmed)) {
      privateKey = trimmed.toLowerCase();
    } else if (normalizedInput.startsWith("nsec1") || normalizedInput.startsWith("sec1")) {
      const decoder = tools?.nip19?.decode;
      if (typeof decoder !== "function") {
        throw new Error("nsec decoding is unavailable.");
      }
      let decoded;
      try {
        decoded = decoder(trimmed);
      } catch (error) {
        const failure = new Error("Invalid nsec secret.");
        failure.cause = error;
        throw failure;
      }
      if (!decoded || (decoded.type !== "nsec" && decoded.type !== "sec")) {
        throw new Error("Unsupported nsec secret.");
      }
      if (typeof decoded.data === "string") {
        privateKey = decoded.data;
      } else if (decoded.data instanceof Uint8Array) {
        privateKey = bytesToHex(decoded.data);
      } else if (Array.isArray(decoded.data)) {
        privateKey = bytesToHex(Uint8Array.from(decoded.data));
      }
      if (!HEX64_REGEX.test(privateKey)) {
        throw new Error("Decoded private key is invalid.");
      }
      privateKey = privateKey.toLowerCase();
    } else if (trimmed.split(/\s+/).length >= 12) {
      const nip06 = tools?.nip06;
      if (!nip06 || typeof nip06.privateKeyFromSeedWords !== "function") {
        throw new Error("Seed word support is unavailable.");
      }
      try {
        privateKey = nip06.privateKeyFromSeedWords(trimmed);
      } catch (error) {
        const failure = new Error("Failed to derive a key from the provided seed words.");
        failure.cause = error;
        throw failure;
      }
      if (!HEX64_REGEX.test(privateKey)) {
        throw new Error("Derived private key is invalid.");
      }
      privateKey = privateKey.toLowerCase();
    } else {
      throw new Error(
        "Unsupported secret format. Provide a hex key, nsec, or mnemonic seed.",
      );
    }

    const getPublicKey =
      typeof tools.getPublicKey === "function" ? tools.getPublicKey : null;
    if (!getPublicKey) {
      throw new Error("Public key derivation is unavailable.");
    }

    let pubkey = "";
    try {
      pubkey = getPublicKey(privateKey);
    } catch (error) {
      const failure = new Error("Failed to derive the public key.");
      failure.cause = error;
      throw failure;
    }

    if (typeof pubkey !== "string" || !pubkey.trim()) {
      throw new Error("Derived public key is invalid.");
    }

    return { privateKey, pubkey: pubkey.trim() };
  }

  async registerPrivateKeySigner({
    privateKey,
    pubkey,
    persist = false,
    passphrase,
  } = {}) {
    const normalizedPrivateKey =
      typeof privateKey === "string" && HEX64_REGEX.test(privateKey)
        ? privateKey.toLowerCase()
        : "";

    if (!normalizedPrivateKey) {
      const error = new Error("A valid private key is required.");
      error.code = "invalid-private-key";
      throw error;
    }

    let normalizedPubkey =
      typeof pubkey === "string" && pubkey.trim() ? pubkey.trim() : "";
    if (!normalizedPubkey) {
      const tools = (await ensureNostrTools()) || getCachedNostrTools();
      const getPublicKey =
        tools && typeof tools.getPublicKey === "function"
          ? tools.getPublicKey
          : null;
      if (!getPublicKey) {
        throw new Error("Public key derivation is unavailable.");
      }
      try {
        normalizedPubkey = getPublicKey(normalizedPrivateKey);
      } catch (error) {
        const failure = new Error("Failed to derive the public key.");
        failure.cause = error;
        throw failure;
      }
    }

    if (!normalizedPubkey) {
      throw new Error("Unable to resolve the public key for this private key.");
    }

    this.sessionActor = {
      pubkey: normalizedPubkey,
      privateKey: normalizedPrivateKey,
      createdAt: Date.now(),
      source: "nsec",
      persisted: persist === true,
    };

    setActiveSigner({
      type: "nsec",
      pubkey: normalizedPubkey,
      signEvent: (event) => signEventWithPrivateKey(event, normalizedPrivateKey),
    });

    if (persist) {
      if (typeof passphrase !== "string" || !passphrase.trim()) {
        const error = new Error("A passphrase is required to remember this key.");
        error.code = "passphrase-required";
        throw error;
      }

      const encrypted = await encryptSessionPrivateKey(
        normalizedPrivateKey,
        passphrase,
      );

      const payload = {
        pubkey: normalizedPubkey,
        privateKeyEncrypted: encrypted.ciphertext,
        encryption: {
          version: encrypted.version,
          algorithm: encrypted.algorithm,
          iterations: encrypted.iterations,
          hash: encrypted.hash,
          salt: encrypted.salt,
          iv: encrypted.iv,
        },
        createdAt: this.sessionActor.createdAt,
      };

      this.lockedSessionActor = { ...payload };
      this.persistSessionActor(payload);
    } else {
      this.lockedSessionActor = null;
      this.clearStoredSessionActor();
    }

    return { pubkey: normalizedPubkey };
  }

  async unlockStoredSessionActor(passphrase) {
    if (typeof passphrase !== "string" || !passphrase.trim()) {
      const error = new Error("A passphrase is required to unlock the saved key.");
      error.code = "passphrase-required";
      throw error;
    }

    if (
      !this.lockedSessionActor ||
      !this.lockedSessionActor.privateKeyEncrypted ||
      !this.lockedSessionActor.encryption
    ) {
      const entry = readStoredSessionActorEntry();
      if (entry && entry.privateKeyEncrypted && entry.encryption) {
        this.lockedSessionActor = {
          pubkey: entry.pubkey,
          privateKeyEncrypted: entry.privateKeyEncrypted,
          encryption: entry.encryption,
          createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
        };
      }
    }

    const locked = this.lockedSessionActor;
    if (!locked || !locked.privateKeyEncrypted || !locked.encryption) {
      const error = new Error("No encrypted key is stored on this device.");
      error.code = "no-stored-key";
      throw error;
    }

    const decrypted = await decryptSessionPrivateKey(locked, passphrase);
    if (!HEX64_REGEX.test(decrypted)) {
      const error = new Error("The stored key could not be decrypted with this passphrase.");
      error.code = "decrypt-failed";
      throw error;
    }

    const normalizedPrivateKey = decrypted.toLowerCase();
    let normalizedPubkey =
      typeof locked.pubkey === "string" && locked.pubkey.trim()
        ? locked.pubkey.trim()
        : "";

    if (!normalizedPubkey) {
      const tools = (await ensureNostrTools()) || getCachedNostrTools();
      const getPublicKey =
        tools && typeof tools.getPublicKey === "function"
          ? tools.getPublicKey
          : null;
      if (!getPublicKey) {
        throw new Error("Public key derivation is unavailable.");
      }
      try {
        normalizedPubkey = getPublicKey(normalizedPrivateKey);
      } catch (error) {
        const failure = new Error("Failed to derive the public key.");
        failure.cause = error;
        throw failure;
      }
    }

    this.sessionActor = {
      pubkey: normalizedPubkey,
      privateKey: normalizedPrivateKey,
      createdAt: Number.isFinite(locked.createdAt) ? locked.createdAt : Date.now(),
      source: "nsec",
      persisted: true,
    };

    setActiveSigner({
      type: "nsec",
      pubkey: normalizedPubkey,
      signEvent: (event) => signEventWithPrivateKey(event, normalizedPrivateKey),
    });

    const storedPayload = {
      pubkey: normalizedPubkey,
      privateKeyEncrypted: locked.privateKeyEncrypted,
      encryption: locked.encryption,
      createdAt: Number.isFinite(locked.createdAt) ? locked.createdAt : Date.now(),
    };

    this.lockedSessionActor = { ...storedPayload };
    this.persistSessionActor(storedPayload);

    return { pubkey: normalizedPubkey };
  }

  async ensureSessionActor(forceRenew = false) {
    const normalizedLogged =
      typeof this.pubkey === "string" && this.pubkey
        ? this.pubkey.toLowerCase()
        : "";
    const activeSigner = resolveActiveSigner(this.pubkey);
    const canSignWithActiveSigner =
      !!normalizedLogged &&
      activeSigner &&
      typeof activeSigner.signEvent === "function";

    if (!forceRenew && canSignWithActiveSigner) {
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
        devLogger.warn("[nostr] Failed to parse cached events:", err);
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
          devLogger.warn("[nostr] Failed to remove legacy cache:", err);
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
        devLogger.warn("[nostr] Failed to clear expired cache:", err);
      }
      return false;
    }

    const events = payload.events;
    if (!events || typeof events !== "object") {
      return false;
    }

    this.allEvents.clear();
    this.rawEvents.clear();
    this.activeMap.clear();
    this.rootCreatedAtByRoot.clear();
    this.tombstones.clear();

    if (Array.isArray(payload.tombstones)) {
      for (const entry of payload.tombstones) {
        if (!Array.isArray(entry) || entry.length < 2) {
          continue;
        }
        const [key, value] = entry;
        const normalizedKey = typeof key === "string" ? key.trim() : "";
        const timestamp = Number.isFinite(value) ? Math.floor(value) : 0;
        if (normalizedKey && timestamp > 0) {
          this.tombstones.set(normalizedKey, timestamp);
        }
      }
    }

    for (const [id, video] of Object.entries(events)) {
      if (!id || !video || typeof video !== "object") {
        continue;
      }

      this.applyRootCreatedAt(video);
      const activeKey = getActiveKey(video);

      if (video.deleted) {
        this.recordTombstone(activeKey, video.created_at);
      } else {
        this.applyTombstoneGuard(video);
      }

      this.allEvents.set(id, video);
      if (video.deleted) {
        continue;
      }

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
      devLogger.warn("[nostr] Failed to read watch history storage:", error);
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
      devLogger.warn("[nostr] Failed to parse watch history storage:", error);
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
        devLogger.warn("[nostr] Failed to rewrite watch history storage:", error);
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
      devLogger.warn("[nostr] Failed to persist watch history entry:", error);
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
        devLogger.warn(
        `[nostr] Failed to notify watch history republish schedule for ${key}:`,
        error,
        );
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
          } else devLogger.warn(
 `[nostr] Watch history republish aborted for ${key}: max attempts reached.`,
 );
        } else {
          this.cancelWatchHistoryRepublish(key);
        }
      } catch (error) {
        devLogger.warn("[nostr] Watch history republish attempt failed:", error);
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
      devLogger.info(`[nostr] Watch history fingerprint changed for ${actorKey}.`);
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
        devLogger.warn("[nostr] Watch history background refresh failed:", error);
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
    const normalizedLogged = normalizeActorKey(this.pubkey);
    const signer = resolveActiveSigner(actorKey);
    const canUseActiveSignerSign =
      normalizedLogged &&
      normalizedLogged === actorKey &&
      signer &&
      typeof signer.signEvent === "function";
    const useActiveSignerEncrypt =
      canUseActiveSignerSign &&
      signer &&
      typeof signer.nip04Encrypt === "function";
    const activeSigner = canUseActiveSignerSign ? signer : null;
    const encryptionSigner = useActiveSignerEncrypt ? signer : null;

    if (
      (canUseActiveSignerSign || useActiveSignerEncrypt) &&
      shouldRequestExtensionPermissions(signer)
    ) {
      await this.ensureExtensionPermissions(DEFAULT_NIP07_PERMISSION_METHODS);
    }

    let privateKey = "";
    if (!canUseActiveSignerSign) {
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
      userLogger.warn(
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

    devLogger.info(
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

      devLogger.info(
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
        this.pool,
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
          acceptedCount === relays.length
            ? "accepted"
            : "partially accepted";
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
      userLogger.warn("[nostr] Failed to sign watch history pointer event:", error);
      return { ok: false, error: "signing-failed", retryable: false };
    }

    devLogger.info(
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

    devLogger.info("[nostr] Updating watch history list.", {
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

    const actorKeyIsHex = /^[0-9a-f]{64}$/.test(actorKey);

    const normalizedLogged = normalizeActorKey(this.pubkey);
    const signer = resolveActiveSigner(actorKey);
    const canUseActiveSignerDecrypt =
      normalizedLogged &&
      normalizedLogged === actorKey &&
      signer &&
      typeof signer.nip04Decrypt === "function";
    const decryptSigner = canUseActiveSignerDecrypt ? signer : null;

    if (decryptSigner && shouldRequestExtensionPermissions(decryptSigner)) {
      await this.ensureExtensionPermissions(DEFAULT_NIP07_PERMISSION_METHODS);
    }

    devLogger.info("[nostr] Fetching watch history from relays.", {
      actor: resolvedActor,
      forceRefresh: options.forceRefresh === true,
      });

    const existingEntry = this.watchHistoryCache.get(actorKey);
    const now = Date.now();
    const ttl = this.getWatchHistoryCacheTtlMs();

    const loadFromStorage = async () => {
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

    if (!this.pool) {
      userLogger.warn("[nostr] Cannot fetch watch history because relay pool is unavailable. Returning cached values.");
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
          authors: [actorKey],
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
        }
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
        const results = await this.pool.list(readRelays, chunkFilters);
        chunkEvents = Array.isArray(results)
          ? results
              .flat()
              .filter((event) => event && typeof event === "object")
          : [];
      } catch (error) {
        devLogger.warn("[nostr] Failed to fetch watch history chunks:", error);
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
        devLogger.info("[nostr] Loaded nostr-tools nip04 helpers for watch history decryption.");
        return cachedDecryptTools;
      }
      userLogger.warn("[nostr] Unable to load nostr-tools nip04 helpers for watch history decryption.");
      return null;
    };

    const decryptChunk = async (ciphertext, context = {}) => {
      if (!ciphertext || typeof ciphertext !== "string") {
        throw new Error("empty-ciphertext");
      }
      const ciphertextPreview = ciphertext.slice(0, 32);
      devLogger.info("[nostr] Attempting to decrypt watch history chunk.", {
        actorKey,
        chunkIdentifier: context.chunkIdentifier ?? null,
        eventId: context.eventId ?? null,
        ciphertextPreview,
        ciphertextFormat: "base64 NIP-04 ciphertext",
        expectedPlaintextFormat:
        "JSON string with { version, items, snapshot, chunkIndex, totalChunks }",
        });
      if (decryptSigner) {
        devLogger.info(
          "[nostr] Using active signer to decrypt watch history chunk.",
          {
            actorKey,
            chunkIdentifier: context.chunkIdentifier ?? null,
            eventId: context.eventId ?? null,
          },
        );
        const plaintext = await decryptSigner.nip04Decrypt(actorKey, ciphertext);
        devLogger.info(
          "[nostr] Successfully decrypted watch history chunk via active signer.",
          {
            actorKey,
            chunkIdentifier: context.chunkIdentifier ?? null,
            eventId: context.eventId ?? null,
          },
        );
        return plaintext;
      }
      if (!this.sessionActor || this.sessionActor.pubkey !== actorKey) {
        devLogger.info(
          "[nostr] Session actor mismatch while decrypting watch history chunk. Ensuring session actor matches requested key.",
          {
          actorKey,
          chunkIdentifier: context.chunkIdentifier ?? null,
          eventId: context.eventId ?? null,
          currentSessionActor: this.sessionActor?.pubkey ?? null,
          },
        );
        await this.ensureSessionActor();
      }
      if (!this.sessionActor || this.sessionActor.pubkey !== actorKey) {
        userLogger.error(
          "[nostr] Watch history decrypt failed: session actor key unavailable after ensure.",
          {
          actorKey,
          chunkIdentifier: context.chunkIdentifier ?? null,
          eventId: context.eventId ?? null,
          currentSessionActor: this.sessionActor?.pubkey ?? null,
          },
        );
        throw new Error("missing-session-key");
      }
      const tools = await ensureDecryptTools();
      if (!tools?.nip04 || typeof tools.nip04.decrypt !== "function") {
        userLogger.error(
          "[nostr] Watch history decrypt failed: nip04 helpers unavailable.",
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
        sessionActor: this.sessionActor?.pubkey ?? null,
        },
      );
      const plaintext = await tools.nip04.decrypt(
        this.sessionActor.privateKey,
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
          userLogger.error("[nostr] Decrypt failed for watch history chunk. Falling back to pointer items.", {
            actorKey,
            ...chunkContext,
            error: error?.message || error,
            ciphertextPreview,
            fallbackPointerCount: Array.isArray(fallbackPointers)
            ? fallbackPointers.length
            : 0,
            expectedPlaintextFormat:
            "JSON string with { version, items, snapshot, chunkIndex, totalChunks }",
            });
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

    devLogger.info("[nostr] Resolving watch history for actor.", {
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
      devLogger.warn("[nostr] Failed to list video view events:", error);
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
      devLogger.warn("[nostr] Unable to subscribe to view events: pool missing.");
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
      devLogger.warn("[nostr] Failed to open video view subscription:", error);
      return () => {};
    }

    if (onEvent) {
      subscription.on("event", (event) => {
        if (isVideoViewEvent(event, pointerDescriptor)) {
          try {
            onEvent(event);
          } catch (error) {
            devLogger.warn("[nostr] Video view event handler threw:", error);
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
          devLogger.warn(
            "[nostr] Failed to unsubscribe from video view events:",
            error
          );
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
      devLogger.warn("[nostr] COUNT view request failed:", error);
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
      devLogger.info("[nostr] Skipping duplicate view publish for scope", guardScope);
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
        devLogger.warn(
          "[nostr] Failed to serialize custom view event content:",
          error
        );
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
        devLogger.warn(
          "[nostr] Failed to serialize default view event content:",
          error
        );
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

    const signer = resolveActiveSigner(actorPubkey);
    const canUseActiveSigner =
      normalizedActor &&
      normalizedActor === normalizedLogged &&
      signer &&
      typeof signer.signEvent === "function";

    if (canUseActiveSigner) {
      let permissionResult = { ok: true };
      if (shouldRequestExtensionPermissions(signer)) {
        permissionResult = await this.ensureExtensionPermissions(
          DEFAULT_NIP07_PERMISSION_METHODS,
        );
      }
      if (permissionResult.ok) {
        try {
          signedEvent = await signer.signEvent(event);
        } catch (error) {
          userLogger.warn(
            "[nostr] Failed to sign view event with active signer:",
            error,
          );
          return { ok: false, error: "signing-failed", details: error };
        }
      } else {
        userLogger.warn(
          "[nostr] Active signer permissions missing; signing view event with session key.",
          permissionResult.error,
        );
      }
    }

    if (!signedEvent) {
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
        userLogger.warn("[nostr] Failed to sign view event with session key:", error);
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
      devLogger.info(
        `[nostr] View event accepted by ${acceptedRelays.length} relay(s):`,
        acceptedRelays.join(", ")
      );
    } else {
      userLogger.warn("[nostr] View event rejected by relays:", publishResults);
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
        devLogger.warn(
          "[nostr] Failed to ingest optimistic view event:",
          error
        );
      }
    }

    return view;
  }

  /**
   * Connect to the configured relays
   */
  async init() {
    devLogger.log("Connecting to relays...");

    this.restoreLocalData();

    try {
      this.scheduleStoredRemoteSignerRestore();
    } catch (error) {
      devLogger.warn("[nostr] Failed to schedule remote signer restoration:", error);
    }

    try {
      await this.ensurePool();
      const results = await this.connectToRelays();
      const successfulRelays = results
        .filter((r) => r.success)
        .map((r) => r.url);
      if (successfulRelays.length === 0) {
        throw new Error("No relays connected");
      }
      devLogger.log(
        `Connected to ${successfulRelays.length} relay(s)`,
      );
    } catch (err) {
      userLogger.error("Nostr init failed:", err);
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
      if (tools && typeof tools === "object") {
        const availableKeys = Object.keys(tools).join(", ");
        devLogger.warn(
          "[nostr] NostrTools helpers did not expose SimplePool. Available keys:",
          availableKeys
        );
      } else {
        userLogger.warn(
          "[nostr] NostrTools helpers were unavailable. Check that nostr-tools bundles can load on this domain."
        );
      }
      if (nostrToolsBootstrapFailure) {
        userLogger.warn(
          "[nostr] nostr-tools bootstrap failure details:",
          nostrToolsBootstrapFailure
        );
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
        devLogger.log("No Nostr extension found");
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

      const permissionResult = await this.ensureExtensionPermissions(
        DEFAULT_NIP07_PERMISSION_METHODS,
      );
      if (!permissionResult.ok) {
        const denialMessage =
          'The NIP-07 extension reported "permission denied". Please approve the prompt and try again.';
        const denialError = new Error(denialMessage);
        if (permissionResult.error) {
          denialError.cause = permissionResult.error;
        }
        throw denialError;
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

      devLogger.log("Got pubkey:", pubkey);
              devLogger.log("Converted to npub:", npub);
              devLogger.log("Whitelist:", accessControl.getWhitelist());
              devLogger.log("Blacklist:", accessControl.getBlacklist());
      // Access control
      if (!accessControl.canAccess(npub)) {
        if (accessControl.isBlacklisted(npub)) {
          throw new Error("Your account has been blocked on this platform.");
        } else {
          throw new Error("Access restricted to admins and moderators users only.");
        }
      }
      this.pubkey = pubkey;
      devLogger.log("Logged in with extension. Pubkey:", this.pubkey);

      setActiveSigner({
        type: "extension",
        pubkey,
        signEvent:
          typeof extension.signEvent === "function"
            ? extension.signEvent.bind(extension)
            : null,
        nip04: extension.nip04,
        nip44: extension.nip44,
      });

      const postLoginPermissions = await this.ensureExtensionPermissions(
        DEFAULT_NIP07_PERMISSION_METHODS,
      );
      if (!postLoginPermissions.ok && postLoginPermissions.error) {
        userLogger.warn(
          "[nostr] Extension permissions were not fully granted after login:",
          postLoginPermissions.error,
        );
      }
      return this.pubkey;
    } catch (err) {
      userLogger.error("Login error:", err);
      throw err;
    }
  }

  logout() {
    this.pubkey = null;
    clearActiveSigner();
    const previousSessionActor = this.sessionActor;
    this.sessionActor = null;

    if (this.nip46Client) {
      Promise.resolve()
        .then(() => this.disconnectRemoteSigner({ keepStored: true }))
        .catch((error) => {
          devLogger.warn(
            "[nostr] Failed to disconnect remote signer during logout:",
            error,
          );
        });
    }

    const shouldClearStoredSession =
      previousSessionActor &&
      previousSessionActor.source === "nsec" &&
      previousSessionActor.persisted !== true;

    if (shouldClearStoredSession) {
      this.lockedSessionActor = null;
      this.clearStoredSessionActor();
    }

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
    if (
      this.extensionPermissionCache &&
      typeof this.extensionPermissionCache.clear === "function"
    ) {
      this.extensionPermissionCache.clear();
    }
    clearStoredNip07Permissions();
    devLogger.log("User logged out.");
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

    const activeSignerCandidate =
      typeof actorPubkeyOverride === "string" && actorPubkeyOverride.trim()
        ? resolveActiveSigner(actorPubkeyOverride)
        : resolveActiveSigner(this.pubkey);
    const baseActiveSigner = activeSignerCandidate || getActiveSigner();
    const signer =
      typeof actorPubkeyOverride === "string" && actorPubkeyOverride.trim()
        ? activeSignerCandidate
        : baseActiveSigner
        ? resolveActiveSigner(baseActiveSigner.pubkey || this.pubkey)
        : null;

    if (!signer || typeof signer.signEvent !== "function") {
      return { ok: false, error: "sign-event-unavailable" };
    }

    if (typeof signer.nip04Encrypt !== "function") {
      return { ok: false, error: "nip04-unavailable" };
    }

    if (shouldRequestExtensionPermissions(signer)) {
      const permissionResult = await this.ensureExtensionPermissions(
        DEFAULT_NIP07_PERMISSION_METHODS,
      );
      if (!permissionResult.ok) {
        userLogger.warn(
          "[nostr] Cannot send direct message without extension permissions.",
          permissionResult.error,
        );
        return {
          ok: false,
          error: "extension-permission-denied",
          details: permissionResult.error,
        };
      }
    }

    let actorHex =
      typeof actorPubkeyOverride === "string" && actorPubkeyOverride.trim()
        ? actorPubkeyOverride.trim()
        : "";

    if (!actorHex && typeof this.pubkey === "string") {
      actorHex = this.pubkey.trim();
    }

    if (!actorHex && typeof signer?.pubkey === "string") {
      actorHex = signer.pubkey;
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
      ciphertext = await signer.nip04Encrypt(targetHex, trimmedMessage);
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
      signedEvent = await signer.signEvent(event);
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
      relaysOverride = null,
    } = {}
  ) {
    const normalizedEventPubkey =
      event && typeof event.pubkey === "string"
        ? event.pubkey.toLowerCase()
        : "";
    const normalizedLogged =
      typeof this.pubkey === "string" ? this.pubkey.toLowerCase() : "";
    const usingSessionActor =
      normalizedEventPubkey &&
      normalizedLogged &&
      normalizedEventPubkey !== normalizedLogged;

    const signer = resolveActiveSigner(normalizedEventPubkey || this.pubkey);
    const canUseActiveSigner =
      !usingSessionActor &&
      signer &&
      typeof signer.signEvent === "function";

    let eventToSign = event;
    let signedEvent = null;
    let signerPubkey = null;

    if (canUseActiveSigner) {
      let permissionResult = { ok: true };
      if (shouldRequestExtensionPermissions(signer)) {
        permissionResult = await this.ensureExtensionPermissions(
          DEFAULT_NIP07_PERMISSION_METHODS,
        );
      }
      if (permissionResult.ok) {
        try {
          signedEvent = await signer.signEvent(event);
        } catch (error) {
          userLogger.warn(
            "[nostr] Failed to sign event with active signer:",
            error,
          );
        }
      } else {
        userLogger.warn(
          "[nostr] Active signer permissions missing; falling back to session signer.",
          permissionResult.error,
        );
      }
    }

    if (!signedEvent) {
      try {
        const currentSessionPubkey =
          typeof this.sessionActor?.pubkey === "string"
            ? this.sessionActor.pubkey.toLowerCase()
            : "";

        if (
          usingSessionActor &&
          normalizedEventPubkey &&
          normalizedEventPubkey !== currentSessionPubkey
        ) {
          await this.ensureSessionActor(true);
        } else {
          await this.ensureSessionActor();
        }

        const sessionActor = this.sessionActor;
        if (
          !sessionActor ||
          typeof sessionActor.pubkey !== "string" ||
          !sessionActor.pubkey ||
          typeof sessionActor.privateKey !== "string" ||
          !sessionActor.privateKey
        ) {
          throw new Error("session-actor-unavailable");
        }

        const normalizedSessionPubkey = sessionActor.pubkey.toLowerCase();
        if (
          !normalizedEventPubkey ||
          normalizedEventPubkey !== normalizedSessionPubkey ||
          event.pubkey !== sessionActor.pubkey
        ) {
          eventToSign = { ...event, pubkey: sessionActor.pubkey };
        }

        signedEvent = signEventWithPrivateKey(
          eventToSign,
          sessionActor.privateKey
        );
        signerPubkey = sessionActor.pubkey;
      } catch (error) {
        userLogger.warn("[nostr] Failed to sign event with session key:", error);
        throw error;
      }
    }

      if (!signerPubkey && signedEvent && typeof signedEvent.pubkey === "string") {
        signerPubkey = signedEvent.pubkey;
      }

      devLogger.log(`Signed ${devLogLabel} event:`, signedEvent);

    let targetRelays = sanitizeRelayList(
      Array.isArray(relaysOverride) && relaysOverride.length
        ? relaysOverride
        : Array.isArray(this.writeRelays) && this.writeRelays.length
        ? this.writeRelays
        : this.relays
    );

    if (!targetRelays.length) {
      targetRelays = Array.from(RELAY_URLS);
    }

    const publishResults = await publishEventToRelays(
      this.pool,
      targetRelays,
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
            const logFn = logLevel === "warn" ? userLogger.warn : userLogger.error;
            logFn(
              `[nostr] ${logName} rejected by ${url}: ${reason}`,
              relayError || reason
            );
          }
        );
      }
      throw publishError;
    }

    publishSummary.accepted.forEach(({ url }) => {
      devLogger.log(`${logName} published to ${url}`);
    });

    if (publishSummary.failed.length) {
      publishSummary.failed.forEach(({ url, error: relayError }) => {
        const reason =
          relayError instanceof Error
            ? relayError.message
            : relayError
            ? String(relayError)
            : "publish failed";
        userLogger.warn(
          `[nostr] ${logName} not accepted by ${url}: ${reason}`,
          relayError
        );
      });
    }

    return {
      signedEvent,
      summary: publishSummary,
      signerPubkey,
      relays: targetRelays,
    };
  }

  async publishVideo(videoPayload, pubkey) {
    if (!pubkey) throw new Error("Not logged in to publish video.");

    const { videoData, nip71Metadata } = extractVideoPublishPayload(videoPayload);

    // NOTE: Keep the Upload, Edit, and Revert flows synchronized when
    // updating shared fields. Changes here must be reflected in the modal
    // controllers and revert helpers so all paths stay in lockstep.
    devLogger.log("Publishing new video with data:", videoData);
    if (nip71Metadata) {
    devLogger.log("Including NIP-71 metadata:", nip71Metadata);
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
    const finalIsNsfw = videoData.isNsfw === true;
    const finalIsForKids =
      videoData.isForKids === true && !finalIsNsfw;
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
      isNsfw: finalIsNsfw,
      isForKids: finalIsForKids,
      enableComments: finalEnableComments,
    };

    if (finalWs) {
      contentObject.ws = finalWs;
    }

    if (finalXs) {
      contentObject.xs = finalXs;
    }

    const nip71Tags = buildNip71MetadataTags(
      nip71Metadata && typeof nip71Metadata === "object" ? nip71Metadata : null
    );

    const event = buildVideoPostEvent({
      pubkey,
      created_at: createdAt,
      dTagValue,
      content: contentObject,
      additionalTags: nip71Tags,
    });

    devLogger.log("Publish event with brand-new root:", videoRootId);
          devLogger.log("Event content:", event.content);

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

        devLogger.log("Prepared NIP-94 mirror event:", mirrorEvent);

        try {
          await this.signAndPublishEvent(mirrorEvent, {
            context: "NIP-94 mirror",
            logName: "NIP-94 mirror",
            devLogLabel: "NIP-94 mirror",
            rejectionLogLevel: "warn",
          });

          devLogger.log(
            "NIP-94 mirror dispatched for hosted URL:",
            finalUrl
          );
        } catch (mirrorError) {
          devLogger.warn(
            "[nostr] NIP-94 mirror rejected by all relays:",
            mirrorError
          );
        }
      } else devLogger.log("Skipping NIP-94 mirror: no hosted URL provided.");
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
          isNsfw: contentObject.isNsfw,
          isForKids: contentObject.isForKids,
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
          userLogger.warn(
            "[nostr] Failed to publish NIP-71 metadata for edit:",
            nip71Error
          );
        }
      }

      return signedEvent;
    } catch (err) {
      devLogger.error("Failed to sign/publish:", err);
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
      devLogger.log("[nostr] Skipping NIP-71 publish: metadata missing.");
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
      devLogger.warn("[nostr] Skipping NIP-71 publish: builder produced no event.");
      return null;
    }

    devLogger.log("Prepared NIP-71 video event:", event);

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
    const wantNsfw = updatedData.isNsfw ?? baseEvent.isNsfw ?? false;
    const wantForKids = updatedData.isForKids ?? baseEvent.isForKids ?? false;
    const finalIsNsfw = wantNsfw === true;
    const finalIsForKids = finalIsNsfw ? false : wantForKids === true;

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
      isNsfw: finalIsNsfw,
      isForKids: finalIsForKids,
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

    let metadataForTags =
      nip71Metadata && typeof nip71Metadata === "object" ? nip71Metadata : null;
    if (!metadataForTags) {
      if (baseEvent?.nip71 && typeof baseEvent.nip71 === "object") {
        metadataForTags = baseEvent.nip71;
      } else {
        const extracted = extractNip71MetadataFromTags(baseEvent);
        if (extracted?.metadata) {
          metadataForTags = extracted.metadata;
        }
      }
    }

    const nip71Tags = buildNip71MetadataTags(metadataForTags);

    const event = buildVideoPostEvent({
      pubkey: userPubkeyLower,
      created_at: Math.floor(Date.now() / 1000),
      dTagValue: newD,
      content: contentObject,
      additionalTags: nip71Tags,
    });

    devLogger.log("Creating edited event with root ID:", oldRootId);
          devLogger.log("Event content:", event.content);

    const signer = resolveActiveSigner(userPubkeyLower);
    if (!signer || typeof signer.signEvent !== "function") {
      const error = new Error(
        "An active signer with signEvent support is required to edit videos.",
      );
      error.code = "nostr-extension-missing";
      throw error;
    }

    if (shouldRequestExtensionPermissions(signer)) {
      const permissionResult = await this.ensureExtensionPermissions(
        DEFAULT_NIP07_PERMISSION_METHODS,
      );
      if (!permissionResult.ok) {
        userLogger.warn(
          "[nostr] Signer permissions denied while editing a video.",
          permissionResult.error,
        );
        const error = new Error(
          "The active signer must grant decrypt and sign permissions before editing a video.",
        );
        error.code = "extension-permission-denied";
        error.cause = permissionResult.error;
        throw error;
      }
    }

    try {
      const signedEvent = await signer.signEvent(event);
      devLogger.log("Signed edited event:", signedEvent);

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
              userLogger.error(
                `[nostr] Edited video rejected by ${url}: ${reason}`,
                relayError || reason
              );
            }
          );
        }
        throw publishError;
      }

      publishSummary.accepted.forEach(({ url }) =>
        devLogger.log(`Edited video published to ${url}`)
      );

      if (publishSummary.failed.length) {
        publishSummary.failed.forEach(({ url, error: relayError }) => {
          const reason =
            relayError instanceof Error
              ? relayError.message
              : relayError
              ? String(relayError)
              : "publish failed";
          userLogger.warn(
            `[nostr] Edited video not accepted by ${url}: ${reason}`,
            relayError
          );
        });
      }

      return signedEvent;
    } catch (err) {
      userLogger.error("Edit failed:", err);
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
            isNsfw: fetched.isNsfw,
            isForKids: fetched.isForKids,
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
      devLogger.warn("[nostr] Failed to parse baseEvent.content while reverting:", err);
      oldContent = {};
    }
    const oldVersion = oldContent.version ?? 1;

    const finalRootId =
      oldContent.videoRootId ||
      (existingD
        ? `LEGACY:${baseEvent.pubkey}:${existingD}`
        : baseEvent.id);

    const oldIsNsfw = oldContent.isNsfw === true;
    const oldIsForKids = oldContent.isForKids === true && !oldIsNsfw;

    const contentObject = {
      videoRootId: finalRootId,
      version: oldVersion,
      deleted: true,
      isPrivate: oldContent.isPrivate ?? false,
      isNsfw: oldIsNsfw,
      isForKids: oldIsForKids,
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

    const signer = resolveActiveSigner(pubkey);
    if (!signer || typeof signer.signEvent !== "function") {
      const error = new Error(
        "An active signer with signEvent support is required to revert videos.",
      );
      error.code = "nostr-extension-missing";
      throw error;
    }

    if (shouldRequestExtensionPermissions(signer)) {
      const permissionResult = await this.ensureExtensionPermissions(
        DEFAULT_NIP07_PERMISSION_METHODS,
      );
      if (!permissionResult.ok) {
        userLogger.warn(
          "[nostr] Signer permissions denied while reverting a video.",
          permissionResult.error,
        );
        const error = new Error(
          "The active signer must grant decrypt and sign permissions before reverting a video.",
        );
        error.code = "extension-permission-denied";
        error.cause = permissionResult.error;
        throw error;
      }
    }

    const signedEvent = await signer.signEvent(event);
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
            userLogger.error(
              `[nostr] Video revert rejected by ${url}: ${reason}`,
              relayError || reason
            );
          }
        );
      }
      throw publishError;
    }

    publishSummary.accepted.forEach(({ url }) =>
      devLogger.log(`Revert event published to ${url}`)
    );

    if (publishSummary.failed.length) {
      publishSummary.failed.forEach(({ url, error: relayError }) => {
        const reason =
          relayError instanceof Error
            ? relayError.message
            : relayError
            ? String(relayError)
            : "publish failed";
        userLogger.warn(
          `[nostr] Video revert not accepted by ${url}: ${reason}`,
          relayError
        );
      });
    }

    return {
      event: signedEvent,
      publishResults,
      summary: publishSummary,
    };
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
    const targetVideo =
      options && typeof options.video === "object" ? options.video : null;
    let confirmed = true;

    if (shouldConfirm && typeof window?.confirm === "function") {
      confirmed = window.confirm(
        "Are you sure you want to delete all versions of this video? This action cannot be undone."
      );
    }

    if (!confirmed) {
      devLogger.log("Deletion cancelled by user.");
      return null; // Cancel deletion if user clicks "Cancel"
    }

    const normalizedPubkey = typeof pubkey === "string" ? pubkey.toLowerCase() : "";
    const normalizedRootInput =
      typeof videoRootId === "string" && videoRootId.trim().length
        ? videoRootId.trim()
        : "";
    const inferredRoot =
      normalizedRootInput ||
      (targetVideo && typeof targetVideo.videoRootId === "string"
        ? targetVideo.videoRootId.trim()
        : "");
    const targetDTag = targetVideo ? getDTagValueFromTags(targetVideo.tags) : "";

    if (targetVideo) {
      try {
        await this.hydrateVideoHistory(targetVideo);
      } catch (error) {
        devLogger.warn(
          "[nostr] Failed to hydrate video history before delete:",
          error
        );
      }
    }

    const matchingEvents = new Map();
    for (const candidate of this.allEvents.values()) {
      if (!candidate || typeof candidate !== "object") {
        continue;
      }
      const candidatePubkey =
        typeof candidate.pubkey === "string" ? candidate.pubkey.toLowerCase() : "";
      if (!candidatePubkey || candidatePubkey !== normalizedPubkey) {
        continue;
      }

      if (candidate.deleted === true) {
        continue;
      }

      const candidateRoot =
        typeof candidate.videoRootId === "string" ? candidate.videoRootId : "";
      const candidateDTag = getDTagValueFromTags(candidate.tags);
      const sameRoot = inferredRoot && candidateRoot === inferredRoot;
      const sameD = targetDTag && candidateDTag === targetDTag;
      const legacyMatch =
        !inferredRoot &&
        targetVideo &&
        candidateRoot &&
        candidateRoot === targetVideo.id;
      const directMatch = targetVideo && candidate.id === targetVideo.id;

      if (!sameRoot && !sameD && !legacyMatch && !directMatch) {
        continue;
      }

      matchingEvents.set(candidate.id, candidate);
    }

    if (targetVideo && !matchingEvents.has(targetVideo.id)) {
      matchingEvents.set(targetVideo.id, targetVideo);
    }

    if (!matchingEvents.size) {
      throw new Error("No existing events found for that root.");
    }

    const revertSummaries = [];
    const revertEvents = [];

    for (const vid of matchingEvents.values()) {
      const baseRoot =
        (typeof vid.videoRootId === "string" && vid.videoRootId) ||
        inferredRoot ||
        (targetVideo && typeof targetVideo.videoRootId === "string"
          ? targetVideo.videoRootId
          : "") ||
        (targetVideo ? targetVideo.id : "") ||
        vid.id;

      const contentPayload = {
        version: Number.isFinite(vid.version) ? vid.version : 3,
        deleted: true,
        isPrivate: vid.isPrivate === true,
        isNsfw: vid.isNsfw === true,
        isForKids: vid.isForKids === true && vid.isNsfw !== true,
        title: typeof vid.title === "string" ? vid.title : "",
        url: typeof vid.url === "string" ? vid.url : "",
        magnet: typeof vid.magnet === "string" ? vid.magnet : "",
        thumbnail: typeof vid.thumbnail === "string" ? vid.thumbnail : "",
        description: typeof vid.description === "string" ? vid.description : "",
        mode: typeof vid.mode === "string" ? vid.mode : "live",
        videoRootId: baseRoot,
      };

      const revertResult = await this.revertVideo(
        {
          id: vid.id,
          pubkey: vid.pubkey,
          content: JSON.stringify(contentPayload),
          tags: Array.isArray(vid.tags) ? vid.tags : [],
        },
        pubkey
      );

      const revertEvent = revertResult?.event || null;
      const revertSummary =
        revertResult?.summary ||
        summarizePublishResults(revertResult?.publishResults || []);
      const revertPublishResults = Array.isArray(revertResult?.publishResults)
        ? revertResult.publishResults
        : [];

      revertSummaries.push({
        targetId: vid.id || "",
        event: revertEvent,
        publishResults: revertPublishResults,
        summary: revertSummary,
      });

      if (revertEvent?.id) {
        revertEvents.push(revertEvent);
        this.rawEvents.set(revertEvent.id, revertEvent);
      }

      const cached = this.allEvents.get(vid.id) || vid;
      cached.deleted = true;
      cached.url = "";
      cached.magnet = "";
      cached.thumbnail = "";
      cached.description = "This version was deleted by the creator.";
      cached.videoRootId = baseRoot;
      this.allEvents.set(vid.id, cached);

      const activeKey = getActiveKey(cached);
      if (activeKey) {
        this.activeMap.delete(activeKey);
        const revertCreatedAt = Number.isFinite(revertEvent?.created_at)
          ? Math.floor(revertEvent.created_at)
          : Math.floor(Date.now() / 1000);
        this.recordTombstone(activeKey, revertCreatedAt);
      }
    }

    const eventIdSet = new Set();
    const addressPointerSet = new Set();

    const collectIdentifiersFromEvent = (eventLike) => {
      if (!eventLike || typeof eventLike !== "object") {
        return;
      }

      const eventId = typeof eventLike.id === "string" ? eventLike.id : "";
      if (eventId) {
        eventIdSet.add(eventId);
      }

      const pointerSources = [];
      if (eventLike.kind && Array.isArray(eventLike.tags)) {
        pointerSources.push(eventLike);
      }
      if (eventId) {
        const raw = this.rawEvents.get(eventId);
        if (raw && raw !== eventLike) {
          pointerSources.push(raw);
        }
      }

      for (const source of pointerSources) {
        const pointer = eventToAddressPointer(source);
        if (pointer) {
          addressPointerSet.add(pointer);
        }
      }
    };

    matchingEvents.forEach((event) => collectIdentifiersFromEvent(event));
    revertEvents.forEach((event) => collectIdentifiersFromEvent(event));
    if (targetVideo) {
      collectIdentifiersFromEvent(targetVideo);
    }

    const identifierRecords = [];
    eventIdSet.forEach((value) => {
      identifierRecords.push({ type: "e", value });
    });
    addressPointerSet.forEach((value) => {
      identifierRecords.push({ type: "a", value });
    });

    const deleteSummaries = [];
    if (identifierRecords.length) {
      const signer = resolveActiveSigner(pubkey);
      if (!signer || typeof signer.signEvent !== "function") {
        const error = new Error(
          "An active signer with signEvent support is required to delete videos.",
        );
        error.code = "nostr-extension-missing";
        throw error;
      }

      if (shouldRequestExtensionPermissions(signer)) {
        const permissionResult = await this.ensureExtensionPermissions(
          DEFAULT_NIP07_PERMISSION_METHODS,
        );
        if (!permissionResult.ok) {
          userLogger.warn(
            "[nostr] Signer permissions denied while deleting videos.",
            permissionResult.error,
          );
          const error = new Error(
            "The active signer must grant decrypt and sign permissions before deleting a video.",
          );
          error.code = "extension-permission-denied";
          error.cause = permissionResult.error;
          throw error;
        }
      }

      const chunkSize = 100;
      for (let index = 0; index < identifierRecords.length; index += chunkSize) {
        const chunk = identifierRecords.slice(index, index + chunkSize);
        const deleteTags = chunk.map((record) => [record.type, record.value]);

        const deleteEvent = {
          kind: 5,
          pubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: deleteTags,
          content: inferredRoot
            ? `Delete video root ${inferredRoot}`
            : "Delete published video events",
        };

        const signedDelete = await signer.signEvent(deleteEvent);
        const publishResults = await publishEventToRelays(
          this.pool,
          this.relays,
          signedDelete,
        );
        const publishSummary = summarizePublishResults(publishResults);

        publishSummary.accepted.forEach(({ url }) =>
          devLogger.log(`Delete event published to ${url}`),
        );

        if (publishSummary.failed.length) {
          publishSummary.failed.forEach(({ url, error: relayError }) => {
            const reason =
              relayError instanceof Error
                ? relayError.message
                : relayError
                ? String(relayError)
                : "publish failed";
            userLogger.warn(
              `[nostr] Delete event not accepted by ${url}: ${reason}`,
              relayError,
            );
          });
        }

        if (signedDelete?.id) {
          this.rawEvents.set(signedDelete.id, signedDelete);
        }

        deleteSummaries.push({
          event: signedDelete,
          publishResults,
          summary: publishSummary,
          identifiers: {
            events: chunk
              .filter((record) => record.type === "e")
              .map((record) => record.value),
            addresses: chunk
              .filter((record) => record.type === "a")
              .map((record) => record.value),
          },
        });
      }
    }

    this.saveLocalData();

    return {
      reverts: revertSummaries,
      deletes: deleteSummaries,
    };
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
      tombstones: Array.from(this.tombstones.entries()),
    };

    for (const [id, vid] of this.allEvents.entries()) {
      payload.events[id] = vid;
    }

    try {
      localStorage.setItem(EVENTS_CACHE_STORAGE_KEY, JSON.stringify(payload));
      localStorage.removeItem(LEGACY_EVENTS_STORAGE_KEY);
    } catch (err) {
      devLogger.warn("[nostr] Failed to persist events cache:", err);
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

    devLogger.log("[subscribeVideos] Subscribing with filter:", filter);

    const sub = this.pool.sub(this.relays, [filter]);
    const invalidDuringSub = [];

    // We'll collect events here instead of processing them instantly
    let eventBuffer = [];
    const EVENT_FLUSH_DEBOUNCE_MS = 75;
    let flushTimerId = null;

    const flushEventBuffer = () => {
      if (!eventBuffer.length) {
        return;
      }

      const toProcess = eventBuffer;
      eventBuffer = [];

      for (const evt of toProcess) {
        try {
          if (evt && evt.id) {
            this.rawEvents.set(evt.id, evt);
          }
          const video = convertEventToVideo(evt);

          if (video.invalid) {
            invalidDuringSub.push({ id: video.id, reason: video.reason });
            continue;
          }

          this.mergeNip71MetadataIntoVideo(video);
          this.applyRootCreatedAt(video);

          const activeKey = getActiveKey(video);
          const wasDeletedEvent = video.deleted === true;

          if (wasDeletedEvent) {
            this.recordTombstone(activeKey, video.created_at);
          } else {
            this.applyTombstoneGuard(video);
          }

          // Store in allEvents
          this.allEvents.set(evt.id, video);

          // If it's a "deleted" note, remove from activeMap
          if (video.deleted) {
            if (activeKey) {
              if (wasDeletedEvent) {
                this.activeMap.delete(activeKey);
              } else {
                const currentActive = this.activeMap.get(activeKey);
                if (currentActive?.id === video.id) {
                  this.activeMap.delete(activeKey);
                }
              }
            }
            continue;
          }

          // Otherwise, if it's newer than what we have, update activeMap
          const prevActive = this.activeMap.get(activeKey);
          if (!prevActive || video.created_at > prevActive.created_at) {
            this.activeMap.set(activeKey, video);
            onVideo(video); // Trigger the callback that re-renders
            this.populateNip71MetadataForVideos([video])
              .then(() => {
                this.applyRootCreatedAt(video);
              })
              .catch((error) => {
                devLogger.warn(
                  "[nostr] Failed to hydrate NIP-71 metadata for live video:",
                  error
                );
              });
          }
        } catch (err) {
          devLogger.error("[subscribeVideos] Error processing event:", err);
        }
      }

      // Persist processed events after each flush so reloads warm quickly.
      this.saveLocalData();
    };

    const scheduleFlush = (immediate = false) => {
      if (flushTimerId) {
        if (!immediate) {
          return;
        }
        clearTimeout(flushTimerId);
        flushTimerId = null;
      }

      if (immediate) {
        flushEventBuffer();
        return;
      }

      flushTimerId = setTimeout(() => {
        flushTimerId = null;
        flushEventBuffer();
      }, EVENT_FLUSH_DEBOUNCE_MS);
    };

    // 1) On each incoming event, just push to the buffer and schedule a flush
    sub.on("event", (event) => {
      eventBuffer.push(event);
      scheduleFlush(false);
    });

    // You can still use sub.on("eose") if needed
    sub.on("eose", () => {
      if (isDevMode && invalidDuringSub.length > 0) {
        userLogger.warn(
          `[subscribeVideos] found ${invalidDuringSub.length} invalid video notes (with reasons):`,
          invalidDuringSub
        );
      }
      devLogger.log(
        "[subscribeVideos] Reached EOSE for all relays (historical load done)"
      );
      scheduleFlush(true);
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
      if (flushTimerId) {
        clearTimeout(flushTimerId);
        flushTimerId = null;
      }
      // Ensure any straggling events are flushed before tearing down.
      flushEventBuffer();
      try {
        return originalUnsub();
      } catch (err) {
        userLogger.error("[subscribeVideos] Failed to unsub from pool:", err);
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

    let appliedMetadata = null;
    let sourceEventId = "";
    let sourceCreatedAt = 0;

    if (cacheEntry) {
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

      if (record?.metadata) {
        const cloned = cloneNip71Metadata(record.metadata);
        if (cloned) {
          appliedMetadata = cloned;
          sourceEventId = record.nip71EventId || "";
          sourceCreatedAt = Number.isFinite(record.created_at)
            ? Math.floor(record.created_at)
            : 0;
        }
      }
    }

    if (!appliedMetadata) {
      const extracted = extractNip71MetadataFromTags(video);
      if (extracted?.metadata) {
        const cloned = cloneNip71Metadata(extracted.metadata);
        if (cloned) {
          if (Array.isArray(video.tags)) {
            const hasVideoTopicTag = video.tags.some(
              (tag) => Array.isArray(tag) && tag[0] === "t" && tag[1] === "video"
            );
            if (hasVideoTopicTag) {
              if (Array.isArray(cloned.hashtags)) {
                const filteredHashtags = cloned.hashtags.filter((value) => {
                  if (typeof value !== "string") {
                    return false;
                  }
                  const trimmed = value.trim();
                  return trimmed && trimmed.toLowerCase() !== "video";
                });
                if (filteredHashtags.length) {
                  cloned.hashtags = filteredHashtags;
                } else {
                  delete cloned.hashtags;
                }
              }

              if (Array.isArray(cloned.t)) {
                const filteredTopics = cloned.t.filter((value) => {
                  if (typeof value !== "string") {
                    return false;
                  }
                  const trimmed = value.trim();
                  return trimmed && trimmed.toLowerCase() !== "video";
                });
                if (filteredTopics.length) {
                  cloned.t = filteredTopics;
                } else {
                  delete cloned.t;
                }
              }
            }
          }

          appliedMetadata = cloned;
          const extractedSource = extracted.source || {};
          const fallbackId = typeof video.id === "string" ? video.id : "";
          sourceEventId = extractedSource.id || fallbackId;
          const candidateCreatedAt = Number.isFinite(extractedSource.created_at)
            ? Math.floor(extractedSource.created_at)
            : Number.isFinite(video.created_at)
              ? Math.floor(video.created_at)
              : 0;
          sourceCreatedAt = candidateCreatedAt;
        }
      }
    }

    if (appliedMetadata) {
      video.nip71 = appliedMetadata;
      video.nip71Source = {
        eventId: sourceEventId,
        created_at: sourceCreatedAt,
      };
    } else {
      if (video.nip71) {
        delete video.nip71;
      }
      if (video.nip71Source) {
        delete video.nip71Source;
      }
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
              devLogger.warn(
                `[nostr] NIP-71 fetch failed on ${url}:`,
                error,
              );
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
      devLogger.warn("[nostr] Failed to fetch NIP-71 metadata:", error);
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
            if (evt && evt.id) {
              this.rawEvents.set(evt.id, evt);
            }
            const vid = convertEventToVideo(evt);
            if (vid.invalid) {
              // Accumulate if invalid
              invalidNotes.push({ id: vid.id, reason: vid.reason });
            } else {
              // Only add if good
              this.applyRootCreatedAt(vid);
              const activeKey = getActiveKey(vid);
              if (vid.deleted) {
                this.recordTombstone(activeKey, vid.created_at);
              } else {
                this.applyTombstoneGuard(vid);
              }
              localAll.set(evt.id, vid);
            }
          }
        })
      );

      // Merge into allEvents
      for (const [id, vid] of localAll.entries()) {
        this.allEvents.set(id, vid);
        this.applyRootCreatedAt(vid);
      }

      // Rebuild activeMap
      this.activeMap.clear();
      for (const [id, video] of this.allEvents.entries()) {
        if (video.deleted) continue;
        const activeKey = getActiveKey(video);
        const existing = this.activeMap.get(activeKey);

        if (!existing || video.created_at > existing.created_at) {
          this.activeMap.set(activeKey, video);
          this.applyRootCreatedAt(video);
        }
      }

      // OPTIONAL: Log invalid stats
      if (invalidNotes.length > 0 && isDevMode) {
        userLogger.warn(
          `Skipped ${invalidNotes.length} invalid video notes:\n`,
          invalidNotes.map((n) => `${n.id.slice(0, 8)}.. => ${n.reason}`)
        );
      }

      const activeVideos = Array.from(this.activeMap.values()).sort(
        (a, b) => b.created_at - a.created_at
      );
      await this.populateNip71MetadataForVideos(activeVideos);
      activeVideos.forEach((video) => this.applyRootCreatedAt(video));
      return activeVideos;
    } catch (err) {
      userLogger.error("fetchVideos error:", err);
      return [];
    }
  }

  /**
   * Raw event helpers
   */
  /**
   * Fetch the unmodified Nostr event for a given id and cache the payload.
   *
   * @param {string} eventId
   * @param {{ relays?: string[], filter?: import("nostr-tools").Filter }} options
   * @returns {Promise<object|null>}
   */
  async fetchRawEventById(eventId, options = {}) {
    const id = typeof eventId === "string" ? eventId.trim() : "";
    if (!id) {
      return null;
    }

    const cached = this.rawEvents.get(id);
    if (cached) {
      return cached;
    }

    try {
      await this.ensurePool();
    } catch (error) {
      devLogger.warn("fetchRawEventById ensurePool error:", error);
      return null;
    }

    if (!this.pool) {
      return null;
    }

    const relayCandidatesRaw =
      Array.isArray(options?.relays) && options.relays.length
        ? options.relays
        : this.relays;
    const relays = Array.isArray(relayCandidatesRaw)
      ? Array.from(
          new Set(
            relayCandidatesRaw
              .map((url) => (typeof url === "string" ? url.trim() : ""))
              .filter(Boolean)
          )
        )
      : [];

    if (!relays.length) {
      return null;
    }

    const baseFilter =
      options && typeof options.filter === "object"
        ? { ...options.filter }
        : { ids: [id] };

    const normalizedIds = Array.isArray(baseFilter.ids)
      ? baseFilter.ids
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
      : [];

    if (!normalizedIds.includes(id)) {
      normalizedIds.push(id);
    }

    const filterTemplate = { ...baseFilter, ids: normalizedIds };

    const makeFilter = () => ({
      ...filterTemplate,
      ids: Array.from(filterTemplate.ids),
    });

    const remember = (evt) => {
      if (evt && typeof evt === "object" && evt.id) {
        this.rawEvents.set(evt.id, evt);
      }
      return evt || null;
    };

    if (typeof this.pool.get === "function") {
      try {
        const evt = await this.pool.get(relays, makeFilter());
        if (evt && evt.id === id) {
          return remember(evt);
        }
      } catch (error) {
        devLogger.warn("fetchRawEventById pool.get error:", error);
      }
    }

    if (typeof this.pool.list === "function") {
      try {
        const events = await this.pool.list(relays, [makeFilter()]);
        if (Array.isArray(events)) {
          for (const evt of events) {
            if (!evt) {
              continue;
            }
            const stored = remember(evt);
            if (evt.id === id) {
              return stored;
            }
          }
        }
      } catch (error) {
        devLogger.warn("fetchRawEventById pool.list error:", error);
      }
    }

    return null;
  }

  /**
   * Resolve a single video from cache or the relay network.
   *
   * @param {string} eventId - The event id to look up.
   * @param {{ includeRaw?: boolean }} options
   * @returns {Promise<object|null|{video: object|null, rawEvent: object|null}>}
   */
  async getEventById(eventId, options = {}) {
    const includeRaw = options?.includeRaw === true;

    const local = this.allEvents.get(eventId) || null;
    const localRaw = this.rawEvents.get(eventId) || null;

    if (local) {
      this.applyRootCreatedAt(local);
      const localKey = getActiveKey(local);
      if (local.deleted) {
        this.recordTombstone(localKey, local.created_at);
      } else {
        this.applyTombstoneGuard(local);
      }
      if (!includeRaw) {
        return local;
      }

      if (localRaw) {
        return { video: local, rawEvent: localRaw };
      }
    }

    const rawEvent = await this.fetchRawEventById(eventId);
    if (!rawEvent && !includeRaw) {
      return local || null;
    }

    if (!rawEvent) {
      return { video: local || null, rawEvent: null };
    }

    const video = convertEventToVideo(rawEvent);
    this.applyRootCreatedAt(video);
    const activeKey = getActiveKey(video);
    if (video.deleted) {
      this.recordTombstone(activeKey, video.created_at);
    } else {
      this.applyTombstoneGuard(video);
    }
    this.allEvents.set(eventId, video);

    if (includeRaw) {
      return { video, rawEvent };
    }

    return video;
  }

  async repostEvent(eventId, options = {}) {
    const normalizedId =
      typeof eventId === "string" && eventId.trim() ? eventId.trim() : "";
    if (!normalizedId) {
      return { ok: false, error: "invalid-event-id" };
    }

    let pointer = null;
    if (options.pointer) {
      pointer = normalizePointerInput(options.pointer);
    }
    if (!pointer) {
      const type =
        typeof options.pointerType === "string" ? options.pointerType.trim() : "";
      const value =
        typeof options.pointerValue === "string" ? options.pointerValue.trim() : "";
      if (type && value) {
        const candidate = [type, value];
        const relay =
          typeof options.pointerRelay === "string"
            ? options.pointerRelay.trim()
            : "";
        if (relay) {
          candidate.push(relay);
        }
        pointer = normalizePointerInput(candidate);
      }
    }

    const cachedVideo = this.allEvents.get(normalizedId) || null;
    const cachedRaw = this.rawEvents.get(normalizedId) || null;

    let authorPubkey =
      typeof options.authorPubkey === "string" && options.authorPubkey.trim()
        ? options.authorPubkey.trim().toLowerCase()
        : "";

    if (!authorPubkey && cachedVideo?.pubkey) {
      authorPubkey = cachedVideo.pubkey.trim().toLowerCase();
    }
    if (!authorPubkey && cachedRaw?.pubkey) {
      authorPubkey = cachedRaw.pubkey.trim().toLowerCase();
    }

    let address = typeof options.address === "string" ? options.address.trim() : "";
    if (!address && pointer?.type === "a") {
      address = pointer.value;
    }

    let addressRelay =
      typeof options.addressRelay === "string" ? options.addressRelay.trim() : "";
    if (!addressRelay && pointer?.type === "a" && pointer.relay) {
      addressRelay = pointer.relay;
    }

    let eventRelay =
      typeof options.eventRelay === "string" ? options.eventRelay.trim() : "";
    if (!eventRelay && pointer?.type === "e" && pointer.relay) {
      eventRelay = pointer.relay;
    }

    let targetKind = Number.isFinite(options.kind)
      ? Math.floor(options.kind)
      : null;

    const parseAddressMetadata = (candidate) => {
      if (typeof candidate !== "string" || !candidate) {
        return;
      }
      const parts = candidate.split(":");
      if (parts.length >= 3) {
        const maybeKind = Number.parseInt(parts[0], 10);
        if (Number.isFinite(maybeKind) && !Number.isFinite(targetKind)) {
          targetKind = maybeKind;
        }
        const maybePubkey = parts[1];
        if (
          maybePubkey &&
          !authorPubkey &&
          /^[0-9a-f]{64}$/i.test(maybePubkey)
        ) {
          authorPubkey = maybePubkey.toLowerCase();
        }
      }
    };

    if (address) {
      parseAddressMetadata(address);
    }

    if (!Number.isFinite(targetKind)) {
      if (Number.isFinite(cachedRaw?.kind)) {
        targetKind = Math.floor(cachedRaw.kind);
      } else if (Number.isFinite(cachedVideo?.kind)) {
        targetKind = Math.floor(cachedVideo.kind);
      } else {
        targetKind = 30078;
      }
    }

    const deriveIdentifierFromVideo = () => {
      if (!cachedVideo || typeof cachedVideo !== "object") {
        return "";
      }

      if (typeof cachedVideo.videoRootId === "string" && cachedVideo.videoRootId.trim()) {
        return cachedVideo.videoRootId.trim();
      }

      if (Array.isArray(cachedVideo.tags)) {
        for (const tag of cachedVideo.tags) {
          if (!Array.isArray(tag) || tag.length < 2) {
            continue;
          }
          if (tag[0] === "d" && typeof tag[1] === "string" && tag[1].trim()) {
            return tag[1].trim();
          }
        }
      }

      return "";
    };

    if (!address) {
      const identifier = deriveIdentifierFromVideo();
      const ownerPubkey =
        authorPubkey ||
        (cachedVideo?.pubkey ? cachedVideo.pubkey.trim().toLowerCase() : "") ||
        (cachedRaw?.pubkey ? cachedRaw.pubkey.trim().toLowerCase() : "");

      if (identifier && ownerPubkey) {
        address = `${targetKind}:${ownerPubkey}:${identifier}`;
        parseAddressMetadata(address);
      } else if (cachedRaw) {
        const fallbackAddress = eventToAddressPointer(cachedRaw);
        if (fallbackAddress) {
          address = fallbackAddress;
          parseAddressMetadata(address);
        }
      }
    }

    const relaysOverride = sanitizeRelayList(
      Array.isArray(options.relays) && options.relays.length
        ? options.relays
        : Array.isArray(this.writeRelays) && this.writeRelays.length
        ? this.writeRelays
        : this.relays
    );
    const relays = relaysOverride.length ? relaysOverride : Array.from(RELAY_URLS);

    let actorPubkey =
      typeof options.actorPubkey === "string" && options.actorPubkey.trim()
        ? options.actorPubkey.trim()
        : typeof this.pubkey === "string" && this.pubkey.trim()
        ? this.pubkey.trim()
        : "";

    if (!actorPubkey) {
      try {
        const ensured = await this.ensureSessionActor();
        actorPubkey = ensured || "";
      } catch (error) {
        devLogger.warn("[nostr] Failed to ensure session actor before repost:", error);
        return { ok: false, error: "missing-actor", details: error };
      }
    }

    if (!actorPubkey) {
      return { ok: false, error: "missing-actor" };
    }

    if (!this.pool) {
      try {
        await this.ensurePool();
      } catch (error) {
        devLogger.warn("[nostr] Failed to ensure pool before repost:", error);
        return { ok: false, error: "pool-unavailable", details: error };
      }
    }

    const createdAt =
      typeof options.created_at === "number" && Number.isFinite(options.created_at)
        ? Math.max(0, Math.floor(options.created_at))
        : Math.floor(Date.now() / 1000);

    const additionalTags = Array.isArray(options.additionalTags)
      ? options.additionalTags.filter((tag) => Array.isArray(tag) && tag.length >= 2)
      : [];

    const repostEvent = buildRepostEvent({
      pubkey: actorPubkey,
      created_at: createdAt,
      eventId: normalizedId,
      eventRelay,
      address,
      addressRelay,
      authorPubkey,
      additionalTags,
    });

    try {
      const { signedEvent, summary, signerPubkey } = await this.signAndPublishEvent(
        repostEvent,
        {
          context: "repost",
          logName: "Repost",
          devLogLabel: "repost",
          relaysOverride: relays,
        }
      );

      const normalizedSigner =
        typeof signerPubkey === "string" ? signerPubkey.toLowerCase() : "";
      const normalizedLogged =
        typeof this.pubkey === "string" ? this.pubkey.toLowerCase() : "";
      const sessionPubkey =
        typeof this.sessionActor?.pubkey === "string"
          ? this.sessionActor.pubkey.toLowerCase()
          : "";

      const usedSessionActor =
        normalizedSigner &&
        normalizedSigner !== normalizedLogged &&
        normalizedSigner === sessionPubkey;

      return {
        ok: true,
        event: signedEvent,
        summary,
        relays,
        sessionActor: usedSessionActor,
        signerPubkey,
      };
    } catch (error) {
      devLogger.warn("[nostr] Repost publish failed:", error);
      const relayFailure =
        error && typeof error === "object" && Array.isArray(error.relayFailures);
      return {
        ok: false,
        error: relayFailure ? "publish-rejected" : "signing-failed",
        details: error,
      };
    }
  }

  async mirrorVideoEvent(eventId, options = {}) {
    const normalizedId =
      typeof eventId === "string" && eventId.trim() ? eventId.trim() : "";
    if (!normalizedId) {
      return { ok: false, error: "invalid-event-id" };
    }

    const cachedVideo = this.allEvents.get(normalizedId) || null;

    const sanitize = (value) => (typeof value === "string" ? value.trim() : "");

    let url = sanitize(options.url);
    if (!url && cachedVideo?.url) {
      url = sanitize(cachedVideo.url);
    }

    if (!url) {
      return { ok: false, error: "missing-url" };
    }

    const isPrivate =
      options.isPrivate === true ||
      options.isPrivate === "true" ||
      cachedVideo?.isPrivate === true;

    let magnet = sanitize(options.magnet);
    if (!magnet && cachedVideo?.magnet) {
      magnet = sanitize(cachedVideo.magnet);
    }
    if (!magnet && cachedVideo?.rawMagnet) {
      magnet = sanitize(cachedVideo.rawMagnet);
    }
    if (!magnet && cachedVideo?.originalMagnet) {
      magnet = sanitize(cachedVideo.originalMagnet);
    }

    let thumbnail = sanitize(options.thumbnail);
    if (!thumbnail && cachedVideo?.thumbnail) {
      thumbnail = sanitize(cachedVideo.thumbnail);
    }

    let description = sanitize(options.description);
    if (!description && cachedVideo?.description) {
      description = sanitize(cachedVideo.description);
    }

    let title = sanitize(options.title);
    if (!title && cachedVideo?.title) {
      title = sanitize(cachedVideo.title);
    }

    const providedMimeType = sanitize(options.mimeType);
    const inferredMimeType = inferMimeTypeFromUrl(url);
    const mimeType = providedMimeType || inferredMimeType || "application/octet-stream";

    const explicitAlt = sanitize(options.altText);
    const altText = explicitAlt || description || title || "";

    const tags = [];
    tags.push(["url", url]);
    if (mimeType) {
      tags.push(["m", mimeType]);
    }
    if (thumbnail) {
      tags.push(["thumb", thumbnail]);
    }
    if (altText) {
      tags.push(["alt", altText]);
    }
    if (!isPrivate && magnet) {
      tags.push(["magnet", magnet]);
    }

    const additionalTags = Array.isArray(options.additionalTags)
      ? options.additionalTags.filter((tag) => Array.isArray(tag) && tag.length >= 2)
      : [];
    tags.push(...additionalTags);

    let actorPubkey =
      typeof options.actorPubkey === "string" && options.actorPubkey.trim()
        ? options.actorPubkey.trim()
        : typeof this.pubkey === "string" && this.pubkey.trim()
        ? this.pubkey.trim()
        : "";

    if (!actorPubkey) {
      try {
        const ensured = await this.ensureSessionActor();
        actorPubkey = ensured || "";
      } catch (error) {
        devLogger.warn("[nostr] Failed to ensure session actor before mirror:", error);
        return { ok: false, error: "missing-actor", details: error };
      }
    }

    if (!actorPubkey) {
      return { ok: false, error: "missing-actor" };
    }

    if (!this.pool) {
      try {
        await this.ensurePool();
      } catch (error) {
        devLogger.warn("[nostr] Failed to ensure pool before mirror:", error);
        return { ok: false, error: "pool-unavailable", details: error };
      }
    }

    const createdAt =
      typeof options.created_at === "number" && Number.isFinite(options.created_at)
        ? Math.max(0, Math.floor(options.created_at))
        : Math.floor(Date.now() / 1000);

    const relaysOverride = sanitizeRelayList(
      Array.isArray(options.relays) && options.relays.length
        ? options.relays
        : Array.isArray(this.writeRelays) && this.writeRelays.length
        ? this.writeRelays
        : this.relays
    );
    const relays = relaysOverride.length ? relaysOverride : Array.from(RELAY_URLS);

    const mirrorEvent = buildVideoMirrorEvent({
      pubkey: actorPubkey,
      created_at: createdAt,
      tags,
      content: altText,
    });

    try {
      const { signedEvent, summary, signerPubkey } = await this.signAndPublishEvent(
        mirrorEvent,
        {
          context: "mirror",
          logName: "NIP-94 mirror",
          devLogLabel: "NIP-94 mirror",
          rejectionLogLevel: "warn",
          relaysOverride: relays,
        }
      );

      const normalizedSigner =
        typeof signerPubkey === "string" ? signerPubkey.toLowerCase() : "";
      const normalizedLogged =
        typeof this.pubkey === "string" ? this.pubkey.toLowerCase() : "";
      const sessionPubkey =
        typeof this.sessionActor?.pubkey === "string"
          ? this.sessionActor.pubkey.toLowerCase()
          : "";

      const usedSessionActor =
        normalizedSigner &&
        normalizedSigner !== normalizedLogged &&
        normalizedSigner === sessionPubkey;

      return {
        ok: true,
        event: signedEvent,
        summary,
        relays,
        sessionActor: usedSessionActor,
        signerPubkey,
      };
    } catch (error) {
      devLogger.warn("[nostr] Mirror publish failed:", error);
      const relayFailure =
        error && typeof error === "object" && Array.isArray(error.relayFailures);
      return {
        ok: false,
        error: relayFailure ? "publish-rejected" : "signing-failed",
        details: error,
      };
    }
  }

  async rebroadcastEvent(eventId, options = {}) {
    const normalizedId =
      typeof eventId === "string" && eventId.trim() ? eventId.trim() : "";
    if (!normalizedId) {
      return { ok: false, error: "invalid-event-id" };
    }

    const candidatePubkeys = [];
    if (typeof options.pubkey === "string" && options.pubkey.trim()) {
      candidatePubkeys.push(options.pubkey.trim().toLowerCase());
    }
    const cachedVideo = this.allEvents.get(normalizedId);
    if (cachedVideo?.pubkey) {
      candidatePubkeys.push(cachedVideo.pubkey.toLowerCase());
    }
    const cachedRaw = this.rawEvents.get(normalizedId);
    if (cachedRaw?.pubkey) {
      candidatePubkeys.push(cachedRaw.pubkey.toLowerCase());
    }

    let normalizedPubkey = "";
    for (const candidate of candidatePubkeys) {
      if (typeof candidate === "string" && candidate) {
        normalizedPubkey = candidate;
        break;
      }
    }

    let guardScope = deriveRebroadcastScope(normalizedPubkey, normalizedId);
    const guardBucket = deriveRebroadcastBucketIndex();
    if (guardScope && hasRecentRebroadcastAttempt(guardScope, guardBucket)) {
      const cooldown = getRebroadcastCooldownState(guardScope);
      return { ok: false, error: "cooldown-active", throttled: true, cooldown };
    }

    const relayCandidates = Array.isArray(options.relays) && options.relays.length
      ? options.relays
      : Array.isArray(this.relays) && this.relays.length
      ? this.relays
      : RELAY_URLS;
    const relays = relayCandidates
      .map((url) => (typeof url === "string" ? url.trim() : ""))
      .filter(Boolean);

    if (!this.pool) {
      try {
        await this.ensurePool();
      } catch (error) {
        devLogger.warn("[nostr] Failed to ensure pool before rebroadcast:", error);
        return { ok: false, error: "pool-unavailable", details: error };
      }
    }

    let rawEvent =
      options.rawEvent || cachedRaw || (await this.fetchRawEventById(normalizedId, { relays }));

    if (!rawEvent) {
      return { ok: false, error: "event-not-found" };
    }

    if (!normalizedPubkey && typeof rawEvent.pubkey === "string") {
      normalizedPubkey = rawEvent.pubkey.trim().toLowerCase();
    }

    const effectiveScope = deriveRebroadcastScope(normalizedPubkey, normalizedId);
    if (effectiveScope && !guardScope) {
      guardScope = effectiveScope;
      if (hasRecentRebroadcastAttempt(guardScope, guardBucket)) {
        const cooldown = getRebroadcastCooldownState(guardScope);
        return { ok: false, error: "cooldown-active", throttled: true, cooldown };
      }
    }

    if (guardScope) {
      rememberRebroadcastAttempt(guardScope, guardBucket);
    }

    let countResult = null;
    if (options.skipCount !== true) {
      try {
        countResult = await this.countEventsAcrossRelays([
          { ids: [normalizedId] },
        ], {
          relays,
          timeoutMs: options.timeoutMs,
        });
      } catch (error) {
        devLogger.warn("[nostr] COUNT request for rebroadcast failed:", error);
      }

      if (countResult?.total && Number(countResult.total) > 0) {
        return {
          ok: true,
          alreadyPresent: true,
          count: countResult,
          cooldown: guardScope ? getRebroadcastCooldownState(guardScope) : null,
        };
      }
    }

    const publishResults = await publishEventToRelays(this.pool, relays, rawEvent);

    try {
      const summary = assertAnyRelayAccepted(publishResults, { context: "rebroadcast" });
      return {
        ok: true,
        rebroadcast: true,
        summary,
        count: countResult,
        cooldown: guardScope ? getRebroadcastCooldownState(guardScope) : null,
      };
    } catch (error) {
      devLogger.warn("[nostr] Rebroadcast rejected by relays:", error);
      return {
        ok: false,
        error: "publish-rejected",
        details: error,
        results: publishResults,
        cooldown: guardScope ? getRebroadcastCooldownState(guardScope) : null,
      };
    }
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
            } else {
              devLogger.warn(
                `[nostr] COUNT request failed on ${url}:`,
                error,
              );
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

    this.applyRootCreatedAt(video);

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
            if (!candidate.deleted) {
              this.applyTombstoneGuard(candidate);
            }
            matches.push(candidate);
          }
        }
      }
      return matches;
    };

    let localMatches = collectLocalMatches();

    const ensureRootPresence = async () => {
      const normalizedRoot = targetRoot && typeof targetRoot === "string"
        ? targetRoot
        : "";
      if (!normalizedRoot || normalizedRoot === video.id) {
        return;
      }

      const alreadyPresent = localMatches.some((entry) => entry?.id === normalizedRoot);
      if (alreadyPresent) {
        return;
      }

      const cachedRoot = this.allEvents.get(normalizedRoot);
      if (cachedRoot) {
        this.applyRootCreatedAt(cachedRoot);
        localMatches.push(cachedRoot);
        return;
      }

      if (
        !this.pool ||
        typeof this.pool.get !== "function" ||
        !Array.isArray(this.relays) ||
        !this.relays.length
      ) {
        return;
      }

      try {
        const rootEvent = await this.pool.get(this.relays, { ids: [normalizedRoot] });
        if (rootEvent && rootEvent.id === normalizedRoot) {
          this.rawEvents.set(rootEvent.id, rootEvent);
          const parsed = convertEventToVideo(rootEvent);
          if (!parsed.invalid) {
            this.mergeNip71MetadataIntoVideo(parsed);
            this.applyRootCreatedAt(parsed);
            const activeKey = getActiveKey(parsed);
            if (parsed.deleted) {
              this.recordTombstone(activeKey, parsed.created_at);
            } else {
              this.applyTombstoneGuard(parsed);
            }
            this.allEvents.set(rootEvent.id, parsed);
            localMatches.push(parsed);
          }
        }
      } catch (error) {
        devLogger.warn(
        `[nostr] Failed to fetch root event ${normalizedRoot} for history:`,
        error
        );
      }
    };

    await ensureRootPresence();

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
                devLogger.warn(
                  `[nostr] History fetch failed on ${url}:`,
                  err,
                );
                return [];
              }
            })
        );

        const merged = perRelay.flat();
        for (const evt of merged) {
          try {
            if (evt && evt.id) {
              this.rawEvents.set(evt.id, evt);
            }
            const parsed = convertEventToVideo(evt);
            if (!parsed.invalid) {
              this.mergeNip71MetadataIntoVideo(parsed);
              this.applyRootCreatedAt(parsed);
              const activeKey = getActiveKey(parsed);
              if (parsed.deleted) {
                this.recordTombstone(activeKey, parsed.created_at);
              } else {
                this.applyTombstoneGuard(parsed);
              }
              this.allEvents.set(evt.id, parsed);
            }
          } catch (err) {
            devLogger.warn("[nostr] Failed to convert historical event:", err);
          }
        }
      } catch (err) {
        devLogger.warn("[nostr] hydrateVideoHistory relay fetch error:", err);
      }

      localMatches = collectLocalMatches();
      await ensureRootPresence();
    }

    localMatches.sort((a, b) => b.created_at - a.created_at);
    await this.populateNip71MetadataForVideos(localMatches);
    localMatches.forEach((entry) => this.applyRootCreatedAt(entry));
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

registerNostrClient(nostrClient, {
  requestPermissions: () =>
    nostrClient.ensureExtensionPermissions(DEFAULT_NIP07_PERMISSION_METHODS),
});

export function requestDefaultExtensionPermissions() {
  return requestRegisteredPermissions(
    DEFAULT_NIP07_PERMISSION_METHODS,
  );
}

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
