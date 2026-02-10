// js/nostr/client.js

/**
 * NostrClient
 *
 * The central controller for all Nostr network interactions and state management.
 * For a high-level overview, see `docs/nostr-client-overview.md`.
 *
 * Responsibilities:
 * - Connection Management: Maintains the connection pool to Relays.
 * - Event Publishing: Handles signing and broadcasting events (Kind 0, 1, 30078, etc.).
 * - State Management:
 *   - `allEvents`: A raw map of all fetched video events.
 *   - `activeMap`: A derived map containing only the *latest* version of each video (deduplicated by `videoRootId`).
 *   - `rawEvents`: A cache of the exact raw JSON events from relays (for signature verification).
 * - Caching: Implements a dual-layer cache (IndexedDB + localStorage) to restore app state instantly on load.
 * - Signer Management: Orchestrates NIP-07 (Extension), NIP-46 (Remote/Bunker), and NIP-01 (Local nsec) signers.
 */

import { isDevMode } from "../config.js";
import { infoHashFromMagnet } from "../magnets.js";
// 🔧 merged conflicting changes from codex/update-video-publishing-and-parsing-logic vs unstable
import {
  buildNip71MetadataTags,
  collectNip71PointerRequests,
  convertEventToVideo,
  extractNip71MetadataFromTags,
  getDTagValueFromTags,
  mergeNip71MetadataIntoVideo as mergeNip71MetadataIntoVideoHelper,
  populateNip71MetadataForVideos as populateNip71MetadataForVideosHelper,
  processNip71Events as processNip71EventsHelper,
} from "./nip71.js";
import {
  handlePublishNip94,
  handlePublishNip71,
} from "./videoPublisher.js";
import {
  buildStoragePointerValue,
  deriveStoragePointerFromUrl,
  getStoragePointerFromTags,
  normalizeStoragePointer,
  resolveStoragePointerValue,
} from "../utils/storagePointer.js";
import { RelayBatchFetcher } from "./relayBatchFetcher.js";
import {
  createWatchHistoryManager,
  normalizePointerInput,
  pointerKey,
  buildWatchHistoryPayload,
  normalizeActorKey,
  getWatchHistoryCacheTtlMs as getWatchHistoryCacheTtlMsFromManager,
  getWatchHistoryStorage as getWatchHistoryStorageFromManager,
  persistWatchHistoryEntry as persistWatchHistoryEntryToManager,
  cancelWatchHistoryRepublish as cancelWatchHistoryRepublishForManager,
  scheduleWatchHistoryRepublish as scheduleWatchHistoryRepublishForManager,
  getWatchHistoryFingerprint as getWatchHistoryFingerprintFromManager,
  ensureWatchHistoryBackgroundRefresh as ensureWatchHistoryBackgroundRefreshForManager,
  publishWatchHistorySnapshot as publishWatchHistorySnapshotWithManager,
  updateWatchHistoryList as updateWatchHistoryListWithManager,
  removeWatchHistoryItem as removeWatchHistoryItemWithManager,
  fetchWatchHistory as fetchWatchHistoryWithManager,
  resolveWatchHistory as resolveWatchHistoryWithManager,
} from "./watchHistory.js";
import {
  buildVideoPostEvent,
  buildRepostEvent,
  buildWatchHistoryEvent,
  buildDmAttachmentEvent,
  buildDeletionEvent,
  buildLegacyDirectMessageEvent,
  buildGiftWrapEvent,
  buildSealEvent,
  buildChatMessageEvent,
  getNostrEventSchema,
  NOTE_TYPES,
} from "../nostrEventSchemas.js";
import { CACHE_POLICIES } from "./cachePolicies.js";
import {
  SyncMetadataStore,
  __testExports as syncMetaTestExports,
} from "./syncMetadataStore.js";
import {
  listVideoViewEvents as listVideoViewEventsForClient,
  subscribeVideoViewEvents as subscribeVideoViewEventsForClient,
  countVideoViewEvents as countVideoViewEventsForClient,
  publishViewEvent as publishViewEventForClient,
  recordVideoView as recordVideoViewForClient,
} from "./viewEvents.js";
import { publishVideoReaction as publishVideoReactionForClient } from "./reactionEvents.js";
import {
  publishComment as publishCommentForClient,
  listVideoComments as listVideoCommentsForClient,
  subscribeVideoComments as subscribeVideoCommentsForClient,
} from "./commentEvents.js";
import {
  publishDmReadReceipt as publishDmReadReceiptForClient,
  publishDmTypingIndicator as publishDmTypingIndicatorForClient,
} from "./dmSignalEvents.js";
import {
  logCountTimeoutCleanupFailure,
  logRelayCountFailure,
} from "./countDiagnostics.js";
import "./maxListenerDiagnostics.js";
import {
  publishEventToRelay,
  publishEventToRelays,
  assertAnyRelayAccepted,
} from "../nostrPublish.js";
import {
  signEventWithPrivateKey,
  signAndPublishEvent as signAndPublishEventHelper,
  repostEvent as repostEventHelper,
  mirrorVideoEvent as mirrorVideoEventHelper,
  rebroadcastEvent as rebroadcastEventHelper,
  buildRevertVideoPayload,
  summarizePublishResults,
} from "./publishHelpers.js";
import {
  DEFAULT_RELAY_URLS,
  RELAY_URLS,
  ensureNostrTools,
  getCachedNostrTools,
  nostrToolsBootstrapFailure,
  readToolkitFromScope,
  resolveSimplePoolConstructor,
  shimLegacySimplePoolMethods,
} from "./toolkit.js";
import { encryptNip04InWorker } from "./nip04WorkerClient.js";
import {
  decryptDmInWorker,
  isDmDecryptWorkerSupported,
} from "./dmDecryptWorkerClient.js";
import {
  sanitizeDecryptError,
  summarizeDmEventForLog,
} from "./dmDecryptDiagnostics.js";
import { devLogger, userLogger } from "../utils/logger.js";
import { withRequestTimeout } from "../utils/asyncUtils.js";
import { LRUCache } from "../utils/lruCache.js";
import { updateConversationFromMessage, writeMessages } from "../storage/dmDb.js";
import {
  DM_RELAY_WARNING_FALLBACK,
  resolveDmRelaySelection,
} from "../services/dmNostrService.js";
import {
  DEFAULT_NIP07_CORE_METHODS,
  DEFAULT_NIP07_ENCRYPTION_METHODS,
  DEFAULT_NIP07_PERMISSION_METHODS,
  NIP07_PRIORITY,
  clearStoredNip07Permissions,
  normalizePermissionMethod,
  readStoredNip07Permissions,
  requestEnablePermissions,
  runNip07WithRetry,
  writeStoredNip07Permissions,
  waitForNip07Extension,
} from "./nip07Permissions.js";
import {
  clearStoredSessionActor as clearStoredSessionActorEntry,
  decryptSessionPrivateKey,
  encryptSessionPrivateKey,
  persistSessionActor as persistSessionActorEntry,
  readStoredSessionActorEntry,
  isSessionActor,
} from "./sessionActor.js";
import { HEX64_REGEX, normalizeHexHash } from "../utils/hex.js";
import {
  NIP46_RPC_KIND,
  NIP46_HANDSHAKE_TIMEOUT_MS,
  NIP46_AUTH_CHALLENGE_MAX_ATTEMPTS,
  sanitizeRelayList,
  readStoredNip46Session,
  writeStoredNip46Session,
  decryptNip46Session,
  clearStoredNip46Session,
  parseNip46ConnectionString,
  generateNip46Secret,
  sanitizeNip46Metadata,
  normalizeNip46EncryptionAlgorithm,
  resolveNip46Relays,
  normalizeNip46CiphertextPayload,
  createNip46Cipher,
  decryptNip46PayloadWithKeys,
  attemptDecryptNip46HandshakePayload,
  Nip46RpcClient,
  createNip46RequestId,
  decodeNpubToHex,
  encodeHexToNpub,
  normalizeNostrPubkey,
} from "./nip46Client.js";
import {
  summarizeHexForLog,
  summarizeSecretForLog,
  summarizeMetadataForLog,
  summarizeUrlForLog,
  summarizePayloadPreviewForLog,
  summarizeRpcParamsForLog,
  summarizeRpcResultForLog,
  summarizeRelayPublishResultsForLog,
} from "./nip46LoggingUtils.js";
import { profileCache } from "../state/profileCache.js";
import { createPrivateKeyCipherClosures } from "./signerHelpers.js";
import {
  setActiveSigner as setActiveSignerInRegistry,
  getActiveSigner as getActiveSignerFromRegistry,
  clearActiveSigner as clearActiveSignerInRegistry,
  logoutSigner as logoutSignerFromRegistry,
  resolveActiveSigner as resolveActiveSignerFromRegistry,
} from "../nostrClientRegistry.js";
import { createNip07Adapter } from "./adapters/nip07Adapter.js";
import { createNsecAdapter } from "./adapters/nsecAdapter.js";
import { createNip46Adapter } from "./adapters/nip46Adapter.js";
import { queueSignEvent } from "./signRequestQueue.js";
import { EventsMap } from "./eventsMap.js";
import { PersistenceManager } from "./managers/PersistenceManager.js";
import { ConnectionManager } from "./managers/ConnectionManager.js";
import {
  SignerManager,
  resolveSignerCapabilities,
  hydrateExtensionSignerCapabilities,
  attachNipMethodAliases,
} from "./managers/SignerManager.js";
import {
  prepareVideoPublishPayload,
  prepareVideoEditPayload,
} from "./videoPayloadBuilder.js";
import { inferMimeTypeFromUrl } from "../utils/mime.js";
import { VideoEventBuffer } from "./videoEventBuffer.js";

function normalizeProfileFromEvent(event) {
  if (!event || !event.content) return null;
  try {
    return JSON.parse(event.content);
  } catch (err) {
    return null;
  }
}

// Helper functions
// Ideally these are replaced by usages of signerManager instance, but they are exported.
// We keep them as pass-throughs to the registry or utility logic where appropriate.

function resolveActiveSigner(pubkey) {
  const signer = resolveActiveSignerFromRegistry(pubkey);
  hydrateExtensionSignerCapabilities(signer);
  attachNipMethodAliases(signer);
  return signer;
}

function setActiveSigner(signer) {
  hydrateExtensionSignerCapabilities(signer);
  attachNipMethodAliases(signer);
  setActiveSignerInRegistry(signer);
}

function getActiveSigner() {
  const signer = getActiveSignerFromRegistry();
  hydrateExtensionSignerCapabilities(signer);
  attachNipMethodAliases(signer);
  return signer;
}

function clearActiveSigner() {
  clearActiveSignerInRegistry();
}

function logoutSigner(pubkey) {
  logoutSignerFromRegistry(pubkey);
}

function shouldRequestExtensionPermissions(signer) {
  if (!signer || typeof signer !== "object") {
    return false;
  }
  return signer.type === "extension";
}

import {
  RELAY_CONNECT_TIMEOUT_MS,
  RELAY_RECONNECT_BASE_DELAY_MS,
  RELAY_RECONNECT_MAX_DELAY_MS,
  RELAY_RECONNECT_MAX_ATTEMPTS,
  RELAY_BACKOFF_BASE_DELAY_MS,
  RELAY_BACKOFF_MAX_DELAY_MS,
  RELAY_CIRCUIT_BREAKER_THRESHOLD,
  RELAY_CIRCUIT_BREAKER_COOLDOWN_MS,
  RELAY_FAILURE_WINDOW_MS,
  RELAY_FAILURE_WINDOW_THRESHOLD,
  RELAY_SUMMARY_LOG_INTERVAL_MS,
} from "./relayConstants.js";
const EVENTS_CACHE_STORAGE_KEY = "bitvid:eventsCache:v1";
// We use the policy TTL, but currently the storage backend is hardcoded to IDB (with localStorage fallback).
// Future refactors should make EventsCacheStore dynamic based on CACHE_POLICIES[NOTE_TYPES.VIDEO_POST].storage.
const EVENTS_CACHE_TTL_MS = CACHE_POLICIES[NOTE_TYPES.VIDEO_POST]?.ttl ?? (10 * 60 * 1000);
const EVENTS_CACHE_DB_NAME = "bitvid-events-cache";
const EVENTS_CACHE_DB_VERSION = 1;
const DEFAULT_VIDEO_REQUEST_LIMIT = 150;
const MAX_VIDEO_REQUEST_LIMIT = 500;

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

export const __testExports = {
  runNip07WithRetry,
  DEFAULT_NIP07_ENCRYPTION_METHODS,
  decryptNip46PayloadWithKeys,
  createNip46Cipher,
  normalizeNip46CiphertextPayload,
  parseNip46ConnectionString,
  attemptDecryptNip46HandshakePayload,
};

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

const DM_DECRYPT_CACHE_LIMIT = 256;
const DM_EVENT_KINDS = Object.freeze([4, 1059]);

function buildDmFilters(actorPubkey, { since, until, limit } = {}) {
  const normalizedActor = normalizeActorKey(actorPubkey);
  const filters = [];

  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined;
  const normalizedSince = Number.isFinite(since) ? Math.floor(since) : undefined;
  const normalizedUntil = Number.isFinite(until) ? Math.floor(until) : undefined;

  const baseFilterPayload = (kinds) => {
    const payload = { kinds: Array.isArray(kinds) ? kinds : [kinds] };
    if (normalizedLimit !== undefined) {
      payload.limit = normalizedLimit;
    }
    if (normalizedSince !== undefined) {
      payload.since = normalizedSince;
    }
    if (normalizedUntil !== undefined) {
      payload.until = normalizedUntil;
    }
    return payload;
  };

  if (normalizedActor) {
    const authorFilter = baseFilterPayload(DM_EVENT_KINDS);
    authorFilter.authors = [normalizedActor];
    filters.push(authorFilter);

    const directFilter = baseFilterPayload(DM_EVENT_KINDS);
    directFilter["#p"] = [normalizedActor];
    filters.push(directFilter);
  } else {
    const fallbackFilter = baseFilterPayload(DM_EVENT_KINDS);
    filters.push(fallbackFilter);
  }

  return filters;
}

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

export {
  convertEventToVideo,
  Nip46RpcClient,
  buildNip71MetadataTags,
  extractNip71MetadataFromTags,
};

export class NostrClient {
  /**
   * Initializes the NostrClient.
   * Sets up connection pools, state maps, and default relays.
   *
   * The client manages the full lifecycle of Nostr interactions:
   * - Connection pooling via `SimplePool`.
   * - State tracking (allEvents, activeMap).
   * - Signer negotiation (NIP-07, NIP-46, local).
   * - Background caching with IndexedDB.
   *
   * For a detailed architectural overview, see `docs/nostr-client-overview.md`.
   */
  constructor() {
    this.connectionManager = new ConnectionManager(this);
    this.signerManager = new SignerManager(this);
    this.relayBatchFetcher = new RelayBatchFetcher(this);

    /**
     * @type {Map<string, object>}
     * Maps event ID to the converted Video object.
     * Stores ALL fetched versions to ensure old links resolve.
     * @public
     */
    this.allEvents = new Map();

    /**
     * @type {Map<string, import("nostr-tools").Event>}
     * Maps event ID to the raw Nostr event object.
     * Kept for signature verification and republishing (e.g. NIP-94 mirror).
     * @public
     */
    this.rawEvents = new EventsMap();

    /**
     * @type {Map<string, object>}
     * Maps `videoRootId` (or `pubkey:dTag`) to the latest valid Video object.
     * This is the "materialized view" used by the UI.
     * It automatically deduplicates versions, keeping only the most recent one.
     * @public
     */
    this.activeMap = new Map();

    /**
     * @type {Map<string, number>}
     * Maps `activeKey` to the timestamp of its latest deletion.
     * Prevents older events from reappearing after a delete.
     * Critical for "Eventual Consistency" handling.
     * @public
     */
    this.tombstones = new Map();
    this.dirtyEventIds = new Set();
    this.dirtyTombstones = new Set();

    this.rootCreatedAtByRoot = new Map();

    this.persistenceManager = new PersistenceManager(this);
    this.syncMetadataStore = new SyncMetadataStore();

    this.nip71Cache = new Map();
    this.watchHistory = createWatchHistoryManager({
      getPool: () => this.pool,
      getActivePubkey: () => this.pubkey,
      getSessionActor: () => this.sessionActor,
      ensureSessionActor: () => this.ensureSessionActor(),
      ensureExtensionPermissions: (...args) => this.ensureExtensionPermissions(...args),
      resolveActiveSigner: (pubkey) => this.signerManager.resolveActiveSigner(pubkey),
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
      getReadRelays: () => this.readRelays,
      getWriteRelays: () => this.writeRelays,
      getRelayFallback: () => this.relays,
      eventToAddressPointer,
    });
    Object.defineProperties(this, {
      watchHistoryCache: {
        configurable: true,
        enumerable: false,
        get: () => this.watchHistory.cache,
        set: (value) => {
          const nextValue =
            value instanceof Map
              ? value
              : value && typeof value[Symbol.iterator] === "function"
                ? new Map(value)
                : new Map();
          this.watchHistory.cache = nextValue;
        },
      },
      watchHistoryFingerprints: {
        configurable: true,
        enumerable: false,
        get: () => this.watchHistory.fingerprints,
        set: (value) => {
          const nextValue =
            value instanceof Map
              ? value
              : value && typeof value[Symbol.iterator] === "function"
                ? new Map(value)
                : new Map();
          this.watchHistory.fingerprints = nextValue;
        },
      },
      watchHistoryRepublishTimers: {
        configurable: true,
        enumerable: false,
        get: () => this.watchHistory.republishTimers,
        set: (value) => {
          const nextValue =
            value instanceof Map
              ? value
              : value && typeof value[Symbol.iterator] === "function"
                ? new Map(value)
                : new Map();
          this.watchHistory.republishTimers = nextValue;
        },
      },
      watchHistoryRefreshPromises: {
        configurable: true,
        enumerable: false,
        get: () => this.watchHistory.refreshPromises,
        set: (value) => {
          const nextValue =
            value instanceof Map
              ? value
              : value && typeof value[Symbol.iterator] === "function"
                ? new Map(value)
                : new Map();
          this.watchHistory.refreshPromises = nextValue;
        },
      },
      watchHistoryCacheTtlMs: {
        configurable: true,
        enumerable: false,
        get: () => this.watchHistory.cacheTtlMs,
        set: (value) => {
          const numeric = Number(value);
          this.watchHistory.cacheTtlMs = Number.isFinite(numeric)
            ? numeric
            : 0;
        },
      },
      watchHistoryLastCreatedAt: {
        configurable: true,
        enumerable: false,
        get: () => this.watchHistory.lastCreatedAt,
        set: (value) => {
          const numeric = Number(value);
          this.watchHistory.lastCreatedAt = Number.isFinite(numeric)
            ? numeric
            : 0;
        },
      },
      watchHistoryStorage: {
        configurable: true,
        enumerable: false,
        get: () => this.watchHistory.storage,
        set: (value) => {
          this.watchHistory.storage =
            value && typeof value === "object" ? value : null;
        },
      },
    });
    this.dmDecryptCache = new LRUCache({ maxSize: DM_DECRYPT_CACHE_LIMIT });
    this.dmDecryptor = null;
    this.dmDecryptorPromise = null;
    this.isInitialized = false;
  }

  get pubkey() { return this.signerManager.pubkey; }
  set pubkey(val) { this.signerManager.pubkey = val; }

  get sessionActor() { return this.signerManager.sessionActor; }
  set sessionActor(val) { this.signerManager.sessionActor = val; }

  get lockedSessionActor() { return this.signerManager.lockedSessionActor; }
  set lockedSessionActor(val) { this.signerManager.lockedSessionActor = val; }

  get nip46Client() { return this.signerManager.nip46Client; }
  set nip46Client(val) { this.signerManager.nip46Client = val; }

  get sessionActorCipherClosures() { return this.signerManager.sessionActorCipherClosures; }
  set sessionActorCipherClosures(val) { this.signerManager.sessionActorCipherClosures = val; }

  get sessionActorCipherClosuresPrivateKey() { return this.signerManager.sessionActorCipherClosuresPrivateKey; }
  set sessionActorCipherClosuresPrivateKey(val) { this.signerManager.sessionActorCipherClosuresPrivateKey = val; }

  get extensionPermissionCache() { return this.signerManager.extensionPermissionCache; }

  get pool() { return this.connectionManager.pool; }
  set pool(val) { this.connectionManager.pool = val; }

  get poolPromise() { return this.connectionManager.poolPromise; }
  set poolPromise(val) { this.connectionManager.poolPromise = val; }

  get relays() { return this.connectionManager.relays; }
  set relays(val) { this.connectionManager.relays = val; }

  get readRelays() { return this.connectionManager.readRelays; }
  set readRelays(val) { this.connectionManager.readRelays = val; }

  get writeRelays() { return this.connectionManager.writeRelays; }
  set writeRelays(val) { this.connectionManager.writeRelays = val; }

  get unreachableRelays() { return this.connectionManager.unreachableRelays; }

  /**
   * Records a deletion timestamp for a video identifier (Tombstoning).
   *
   * **Purpose:**
   * Enforces "Eventual Consistency". If we receive an old version of a video
   * *after* we've seen it was deleted, this tombstone ensures we ignore the zombie event.
   *
   * @param {string} activeKey - The unique key (root ID or pubkey:dTag).
   * @param {number} createdAt - The timestamp of the deletion event.
   */
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
    this.dirtyTombstones.add(key);

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

  /**
   * Checks if a video event is superseded by a known tombstone.
   * If so, marks the video object as `deleted = true`.
   *
   * @param {object} video - The video object to check.
   * @returns {boolean} True if the video was marked deleted by a tombstone.
   */
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


  makeCountUnsupportedError(relayUrl) {
    return this.connectionManager.makeCountUnsupportedError(relayUrl);
  }

  resolveEventDTag(event, fallbackEvent = null) {
    if (event && event.tags) {
      const dTag = getDTagValueFromTags(event.tags);
      if (dTag) return dTag;
    }
    if (fallbackEvent && fallbackEvent.tags) {
      const dTag = getDTagValueFromTags(fallbackEvent.tags);
      if (dTag) return dTag;
    }
    return "";
  }

  applyRootCreatedAt(video) {
    if (!video || typeof video !== "object") return;
    const rootId = video.videoRootId;
    if (!rootId) return;

    let currentMin = this.rootCreatedAtByRoot.get(rootId);
    if (currentMin === undefined) {
      currentMin = Number.MAX_SAFE_INTEGER;
    }

    const videoCreated = Number.isFinite(video.created_at) ? video.created_at : Number.MAX_SAFE_INTEGER;
    if (videoCreated < currentMin) {
      this.rootCreatedAtByRoot.set(rootId, videoCreated);
    }
  }

  getActiveKey(video) {
    return getActiveKey(video);
  }

  /**
   * Restores application state from the best available local cache.
   * Delegates to PersistenceManager.
   *
   * @returns {Promise<boolean>} True if data was successfully restored.
   */
  async restoreLocalData() {
    return this.persistenceManager.restoreLocalData();
  }

  getSyncLastSeen(kind, pubkey, dTag, relayUrl) {
    const effectivePubkey = pubkey || this.pubkey;
    return this.syncMetadataStore.getLastSeen(kind, effectivePubkey, dTag, relayUrl);
  }

  updateSyncLastSeen(kind, pubkey, dTag, relayUrl, createdAt) {
    const effectivePubkey = pubkey || this.pubkey;
    this.syncMetadataStore.updateLastSeen(kind, effectivePubkey, dTag, relayUrl, createdAt);
  }

  getPerRelaySyncLastSeen(kind, pubkey, dTag) {
    const effectivePubkey = pubkey || this.pubkey;
    return this.syncMetadataStore.getPerRelayLastSeen(kind, effectivePubkey, dTag);
  }

  /**
   * Fetches a list of events incrementally from multiple relays, respecting `lastSeen` timestamps per relay.
   *
   * **Optimization Strategy:**
   * - Checks `SyncMetadataStore` for the last known `created_at` timestamp for this query on each relay.
   * - If a timestamp exists, it requests `since: lastSeen + 1` to fetch only new items.
   * - If the incremental fetch fails (or returns nothing when we expected updates), it falls back to a full fetch.
   * - Updates the `SyncMetadataStore` with the new max `created_at` on success.
   *
   * **Concurrency:**
   * - Batches relay requests in chunks of 8 to avoid saturating network connections.
   *
   * @param {object} params
   * @param {number} params.kind - The event kind to fetch (e.g. 10000 for mute list).
   * @param {string} params.pubkey - The author's pubkey.
   * @param {string} [params.dTag] - Optional d-tag for addressable events (NIP-33).
   * @param {string[]} [params.relayUrls] - List of relays to query. Defaults to client's configured relays.
   * @param {function} [params.fetchFn] - Custom fetch function (mocks or specialized logic). Defaults to `pool.list`.
   * @param {number} [params.since] - Explicit start timestamp (overrides storage).
   * @param {number} [params.timeoutMs] - Optional per-relay timeout for list fetches; defaults to a higher list-friendly baseline.
   * @returns {Promise<import("nostr-tools").Event[]>} Deduplicated list of events found across all relays.
   */
  async fetchListIncrementally({
    kind,
    pubkey,
    dTag,
    relayUrls,
    fetchFn,
    since,
    timeoutMs = 10000,
  } = {}) {
    return this.relayBatchFetcher.fetchListIncrementally({
      kind,
      pubkey,
      dTag,
      relayUrls,
      fetchFn,
      since,
      timeoutMs,
    });
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
    return getWatchHistoryCacheTtlMsFromManager(this.watchHistory);
  }

  getWatchHistoryStorage() {
    return getWatchHistoryStorageFromManager(this.watchHistory);
  }

  persistWatchHistoryEntry(actorInput, entry) {
    persistWatchHistoryEntryToManager(this.watchHistory, actorInput, entry);
  }

  cancelWatchHistoryRepublish(taskId = null) {
    cancelWatchHistoryRepublishForManager(this.watchHistory, taskId);
  }

  scheduleWatchHistoryRepublish(taskId, operation, options = {}) {
    return scheduleWatchHistoryRepublishForManager(
      this.watchHistory,
      taskId,
      operation,
      options,
    );
  }
  async getWatchHistoryFingerprint(actorInput, itemsOverride = null) {
    return getWatchHistoryFingerprintFromManager(
      this.watchHistory,
      actorInput,
      itemsOverride,
    );
  }
  ensureWatchHistoryBackgroundRefresh(actorInput = null) {
    return ensureWatchHistoryBackgroundRefreshForManager(
      this.watchHistory,
      actorInput,
    );
  }
  async publishWatchHistorySnapshot(rawItems, options = {}) {
    if (isSessionActor(this)) {
      const error = new Error(
        "Publishing watch history is not allowed for session actors."
      );
      error.code = "session-actor-publish-blocked";
      throw error;
    }
    return publishWatchHistorySnapshotWithManager(
      this.watchHistory,
      rawItems,
      options,
    );
  }
  async updateWatchHistoryList(rawItems = [], options = {}) {
    if (isSessionActor(this)) {
      const error = new Error(
        "Publishing watch history is not allowed for session actors."
      );
      error.code = "session-actor-publish-blocked";
      throw error;
    }
    return updateWatchHistoryListWithManager(
      this.watchHistory,
      rawItems,
      options,
    );
  }
  async removeWatchHistoryItem(pointerInput, options = {}) {
    if (isSessionActor(this)) {
      const error = new Error(
        "Publishing watch history is not allowed for session actors."
      );
      error.code = "session-actor-publish-blocked";
      throw error;
    }
    return removeWatchHistoryItemWithManager(
      this.watchHistory,
      pointerInput,
      options,
    );
  }
  async fetchWatchHistory(actorInput, options = {}) {
    return fetchWatchHistoryWithManager(this.watchHistory, actorInput, options);
  }
  async resolveWatchHistory(actorInput, options = {}) {
    return resolveWatchHistoryWithManager(
      this.watchHistory,
      actorInput,
      options,
    );
  }
  async listVideoViewEvents(pointer, options = {}) {
    return listVideoViewEventsForClient(this, pointer, options);
  }

  subscribeVideoViewEvents(pointer, options = {}) {
    return subscribeVideoViewEventsForClient(this, pointer, options);
  }

  async countVideoViewEvents(pointer, options = {}) {
    return countVideoViewEventsForClient(this, pointer, options);
  }

  async publishViewEvent(videoPointer, options = {}) {
    return publishViewEventForClient(this, videoPointer, options, {
      resolveActiveSigner: (p) => this.signerManager.resolveActiveSigner(p),
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
      DEFAULT_NIP07_PERMISSION_METHODS,
    });
  }

  async publishVideoReaction(pointer, options = {}) {
    return publishVideoReactionForClient(this, pointer, options, {
      resolveActiveSigner: (p) => this.signerManager.resolveActiveSigner(p),
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
      DEFAULT_NIP07_PERMISSION_METHODS,
    });
  }

  async publishVideoComment(target, options = {}) {
    return publishCommentForClient(this, target, options, {
      resolveActiveSigner: (p) => this.signerManager.resolveActiveSigner(p),
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
      DEFAULT_NIP07_PERMISSION_METHODS,
    });
  }

  async publishDmReadReceipt(payload, options = {}) {
    return publishDmReadReceiptForClient(this, payload, options, {
      shouldRequestExtensionPermissions,
      DEFAULT_NIP07_PERMISSION_METHODS,
    });
  }

  async publishDmTypingIndicator(payload, options = {}) {
    return publishDmTypingIndicatorForClient(this, payload, options, {
      shouldRequestExtensionPermissions,
      DEFAULT_NIP07_PERMISSION_METHODS,
    });
  }

  async fetchVideoComments(target, options = {}) {
    return listVideoCommentsForClient(this, target, options);
  }

  subscribeVideoComments(target, options = {}) {
    return subscribeVideoCommentsForClient(this, target, options);
  }

  async recordVideoView(videoPointer, options = {}) {
    return recordVideoViewForClient(this, videoPointer, options, {
      resolveActiveSigner: (p) => this.signerManager.resolveActiveSigner(p),
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
      DEFAULT_NIP07_PERMISSION_METHODS,
    });
  }

  /**
   * Initializes the client and bootstraps the network layer.
   *
   * **Boot Sequence:**
   * 1. **Offline Restore**: Loads cached events from IndexedDB/localStorage to render the UI immediately (Stale-While-Revalidate).
   * 2. **Session Restore**: Attempts to reconnect to a stored NIP-46 remote signer (if any).
   * 3. **Network Connect**: Initializes `SimplePool` and establishes WebSocket connections to relays.
   *
   * @returns {Promise<void>} Resolves when the relay pool is initialized and connections are attempted.
   */
  async init() {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    devLogger.log("Connecting to relays...");

    // 1. Restore cache for immediate UI render (Stale-While-Revalidate)
    await this.restoreLocalData();

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
        userLogger.warn(
          "[nostr] No relays connected during init. Retrying in the background.",
        );
        this.scheduleRelayReconnect({ reason: "initial-connect-failed" });
      } else {
        this.resetRelayReconnectState();
        devLogger.log(
          `Connected to ${successfulRelays.length} relay(s)`,
        );
      }
    } catch (err) {
      userLogger.error("Nostr init failed:", err);
      throw err;
    }
  }

  /**
   * Ensures the `SimplePool` (from nostr-tools) is initialized and ready.
   *
   * @returns {Promise<import("nostr-tools").SimplePool>} The active pool instance.
   */
  async ensurePool() {
    return this.connectionManager.ensurePool();
  }

  async connectToRelays() {
    return this.connectionManager.connectToRelays();
  }

  resolveRelayReconnectDelayMs(attempt) {
    return this.connectionManager.resolveRelayReconnectDelayMs(attempt);
  }

  resetRelayReconnectState() {
    this.connectionManager.resetRelayReconnectState();
  }

  scheduleRelayReconnect(options) {
    return this.connectionManager.scheduleRelayReconnect(options);
  }

  logRelaySummary(options) {
    return this.connectionManager.logRelaySummary(options);
  }

  resolveRelayBackoffMs(failureCount, ttlOverride) {
    return this.connectionManager.resolveRelayBackoffMs(failureCount, ttlOverride);
  }

  clearRelayBackoff(url) {
    return this.connectionManager.clearRelayBackoff(url);
  }

  recordRelayFailureWindow(url) {
    return this.connectionManager.recordRelayFailureWindow(url);
  }

  markRelayUnreachable(url, ttlMs, options) {
    return this.connectionManager.markRelayUnreachable(url, ttlMs, options);
  }

  getHealthyRelays(candidates) {
    return this.connectionManager.getHealthyRelays(candidates);
  }

  /**
   * Logs out the current user and clears all session state.
   *
   * **Cleanup:**
   * - Clears `this.pubkey` and notifies the global signer registry.
   * - Wipes session actor (ephemeral keys).
   * - Disconnects NIP-46 remote signer (if active).
   * - Clears Watch History cache.
   * - Resets permissions cache.
   */

  getDmDecryptCacheLimit() {
    return DM_DECRYPT_CACHE_LIMIT;
  }

  getDmDecryptCacheStats() {
    if (!this.dmDecryptCache || typeof this.dmDecryptCache.getStats !== "function") {
      return null;
    }
    return this.dmDecryptCache.getStats();
  }

  clearDmDecryptCache() {
    if (this.dmDecryptCache) {
      this.dmDecryptCache.clear();
    }
  }

  async ensureDmDecryptor() {
    if (this.dmDecryptor) {
      return this.dmDecryptor;
    }

    if (!this.dmDecryptorPromise) {
      this.dmDecryptorPromise = import("../dmDecryptor.js")
        .then((module) => {
          if (!module || typeof module.decryptDM !== "function") {
            throw new Error("DM decryptor module is unavailable.");
          }
          this.dmDecryptor = module.decryptDM;
          return this.dmDecryptor;
        })
        .catch((error) => {
          this.dmDecryptorPromise = null;
          throw error;
        });
    }

    return this.dmDecryptorPromise;
  }

  async buildDmDecryptContext(actorPubkeyInput = null) {
    let normalizedActor = normalizeActorKey(actorPubkeyInput);
    if (!normalizedActor && typeof this.pubkey === "string" && this.pubkey) {
      normalizedActor = normalizeActorKey(this.pubkey);
    }
    if (
      !normalizedActor &&
      this.sessionActor &&
      typeof this.sessionActor.pubkey === "string"
    ) {
      normalizedActor = normalizeActorKey(this.sessionActor.pubkey);
    }

    const decryptors = [];
    const seen = new Set();

    const addCandidate = (scheme, decrypt, options = {}) => {
      if (typeof decrypt !== "function") {
        return;
      }

      const normalizedScheme = typeof scheme === "string" ? scheme : "";
      const key = `${normalizedScheme}:${options.source || ""}`;
      if (seen.has(key)) {
        return;
      }

      decryptors.push({
        scheme: normalizedScheme,
        decrypt,
        priority: Number.isFinite(options.priority) ? options.priority : 0,
        source: options.source || "",
        supportsGiftWrap: options.supportsGiftWrap === true,
      });
      seen.add(key);
    };

    let activeSigner = null;
    if (normalizedActor) {
      activeSigner = this.signerManager.resolveActiveSigner(normalizedActor);
    }
    if (!activeSigner && this.pubkey) {
      activeSigner = this.signerManager.resolveActiveSigner(this.pubkey);
    }
    if (!activeSigner) {
      activeSigner = this.signerManager.getActiveSigner();
    }

    let extensionPermissionResult = null;
    if (
      activeSigner?.type === "extension" &&
      typeof this.ensureExtensionPermissions === "function"
    ) {
      extensionPermissionResult = await this.ensureExtensionPermissions(
        DEFAULT_NIP07_ENCRYPTION_METHODS,
        { context: "dm" },
      );
      if (!extensionPermissionResult?.ok) {
        devLogger.warn(
          "[nostr] Extension encryption permissions missing for DM decryption.",
          extensionPermissionResult?.error,
        );
      }
    }

    if (activeSigner && extensionPermissionResult?.ok !== false) {
      const capabilities = resolveSignerCapabilities(activeSigner);
      if (
        capabilities.nip44 &&
        typeof activeSigner.nip44Decrypt === "function"
      ) {
        addCandidate(
          "nip44",
          (pubkey, ciphertext, options) =>
            activeSigner.nip44Decrypt(pubkey, ciphertext, {
              ...options,
              priority: NIP07_PRIORITY.NORMAL,
            }),
          {
            priority: -20,
            source: activeSigner.type || "signer",
            supportsGiftWrap: true,
          },
        );
      }
      if (
        capabilities.nip04 &&
        typeof activeSigner.nip04Decrypt === "function"
      ) {
        addCandidate(
          "nip04",
          (pubkey, ciphertext, options) =>
            activeSigner.nip04Decrypt(pubkey, ciphertext, {
              ...options,
              priority: NIP07_PRIORITY.NORMAL,
            }),
          {
            priority: -10,
            source: activeSigner.type || "signer",
          },
        );
      }
    }

    const sessionActor = this.sessionActor;
    if (
      sessionActor &&
      typeof sessionActor.privateKey === "string" &&
      sessionActor.privateKey
    ) {
      const canUseWorker = isDmDecryptWorkerSupported();
      const sessionPrivateKey = sessionActor.privateKey;

      if (canUseWorker) {
        addCandidate(
          "nip44",
          (targetPubkey, ciphertext, options = {}) =>
            decryptDmInWorker({
              scheme: "nip44",
              privateKey: sessionPrivateKey,
              targetPubkey,
              ciphertext,
              event: options?.event,
            }),
          {
            priority: -6,
            source: "worker",
            supportsGiftWrap: true,
          },
        );

        addCandidate(
          "nip04",
          (targetPubkey, ciphertext, options = {}) =>
            decryptDmInWorker({
              scheme: "nip04",
              privateKey: sessionPrivateKey,
              targetPubkey,
              ciphertext,
              event: options?.event,
            }),
          {
            priority: -4,
            source: "worker",
          },
        );
      }

      if (
        !this.sessionActorCipherClosures ||
        this.sessionActorCipherClosuresPrivateKey !== sessionActor.privateKey
      ) {
        const closures = await createPrivateKeyCipherClosures(
          sessionActor.privateKey,
        );
        this.sessionActorCipherClosures = closures || null;
        this.sessionActorCipherClosuresPrivateKey = sessionActor.privateKey;
      }

      const closures = this.sessionActorCipherClosures || {};
      if (typeof closures.nip44Decrypt === "function") {
        addCandidate("nip44", closures.nip44Decrypt, {
          priority: -5,
          source: "session-actor",
          supportsGiftWrap: true,
        });
      }
      if (typeof closures.nip04Decrypt === "function") {
        addCandidate("nip04", closures.nip04Decrypt, {
          priority: 0,
          source: "session-actor",
        });
      }
    }

    return { actorPubkey: normalizedActor, decryptors };
  }

  async decryptDirectMessageEvent(event, { actorPubkey } = {}) {
    const eventId = typeof event?.id === "string" ? event.id : "";
    if (eventId) {
      const cached = this.dmDecryptCache.get(eventId);
      if (cached) {
        return cached;
      }
    }

    const decryptDM = await this.ensureDmDecryptor();
    const context = await this.buildDmDecryptContext(actorPubkey);

    let result;
    try {
      result = await decryptDM(event, context);
    } catch (error) {
      devLogger.warn("[nostr] DM decryptor threw unexpectedly.", {
        error: sanitizeDecryptError(error),
        event: summarizeDmEventForLog(event),
      });
      throw error;
    }

    if (result?.ok && eventId) {
      this.dmDecryptCache.set(eventId, result);
    }

    return result;
  }

  /**
   * Fetches and decrypts Direct Messages (DMs) for the active user.
   * Handles both NIP-04 (Legacy) and NIP-17 (Gift Wrap) events transparently.
   *
   * **Process:**
   * 1. **Filter Construction**: Builds filters for Kind 4 and Kind 1059 events.
   * 2. **Relay Query**: Fetches events from read relays (or specified candidates).
   * 3. **Decryption**: Attempts to decrypt each event using available strategies:
   *    - NIP-04: Uses signer's `nip04.decrypt`.
   *    - NIP-44/17: Uses signer's `nip44.decrypt` (or private key if local).
   * 4. **Caching**: Decrypted results are cached in memory (`dmDecryptCache`) to avoid repeated decryption overhead.
   *
   * @param {string|null} [actorPubkeyInput] - The public key of the user viewing the DMs (defaults to logged-in user).
   * @param {object} [options] - Filter options.
   * @param {number} [options.limit] - Max events to fetch.
   * @param {number} [options.since] - Start timestamp.
   * @param {string[]} [options.relays] - Custom relay list.
   * @param {number} [options.decryptLimit] - Max number of messages to attempt decrypting (optimization).
   * @returns {Promise<object[]>} A list of decrypted message objects (text, timestamp, sender, etc.).
   */
  async listDirectMessages(actorPubkeyInput = null, options = {}) {
    if (!this.pool) {
      await this.ensurePool();
    }

    const context = await this.buildDmDecryptContext(actorPubkeyInput);
    if (!context.decryptors.length) {
      throw new Error("DM decryption helpers are unavailable.");
    }

    const decryptLimit =
      Number.isFinite(options?.decryptLimit) && options.decryptLimit > 0
        ? Math.floor(options.decryptLimit)
        : null;

    const relayCandidates = Array.isArray(options.relays)
      ? options.relays
      : Array.isArray(this.readRelays) && this.readRelays.length
      ? this.readRelays
      : this.relays;
    const relays = sanitizeRelayList(this.getHealthyRelays(relayCandidates));
    const relaysToUse = relays.length ? relays : Array.from(DEFAULT_RELAY_URLS);

    const filters = buildDmFilters(
      context.actorPubkey || actorPubkeyInput,
      options,
    );

    const dedupedIds = new Set();
    const messages = [];
    let decryptedCount = 0;

    return new Promise((resolve) => {
      const sub = this.pool.sub(relaysToUse, filters);
      const timeoutMs = options.timeoutMs || 10000;
      let settled = false;
      let timeoutId = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        sub.unsub();
        messages.sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0));
        resolve(messages);
      };

      timeoutId = setTimeout(() => {
        devLogger.warn("[nostr] listDirectMessages timed out.");
        finish();
      }, timeoutMs);

      sub.on("event", async (event) => {
        if (!event || typeof event !== "object") return;

        const eventId = typeof event.id === "string" ? event.id : "";
        if (eventId && dedupedIds.has(eventId)) return;
        if (eventId) dedupedIds.add(eventId);

        if (decryptLimit && decryptedCount >= decryptLimit) {
          // We reached the limit, but since relays may send out of order,
          // strictly stopping here might miss newer messages if they arrive late.
          // However, to respect the limit and avoid over-decrypting massive histories,
          // we stop processing new decrypts.
          return;
        }

        try {
          const decrypted = await this.decryptDirectMessageEvent(event, {
            actorPubkey: context.actorPubkey || actorPubkeyInput,
          });

          if (decrypted?.ok) {
            decryptedCount++;
            messages.push(decrypted);
            if (typeof options.onMessage === "function") {
              try {
                options.onMessage(decrypted);
              } catch (error) {
                devLogger.warn("[nostr] onMessage callback threw:", error);
              }
            }
          }
        } catch (error) {
          devLogger.warn("[nostr] Failed to decrypt DM event during list.", {
            error: sanitizeDecryptError(error),
            event: summarizeDmEventForLog(event),
          });
        }
      });

      sub.on("eose", () => {
        finish();
      });
    });
  }

  subscribeDirectMessages(actorPubkeyInput = null, options = {}) {
    if (!this.pool) {
      throw new Error("nostr pool is not initialized");
    }

    const relayCandidates = Array.isArray(options.relays)
      ? options.relays
      : Array.isArray(this.readRelays) && this.readRelays.length
      ? this.readRelays
      : this.relays;
    const relays = sanitizeRelayList(this.getHealthyRelays(relayCandidates));
    const relaysToUse = relays.length ? relays : Array.from(DEFAULT_RELAY_URLS);

    const filters = buildDmFilters(actorPubkeyInput, options);
    const subscription = this.pool.sub(relaysToUse, filters);
    const seenIds = new Set();

    subscription.on("event", (event) => {
      if (!event || typeof event !== "object") {
        return;
      }

      const eventId = typeof event.id === "string" ? event.id : null;
      if (eventId) {
        if (seenIds.has(eventId)) {
          return;
        }
        seenIds.add(eventId);
      }

      if (typeof options.onEvent === "function") {
        try {
          options.onEvent(event);
        } catch (error) {
          devLogger.warn("[nostr] DM onEvent handler threw.", error);
        }
      }

      if (options.skipDecrypt === true) {
        return;
      }

      (async () => {
        try {
          const contextPromise = this.getCurrentDmDecryptContextPromise(actorPubkeyInput);
          const context = await contextPromise;

          if (!context.decryptors.length) {
            this.refreshDmDecryptContext(actorPubkeyInput);

            if (typeof options.onFailure === "function") {
              options.onFailure(
                { ok: false, event },
                { event, reason: "no-decryptors" },
              );
            }
            return;
          }

          const result = await this.decryptDirectMessageEvent(event, {
            actorPubkey: context.actorPubkey || actorPubkeyInput,
          });

          if (result?.ok) {
            if (typeof options.onMessage === "function") {
              options.onMessage(result, { event });
            }
          } else if (typeof options.onFailure === "function") {
            options.onFailure(result, { event });
          }
        } catch (error) {
          if (typeof options.onError === "function") {
            options.onError(error, { event });
          } else {
            devLogger.warn(
              "[nostr] Failed to decrypt DM event from subscription.",
              {
                error: sanitizeDecryptError(error),
                event: summarizeDmEventForLog(event),
              },
            );
          }
        }
      })();
    });

    if (typeof options.onEose === "function") {
      subscription.on("eose", () => {
        try {
          options.onEose();
        } catch (error) {
          devLogger.warn("[nostr] DM onEose handler threw.", error);
        }
      });
    }

    const originalUnsub =
      typeof subscription.unsub === "function"
        ? subscription.unsub.bind(subscription)
        : () => {};

    subscription.unsub = () => {
      seenIds.clear();
      return originalUnsub();
    };

    return subscription;
  }

  getCurrentDmDecryptContextPromise(actorPubkeyInput = null) {
    const normalizedActor = normalizeActorKey(actorPubkeyInput);
    const cacheKey = normalizedActor || 'default';

    if (!this.dmDecryptContextCache) {
      this.dmDecryptContextCache = new Map();
    }

    let promise = this.dmDecryptContextCache.get(cacheKey);
    if (!promise) {
      promise = this.buildDmDecryptContext(actorPubkeyInput);
      this.dmDecryptContextCache.set(cacheKey, promise);
    }

    return promise;
  }

  refreshDmDecryptContext(actorPubkeyInput = null) {
    const normalizedActor = normalizeActorKey(actorPubkeyInput);
    const cacheKey = normalizedActor || 'default';

    if (!this.dmDecryptContextCache) {
      this.dmDecryptContextCache = new Map();
    }

    if (this.dmDecryptContextCache.has(cacheKey)) {
      this.dmDecryptContextCache.delete(cacheKey);
    }

    const newPromise = this.buildDmDecryptContext(actorPubkeyInput);
    this.dmDecryptContextCache.set(cacheKey, newPromise);

    return newPromise;
  }

  /**
   * Sends a private Direct Message (DM) to a target user.
   * Supports both legacy NIP-04 (simple encryption) and modern NIP-17 (sealed gift wraps).
   *
   * **Protocol Selection:**
   * - Defaults to NIP-04 for maximum compatibility unless `options.useNip17` is explicitly true.
   * - NIP-17 is required for sending rich attachments (images/videos) privately.
   *
   * **NIP-17 Flow (Sealed Rumor):**
   * 1. **Rumor**: Create an unsigned Kind 14 (Chat Message) or Kind 1063 (Attachment).
   * 2. **Seal**: Sign the rumor, encrypt it to the recipient, and wrap it in a Kind 13 (Seal).
   * 3. **Wrap**: Generate an ephemeral keypair, encrypt the seal to the recipient, and wrap in a Kind 1059 (Gift Wrap).
   *    This creates an "onion" where the outer layer leaks no metadata about the sender or content.
   * 4. **Publish**: Send to the recipient's inbox relays (discovered via NIP-65).
   *
   * **NIP-04 Flow (Legacy):**
   * 1. **Encrypt**: Encrypt the message content using the shared secret (sender priv + recipient pub).
   * 2. **Publish**: Send a Kind 4 event with the ciphertext.
   *    *Privacy Warning*: NIP-04 leaks metadata (sender, receiver, timestamp) to relays.
   *
   * @param {string} targetNpub - The recipient's public key (npub or hex).
   * @param {string} message - The plaintext message to send.
   * @param {string|null} [actorPubkeyOverride] - Optional sender pubkey (defaults to logged-in user).
   * @param {object} [options] - Configuration options.
   * @param {boolean} [options.useNip17=false] - If true, uses the NIP-17 sealing protocol.
   * @param {Array<{url: string, type: string}>} [options.attachments] - File attachments (requires NIP-17).
   * @returns {Promise<{ok: boolean, error?: string, details?: any}>} Result object. `ok: true` on success.
   */
  async sendDirectMessage(targetNpub, message, actorPubkeyOverride = null, options = {}) {
    let resolvedOptions = options;
    let resolvedActorOverride = actorPubkeyOverride;
    if (actorPubkeyOverride && typeof actorPubkeyOverride === "object") {
      resolvedOptions = actorPubkeyOverride;
      resolvedActorOverride = null;
    }

    if (!resolvedOptions || typeof resolvedOptions !== "object") {
      resolvedOptions = {};
    }

    const trimmedTarget = typeof targetNpub === "string" ? targetNpub.trim() : "";
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    const attachments = Array.isArray(resolvedOptions.attachments)
      ? resolvedOptions.attachments.filter(
          (attachment) =>
            attachment &&
            typeof attachment === "object" &&
            (typeof attachment.url === "string" ||
              typeof attachment.x === "string"),
        )
      : [];
    const hasAttachments = attachments.length > 0;

    if (!trimmedTarget) {
      return { ok: false, error: "invalid-target" };
    }

    if (!trimmedMessage && !hasAttachments) {
      return { ok: false, error: "empty-message" };
    }

    if (!this.pool) {
      return { ok: false, error: "nostr-uninitialized" };
    }

    const activeSignerCandidate =
      typeof resolvedActorOverride === "string" && resolvedActorOverride.trim()
        ? this.signerManager.resolveActiveSigner(resolvedActorOverride)
        : this.signerManager.resolveActiveSigner(this.pubkey);
    const baseActiveSigner = activeSignerCandidate || this.signerManager.getActiveSigner();
    const signer =
      typeof resolvedActorOverride === "string" && resolvedActorOverride.trim()
        ? activeSignerCandidate
        : baseActiveSigner
        ? this.signerManager.resolveActiveSigner(baseActiveSigner.pubkey || this.pubkey)
        : null;

    if (!signer || typeof signer.signEvent !== "function") {
      return { ok: false, error: "sign-event-unavailable" };
    }

    if (shouldRequestExtensionPermissions(signer)) {
      const permissionResult = await this.ensureExtensionPermissions(
        DEFAULT_NIP07_ENCRYPTION_METHODS,
        { context: "dm" },
      );
      if (!permissionResult.ok) {
        userLogger.warn(
          "[nostr] Cannot send direct message without encryption permissions.",
          permissionResult.error,
        );
        return {
          ok: false,
          error: "extension-encryption-permission-denied",
          details: permissionResult.error,
        };
      }
    }

    let actorHex =
      typeof resolvedActorOverride === "string" && resolvedActorOverride.trim()
        ? resolvedActorOverride.trim()
        : "";

    if (!actorHex && typeof this.pubkey === "string") {
      actorHex = this.pubkey.trim();
    }

    if (!actorHex && typeof signer?.pubkey === "string") {
      actorHex = signer.pubkey;
    }

    const targetHex = decodeNpubToHex(trimmedTarget);
    if (!targetHex) {
      return { ok: false, error: "invalid-target" };
    }

    const signingAdapter =
      resolvedOptions?.signingAdapter &&
      typeof resolvedOptions.signingAdapter === "object"
        ? resolvedOptions.signingAdapter
        : signer && typeof signer.signEvent === "function"
        ? {
            signEvent: (event) => signer.signEvent(event),
            getPubkey: async () => actorHex || signer.pubkey || "",
            getDisplayName: async () => "",
          }
        : null;

    if (!signingAdapter || typeof signingAdapter.signEvent !== "function") {
      return { ok: false, error: "sign-event-unavailable" };
    }

    if (typeof signingAdapter.getPubkey === "function") {
      try {
        const adapterPubkey = await signingAdapter.getPubkey();
        if (typeof adapterPubkey === "string" && adapterPubkey.trim()) {
          actorHex = adapterPubkey.trim();
        }
      } catch (error) {
        devLogger.warn("[nostr] Failed to resolve DM pubkey from adapter.", error);
      }
    }

    if (!actorHex) {
      return { ok: false, error: "missing-actor-pubkey" };
    }

    const signerCapabilities = resolveSignerCapabilities(signer);
    const useNip17 = Boolean(resolvedOptions.useNip17);

    if (hasAttachments && !useNip17) {
      return { ok: false, error: "attachments-unsupported" };
    }

    const resolveNip17RelaySelection = async (pubkey, relayHints) => {
      const discoveryRelays = sanitizeRelayList(
        Array.isArray(this.readRelays) && this.readRelays.length
          ? this.readRelays
          : Array.isArray(this.relays) && this.relays.length
            ? this.relays
            : RELAY_URLS,
      );
      const fallbackRelays = sanitizeRelayList(
        Array.isArray(this.writeRelays) && this.writeRelays.length
          ? this.writeRelays
          : Array.isArray(this.relays) && this.relays.length
            ? this.relays
            : RELAY_URLS,
      );

      return resolveDmRelaySelection({
        pubkey,
        relayHints,
        discoveryRelays,
        fallbackRelays,
        pool: this.pool,
        log: { dev: devLogger, user: userLogger },
      });
    };

    if (useNip17) {
      if (!signerCapabilities.nip44 || typeof signer.nip44Encrypt !== "function") {
        return { ok: false, error: "nip44-unsupported" };
      }

      const recipientSelection = await resolveNip17RelaySelection(
        targetHex,
        resolvedOptions.recipientRelayHints,
      );

      if (!recipientSelection.relays.length) {
        return { ok: false, error: "nip17-relays-unavailable" };
      }

      const senderSelection = await resolveNip17RelaySelection(
        actorHex,
        resolvedOptions.senderRelayHints,
      );
      const senderRelayTargets = senderSelection.relays;
      const relayWarning =
        recipientSelection.warning === DM_RELAY_WARNING_FALLBACK ||
        senderSelection.warning === DM_RELAY_WARNING_FALLBACK
          ? DM_RELAY_WARNING_FALLBACK
          : null;

      const tools = await ensureNostrTools();
      const getPublicKey =
        tools && typeof tools.getPublicKey === "function" ? tools.getPublicKey : null;
      if (!getPublicKey) {
        return { ok: false, error: "nip17-keygen-failed" };
      }

      const randomPastTimestamp = () => {
        const now = Math.floor(Date.now() / 1000);
        const offset = Math.floor(Math.random() * 172800);
        return now - offset;
      };

      const generateEphemeralKeypair = () => {
        let privateKey = "";
        try {
          if (typeof tools.generateSecretKey === "function") {
            const secret = tools.generateSecretKey();
            if (secret instanceof Uint8Array) {
              privateKey = bytesToHex(secret);
            }
          }
          if (!privateKey) {
            if (typeof tools.generatePrivateKey === "function") {
              privateKey = tools.generatePrivateKey();
            } else if (window?.crypto?.getRandomValues) {
              const randomBytes = new Uint8Array(32);
              window.crypto.getRandomValues(randomBytes);
              privateKey = Array.from(randomBytes)
                .map((byte) => byte.toString(16).padStart(2, "0"))
                .join("");
            }
          }
        } catch (error) {
          devLogger.warn("[nostr] Failed to generate NIP-17 wrapper key.", error);
          privateKey = "";
        }

        const normalizedPrivateKey =
          typeof privateKey === "string" ? privateKey.trim() : "";
        if (!normalizedPrivateKey) {
          return null;
        }

        let pubkey = "";
        try {
          pubkey = getPublicKey(normalizedPrivateKey);
        } catch (error) {
          let retrySuccess = false;
          try {
            if (HEX64_REGEX.test(normalizedPrivateKey)) {
              const bytes = new Uint8Array(normalizedPrivateKey.length / 2);
              for (let i = 0; i < normalizedPrivateKey.length; i += 2) {
                bytes[i / 2] = parseInt(
                  normalizedPrivateKey.substring(i, i + 2),
                  16,
                );
              }
              pubkey = getPublicKey(bytes);
              retrySuccess = true;
            }
          } catch (retryError) {
            // Fall back to error handling below
          }
          if (!retrySuccess) {
            devLogger.warn(
              "[nostr] Failed to derive NIP-17 wrapper pubkey.",
              error,
            );
            return null;
          }
        }

        return { privateKey: normalizedPrivateKey, pubkey };
      };

      const rumorEvents = [];
      const createdAt = Math.floor(Date.now() / 1000);

      if (trimmedMessage) {
        rumorEvents.push(buildChatMessageEvent({
          pubkey: actorHex,
          created_at: createdAt,
          recipientPubkey: targetHex,
          content: trimmedMessage,
        }));
      }

      if (hasAttachments) {
        attachments.forEach((attachment) => {
          const normalizedAttachment = {
            x:
              typeof attachment.x === "string"
                ? attachment.x.trim().toLowerCase()
                : "",
            url: typeof attachment.url === "string" ? attachment.url.trim() : "",
            name:
              typeof attachment.name === "string" ? attachment.name.trim() : "",
            type:
              typeof attachment.type === "string" ? attachment.type.trim() : "",
            size: Number.isFinite(attachment.size) ? Math.floor(attachment.size) : null,
            key: typeof attachment.key === "string" ? attachment.key.trim() : "",
          };

          rumorEvents.push(
            buildDmAttachmentEvent({
              pubkey: actorHex,
              created_at: createdAt,
              recipientPubkey: targetHex,
              attachment: normalizedAttachment,
            }),
          );
        });
      }

      if (!rumorEvents.length) {
        return { ok: false, error: "empty-message" };
      }

      const buildGiftWrapForRecipient = async (
        recipientPubkey,
        relayHint,
        rumorEvent,
      ) => {
        const sealPayload = buildSealEvent({
          pubkey: actorHex,
          created_at: randomPastTimestamp(),
          ciphertext: await signer.nip44Encrypt(
            recipientPubkey,
            JSON.stringify(rumorEvent),
          ),
        });

        const signedSeal = await signingAdapter.signEvent(sealPayload);
        if (!signedSeal || typeof signedSeal.id !== "string") {
          throw new Error("seal-signature-failed");
        }

        const wrapperKeys = generateEphemeralKeypair();
        if (!wrapperKeys) {
          throw new Error("wrapper-keygen-failed");
        }

        const cipherClosures = await createPrivateKeyCipherClosures(
          wrapperKeys.privateKey,
        );
        if (typeof cipherClosures.nip44Encrypt !== "function") {
          throw new Error("wrapper-encryption-unavailable");
        }

        const wrapCiphertext = await cipherClosures.nip44Encrypt(
          recipientPubkey,
          JSON.stringify(signedSeal),
        );

        const wrapEvent = buildGiftWrapEvent({
          pubkey: wrapperKeys.pubkey,
          created_at: randomPastTimestamp(),
          recipientPubkey,
          relayHint,
          ciphertext: wrapCiphertext,
        });

        return {
          wrap: signEventWithPrivateKey(wrapEvent, wrapperKeys.privateKey),
          seal: signedSeal,
        };
      };

      const resolveRumorPreview = (rumorEvent) => {
        const content =
          typeof rumorEvent?.content === "string" ? rumorEvent.content.trim() : "";
        if (content) {
          return content;
        }

        const tags = Array.isArray(rumorEvent?.tags) ? rumorEvent.tags : [];
        const nameTag = tags.find(
          (tag) => Array.isArray(tag) && tag[0] === "name" && tag[1],
        );
        if (nameTag) {
          return `Attachment: ${nameTag[1]}`;
        }

        return "Attachment";
      };

      const publishRumorEvent = async (rumorEvent) => {
        let recipientGiftWrap;
        try {
          recipientGiftWrap = await buildGiftWrapForRecipient(
            targetHex,
            recipientSelection.relays[0] || "",
            rumorEvent,
          );
        } catch (error) {
          devLogger.warn("[nostr] Failed to build NIP-17 recipient wrap.", error);
          const errorCode =
            error?.message === "wrapper-keygen-failed"
              ? "nip17-keygen-failed"
              : "encryption-failed";
          return { ok: false, error: errorCode, details: error };
        }

        const conversationId = `dm:${[actorHex, targetHex].sort().join(":")}`;
        const preview = resolveRumorPreview(rumorEvent);
        const dmRecord = {
          id: recipientGiftWrap.wrap.id,
          conversation_id: conversationId,
          sender_pubkey: actorHex,
          receiver_pubkey: targetHex,
          created_at: rumorEvent.created_at,
          kind: rumorEvent.kind,
          content: typeof rumorEvent.content === "string" ? rumorEvent.content : "",
          tags: rumorEvent.tags,
          status: "pending",
          seen: true,
        };

        try {
          await writeMessages(dmRecord);
          await updateConversationFromMessage(dmRecord, {
            preview,
            unseenDelta: 0,
          });
        } catch (error) {
          devLogger.warn("[nostr] Failed to persist outgoing DM.", error);
        }

        const recipientPublishResults = await Promise.all(
          recipientSelection.relays.map((url) =>
            publishEventToRelay(this.pool, url, recipientGiftWrap.wrap),
          ),
        );

        const recipientSuccess = recipientPublishResults.some(
          (result) => result.success,
        );
        if (!recipientSuccess) {
          try {
            await writeMessages({ ...dmRecord, status: "failed" });
          } catch (error) {
            devLogger.warn("[nostr] Failed to persist DM failure state.", error);
          }
          return {
            ok: false,
            error: "publish-failed",
            details: recipientPublishResults.filter((result) => !result.success),
          };
        }

        let senderGiftWrap = null;
        try {
          senderGiftWrap = await buildGiftWrapForRecipient(
            actorHex,
            senderRelayTargets[0] || "",
            rumorEvent,
          );
        } catch (error) {
          devLogger.warn("[nostr] Failed to build NIP-17 sender copy.", error);
        }

        if (senderGiftWrap && senderRelayTargets.length) {
          const senderPublishResults = await Promise.all(
            senderRelayTargets.map((url) =>
              publishEventToRelay(this.pool, url, senderGiftWrap.wrap),
            ),
          );
          if (!senderPublishResults.some((result) => result.success)) {
            devLogger.warn("[nostr] Failed to publish sender copy of NIP-17 DM.", {
              relays: senderRelayTargets,
            });
          }
        }

        try {
          await writeMessages({ ...dmRecord, status: "published" });
        } catch (error) {
          devLogger.warn("[nostr] Failed to persist DM publish state.", error);
        }

        return { ok: true };
      };

      const failures = [];
      for (const rumorEvent of rumorEvents) {
        const result = await publishRumorEvent(rumorEvent);
        if (!result?.ok) {
          failures.push(result);
        }
      }

      if (failures.length) {
        return {
          ok: false,
          error: failures[0]?.error || "publish-failed",
          details: failures,
        };
      }

      return relayWarning ? { ok: true, warning: relayWarning } : { ok: true };
    }

    const encryptionErrors = [];
    let ciphertext = "";

    const normalizedActorHex = normalizeActorKey(actorHex);
    const sessionActor = this.sessionActor;
    const sessionPrivateKey =
      sessionActor &&
      typeof sessionActor.pubkey === "string" &&
      sessionActor.pubkey.toLowerCase() === normalizedActorHex &&
      typeof sessionActor.privateKey === "string"
        ? sessionActor.privateKey
        : "";

    if (sessionPrivateKey) {
      try {
        ciphertext = await encryptNip04InWorker({
          privateKey: sessionPrivateKey,
          targetPubkey: targetHex,
          plaintext: trimmedMessage,
        });
      } catch (error) {
        encryptionErrors.push({ scheme: "nip04-worker", error });
      }
    }

    if (
      !ciphertext &&
      signerCapabilities.nip04 &&
      typeof signer.nip04Encrypt === "function"
    ) {
      try {
        const encrypted = await signer.nip04Encrypt(targetHex, trimmedMessage);
        if (typeof encrypted === "string" && encrypted) {
          ciphertext = encrypted;
        }
      } catch (error) {
        encryptionErrors.push({ scheme: "nip04", error });
      }
    }

    if (!ciphertext) {
      if (!sessionPrivateKey && !signerCapabilities.nip04) {
        const error = new Error(
          "Your signer does not support NIP-04 encryption.",
        );
        userLogger.warn("[nostr] Encryption unsupported for DM send.", error);
        return {
          ok: false,
          error: "encryption-unsupported",
          details: error,
        };
      }

      const details =
        encryptionErrors.length === 1
          ? encryptionErrors[0].error
          : encryptionErrors.map((entry) => ({
              scheme: entry.scheme,
              error: entry.error,
            }));
      return { ok: false, error: "encryption-failed", details };
    }

    const event = buildLegacyDirectMessageEvent({
      pubkey: actorHex,
      created_at: Math.floor(Date.now() / 1000),
      recipientPubkey: targetHex,
      ciphertext,
    });

    let signedEvent;
    try {
      signedEvent = await signingAdapter.signEvent(event);
    } catch (error) {
      return { ok: false, error: "signature-failed", details: error };
    }

    if (!signedEvent || typeof signedEvent.id !== "string") {
      return { ok: false, error: "signature-failed" };
    }

    const conversationId = `dm:${[actorHex, targetHex].sort().join(":")}`;
    const dmRecord = {
      id: signedEvent.id,
      conversation_id: conversationId,
      sender_pubkey: actorHex,
      receiver_pubkey: targetHex,
      created_at: event.created_at,
      kind: event.kind,
      content: trimmedMessage,
      tags: event.tags,
      status: "pending",
      seen: true,
    };

    try {
      await writeMessages(dmRecord);
      await updateConversationFromMessage(dmRecord, {
        preview: trimmedMessage,
        unseenDelta: 0,
      });
    } catch (error) {
      devLogger.warn("[nostr] Failed to persist outgoing DM.", error);
    }

    const relayListCandidates = sanitizeRelayList(
      Array.isArray(this.readRelays) && this.readRelays.length
        ? this.readRelays
        : Array.isArray(this.relays) && this.relays.length
        ? this.relays
        : RELAY_URLS,
    );

    const parseRecipientRelays = (relayEvent) => {
      const tags = Array.isArray(relayEvent?.tags) ? relayEvent.tags : [];
      const seen = new Set();
      const candidates = [];

      tags.forEach((tag) => {
        if (!Array.isArray(tag) || tag[0] !== "r") {
          return;
        }
        const url = typeof tag[1] === "string" ? tag[1].trim() : "";
        if (!url) {
          return;
        }
        const marker =
          typeof tag[2] === "string" ? tag[2].trim().toLowerCase() : "";
        if (marker === "write") {
          return;
        }
        if (!seen.has(url)) {
          seen.add(url);
          candidates.push(url);
        }
      });

      return sanitizeRelayList(candidates);
    };

    let recipientRelays = [];
    if (relayListCandidates.length) {
      try {
        await this.ensurePool();
        const events = await this.pool.list(relayListCandidates, [
          { kinds: [10002], authors: [targetHex], limit: 1 },
        ]);
        const sorted = Array.isArray(events)
          ? events
              .filter((entry) => entry && entry.pubkey === targetHex)
              .sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0))
          : [];
        if (sorted.length) {
          recipientRelays = parseRecipientRelays(sorted[0]);
        }
      } catch (error) {
        devLogger.warn("[nostr] Failed to load recipient relay list.", error);
      }
    }

    const fallbackRelays = sanitizeRelayList(
      Array.isArray(this.writeRelays) && this.writeRelays.length
        ? this.writeRelays
        : Array.isArray(this.relays) && this.relays.length
        ? this.relays
        : RELAY_URLS,
    );

    const relays = recipientRelays.length ? recipientRelays : fallbackRelays;

    const publishResults = await Promise.all(
      relays.map((url) => publishEventToRelay(this.pool, url, signedEvent))
    );

    const success = publishResults.some((result) => result.success);
    if (!success) {
      try {
        await writeMessages({ ...dmRecord, status: "failed" });
      } catch (error) {
        devLogger.warn("[nostr] Failed to persist DM failure state.", error);
      }
      return {
        ok: false,
        error: "publish-failed",
        details: publishResults.filter((result) => !result.success),
      };
    }

    try {
      await writeMessages({ ...dmRecord, status: "published" });
    } catch (error) {
      devLogger.warn("[nostr] Failed to persist DM publish state.", error);
    }

    return { ok: true };
  }

  /**
   * Publish a new video using the v3 content schema.
   */
  async signAndPublishEvent(event, options = {}) {
    return signAndPublishEventHelper({
      client: this,
      event,
      options,
      resolveActiveSigner: (p) => this.signerManager.resolveActiveSigner(p),
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
    });
  }

  /**
   * Registers a local private key (nsec) as the active signer.
   * Useful for tests or manual key management.
   *
   * @param {object} opts
   * @param {string} opts.privateKey - The hex private key.
   * @param {string} [opts.pubkey] - Optional hex public key.
   * @returns {object} The created signer adapter.
   */
  async registerPrivateKeySigner(opts) {
    const adapter = await createNsecAdapter(opts);
    this.signerManager.setActiveSigner(adapter);

    if (opts.privateKey && typeof opts.privateKey === "string") {
      this.sessionActor = {
        pubkey: adapter.pubkey,
        privateKey: opts.privateKey.trim().toLowerCase(),
        source: "nsec",
      };
    }

    return adapter;
  }

  /**
   * Publishes a fresh Video Series (Kind 30078) to the network.
   * This is the entry point for creating new content.
   *
   * **Protocol (V3):**
   * - The main event is a Kind 30078 (Application-Specific Data) with `t=video`.
   * - It includes both a WebTorrent `magnet` and a direct `url` (if hosted).
   * - A unique `d` tag is generated to make the series addressable (NIP-33).
   * - A `videoRootId` is assigned to track future edits.
   *
   * **Side Effects (Mirroring):**
   * 1. **Primary Event**: Signs and broadcasts the Kind 30078 event.
   * 2. **NIP-94 Mirror**: If a `url` exists, we *also* publish a Kind 1063 (File Header).
   *    This allows clients that only support NIP-94 (like file browsers) to see the video.
   * 3. **NIP-71 Metadata**: If the user added categories/tags, we publish a Kind 22 event
   *    referencing the main video. This keeps the main event lightweight.
   *
   * @param {object} videoPayload - The normalized form data (title, magnet, thumbnail, etc.).
   * @param {string} pubkey - The active user's public key.
   * @returns {Promise<import("nostr-tools").Event>} The signed Kind 30078 event.
   * @throws {Error} If signing fails or the primary event is rejected by all relays.
   */
  async publishVideo(videoPayload, pubkey) {
    const context = await prepareVideoPublishPayload(videoPayload, pubkey);

    devLogger.log("Publish event with series identifier:", context.videoRootId);
    devLogger.log("Event content:", context.event.content);

    try {
      // 1. Publish the primary Video Note (Kind 30078)
      const { signedEvent } = await this.signAndPublishEvent(context.event, {
        context: "video note",
        logName: "Video note",
        devLogLabel: "video note",
        resolveActiveSigner: (p) => this.signerManager.resolveActiveSigner(p),
      });

      // 2. Publish NIP-94 Mirror (Kind 1063) if a hosted URL is present.
      await handlePublishNip94(this, signedEvent, context);

      // 3. Publish NIP-71 Metadata (Kind 22) if categories/tags were added.
      await handlePublishNip71(this, signedEvent, context);

      return signedEvent;
    } catch (err) {
      devLogger.error("Failed to sign/publish:", err);
      throw err;
    }
  }

  /**
   * Publishes a *new version* of an existing video series.
   * Nostr events are immutable, so "editing" means creating a newer event that supersedes the old one.
   *
   * **Mechanism (NIP-33 Replacement):**
   * 1. **Address Retention**: We reuse the original `d` tag. Relays will now serve *this* event
   *    instead of the old one when queried by address.
   * 2. **Root Preservation**: We copy the `videoRootId` from the original event. This links the
   *    new event to the series history.
   * 3. **Content Update**: The new payload (title, magnet, etc.) replaces the old content.
   *
   * **Constraints:**
   * - The `userPubkey` must match the original event's author (only the creator can edit).
   * - The original event must be V2 or newer (legacy V1 migration is not supported here).
   *
   * @param {object} originalEventStub - The video event being edited (requires `id` and `d` tag).
   * @param {object} updatedData - The modified fields (title, thumbnail, etc.).
   * @param {string} userPubkey - The active user's public key.
   * @returns {Promise<import("nostr-tools").Event>} The newly published event.
   * @throws {Error} If the user is not the owner or if the original event is too old.
   */
  async editVideo(originalEventStub, updatedData, userPubkey) {
    if (!userPubkey) {
      throw new Error("Not logged in to edit.");
    }

    // NOTE: Keep the Upload, Edit, and Revert flows synchronized when
    // adjusting validation or persisted fields.
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

    const context = prepareVideoEditPayload({
      baseEvent,
      originalEventStub,
      updatedData,
      userPubkey,
      resolveEventDTag: (evt, stub) => this.resolveEventDTag(evt, stub),
    });

    devLogger.log("Creating edited event with root ID:", context.videoRootId);
    devLogger.log("Event content:", context.event.content);

    await this.ensureActiveSignerForPubkey(userPubkeyLower);

    try {
      const { signedEvent } = await this.signAndPublishEvent(context.event, {
        context: "edited video note",
        logName: "Edited video note",
        devLogLabel: "edited video note",
        resolveActiveSigner: (p) => this.signerManager.resolveActiveSigner(p),
      });

      await handlePublishNip94(this, signedEvent, context);
      await handlePublishNip71(this, signedEvent, context);

      return signedEvent;
    } catch (err) {
      userLogger.error("Edit failed:", err);
      throw err;
    }
  }

  async ensureActiveSignerForPubkey(pubkey) {
    return this.signerManager.ensureActiveSignerForPubkey(pubkey);
  }

  async derivePrivateKeyFromSecret(secret) {
    return this.signerManager.derivePrivateKeyFromSecret(secret);
  }

  async loginWithExtension(options) {
    // Check if ensureExtensionPermissions was overridden on this instance (e.g. by tests).
    // Only proxy when the own property differs from the prototype method to avoid recursion.
    const ownDesc = Object.getOwnPropertyDescriptor(this, "ensureExtensionPermissions");
    const isOverridden =
      ownDesc &&
      typeof ownDesc.value === "function" &&
      ownDesc.value !== NostrClient.prototype.ensureExtensionPermissions;

    if (isOverridden) {
      const sm = this.signerManager;
      const smOriginal = sm.ensureExtensionPermissions.bind(sm);
      sm.ensureExtensionPermissions = (...args) => ownDesc.value.call(this, ...args);
      try {
        return await sm.loginWithExtension(options);
      } finally {
        sm.ensureExtensionPermissions = smOriginal;
      }
    }
    return this.signerManager.loginWithExtension(options);
  }

  installNip46Client(client, options) {
    return this.signerManager.installNip46Client(client, options);
  }

  async connectRemoteSigner(params) {
    return this.signerManager.connectRemoteSigner(params);
  }

  async useStoredRemoteSigner(options) {
    return this.signerManager.useStoredRemoteSigner(options);
  }

  getRemoteSignerStatus() {
    return this.signerManager.getRemoteSignerStatus();
  }

  onRemoteSignerChange(listener) {
    return this.signerManager.onRemoteSignerChange(listener);
  }

  getStoredNip46Metadata() {
    return this.signerManager.getStoredNip46Metadata();
  }

  async ensureExtensionPermissions(
    requiredMethods,
    options,
  ) {
    return this.signerManager.ensureExtensionPermissions(requiredMethods, options);
  }

  async scheduleStoredRemoteSignerRestore() {
    return this.signerManager.scheduleStoredRemoteSignerRestore();
  }

  async disconnectRemoteSigner(options) {
    return this.signerManager.disconnectRemoteSigner(options);
  }

  async ensureSessionActor(force) {
    return this.signerManager.ensureSessionActor(force);
  }

  clearStoredSessionActor() {
    return this.signerManager.clearStoredSessionActor();
  }

  logout() {
    return this.signerManager.logout();
  }

  /**
   * Performs a "Soft Delete" by publishing a new version marked as deleted.
   *
   * **Mechanism:**
   * - Creates a new Kind 30078 event with the same `d` tag as the original.
   * - The content is scrubbed and replaced with `{ deleted: true, ...placeholder }`.
   * - Relays will overwrite the old event with this tombstone when resolving the address.
   * - This is reversible (by publishing a new valid version later) and preserves the history chain.
   *
   * @param {object} originalEvent - The video event object to revert.
   * @param {string} pubkey - The active user's public key (must match owner).
   * @returns {Promise<{event: object, publishResults: object[], summary: object}>} The published tombstone event and relay results.
   * @throws {Error} If the user is not the owner or signing fails.
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

    const existingD = this.resolveEventDTag(baseEvent, originalEvent) || null;
    const stableDTag =
      existingD || baseEvent?.id || originalEvent?.id || null;

    const event = buildRevertVideoPayload({
      baseEvent,
      originalEventId: originalEvent?.id,
      pubkey,
      existingD,
      stableDTag,
    });

    await this.ensureActiveSignerForPubkey(pubkey);

    const signer = this.signerManager.resolveActiveSigner(pubkey);
    if (!signer || typeof signer.signEvent !== "function") {
      const error = new Error(
        "An active signer with signEvent support is required to revert videos.",
      );
      error.code = "nostr-extension-missing";
      throw error;
    }

    if (shouldRequestExtensionPermissions(signer)) {
      const permissionResult = await this.ensureExtensionPermissions(
        DEFAULT_NIP07_CORE_METHODS,
      );
      if (!permissionResult.ok) {
        userLogger.warn(
          "[nostr] Signer permissions denied while reverting a video.",
          permissionResult.error,
        );
        const error = new Error(
          "The active signer must allow signing before reverting a video.",
        );
        error.code = "extension-permission-denied";
        error.cause = permissionResult.error;
        throw error;
      }
    }

    const signedEvent = await queueSignEvent(signer, event);
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

  async _hydrateHistoryForDelete(targetVideo) {
    if (!targetVideo) return;
    try {
      await this.hydrateVideoHistory(targetVideo);
    } catch (error) {
      devLogger.warn(
        "[nostr] Failed to hydrate video history before delete:",
        error
      );
    }
  }

  _getEventsToDelete(videoRootId, pubkey, targetVideo) {
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
    const targetDTag = this.resolveEventDTag(targetVideo);

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
      const candidateDTag = this.resolveEventDTag(candidate);
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

    return { matchingEvents, inferredRoot };
  }

  async _softDeleteVersions(matchingEvents, inferredRoot, targetVideo, pubkey) {
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
      this.dirtyEventIds.add(vid.id);

      const activeKey = getActiveKey(cached);
      if (activeKey) {
        this.activeMap.delete(activeKey);
        const revertCreatedAt = Number.isFinite(revertEvent?.created_at)
          ? Math.floor(revertEvent.created_at)
          : Math.floor(Date.now() / 1000);
        this.recordTombstone(activeKey, revertCreatedAt);
      }
    }

    return { revertSummaries, revertEvents };
  }

  async _hardDeleteVersions(matchingEvents, revertEvents, targetVideo, inferredRoot, pubkey) {
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
      await this.ensureActiveSignerForPubkey(pubkey);

      const signer = this.signerManager.resolveActiveSigner(pubkey);
      if (!signer || typeof signer.signEvent !== "function") {
        const error = new Error(
          "An active signer with signEvent support is required to delete videos.",
        );
        error.code = "nostr-extension-missing";
        throw error;
      }

      if (shouldRequestExtensionPermissions(signer)) {
        const permissionResult = await this.ensureExtensionPermissions(
          DEFAULT_NIP07_CORE_METHODS,
        );
        if (!permissionResult.ok) {
          userLogger.warn(
            "[nostr] Signer permissions denied while deleting videos.",
            permissionResult.error,
          );
          const error = new Error(
            "The active signer must allow signing before deleting a video.",
          );
          error.code = "extension-permission-denied";
          error.cause = permissionResult.error;
          throw error;
        }
      }

      const chunkSize = 100;
      for (let index = 0; index < identifierRecords.length; index += chunkSize) {
        const chunk = identifierRecords.slice(index, index + chunkSize);
        const eventIds = chunk
          .filter((record) => record.type === "e")
          .map((record) => record.value);
        const addresses = chunk
          .filter((record) => record.type === "a")
          .map((record) => record.value);

        const deleteEvent = buildDeletionEvent({
          pubkey,
          created_at: Math.floor(Date.now() / 1000),
          eventIds,
          addresses,
          reason: inferredRoot
            ? `Delete video root ${inferredRoot}`
            : "Delete published video events",
        });

        const signedDelete = await queueSignEvent(signer, deleteEvent);
        const publishResults = await publishEventToRelays(
          this.pool,
          this.relays,
          signedDelete,
          { waitForAll: true }
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

    return deleteSummaries;
  }

  /**
   * Permanently removes a video series from the network.
   * This is a "Nuclear Option" that attempts to wipe all traces of the video.
   *
   * **The Problem:**
   * Because a video series might have 10 "edit" versions, deleting just the "latest" one isn't enough.
   * Relays would just serve the *second-latest* version, resurrecting the video.
   *
   * **The Protocol (Soft + Hard Delete):**
   * 1. **History Hydration**: We first fetch *every* historical version of this video (by `rootId` and `d` tag).
   * 2. **Soft Delete (Tombstoning)**: For every unique `d` tag found in the history, we publish a *new* version
   *    with `content: { deleted: true }`. This ensures that even if NIP-09 fails, clients resolving "latest"
   *    will see a tombstone.
   * 3. **Hard Delete (NIP-09)**: We construct a Kind 5 event referencing:
   *    - Every single Event ID (`e` tag) in the history.
   *    - Every NIP-33 address (`a` tag) found.
   *    - The video root ID.
   *    Relays that respect Kind 5 will physically delete these rows.
   * 4. **Local Tombstone**: We update `this.tombstones` and `this.activeMap` immediately to hide the video
   *    from the UI without waiting for relay confirmation.
   *
   * @param {string} videoRootId - The unique root identifier of the video series.
   * @param {string} pubkey - The owner's public key (must match event author).
   * @param {object} [options] - Configuration.
   * @param {boolean} [options.confirm=true] - Whether to show a browser confirmation dialog.
   * @param {object} [options.video] - The current video object (optimization to skip initial fetch).
   * @returns {Promise<{reverts: object[], deletes: object[]}|null>} A summary of the soft (revert) and hard (delete) events published. Returns null if user cancelled.
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

    await this._hydrateHistoryForDelete(targetVideo);

    const { matchingEvents, inferredRoot } = this._getEventsToDelete(
      videoRootId,
      pubkey,
      targetVideo
    );

    const { revertSummaries, revertEvents } = await this._softDeleteVersions(
      matchingEvents,
      inferredRoot,
      targetVideo,
      pubkey
    );

    const deleteSummaries = await this._hardDeleteVersions(
      matchingEvents,
      revertEvents,
      targetVideo,
      inferredRoot,
      pubkey
    );

    this.saveLocalData("delete-events", { immediate: true });

    return {
      reverts: revertSummaries,
      deletes: deleteSummaries,
    };
  }

  /**
   * Schedules a persistence operation to save current state to cache.
   * Delegates to PersistenceManager.
   *
   * @param {string} [reason="unspecified"] - Debug label.
   * @param {object} [options] - Configuration.
   * @returns {Promise<boolean>|null} The persistence promise.
   */
  saveLocalData(reason = "unspecified", options = {}) {
    return this.persistenceManager.saveLocalData(reason, options);
  }

  clampVideoRequestLimit(limit, fallback = DEFAULT_VIDEO_REQUEST_LIMIT) {
    const normalizedFallback =
      Number.isFinite(fallback) && fallback > 0
        ? Math.floor(fallback)
        : DEFAULT_VIDEO_REQUEST_LIMIT;

    if (!Number.isFinite(limit) || limit <= 0) {
      return normalizedFallback;
    }

    const floored = Math.floor(limit);
    const clamped = Math.min(MAX_VIDEO_REQUEST_LIMIT, Math.max(1, floored));

    if (clamped !== floored && isDevMode) {
      devLogger.log(
        `[nostr] Clamped video request limit from ${floored} to ${clamped}`,
      );
    }

    return clamped;
  }

  getLatestCachedCreatedAt() {
    let latest = 0;
    const now = Math.floor(Date.now() / 1000);

    for (const video of this.allEvents.values()) {
      const createdAt = Number.isFinite(video?.created_at)
        ? Math.floor(video.created_at)
        : 0;
      if (createdAt > latest && createdAt <= now) {
        latest = createdAt;
      }
    }

    return latest;
  }

  /**
   * Subscribes to Kind 30078 video events (Series/Clips) from relays using a buffered stream.
   * This is the primary feed ingestion engine for the application.
   *
   * **Why Buffer?**
   * Relays typically send events in high-speed bursts (historical dumps on connect).
   * Processing every single event immediately (parsing -> hydrating -> React setState)
   * causes massive layout thrashing and freezes the main thread.
   *
   * **The Algorithm (Buffering Strategy):**
   * 1. **Ingest**: Push every incoming raw event into a temporary `eventBuffer`.
   * 2. **Debounce**: A 75ms timer ensures we only process the buffer when the stream pauses briefly.
   * 3. **Batch Process (Flush)**:
   *    - Validate & Parse: Convert raw JSON to internal `Video` objects.
   *    - Tombstone Check: Discard any video that is older than a known deletion timestamp.
   *    - **Latest-Wins Resolution**: Compare `created_at` against `activeMap`. Only update if newer.
   *    - **Hydration**: Bulk-fetch NIP-71 category tags for the new items.
   *    - **UI Update**: Fire `onVideo(batch)` *once* for the whole chunk.
   * 4. **Persist**: Asynchronously save the new state to IndexedDB (Stale-While-Revalidate).
   *
   * **Invariants:**
   * - `activeMap` will *only* ever contain the newest valid version of a video series.
   * - Deleted videos (Tombstones) are filtered out before reaching the UI callback.
   *
   * @param {function(object[]): void} onVideo - Callback fired with a BATCH of new/updated `Video` objects.
   * @param {object} [options] - Filter options.
   * @param {number} [options.since] - Unix timestamp to fetch events after (usually `latestCachedCreatedAt`).
   * @param {number} [options.until] - Unix timestamp to fetch events before.
   * @param {number} [options.limit] - Max number of events to request from relays.
   * @returns {import("nostr-tools").Sub} The subscription object. Call `unsub()` to stop listening.
   */
  subscribeVideos(onVideo, options = {}) {
    // Explanation:
    // This method handles the primary video feed. It uses a buffering strategy to
    // prevent UI thrashing when thousands of events arrive at once (e.g. initial load).
    // Incoming events are pushed to `eventBuffer` and processed in batches
    // via `flushEventBuffer` which is debounced.

    const { since, until, limit } = options;
    const latestCachedCreatedAt = this.getLatestCachedCreatedAt();

    const resolvedLimit = this.clampVideoRequestLimit(limit);
    const resolvedSince = Number.isFinite(since)
      ? Math.floor(since)
      : latestCachedCreatedAt > 0
        ? latestCachedCreatedAt
        : undefined;
    const resolvedUntil = Number.isFinite(until) ? Math.floor(until) : undefined;

    const filter = {
      kinds: [30078],
      "#t": ["video"],
      limit: resolvedLimit,
    };

    if (resolvedSince !== undefined) {
      filter.since = resolvedSince;
    }

    if (resolvedUntil !== undefined) {
      filter.until = resolvedUntil;
    }

    devLogger.log("[subscribeVideos] Subscribing with filter:", filter);

    const sub = this.pool.sub(this.getHealthyRelays(this.relays), [filter]);

    // BUFFERING STATE
    // We collect events here instead of processing them instantly to avoid
    // 1000s of React re-renders during the initial relay dump.
    // The buffer acts as a pressure valve between the network and the UI.
    const buffer = new VideoEventBuffer(this, onVideo);

    // 1) On each incoming event, just push to the buffer and schedule a flush
    sub.on("event", (event) => {
      buffer.push(event);
    });

    // You can still use sub.on("eose") if needed
    sub.on("eose", () => {
      buffer.handleEose();
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
      buffer.cleanup();
      try {
        return originalUnsub();
      } catch (err) {
        userLogger.error("[subscribeVideos] Failed to unsub from pool:", err);
        return undefined;
      }
    };

    return sub;
  }

  processNip71Events(events, pointerMap = null) {
    processNip71EventsHelper(events, {
      nip71Cache: this.nip71Cache,
      pointerMap,
    });
  }

  mergeNip71MetadataIntoVideo(video) {
    return mergeNip71MetadataIntoVideoHelper(video, {
      nip71Cache: this.nip71Cache,
    });
  }

  async populateNip71MetadataForVideos(videos = []) {
    if (!Array.isArray(videos) || !videos.length) {
      return;
    }

    const pointerMap = collectNip71PointerRequests(videos);

    await populateNip71MetadataForVideosHelper(videos, {
      nip71Cache: this.nip71Cache,
      pointerMap,
      fetchMetadata: (map, pointerValues) =>
        this.fetchAndCacheNip71Metadata(map, pointerValues),
    });
  }

  async fetchAndCacheNip71Metadata(pointerMap, pointerValues) {
    if (!Array.isArray(pointerValues) || !pointerValues.length) {
      return;
    }

    if (!this.pool || !Array.isArray(this.relays) || !this.relays.length) {
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
        }),
      );

      const deduped = new Map();
      responses.flat().forEach((event) => {
        if (event?.id && !deduped.has(event.id)) {
          deduped.set(event.id, event);
        }
      });

      processNip71EventsHelper(Array.from(deduped.values()), {
        nip71Cache: this.nip71Cache,
        pointerMap,
      });
    } catch (error) {
      devLogger.warn("[nostr] Failed to fetch NIP-71 metadata:", error);
    }
  }

  /**
   * Fetches videos using a standard Request/Response model (legacy).
   *
   * Unlike `subscribeVideos` (which is streaming), this waits for all relays to EOSE
   * before returning. It is useful for one-off fetches but less efficient for the main feed.
   *
   * @param {object} options - Filter options (limit, etc.).
   * @returns {Promise<object[]>} A promise resolving to the list of active videos.
   * @deprecated Use `subscribeVideos` for the main feed to support buffering and streaming.
   */
  async fetchVideos(options = {}) {
    return new Promise((resolve) => {
      // Default to since: 0 to force full fetch if not specified
      const effectiveOptions = { ...options };
      if (effectiveOptions.since === undefined) {
        effectiveOptions.since = 0;
      }

      const sub = this.subscribeVideos(() => {}, effectiveOptions);

      sub.on("eose", async () => {
        sub.unsub();
        try {
          const activeVideos = this.getActiveVideos();
          await this.populateNip71MetadataForVideos(activeVideos);
          activeVideos.forEach((video) => this.applyRootCreatedAt(video));
          resolve(activeVideos);
        } catch (err) {
          userLogger.error("fetchVideos error:", err);
          resolve([]);
        }
      });
    });
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
    const relays = sanitizeRelayList(this.getHealthyRelays(relayCandidatesRaw));

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
    this.dirtyEventIds.add(eventId);

    if (includeRaw) {
      return { video, rawEvent };
    }

    return video;
  }

  async repostEvent(eventId, options = {}) {
    return repostEventHelper({
      client: this,
      eventId,
      options,
      resolveActiveSigner: (p) => this.signerManager.resolveActiveSigner(p),
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
      eventToAddressPointer,
    });
  }

  async mirrorVideoEvent(eventId, options = {}) {
    return mirrorVideoEventHelper({
      client: this,
      eventId,
      options,
      resolveActiveSigner: (p) => this.signerManager.resolveActiveSigner(p),
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
      inferMimeTypeFromUrl,
    });
  }

  async rebroadcastEvent(eventId, options = {}) {
    return rebroadcastEventHelper({ client: this, eventId, options });
  }

  getRequestTimeoutMs(timeoutMs) {
    return this.connectionManager.getRequestTimeoutMs(timeoutMs);
  }

  async sendRawCountFrame(relayUrl, filters, options = {}) {
    return this.connectionManager.sendRawCountFrame(relayUrl, filters, options);
  }

  async countEventsAcrossRelays(filters, options = {}) {
    return this.connectionManager.countEventsAcrossRelays(filters, options);
  }

  /**
   * Fetches and reconstructs the full edit history of a video.
   *
   * **The Problem:**
   * Nostr events are immutable. "Editing" a video creates a NEW event with a new ID.
   * We need to find all previous versions to show a history log or allow reverting to an older state.
   *
   * **The Linking Logic (Version Stitching):**
   * 1. **Modern (V3+)**: Versions share a `videoRootId` field in their content, pointing to the *first* event in the series.
   * 2. **NIP-33 Addressability**: Versions share the same `d` tag, allowing clients to find them by `kind:pubkey:dTag`.
   * 3. **Legacy Fallback**: Older versions might only be linked by the `d` tag or lack a root pointer entirely.
   *
   * **Algorithm:**
   * 1. **Local Scan**: Linearly search `this.allEvents` (memory cache) for any event matching the target's `videoRootId` OR `d` tag.
   * 2. **Root Recovery**: If the `videoRootId` refers to an event ID we don't have in memory, fetch it specifically from relays.
   *    This ensures we have the "genesis" block of the video history.
   * 3. **Sparse History Check**: If we found <= 1 version locally, we assume our cache is incomplete.
   * 4. **Relay Query**: If sparse, query relays for *all* events (Kind 30078) with the same `d` tag and author.
   * 5. **Merge & Sort**: Combine local and network findings, deduplicate by ID, filter out unrelated events, and sort by `created_at` (Newest -> Oldest).
   *
   * @param {object} video - The target video object to find history for.
   * @returns {Promise<object[]>} A promise resolving to an array of Video objects, sorted from newest to oldest.
   */
  async hydrateVideoHistory(video) {
    // Explanation:
    // This method reconstructs the edit history of a video series.
    // Since Nostr events are immutable, "editing" creates a new event.
    // We link these events together using:
    // 1. `videoRootId` (V3 canonical ID) - The primary key for the series.
    // 2. `d` tag (NIP-33 addressability) - The secondary key for lookups.
    // 3. Fallback: Matching ID for legacy V1/V2 posts (where ID was the root).
    //
    // The method first checks local cache (`allEvents`), and if data is sparse,
    // queries relays for the specific `d` tag to find missing links.

    if (!video || typeof video !== "object") {
      return [];
    }

    this.applyRootCreatedAt(video);

    const targetRoot = typeof video.videoRootId === "string" ? video.videoRootId : "";
    const targetPubkey = typeof video.pubkey === "string" ? video.pubkey.toLowerCase() : "";

    const targetDTag = this.resolveEventDTag(video);

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
        const candidateDTag = this.resolveEventDTag(candidate, video);

        // HISTORY MATCHING LOGIC
        // A video is part of the same history if:
        // 1. It shares the same V3 `videoRootId`.
        // 2. It shares the same NIP-33 `d` tag (addressable events).
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
        const rootEvent = await this.pool.get(this.getHealthyRelays(this.relays), { ids: [normalizedRoot] });
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
            this.dirtyEventIds.add(rootEvent.id);
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
            this.getHealthyRelays(this.relays).map(async (url) => {
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
              this.dirtyEventIds.add(evt.id);
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

  handleEvent(event) {
    if (!event || typeof event !== "object") return;

    // Kind 0: Profile Metadata
    if (event.kind === 0 && typeof event.pubkey === "string") {
      const normalized = normalizeProfileFromEvent(event);
      if (normalized) {
        profileCache.setProfile(event.pubkey, normalized, { persist: true });
      }
    }
  }
}

export {
  getActiveSigner,
  setActiveSigner,
  clearActiveSigner,
  resolveActiveSigner,
  shouldRequestExtensionPermissions,
};
const a = 1
