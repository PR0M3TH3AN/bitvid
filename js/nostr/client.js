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
import { FEATURE_PUBLISH_NIP71 } from "../constants.js";
import { accessControl } from "../accessControl.js";
import { bytesToHex, sha256 } from "../../vendor/crypto-helpers.bundle.min.js";
// 🔧 merged conflicting changes from codex/update-video-publishing-and-parsing-logic vs unstable
import {
  buildNip71MetadataTags,
  buildNip71VideoEvent,
  collectNip71PointerRequests,
  convertEventToVideo,
  extractNip71MetadataFromTags,
  getDTagValueFromTags,
  mergeNip71MetadataIntoVideo as mergeNip71MetadataIntoVideoHelper,
  populateNip71MetadataForVideos as populateNip71MetadataForVideosHelper,
  processNip71Events as processNip71EventsHelper,
  buildVideoPointerValue,
  stringFromInput,
} from "./nip71.js";
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
import { LRUCache } from "../utils/lruCache.js";
import { updateConversationFromMessage, writeMessages } from "../storage/dmDb.js";
import {
  DM_RELAY_WARNING_FALLBACK,
  resolveDmRelaySelection,
} from "../services/dmNostrService.js";
import {
  DEFAULT_NIP07_ENCRYPTION_METHODS,
  DEFAULT_NIP07_PERMISSION_METHODS,
  clearStoredNip07Permissions,
  normalizePermissionMethod,
  readStoredNip07Permissions,
  requestEnablePermissions,
  runNip07WithRetry,
  writeStoredNip07Permissions,
} from "./nip07Permissions.js";
import {
  clearStoredSessionActor as clearStoredSessionActorEntry,
  decryptSessionPrivateKey,
  encryptSessionPrivateKey,
  persistSessionActor as persistSessionActorEntry,
  readStoredSessionActorEntry,
  isSessionActor,
} from "./sessionActor.js";
import {
  HEX64_REGEX,
  NIP46_RPC_KIND,
  NIP46_SESSION_STORAGE_KEY,
  NIP46_PUBLISH_TIMEOUT_MS,
  NIP46_RESPONSE_TIMEOUT_MS,
  NIP46_SIGN_EVENT_TIMEOUT_MS,
  NIP46_MAX_RETRIES,
  NIP46_HANDSHAKE_TIMEOUT_MS,
  NIP46_AUTH_CHALLENGE_MAX_ATTEMPTS,
  sanitizeRelayList,
  readStoredNip46Session,
  writeStoredNip46Session,
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
  summarizeHexForLog,
  summarizeSecretForLog,
  summarizeMetadataForLog,
  summarizeUrlForLog,
  summarizePayloadPreviewForLog,
  summarizeRpcParamsForLog,
  summarizeRpcResultForLog,
  summarizeRelayPublishResultsForLog,
} from "./nip46Client.js";
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

function normalizeProfileFromEvent(event) {
  if (!event || !event.content) return null;
  try {
    return JSON.parse(event.content);
  } catch (err) {
    return null;
  }
}

function attachNipMethodAliases(signer) {
  if (!signer || typeof signer !== "object") {
    return;
  }

  const nip04 =
    signer && typeof signer.nip04 === "object" && signer.nip04 !== null
      ? signer.nip04
      : null;
  if (nip04) {
    const encrypt =
      typeof nip04.encrypt === "function" ? nip04.encrypt.bind(nip04) : null;
    const decrypt =
      typeof nip04.decrypt === "function" ? nip04.decrypt.bind(nip04) : null;

    if (encrypt && typeof signer.nip04Encrypt !== "function") {
      signer.nip04Encrypt = (targetPubkey, plaintext) =>
        encrypt(targetPubkey, plaintext);
    }

    if (decrypt && typeof signer.nip04Decrypt !== "function") {
      signer.nip04Decrypt = (actorPubkey, ciphertext) =>
        decrypt(actorPubkey, ciphertext);
    }
  }

  const nip44 =
    signer && typeof signer.nip44 === "object" && signer.nip44 !== null
      ? signer.nip44
      : null;
  if (nip44) {
    const v2 =
      typeof nip44.v2 === "object" && nip44.v2 !== null ? nip44.v2 : null;

    const encrypt = (() => {
      if (typeof signer.nip44Encrypt === "function") {
        return null;
      }
      if (typeof v2?.encrypt === "function") {
        return v2.encrypt.bind(v2);
      }
      if (typeof nip44.encrypt === "function") {
        return nip44.encrypt.bind(nip44);
      }
      return null;
    })();

    const decrypt = (() => {
      if (typeof signer.nip44Decrypt === "function") {
        return null;
      }
      if (typeof v2?.decrypt === "function") {
        return v2.decrypt.bind(v2);
      }
      if (typeof nip44.decrypt === "function") {
        return nip44.decrypt.bind(nip44);
      }
      return null;
    })();

    if (encrypt) {
      signer.nip44Encrypt = (targetPubkey, plaintext) =>
        encrypt(targetPubkey, plaintext);
    }

    if (decrypt) {
      signer.nip44Decrypt = (actorPubkey, ciphertext) =>
        decrypt(actorPubkey, ciphertext);
    }
  }
}

function resolveSignerCapabilities(signer) {
  const fallback = {
    sign: false,
    nip44: false,
    nip04: false,
  };

  if (!signer || typeof signer !== "object") {
    return fallback;
  }

  const capabilities =
    signer.capabilities && typeof signer.capabilities === "object"
      ? signer.capabilities
      : {};

  return {
    sign:
      typeof capabilities.sign === "boolean"
        ? capabilities.sign
        : typeof signer.signEvent === "function",
    nip44:
      typeof capabilities.nip44 === "boolean"
        ? capabilities.nip44
        : typeof signer.nip44Encrypt === "function" ||
          typeof signer.nip44Decrypt === "function",
    nip04:
      typeof capabilities.nip04 === "boolean"
        ? capabilities.nip04
        : typeof signer.nip04Encrypt === "function" ||
          typeof signer.nip04Decrypt === "function",
  };
}

function hydrateExtensionSignerCapabilities(signer) {
  if (!signer || typeof signer !== "object" || signer.type !== "extension") {
    return;
  }

  const extension =
    typeof window !== "undefined" && window && window.nostr ? window.nostr : null;
  if (!extension) {
    return;
  }

  if (typeof signer.signEvent !== "function" && extension.signEvent) {
    if (typeof extension.signEvent === "function") {
      signer.signEvent = extension.signEvent.bind(extension);
    }
  }

  if (!signer.nip04 && extension.nip04) {
    signer.nip04 = extension.nip04;
  }

  if (!signer.nip44 && extension.nip44) {
    signer.nip44 = extension.nip44;
  }
}

function setActiveSigner(signer) {
  if (!signer || typeof signer !== "object") {
    return;
  }

  hydrateExtensionSignerCapabilities(signer);
  attachNipMethodAliases(signer);
  signer.capabilities = resolveSignerCapabilities(signer);

  const pubkey =
    typeof signer.pubkey === "string" && signer.pubkey.trim()
      ? signer.pubkey.trim().toLowerCase()
      : "";
  if (pubkey) {
    profileCache.clearSignerRuntime(pubkey);
  }

  setActiveSignerInRegistry(signer);
}

function getActiveSigner() {
  const signer = getActiveSignerFromRegistry();
  hydrateExtensionSignerCapabilities(signer);
  return signer;
}

function clearActiveSigner() {
  clearActiveSignerInRegistry();
}

function logoutSigner(pubkey) {
  logoutSignerFromRegistry(pubkey);
}

function resolveActiveSigner(pubkey) {
  const signer = resolveActiveSignerFromRegistry(pubkey);
  hydrateExtensionSignerCapabilities(signer);
  return signer;
}

function shouldRequestExtensionPermissions(signer) {
  if (!signer || typeof signer !== "object") {
    return false;
  }
  return signer.type === "extension";
}

const EVENTS_CACHE_STORAGE_KEY = "bitvid:eventsCache:v1";
// We use the policy TTL, but currently the storage backend is hardcoded to IDB (with localStorage fallback).
// Future refactors should make EventsCacheStore dynamic based on CACHE_POLICIES[NOTE_TYPES.VIDEO_POST].storage.
const EVENTS_CACHE_TTL_MS = CACHE_POLICIES[NOTE_TYPES.VIDEO_POST]?.ttl ?? (10 * 60 * 1000);
const EVENTS_CACHE_DB_NAME = "bitvid-events-cache";
const EVENTS_CACHE_DB_VERSION = 1;
const EVENTS_CACHE_PERSIST_DELAY_MS = 450;
const EVENTS_CACHE_IDLE_TIMEOUT_MS = 1500;
const DEFAULT_VIDEO_REQUEST_LIMIT = 150;
const MAX_VIDEO_REQUEST_LIMIT = 500;

function scheduleIdleTask(callback, timeout = EVENTS_CACHE_IDLE_TIMEOUT_MS) {
  if (typeof requestIdleCallback === "function") {
    return requestIdleCallback(callback, { timeout });
  }
  return setTimeout(callback, timeout);
}

function wrapIdbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function waitForTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

/**
 * Persists video events and tombstones to IndexedDB.
 *
 * Schema:
 * - `events`: Store for video objects. Key: `id`.
 * - `tombstones`: Store for deletion timestamps. Key: `key`.
 * - `meta`: Store for versioning and timestamps. Key: `key`.
 *
 * Strategy:
 * - Snapshots are saved periodically (debounced).
 * - "Fingerprints" (hashes/stringified) are tracked to minimize writes.
 * - If the TTL expires, the cache is cleared on restore.
 */
class EventsCacheStore {
  /**
   * Initializes the EventsCacheStore.
   * Tracks fingerprints of persisted items to avoid redundant writes.
   */
  constructor() {
    this.dbPromise = null;
    this.persistedEventFingerprints = new Map();
    this.persistedTombstoneFingerprints = new Map();
    this.hasLoadedFingerprints = false;
  }

  isSupported() {
    return typeof indexedDB !== "undefined";
  }

  async getDb() {
    if (!this.isSupported()) {
      return null;
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(EVENTS_CACHE_DB_NAME, EVENTS_CACHE_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("events")) {
          db.createObjectStore("events", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("tombstones")) {
          db.createObjectStore("tombstones", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Failed to open events cache database"));
    });

    return this.dbPromise;
  }

  computeEventFingerprint(video) {
    try {
      return JSON.stringify(video);
    } catch (error) {
      devLogger.warn("[nostr] Failed to fingerprint cached event", error);
      return String(Date.now());
    }
  }

  computeTombstoneFingerprint(timestamp) {
    return `ts:${timestamp}`;
  }

  async ensureFingerprintsLoaded(db) {
    if (this.hasLoadedFingerprints || !db) {
      return;
    }
    const tx = db.transaction(["events", "tombstones"], "readonly");
    const eventsStore = tx.objectStore("events");
    const tombstoneStore = tx.objectStore("tombstones");

    const [events, tombstones] = await Promise.all([
      wrapIdbRequest(eventsStore.getAll()),
      wrapIdbRequest(tombstoneStore.getAll()),
      waitForTransaction(tx),
    ]);

    for (const entry of Array.isArray(events) ? events : []) {
      if (entry && entry.id && entry.fingerprint) {
        this.persistedEventFingerprints.set(entry.id, entry.fingerprint);
      }
    }

    for (const entry of Array.isArray(tombstones) ? tombstones : []) {
      if (entry && entry.key) {
        const fingerprint = entry.fingerprint || this.computeTombstoneFingerprint(entry.timestamp);
        this.persistedTombstoneFingerprints.set(entry.key, fingerprint);
      }
    }

    this.hasLoadedFingerprints = true;
  }

  async readMeta(db) {
    const tx = db.transaction(["meta"], "readonly");
    const metaStore = tx.objectStore("meta");
    const meta = await wrapIdbRequest(metaStore.get("meta"));
    await waitForTransaction(tx);
    return meta;
  }

  /**
   * Restores the full state from IndexedDB.
   *
   * @returns {Promise<{version: number, savedAt: number, events: Map, tombstones: Map}|null>}
   * The restored snapshot or null if cache is missing/expired.
   */
  async restoreSnapshot() {
    const db = await this.getDb();
    if (!db) {
      return null;
    }

    const meta = await this.readMeta(db);
    if (!meta || meta.version !== 1 || !meta.savedAt) {
      return null;
    }

    // Check TTL: If cache is too old, wipe it and return null to force a fresh fetch.
    const now = Date.now();
    if (now - meta.savedAt > EVENTS_CACHE_TTL_MS) {
      const tx = db.transaction(["events", "tombstones", "meta"], "readwrite");
      tx.objectStore("events").clear();
      tx.objectStore("tombstones").clear();
      tx.objectStore("meta").clear();
      await waitForTransaction(tx);
      return null;
    }

    const tx = db.transaction(["events", "tombstones"], "readonly");
    const eventsStore = tx.objectStore("events");
    const tombstoneStore = tx.objectStore("tombstones");

    const [events, tombstones] = await Promise.all([
      wrapIdbRequest(eventsStore.getAll()),
      wrapIdbRequest(tombstoneStore.getAll()),
      waitForTransaction(tx),
    ]);

    const eventsMap = new Map();
    const tombstoneMap = new Map();

    for (const entry of Array.isArray(events) ? events : []) {
      if (entry && entry.id && entry.video) {
        eventsMap.set(entry.id, entry.video);
        if (entry.fingerprint) {
          this.persistedEventFingerprints.set(entry.id, entry.fingerprint);
        }
      }
    }

    for (const entry of Array.isArray(tombstones) ? tombstones : []) {
      if (entry && entry.key && Number.isFinite(entry.timestamp)) {
        tombstoneMap.set(entry.key, entry.timestamp);
        const fingerprint = entry.fingerprint || this.computeTombstoneFingerprint(entry.timestamp);
        this.persistedTombstoneFingerprints.set(entry.key, fingerprint);
      }
    }

    this.hasLoadedFingerprints = true;

    return {
      version: 1,
      savedAt: meta.savedAt,
      events: eventsMap,
      tombstones: tombstoneMap,
    };
  }

  /**
   * Persists the current state to IndexedDB.
   * Only writes changes (diffs against fingerprints).
   *
   * @param {{events: Map, tombstones: Map, savedAt: number}} payload - The state to save.
   * @returns {Promise<{persisted: boolean, eventWrites: number, eventDeletes: number, tombstoneWrites: number, tombstoneDeletes: number}>}
   * Stats about the persistence operation.
   */
  async persistSnapshot(payload) {
    const db = await this.getDb();
    if (!db) {
      return { persisted: false };
    }

    await this.ensureFingerprintsLoaded(db);

    const tx = db.transaction(["events", "tombstones", "meta"], "readwrite");
    const eventsStore = tx.objectStore("events");
    const tombstoneStore = tx.objectStore("tombstones");
    const metaStore = tx.objectStore("meta");

    const { events, tombstones, savedAt } = payload;
    let eventWrites = 0;
    let eventDeletes = 0;
    let tombstoneWrites = 0;
    let tombstoneDeletes = 0;

    for (const [id, video] of events.entries()) {
      if (!id) {
        continue;
      }
      const fingerprint = this.computeEventFingerprint(video);
      const prevFingerprint = this.persistedEventFingerprints.get(id);
      if (prevFingerprint === fingerprint) {
        continue;
      }
      eventsStore.put({ id, video, fingerprint });
      this.persistedEventFingerprints.set(id, fingerprint);
      eventWrites++;
    }

    for (const persistedId of Array.from(this.persistedEventFingerprints.keys())) {
      if (events.has(persistedId)) {
        continue;
      }
      eventsStore.delete(persistedId);
      this.persistedEventFingerprints.delete(persistedId);
      eventDeletes++;
    }

    for (const [key, timestamp] of tombstones.entries()) {
      if (!key) {
        continue;
      }
      const fingerprint = this.computeTombstoneFingerprint(timestamp);
      const prevFingerprint = this.persistedTombstoneFingerprints.get(key);
      if (prevFingerprint === fingerprint) {
        continue;
      }
      tombstoneStore.put({ key, timestamp, fingerprint });
      this.persistedTombstoneFingerprints.set(key, fingerprint);
      tombstoneWrites++;
    }

    for (const persistedKey of Array.from(this.persistedTombstoneFingerprints.keys())) {
      if (tombstones.has(persistedKey)) {
        continue;
      }
      tombstoneStore.delete(persistedKey);
      this.persistedTombstoneFingerprints.delete(persistedKey);
      tombstoneDeletes++;
    }

    metaStore.put({ key: "meta", savedAt, version: 1 });

    await waitForTransaction(tx);

    return {
      persisted: true,
      eventWrites,
      eventDeletes,
      tombstoneWrites,
      tombstoneDeletes,
    };
  }
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

export const __testExports = {
  runNip07WithRetry,
  DEFAULT_NIP07_ENCRYPTION_METHODS,
  decryptNip46PayloadWithKeys,
  createNip46Cipher,
  normalizeNip46CiphertextPayload,
  parseNip46ConnectionString,
  attemptDecryptNip46HandshakePayload,
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
          logCountTimeoutCleanupFailure(cleanupError);
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

function normalizeHexHash(candidate) {
  if (candidate === undefined || candidate === null) {
    return "";
  }
  const stringValue =
    typeof candidate === "string" ? candidate : String(candidate);
  const trimmed = stringValue.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return HEX64_REGEX.test(trimmed) ? trimmed : "";
}

const BlobConstructor = typeof Blob !== "undefined" ? Blob : null;
let sharedTextEncoder = null;

function getSharedTextEncoder() {
  if (!sharedTextEncoder && typeof TextEncoder !== "undefined") {
    sharedTextEncoder = new TextEncoder();
  }
  return sharedTextEncoder;
}

async function valueToUint8Array(value) {
  if (!value) {
    return null;
  }

  try {
    if (
      BlobConstructor &&
      value instanceof BlobConstructor &&
      typeof value.arrayBuffer === "function"
    ) {
      const buffer = await value.arrayBuffer();
      return new Uint8Array(buffer);
    }
  } catch (error) {
    devLogger.warn("[nostr] Failed to read Blob while computing hash:", error);
    return null;
  }

  if (typeof ArrayBuffer !== "undefined") {
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    if (ArrayBuffer.isView?.(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (typeof value === "string") {
    const encoder = getSharedTextEncoder();
    return encoder ? encoder.encode(value) : null;
  }

  return null;
}

async function computeSha256HexFromValue(value) {
  const data = await valueToUint8Array(value);
  if (!data) {
    return "";
  }

  try {
    const digest = sha256(data);
    const hex = typeof digest === "string" ? digest : bytesToHex(digest);
    return hex ? hex.toLowerCase() : "";
  } catch (error) {
    devLogger.warn("[nostr] Failed to compute SHA-256 for mirror payload:", error);
    return "";
  }
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

  const baseFilterPayload = (kind) => {
    const payload = { kinds: [kind] };
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
    const authorFilter = baseFilterPayload(4);
    authorFilter.authors = [normalizedActor];
    filters.push(authorFilter);

    const directFilter = baseFilterPayload(4);
    directFilter["#p"] = [normalizedActor];
    filters.push(directFilter);

    const giftWrapFilter = baseFilterPayload(1059);
    giftWrapFilter["#p"] = [normalizedActor];
    filters.push(giftWrapFilter);
  } else {
    const fallbackFilter = baseFilterPayload(DM_EVENT_KINDS[0]);
    fallbackFilter.kinds = DM_EVENT_KINDS.slice();
    filters.push(fallbackFilter);
  }

  return filters;
}


const EXTENSION_MIME_MAP = Object.freeze(
  Object.fromEntries(
    Object.entries({
      mp4: "video/mp4",
      m4v: "video/x-m4v",
      webm: "video/webm",
      mkv: "video/x-matroska",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      ogv: "video/ogg",
      ogg: "video/ogg",
      m3u8: "application/x-mpegurl",
      mpd: "application/dash+xml",
      ts: "video/mp2t",
      mpg: "video/mpeg",
      mpeg: "video/mpeg",
      flv: "video/x-flv",
      "3gp": "video/3gpp",
    }).map(([extension, mimeType]) => [
      extension,
      typeof mimeType === "string" ? mimeType.toLowerCase() : "",
    ]),
  ),
);

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
  const mimeType = EXTENSION_MIME_MAP[extension];
  return typeof mimeType === "string" ? mimeType : "";
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
  buildNip71VideoEvent,
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
   */
  constructor() {
    /**
     * @type {import("nostr-tools").SimplePool}
     * The underlying pool of relay connections.
     */
    this.pool = null;
    this.poolPromise = null;
    this.pubkey = null;
    this.relays = sanitizeRelayList(Array.from(DEFAULT_RELAY_URLS));
    this.readRelays = Array.from(this.relays);
    this.writeRelays = Array.from(this.relays);

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
    this.rawEvents = new Map();

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

    this.rootCreatedAtByRoot = new Map();

    this.hasRestoredLocalData = false;
    this.eventsCacheStore = new EventsCacheStore();
    this.syncMetadataStore = new SyncMetadataStore();
    this.cachePersistTimerId = null;
    this.cachePersistIdleId = null;
    this.cachePersistInFlight = null;
    this.cachePersistReason = null;

    this.sessionActor = null;
    this.lockedSessionActor = null;
    this.nip71Cache = new Map();
    this.watchHistory = createWatchHistoryManager({
      getPool: () => this.pool,
      getActivePubkey: () => this.pubkey,
      getSessionActor: () => this.sessionActor,
      ensureSessionActor: () => this.ensureSessionActor(),
      ensureExtensionPermissions: (...args) => this.ensureExtensionPermissions(...args),
      resolveActiveSigner,
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
    this.sessionActorCipherClosures = null;
    this.sessionActorCipherClosuresPrivateKey = null;
    this.countUnsupportedRelays = new Set();
    this.nip46Client = null;
    this.remoteSignerListeners = new Set();
    this.sessionActorListeners = new Set();
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
    const canReconnect = Boolean(stored.clientPrivateKey && stored.secret);

    return {
      hasSession: true,
      canReconnect,
      remotePubkey,
      remoteNpub: encodeHexToNpub(remotePubkey),
      clientPublicKey: stored.clientPublicKey || "",
      relays: Array.isArray(stored.relays) ? [...stored.relays] : [],
      metadata: stored.metadata || {},
      encryption: stored.encryption || "",
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
    const encryption =
      (typeof status.encryption === "string" && status.encryption.trim()
        ? normalizeNip46EncryptionAlgorithm(status.encryption)
        : "") || this.nip46Client?.encryptionAlgorithm || stored.encryption || "";

    const snapshot = {
      state: nextState,
      remotePubkey,
      userPubkey,
      relays,
      metadata,
      encryption,
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

  emitSessionActorChange(actor, context = {}) {
    const resolvedActor =
      actor && typeof actor === "object" ? actor : this.sessionActor;
    const pubkey =
      typeof resolvedActor?.pubkey === "string" ? resolvedActor.pubkey.trim() : "";
    if (!pubkey) {
      return null;
    }

    const reason =
      typeof context.reason === "string" && context.reason.trim()
        ? context.reason.trim()
        : "";
    const createdAt = Number.isFinite(resolvedActor?.createdAt)
      ? resolvedActor.createdAt
      : null;
    const snapshot = {
      pubkey,
      source:
        typeof resolvedActor?.source === "string" ? resolvedActor.source : "",
      persisted: resolvedActor?.persisted === true,
      createdAt,
      reason,
    };

    for (const listener of Array.from(this.sessionActorListeners)) {
      try {
        listener(snapshot);
      } catch (error) {
        devLogger.warn("[nostr] Session actor listener threw:", error);
      }
    }

    return snapshot;
  }

  onSessionActorChange(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    this.sessionActorListeners.add(listener);
    return () => {
      this.sessionActorListeners.delete(listener);
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

    devLogger.debug("[nostr] Preparing remote signer handshake", {
      clientPublicKey: summarizeHexForLog(keyPair.publicKey),
      relays: resolvedRelays,
      permissions: requestedPermissions || null,
      secret: summarizeSecretForLog(handshakeSecret),
      metadataKeys: summarizeMetadataForLog(sanitizedMetadata),
    });

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

    devLogger.debug("[nostr] Prepared nostrconnect URI", {
      uri,
      relayCount: resolvedRelays.length,
      metadataKeys: summarizeMetadataForLog(sanitizedMetadata),
    });

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

  async installNip46Client(client, { userPubkey } = {}) {
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

    const signer = await createNip46Adapter(client);
    setActiveSigner(signer);

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
    expectedRemotePubkey,
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

    devLogger.debug("[nostr] Waiting for remote signer handshake", {
      clientPubkey: summarizeHexForLog(normalizedClientPublicKey),
      relays: resolvedRelays,
      secret: summarizeSecretForLog(secret),
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
      expectedRemotePubkey: summarizeHexForLog(expectedRemotePubkey || ""),
    });

    const pool = await this.ensurePool();
    const filters = [
      {
        kinds: [NIP46_RPC_KIND],
        "#p": [normalizedClientPublicKey],
      },
    ];

    const waitTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : NIP46_HANDSHAKE_TIMEOUT_MS;

    const coerceStructuredString = (value) => {
      if (typeof value === "string") {
        return value.trim();
      }
      if (Array.isArray(value)) {
        for (const entry of value) {
          const candidate = coerceStructuredString(entry);
          if (candidate) {
            return candidate;
          }
        }
        return "";
      }
      if (value && typeof value === "object") {
        const preferredKeys = [
          "secret",
          "message",
          "status",
          "reason",
          "detail",
          "description",
          "value",
          "result",
          "url",
        ];
        for (const key of preferredKeys) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            const candidate = coerceStructuredString(value[key]);
            if (candidate) {
              return candidate;
            }
          }
        }
        for (const entry of Object.values(value)) {
          const candidate = coerceStructuredString(entry);
          if (candidate) {
            return candidate;
          }
        }
      }
      return "";
    };

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
        devLogger.warn("[nostr] Handshake wait timed out", {
          clientPubkey: summarizeHexForLog(normalizedClientPublicKey),
          relays: resolvedRelays,
        });
        reject(error);
      }, waitTimeout);

      let subscription;
      try {
        subscription = pool.sub(resolvedRelays, filters);
        devLogger.debug("[nostr] Handshake subscription established", {
          relays: resolvedRelays,
          filters,
        });
      } catch (error) {
        cleanup();
        devLogger.warn("[nostr] Failed to subscribe for handshake responses", error);
        reject(error);
        return;
      }

      subscription.on("event", (event) => {
        if (settled) {
          return;
        }

        if (!event || event.kind !== NIP46_RPC_KIND) {
          devLogger.debug("[nostr] Ignoring non-handshake event during wait", event);
          return;
        }

        const eventRemotePubkey = normalizeNostrPubkey(event.pubkey);
        const candidateRemotePubkeys = [];
        if (expectedRemotePubkey) {
          candidateRemotePubkeys.push(expectedRemotePubkey);
        }
        if (eventRemotePubkey) {
          candidateRemotePubkeys.push(eventRemotePubkey);
        }

        devLogger.debug("[nostr] Processing handshake event", {
          eventId: typeof event.id === "string" ? event.id : "",
          eventPubkey: summarizeHexForLog(eventRemotePubkey || ""),
          candidateRemotePubkeys: candidateRemotePubkeys.map((key) =>
            summarizeHexForLog(key),
          ),
          contentLength: typeof event.content === "string" ? event.content.length : 0,
        });

        Promise.resolve()
          .then(() =>
            attemptDecryptNip46HandshakePayload({
              clientPrivateKey,
              candidateRemotePubkeys,
              ciphertext: event.content,
            }),
          )
          .then((payloadResult) => {
            const plaintext = payloadResult?.plaintext ?? "";
            let parsed;
            try {
              parsed = JSON.parse(plaintext);
            } catch (error) {
              devLogger.warn("[nostr] Failed to parse remote signer handshake payload:", error);
              return;
            }

            devLogger.debug("[nostr] Handshake payload parsed", {
              remotePubkey: summarizeHexForLog(payloadResult?.remotePubkey || ""),
              eventPubkey: summarizeHexForLog(eventRemotePubkey || ""),
              algorithm: payloadResult?.algorithm || null,
              requestId: typeof parsed?.id === "string" ? parsed.id : "",
              hasResult: parsed?.result !== undefined,
              hasError: parsed?.error !== undefined,
            });

            const resultValue = coerceStructuredString(parsed?.result);
            const errorValue = coerceStructuredString(parsed?.error);

            if (resultValue === "auth_url" && errorValue) {
              const handshakeRemotePubkey = payloadResult?.remotePubkey || eventRemotePubkey || "";
              devLogger.debug("[nostr] Handshake provided auth_url challenge", {
                eventId: typeof parsed?.id === "string" ? parsed.id : "",
                remotePubkey: summarizeHexForLog(handshakeRemotePubkey),
                url: summarizeUrlForLog(errorValue),
              });
              if (typeof onAuthUrl === "function") {
                try {
                  onAuthUrl(errorValue, {
                    phase: "handshake",
                    remotePubkey: handshakeRemotePubkey,
                    requestId: typeof parsed?.id === "string" ? parsed.id : "",
                  });
                } catch (callbackError) {
                  devLogger.warn("[nostr] Handshake auth_url callback threw:", callbackError);
                }
              }
              return;
            }

            if (secret) {
              const normalizedResult = resultValue ? resultValue.toLowerCase() : "";
              if (resultValue !== secret && normalizedResult !== "ack") {
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
                  remotePubkey: payloadResult?.remotePubkey || eventRemotePubkey || "",
                });
              } catch (callbackError) {
                devLogger.warn("[nostr] Handshake status callback threw:", callbackError);
              }
            }

            resolve({
              remotePubkey: payloadResult?.remotePubkey || eventRemotePubkey || "",
              eventPubkey: eventRemotePubkey || "",
              response: parsed,
              algorithm: normalizeNip46EncryptionAlgorithm(payloadResult?.algorithm),
            });

            devLogger.debug("[nostr] Handshake wait resolved", {
              remotePubkey: summarizeHexForLog(payloadResult?.remotePubkey || eventRemotePubkey || ""),
              eventPubkey: summarizeHexForLog(eventRemotePubkey || ""),
              result: resultValue || null,
              hasSecret: Boolean(secret),
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

  /**
   * Establishes a NIP-46 connection with a remote signer (e.g., Nostr Connect / Bunker).
   *
   * Process:
   * 1. **Parse**: Decodes the `nostrconnect://` or `bunker://` URI.
   * 2. **Handshake (if needed)**: If the URI is a "connect" request (no target pubkey yet),
   *    it publishes an ephemeral event and waits for the signer to "ack".
   * 3. **Connect**: Once the remote pubkey is known, sends a `connect` RPC command.
   * 4. **Authorize**: Handles any `auth_url` challenges if the signer requires out-of-band approval.
   * 5. **Session**: Stores the session metadata locally (if `remember: true`) to allow auto-reconnect.
   */
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

    devLogger.debug("[nostr] Connecting to remote signer", {
      connectionType: parsed.type,
      parsedRemotePubkey: summarizeHexForLog(parsed.remotePubkey || ""),
      providedClientPublicKey: summarizeHexForLog(providedClientPublicKey),
      providedClientPrivateKey: summarizeSecretForLog(
        typeof providedClientPrivateKey === "string" ? providedClientPrivateKey : "",
      ),
      providedSecret: summarizeSecretForLog(providedSecret),
      providedPermissions: providedPermissions || null,
      handshakeTimeoutMs,
      parsedRelays: parsed.relays,
      overrideRelayCount: Array.isArray(providedRelays) ? providedRelays.length : 0,
      metadataKeys: summarizeMetadataForLog(metadata),
    });

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
        devLogger.debug("[nostr] Remote signer auth challenge surfaced", {
          url: summarizeUrlForLog(url),
          context,
        });
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
    let handshakeAlgorithm = "";

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
        remotePubkey: parsed.remotePubkey || "",
        userPubkey: parsed.userPubkeyHint || "",
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
          expectedRemotePubkey: parsed.remotePubkey,
        });
        devLogger.debug("[nostr] Remote signer handshake completed", {
          remotePubkey: summarizeHexForLog(handshakeResult?.remotePubkey || parsed.remotePubkey || ""),
          algorithm: handshakeResult?.algorithm || null,
          relays,
          secret: summarizeSecretForLog(secret),
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
      handshakeAlgorithm = normalizeNip46EncryptionAlgorithm(
        handshakeResult?.algorithm,
      );
      if (!remotePubkey) {
        const error = new Error("Remote signer did not return a valid public key.");
        error.code = "missing-remote-pubkey";
        throw error;
      }
      devLogger.debug("[nostr] Remote signer handshake provided final pubkey", {
        remotePubkey: summarizeHexForLog(remotePubkey),
        algorithm: handshakeAlgorithm || null,
        clientPublicKey: summarizeHexForLog(clientPublicKey),
      });
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
        userPubkey: parsed.userPubkeyHint || "",
      });
      devLogger.debug("[nostr] Using bunker URI for remote signer connect", {
        remotePubkey: summarizeHexForLog(remotePubkey || parsed.remotePubkey || ""),
        relays,
        metadataKeys: summarizeMetadataForLog(metadata),
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
      encryption: handshakeAlgorithm,
      signEvent: (event, privateKey) => signEventWithPrivateKey(event, privateKey),
    });

    devLogger.debug("[nostr] Remote signer RPC client created", {
      clientPublicKey: summarizeHexForLog(client.clientPublicKey),
      remotePubkey: summarizeHexForLog(remotePubkey),
      relays,
      permissions,
      secret: summarizeSecretForLog(secret),
      metadataKeys: summarizeMetadataForLog(metadata),
      handshakeAlgorithm,
    });

    try {
      await client.ensureSubscription();

      devLogger.debug("[nostr] Remote signer subscription ready", {
        remotePubkey: summarizeHexForLog(remotePubkey),
        relayCount: relays.length,
      });

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
          devLogger.debug("[nostr] Sending NIP-46 connect request", {
            remotePubkey: summarizeHexForLog(remotePubkey),
            attempt: attempts + 1,
            permissions: permissions || null,
          });
          await client.connect({ permissions });
          break;
        } catch (error) {
          devLogger.warn("[nostr] Connect RPC attempt failed", {
            remotePubkey: summarizeHexForLog(remotePubkey),
            attempt: attempts + 1,
            code: error?.code || null,
            message: error?.message || String(error),
          });
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
      devLogger.debug("[nostr] Retrieved user pubkey from remote signer", {
        remotePubkey: summarizeHexForLog(remotePubkey),
        userPubkey: summarizeHexForLog(userPubkey),
      });
      client.metadata = metadata;
      const signer = await this.installNip46Client(client, { userPubkey });

      if (remember) {
        devLogger.debug("[nostr] Persisting remote signer session", {
          remotePubkey: summarizeHexForLog(remotePubkey),
          relays,
          encryption: client.encryptionAlgorithm || handshakeAlgorithm || "",
          permissions: permissions || null,
        });
        writeStoredNip46Session({
          version: 1,
          clientPublicKey,
          remotePubkey,
          relays,
          encryption: client.encryptionAlgorithm || handshakeAlgorithm || "",
          permissions,
          metadata,
          userPubkey,
          lastConnectedAt: Date.now(),
        });
      } else {
        devLogger.debug("[nostr] Clearing stored remote signer session per request");
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

      devLogger.debug("[nostr] Remote signer connection established", {
        remotePubkey: summarizeHexForLog(remotePubkey),
        userPubkey: summarizeHexForLog(userPubkey),
        relays,
        permissions: permissions || null,
        secret: summarizeSecretForLog(secret),
      });

      return { pubkey: userPubkey, signer };
    } catch (error) {
      devLogger.error("[nostr] Remote signer connection failed", {
        remotePubkey: summarizeHexForLog(remotePubkey),
        relays,
        permissions: permissions || null,
        secret: summarizeSecretForLog(secret),
        message: error?.message || String(error),
        code: error?.code || null,
      });
      client.destroy();
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

    devLogger.debug("[nostr] Reconnecting to stored remote signer", {
      remotePubkey: summarizeHexForLog(stored.remotePubkey || ""),
      relays,
      encryption: stored.encryption || "",
      permissions: stored.permissions || null,
      hasCredentials: Boolean(stored.clientPrivateKey && stored.secret),
    });

    this.emitRemoteSignerChange({
      state: "connecting",
      remotePubkey: stored.remotePubkey,
      relays,
      metadata: stored.metadata,
    });

    if (!stored.clientPrivateKey || !stored.secret) {
      const error = new Error("Stored remote signer credentials are unavailable.");
      error.code = "stored-session-missing-credentials";
      throw error;
    }

    const client = new Nip46RpcClient({
      nostrClient: this,
      clientPrivateKey: stored.clientPrivateKey,
      clientPublicKey: stored.clientPublicKey,
      remotePubkey: stored.remotePubkey,
      relays,
      encryption: stored.encryption,
      secret: stored.secret,
      permissions: stored.permissions,
      metadata: stored.metadata,
      signEvent: (event, privateKey) => signEventWithPrivateKey(event, privateKey),
    });

    try {
      await client.ensureSubscription();
      await client.connect({ permissions: stored.permissions });
      const userPubkey = await client.getUserPubkey();
      client.metadata = stored.metadata;
      const signer = await this.installNip46Client(client, { userPubkey });

      writeStoredNip46Session({
        version: 1,
        clientPublicKey: stored.clientPublicKey,
        remotePubkey: stored.remotePubkey,
        relays: stored.relays,
        encryption: client.encryptionAlgorithm || stored.encryption || "",
        permissions: stored.permissions,
        metadata: stored.metadata,
        userPubkey,
        lastConnectedAt: Date.now(),
      });

      devLogger.debug("[nostr] Stored remote signer session refreshed", {
        remotePubkey: summarizeHexForLog(stored.remotePubkey || ""),
        userPubkey: summarizeHexForLog(userPubkey),
        encryption: client.encryptionAlgorithm || stored.encryption || "",
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
        devLogger.warn("[nostr] Stored remote signer session cleared after failure", {
          remotePubkey: summarizeHexForLog(stored.remotePubkey || ""),
          error: error?.message || String(error),
          code: error?.code || null,
        });
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
    if (!stored.hasSession || !stored.canReconnect) {
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
      logoutSigner(activeSigner.pubkey);
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

    const enableResult = await requestEnablePermissions(extension, outstanding, {
      isDevMode,
    });

    if (enableResult?.ok) {
      this.markExtensionPermissions(outstanding);
      return enableResult;
    }

    return {
      ok: false,
      error: enableResult?.error || new Error("permission-denied"),
    };
  }

  async ensureActiveSignerForPubkey(pubkey) {
    const normalizedPubkey =
      typeof pubkey === "string" && pubkey.trim()
        ? pubkey.trim().toLowerCase()
        : "";

    const existingSigner = resolveActiveSigner(normalizedPubkey);
    if (existingSigner && typeof existingSigner.signEvent === "function") {
      return existingSigner;
    }

    const extension =
      typeof window !== "undefined" && window && window.nostr ? window.nostr : null;
    if (!extension) {
      return existingSigner;
    }

    let extensionPubkey = normalizedPubkey;

    if (typeof extension.getPublicKey === "function") {
      try {
        const retrieved = await runNip07WithRetry(
          () => extension.getPublicKey(),
          { label: "extension.getPublicKey" },
        );
        if (typeof retrieved === "string" && retrieved.trim()) {
          extensionPubkey = retrieved.trim().toLowerCase();
        }
      } catch (error) {
        devLogger.warn(
          "[nostr] Failed to hydrate active signer from extension pubkey:",
          error,
        );
        return existingSigner;
      }
    }

    if (normalizedPubkey && extensionPubkey !== normalizedPubkey) {
      return existingSigner;
    }

    if (typeof extension.signEvent !== "function") {
      return existingSigner;
    }

    const adapter = await createNip07Adapter(extension);
    if (extensionPubkey) {
      adapter.pubkey = extensionPubkey;
    }
    setActiveSigner(adapter);

    return resolveActiveSigner(normalizedPubkey || extensionPubkey);
  }

  resolveEventDTag(event, fallbackEvent = null) {
    const immediate = getDTagValueFromTags(event?.tags);
    if (immediate) {
      return immediate;
    }

    const fallbackTag = getDTagValueFromTags(fallbackEvent?.tags);
    if (fallbackTag) {
      return fallbackTag;
    }

    const candidateIds = [];
    const pushCandidate = (candidate) => {
      if (typeof candidate === "string" && candidate.trim()) {
        const normalized = candidate.trim();
        if (!candidateIds.includes(normalized)) {
          candidateIds.push(normalized);
        }
      }
    };

    pushCandidate(event?.id);
    pushCandidate(fallbackEvent?.id);

    for (const candidateId of candidateIds) {
      const rawEvent = this.rawEvents?.get?.(candidateId);
      if (!rawEvent) {
        continue;
      }
      const rawTag = getDTagValueFromTags(rawEvent.tags);
      if (rawTag) {
        return rawTag;
      }
    }

    return "";
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

    const { pubkey, privateKeyEncrypted, encryption, createdAt } = entry;

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

    const { pubkey, privateKeyEncrypted, encryption, createdAt } = entry;
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
    persistSessionActorEntry(actor);
  }

  clearStoredSessionActor() {
    clearStoredSessionActorEntry();
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
      let retrySuccess = false;
      try {
        if (HEX64_REGEX.test(normalizedPrivateKey)) {
          const bytes = new Uint8Array(normalizedPrivateKey.length / 2);
          for (let i = 0; i < normalizedPrivateKey.length; i += 2) {
            bytes[i / 2] = parseInt(
              normalizedPrivateKey.substring(i, i + 2),
              16
            );
          }
          pubkey = getPublicKey(bytes);
          retrySuccess = true;
        }
      } catch (retryError) {
        // Fall through to original error logging
      }

      if (!retrySuccess) {
        devLogger.warn("[nostr] Failed to derive session pubkey:", error);
        return null;
      }
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

    const cipherClosures = await createPrivateKeyCipherClosures(
      normalizedPrivateKey,
    );
    this.sessionActorCipherClosures = cipherClosures || null;
    this.sessionActorCipherClosuresPrivateKey = normalizedPrivateKey;

    const adapter = await createNsecAdapter({
      privateKey: normalizedPrivateKey,
      pubkey: normalizedPubkey,
    });
    setActiveSigner(adapter);

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

    const cipherClosures = await createPrivateKeyCipherClosures(
      normalizedPrivateKey,
    );
    this.sessionActorCipherClosures = cipherClosures || null;
    this.sessionActorCipherClosuresPrivateKey = normalizedPrivateKey;

    const adapter = await createNsecAdapter({
      privateKey: normalizedPrivateKey,
      pubkey: normalizedPubkey,
    });
    setActiveSigner(adapter);

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
    const canSignWithExtension =
      !!normalizedLogged &&
      activeSigner &&
      typeof activeSigner.signEvent === "function" &&
      shouldRequestExtensionPermissions(activeSigner);

    if (!forceRenew && canSignWithActiveSigner) {
      return normalizedLogged;
    }

    if (forceRenew) {
      this.sessionActor = null;
      this.sessionActorCipherClosures = null;
      this.sessionActorCipherClosuresPrivateKey = null;
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
        this.emitSessionActorChange(restored, { reason: "restored" });
        return restored.pubkey;
      }
    }

    await ensureNostrTools();

    const minted = this.mintSessionActor();
    if (minted) {
      this.sessionActor = minted;
      this.sessionActorCipherClosures = null;
      this.sessionActorCipherClosuresPrivateKey = null;
      this.persistSessionActor(minted);
      this.emitSessionActorChange(minted, { reason: "minted" });
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

  applyCachedPayload(payload, sourceLabel) {
    if (!payload || payload.version !== 1) {
      return false;
    }

    const now = Date.now();
    if (
      typeof payload.savedAt !== "number" ||
      payload.savedAt <= 0 ||
      now - payload.savedAt > EVENTS_CACHE_TTL_MS
    ) {
      return false;
    }

    const events = payload.events;
    if (!events || (typeof events !== "object" && !(events instanceof Map))) {
      return false;
    }

    this.allEvents.clear();
    this.rawEvents.clear();
    this.activeMap.clear();
    this.rootCreatedAtByRoot.clear();
    this.tombstones.clear();

    const tombstoneEntries =
      events instanceof Map && payload.tombstones instanceof Map
        ? payload.tombstones.entries()
        : Array.isArray(payload.tombstones)
          ? payload.tombstones
          : [];

    for (const entry of tombstoneEntries) {
      const [key, value] = Array.isArray(entry) ? entry : [entry.key, entry.timestamp];
      const normalizedKey = typeof key === "string" ? key.trim() : "";
      const timestamp = Number.isFinite(value) ? Math.floor(value) : 0;
      if (normalizedKey && timestamp > 0) {
        this.tombstones.set(normalizedKey, timestamp);
      }
    }

    const eventEntries =
      events instanceof Map ? events.entries() : Object.entries(events);

    for (const [id, video] of eventEntries) {
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

    if (this.allEvents.size > 0 && isDevMode) {
      devLogger.log(
        `[nostr] Restored ${this.allEvents.size} cached events from ${sourceLabel}`,
      );
    }

    return this.allEvents.size > 0;
  }

  async restoreLocalData() {
    if (this.hasRestoredLocalData) {
      return this.allEvents.size > 0;
    }

    this.hasRestoredLocalData = true;

    const restoredFromIndexedDb = await this.restoreFromIndexedDb();
    if (restoredFromIndexedDb) {
      return true;
    }

    return this.restoreFromLocalStorage();
  }

  async restoreFromIndexedDb() {
    try {
      const payload = await this.eventsCacheStore.restoreSnapshot();
      if (!payload) {
        return false;
      }
      return this.applyCachedPayload(payload, "IndexedDB");
    } catch (error) {
      devLogger.warn("[nostr] Failed to restore IndexedDB cache:", error);
      return false;
    }
  }

  restoreFromLocalStorage() {
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

    const applied = this.applyCachedPayload(payload, "localStorage");

    if (!applied && payload) {
      try {
        localStorage.removeItem(EVENTS_CACHE_STORAGE_KEY);
      } catch (err) {
        devLogger.warn("[nostr] Failed to clear expired cache:", err);
      }
    }

    return applied;
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

  async fetchListIncrementally({ kind, pubkey, dTag, relayUrls, fetchFn } = {}) {
    if (!kind || !pubkey) {
      throw new Error("fetchListIncrementally requires kind and pubkey");
    }

    const normalizedPubkey = normalizeNostrPubkey(pubkey);
    if (!normalizedPubkey) {
      throw new Error("Invalid pubkey for fetchListIncrementally");
    }

    const relaysToUse = Array.isArray(relayUrls) && relayUrls.length
      ? relayUrls
      : this.relays;

    const normalizedRelays = sanitizeRelayList(relaysToUse);
    const results = [];
    const concurrencyLimit = 4;

    // We'll use the pool's list method if fetchFn isn't provided,
    // but we need to call it per-relay.
    const pool = await this.ensurePool();
    const actualFetchFn = typeof fetchFn === "function"
      ? fetchFn
      : (r, f) => pool.list([r], [f]);

    const chunks = [];
    for (let i = 0; i < normalizedRelays.length; i += concurrencyLimit) {
      chunks.push(normalizedRelays.slice(i, i + concurrencyLimit));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (relayUrl) => {
        const lastSeen = this.getSyncLastSeen(kind, normalizedPubkey, dTag, relayUrl);
        const filter = {
          kinds: [kind],
          authors: [normalizedPubkey],
        };

        if (dTag) {
          filter["#d"] = [dTag];
        }

        // Strategy:
        // If we have a lastSeen, ask for since = lastSeen + 1.
        // If that fails or returns nothing, we don't necessarily fall back
        // unless there's an error.
        // Wait, requirements say:
        // "If metadata is missing for a relay → do a full fetch"
        // "If a relay returns an error ... fall back to full fetch"

        let doFullFetch = true;
        if (lastSeen > 0) {
          filter.since = lastSeen + 1;
          doFullFetch = false;
        }

        try {
          let events = await actualFetchFn(relayUrl, filter);

          // If incremental returned empty, we assume no updates (success).
          // But if we did a full fetch (no since), empty means empty.

          if (!events || !Array.isArray(events)) {
             events = [];
          }

          // On success, update lastSeen with max created_at
          let maxCreated = 0;
          for (const ev of events) {
            if (ev.created_at > maxCreated) {
              maxCreated = ev.created_at;
            }
          }

          if (maxCreated > 0) {
            // Only update if we found something newer or if we did a full fetch
            // Actually, if we did incremental and found new stuff, maxCreated > lastSeen.
            // If we did full fetch, maxCreated is the latest.
            this.updateSyncLastSeen(kind, normalizedPubkey, dTag, relayUrl, maxCreated);
          }

          return events;
        } catch (error) {
          // Fallback to full fetch if incremental failed or if relay error
          if (!doFullFetch) {
            try {
              delete filter.since;
              const events = await actualFetchFn(relayUrl, filter);
              // Update lastSeen on success of fallback
              let maxCreated = 0;
              if (Array.isArray(events)) {
                for (const ev of events) {
                  if (ev.created_at > maxCreated) {
                    maxCreated = ev.created_at;
                  }
                }
              }
              if (maxCreated > 0) {
                 this.updateSyncLastSeen(kind, normalizedPubkey, dTag, relayUrl, maxCreated);
              }
              return events || [];
            } catch (fallbackError) {
              devLogger.warn(`[fetchListIncrementally] Full fetch fallback failed for ${relayUrl}`, fallbackError);
              return [];
            }
          } else {
             devLogger.warn(`[fetchListIncrementally] Fetch failed for ${relayUrl}`, error);
             return [];
          }
        }
      });

      const chunkResults = await Promise.all(promises);
      for (const res of chunkResults) {
        if (Array.isArray(res)) {
          results.push(...res);
        }
      }
    }

    // Deduplicate by ID
    const uniqueEvents = new Map();
    for (const ev of results) {
      if (ev && ev.id) {
        uniqueEvents.set(ev.id, ev);
      }
    }

    return Array.from(uniqueEvents.values());
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
      resolveActiveSigner,
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
      DEFAULT_NIP07_PERMISSION_METHODS,
    });
  }

  async publishVideoReaction(pointer, options = {}) {
    return publishVideoReactionForClient(this, pointer, options, {
      resolveActiveSigner,
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
      DEFAULT_NIP07_PERMISSION_METHODS,
    });
  }

  async publishVideoComment(target, options = {}) {
    return publishCommentForClient(this, target, options, {
      resolveActiveSigner,
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
      resolveActiveSigner,
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
      DEFAULT_NIP07_PERMISSION_METHODS,
    });
  }

  /**
   * Initializes the client.
   *
   * Flow:
   * 1. Restores local data (IndexedDB/localStorage) to render the UI immediately ("stale-while-revalidate").
   * 2. Schedules the restoration of any stored NIP-46 remote signer session.
   * 3. Initializes the NostrTools `SimplePool` and connects to the configured relays.
   *
   * @returns {Promise<void>} Resolves when relays are connected (or at least attempted).
   */
  async init() {
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

  /**
   * Ensures the `SimplePool` (from nostr-tools) is initialized and ready.
   *
   * @returns {Promise<import("nostr-tools").SimplePool>} The active pool instance.
   */
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
      shimLegacySimplePoolMethods(instance);
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

      const adapter = await createNip07Adapter(extension);
      adapter.pubkey = pubkey;
      setActiveSigner(adapter);

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
    const previousPubkey = this.pubkey;
    this.pubkey = null;
    logoutSigner(previousPubkey);
    const previousSessionActor = this.sessionActor;
    this.sessionActor = null;
    this.sessionActorCipherClosures = null;
    this.sessionActorCipherClosuresPrivateKey = null;
    this.clearDmDecryptCache();
    this.dmDecryptor = null;
    this.dmDecryptorPromise = null;

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

    this.watchHistory.clear();
    if (
      this.extensionPermissionCache &&
      typeof this.extensionPermissionCache.clear === "function"
    ) {
      this.extensionPermissionCache.clear();
    }
    clearStoredNip07Permissions();
    devLogger.log("User logged out.");
  }

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
      activeSigner = resolveActiveSigner(normalizedActor);
    }
    if (!activeSigner && this.pubkey) {
      activeSigner = resolveActiveSigner(this.pubkey);
    }
    if (!activeSigner) {
      activeSigner = getActiveSigner();
    }

    if (activeSigner) {
      const capabilities = resolveSignerCapabilities(activeSigner);
      if (
        capabilities.nip44 &&
        typeof activeSigner.nip44Decrypt === "function"
      ) {
        addCandidate(
          "nip44",
          activeSigner.nip44Decrypt.bind(activeSigner),
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
          activeSigner.nip04Decrypt.bind(activeSigner),
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
    const relays = sanitizeRelayList(relayCandidates);
    const relaysToUse = relays.length ? relays : Array.from(DEFAULT_RELAY_URLS);

    const filters = buildDmFilters(
      context.actorPubkey || actorPubkeyInput,
      options,
    );

    let events = [];
    try {
      events = await this.pool.list(relaysToUse, filters);
    } catch (error) {
      devLogger.warn("[nostr] Failed to list DM events.", error);
      throw error;
    }

    const deduped = new Map();
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || typeof event !== "object") {
        continue;
      }
      const key =
        typeof event.id === "string" && event.id
          ? event.id
          : `${event.kind || ""}:${event.pubkey || ""}:${event.created_at || ""}`;
      if (!deduped.has(key)) {
        deduped.set(key, event);
      }
    }

    let decryptTargets = Array.from(deduped.values());
    decryptTargets.sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));

    if (decryptLimit && decryptTargets.length > decryptLimit) {
      devLogger.debug("[nostr] Limiting DM decrypt workload", {
        requested: decryptTargets.length,
        decryptLimit,
      });
      decryptTargets = decryptTargets.slice(0, decryptLimit);
    }

    const messages = [];
    for (const event of decryptTargets) {
      try {
        const decrypted = await this.decryptDirectMessageEvent(event, {
          actorPubkey: context.actorPubkey || actorPubkeyInput,
        });
        if (decrypted?.ok) {
          messages.push(decrypted);
        }
      } catch (error) {
        devLogger.warn("[nostr] Failed to decrypt DM event during list.", {
          error: sanitizeDecryptError(error),
          event: summarizeDmEventForLog(event),
        });
      }
    }

    messages.sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0));
    return messages;
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
    const relays = sanitizeRelayList(relayCandidates);
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
   * Sends a Direct Message (DM) to a target user.
   *
   * Supports:
   * - **Legacy (NIP-04)**: Simple base64 ciphertext (deprecated but widely supported).
   * - **Wrapped (NIP-17)**: Sealed rumors inside gift wraps (private, metadata-leaking free).
   * - **Attachments**: Handling file attachments via NIP-17 or fallback text.
   *
   * @param {string} targetNpub - The recipient's npub.
   * @param {string} message - The text content to send.
   * @param {string|null} [actorPubkeyOverride] - Optional sender pubkey override.
   * @param {object} [options] - Configuration options.
   * @param {boolean} [options.useNip17=false] - Whether to use the new NIP-17 protocol.
   * @param {Array} [options.attachments] - File attachments (NIP-17 only).
   * @returns {Promise<{ok: boolean, error?: string, details?: any}>} Result of the operation.
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
        ? resolveActiveSigner(resolvedActorOverride)
        : resolveActiveSigner(this.pubkey);
    const baseActiveSigner = activeSignerCandidate || getActiveSigner();
    const signer =
      typeof resolvedActorOverride === "string" && resolvedActorOverride.trim()
        ? activeSignerCandidate
        : baseActiveSigner
        ? resolveActiveSigner(baseActiveSigner.pubkey || this.pubkey)
        : null;

    if (!signer || typeof signer.signEvent !== "function") {
      return { ok: false, error: "sign-event-unavailable" };
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
        rumorEvents.push({
          kind: 14,
          created_at: createdAt,
          tags: [["p", targetHex]],
          content: trimmedMessage,
          pubkey: actorHex,
        });
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
        const sealPayload = {
          kind: 13,
          created_at: randomPastTimestamp(),
          tags: [],
          content: await signer.nip44Encrypt(
            recipientPubkey,
            JSON.stringify(rumorEvent),
          ),
          pubkey: actorHex,
        };

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
        const wrapTags = relayHint
          ? [["p", recipientPubkey, relayHint]]
          : [["p", recipientPubkey]];

        const wrapEvent = {
          kind: 1059,
          created_at: randomPastTimestamp(),
          tags: wrapTags,
          content: wrapCiphertext,
          pubkey: wrapperKeys.pubkey,
        };

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
      resolveActiveSigner,
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
    });
  }

  /**
   * Publishes a video event (Kind 30078).
   *
   * This constructs a V3 video note which includes:
   * - Core metadata (title, description, thumbnail).
   * - `magnet`: The Magnet URI (XT=InfoHash, WS=WebSeed, XS=TorrentMetadata).
   * - `url`: The direct HTTP URL (WebSeed).
   *
   * Side Effects:
   * - NIP-94 Mirror: Optionally publishes a Kind 1063 file header event if a hosted URL is provided.
   * - NIP-71: Optionally publishes a Kind 22 (Video Wrapper) for categorization if metadata is provided.
   *
   * @param {object} videoPayload - The video metadata and form data.
   * @param {string} pubkey - The public key of the publisher.
   * @returns {Promise<import("nostr-tools").Event>} The signed and published event.
   * @throws {Error} If not logged in or publishing fails.
   */
  async publishVideo(videoPayload, pubkey) {
    if (!pubkey) throw new Error("Not logged in to publish video.");

    const normalizedPubkey =
      typeof pubkey === "string" ? pubkey.trim() : "";

    if (!normalizedPubkey) {
      throw new Error("Not logged in to publish video.");
    }

    const userPubkeyLower = normalizedPubkey.toLowerCase();

    const { videoData, nip71Metadata } = extractVideoPublishPayload(videoPayload);
    const nip71EditedFlag =
      videoPayload && typeof videoPayload === "object"
        ? videoPayload.nip71Edited
        : null;

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
        ? videoData.mimeType.trim().toLowerCase()
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
    const wantPrivate = videoData.isPrivate === true;
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
      pubkey: normalizedPubkey,
      created_at: createdAt,
      dTagValue,
      content: contentObject,
      additionalTags: nip71Tags,
    });

    devLogger.log("Publish event with brand-new root:", videoRootId);
    devLogger.log("Event content:", event.content);

    try {
      // 1. Publish the primary Video Note (Kind 30078)
      const { signedEvent } = await this.signAndPublishEvent(event, {
        context: "video note",
        logName: "Video note",
        devLogLabel: "video note",
      });

      // 2. Publish NIP-94 Mirror (Kind 1063) if a hosted URL is present.
      // This allows clients that only understand NIP-94 to find the file.
      if (finalUrl) {
        const inferredMimeType = inferMimeTypeFromUrl(finalUrl);
        const mimeTypeSource =
          providedMimeType ||
          inferredMimeType ||
          "application/octet-stream";
        const mimeType = mimeTypeSource.toLowerCase();

        const fileHashCandidates = [
          videoData.fileSha256,
          videoData.uploadedFileSha256,
          videoPayload?.legacyFormData?.fileSha256,
          videoPayload?.fileSha256,
        ];
        let fileSha256 = "";
        for (const candidate of fileHashCandidates) {
          const normalized = normalizeHexHash(candidate);
          if (normalized) {
            fileSha256 = normalized;
            break;
          }
        }

        const originalHashCandidates = [
          videoData.originalFileSha256,
          videoPayload?.legacyFormData?.originalFileSha256,
          videoPayload?.originalFileSha256,
        ];
        let originalFileSha256 = "";
        for (const candidate of originalHashCandidates) {
          const normalized = normalizeHexHash(candidate);
          if (normalized) {
            originalFileSha256 = normalized;
            break;
          }
        }

        const uploadedFile =
          videoData?.uploadedFile ||
          videoData?.file ||
          videoPayload?.legacyFormData?.uploadedFile ||
          videoPayload?.legacyFormData?.file ||
          videoPayload?.uploadedFile ||
          videoPayload?.file ||
          null;

        const originalFile =
          videoData?.originalFile ||
          videoPayload?.legacyFormData?.originalFile ||
          videoPayload?.originalFile ||
          uploadedFile;

        if (!fileSha256 && uploadedFile) {
          fileSha256 = await computeSha256HexFromValue(uploadedFile);
        }

        if (!originalFileSha256 && originalFile) {
          originalFileSha256 = await computeSha256HexFromValue(originalFile);
        }

        if (!originalFileSha256 && fileSha256) {
          originalFileSha256 = fileSha256;
        }

        const mirrorOptions = {
          url: finalUrl,
          magnet: finalMagnet,
          thumbnail: finalThumbnail,
          description: finalDescription,
          title: finalTitle,
          mimeType,
          isPrivate: contentObject.isPrivate,
          actorPubkey: normalizedPubkey,
          created_at: createdAt,
        };

        if (fileSha256) {
          mirrorOptions.fileSha256 = fileSha256;
        }

        if (originalFileSha256) {
          mirrorOptions.originalFileSha256 = originalFileSha256;
        }

        try {
          const mirrorResult = await this.mirrorVideoEvent(
            signedEvent.id,
            mirrorOptions,
          );

          if (mirrorResult?.ok) {
            devLogger.log("Prepared NIP-94 mirror event:", mirrorResult.event);
            devLogger.log(
              "NIP-94 mirror dispatched for hosted URL:",
              finalUrl,
            );
          } else if (mirrorResult) {
            devLogger.warn(
              "[nostr] NIP-94 mirror rejected:",
              mirrorResult.error || "mirror-failed",
              mirrorResult.details || null,
            );
          }
        } catch (mirrorError) {
          devLogger.warn(
            "[nostr] Failed to publish NIP-94 mirror:",
            mirrorError,
          );
        }
      } else devLogger.log("Skipping NIP-94 mirror: no hosted URL provided.");

      // 3. Publish NIP-71 Metadata (Kind 22) if categories/tags were added.
      // This is a separate event linked to the video via `a` tag or `e` tag.
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
          isPrivate: wantPrivate,
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
              videoRootId,
              dTag: dTagValue,
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
   * Edits a video by creating a new event that reuses the existing d tag
   * so subsequent publishes overwrite the same NIP-33 addressable record
   * while keeping the original videoRootId.
   *
   * This version forces version=2 for the original note and uses
   * lowercase comparison for public keys.
   *
   * @param {object} originalEventStub - The original video event (must have `id`).
   * @param {object} updatedData - The new metadata to apply.
   * @param {string} userPubkey - The public key of the editor (must match owner).
   * @returns {Promise<import("nostr-tools").Event>} The signed and published edit event.
   * @throws {Error} If permission denied, ownership mismatch, or publish failure.
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

    const preservedDTag = this.resolveEventDTag(baseEvent, originalEventStub);
    const fallbackDTag =
      (typeof baseEvent.id === "string" && baseEvent.id.trim()) ||
      (typeof originalEventStub?.id === "string" && originalEventStub.id.trim()) ||
      "";
    const finalDTagValue =
      (typeof preservedDTag === "string" && preservedDTag.trim()) || fallbackDTag;

    if (!finalDTagValue) {
      throw new Error("Unable to determine a stable d tag for this edit.");
    }

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
      dTagValue: finalDTagValue,
      content: contentObject,
      additionalTags: nip71Tags,
    });

    devLogger.log("Creating edited event with root ID:", oldRootId);
    devLogger.log("Event content:", event.content);

    await this.ensureActiveSignerForPubkey(userPubkeyLower);

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
      const signedEvent = await queueSignEvent(signer, event);
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
   * Reverts a video (soft delete).
   * Publishes a new version with the same `d` tag but `deleted: true`.
   * The content is replaced with a placeholder.
   *
   * @param {object} originalEvent - The video event to revert.
   * @param {string} pubkey - The public key of the owner.
   * @returns {Promise<{event: object, publishResults: object[], summary: object}>} Result of the operation.
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
        : stableDTag || baseEvent?.id || originalEvent?.id || "");

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

    const event = buildVideoPostEvent({
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      dTagValue: stableDTag,
      content: contentObject,
    });

    await this.ensureActiveSignerForPubkey(pubkey);

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

  /**
   * Deletes all versions of a video.
   * 1. Reverts every known version (soft delete) by publishing a `deleted: true` update for each `d` tag or root.
   * 2. Publishes Kind 5 (NIP-09) deletion events for all event IDs and NIP-33 addresses.
   *
   * @param {string} videoRootId - The root ID of the video series.
   * @param {string} pubkey - The owner's public key.
   * @param {{confirm?: boolean, video?: object}} [options] - Options (confirm dialog, target video hint).
   * @returns {Promise<{reverts: object[], deletes: object[]}|null>} Summary of actions taken, or null if cancelled.
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
    const targetDTag = this.resolveEventDTag(targetVideo);

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
      await this.ensureActiveSignerForPubkey(pubkey);

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

    this.saveLocalData("delete-events", { immediate: true });

    return {
      reverts: revertSummaries,
      deletes: deleteSummaries,
    };
  }

  clearCachePersistHandles() {
    if (this.cachePersistTimerId) {
      clearTimeout(this.cachePersistTimerId);
      this.cachePersistTimerId = null;
    }

    if (this.cachePersistIdleId) {
      if (typeof cancelIdleCallback === "function") {
        try {
          cancelIdleCallback(this.cachePersistIdleId);
        } catch (error) {
          devLogger.warn("[nostr] Failed to cancel cache idle callback:", error);
        }
      } else {
        clearTimeout(this.cachePersistIdleId);
      }
      this.cachePersistIdleId = null;
    }
  }

  buildCachePayload() {
    return {
      version: 1,
      savedAt: Date.now(),
      events: new Map(this.allEvents),
      tombstones: new Map(this.tombstones),
    };
  }

  /**
   * Schedules a persistence task to save the current state (events, tombstones) to local storage.
   *
   * @param {string} [reason="unspecified"] - Debug label for why persistence was triggered.
   * @param {object} [options]
   * @param {boolean} [options.immediate=false] - If true, bypasses the debounce timer and saves immediately.
   * @returns {Promise<boolean>} A promise resolving to whether persistence succeeded.
   */
  saveLocalData(reason = "unspecified", options = {}) {
    const { immediate = false } = options;

    if (immediate) {
      this.clearCachePersistHandles();
      this.cachePersistInFlight = this.persistLocalData(reason).finally(() => {
        this.cachePersistInFlight = null;
      });
      return this.cachePersistInFlight;
    }

    if (this.cachePersistTimerId || this.cachePersistIdleId || this.cachePersistInFlight) {
      return this.cachePersistInFlight;
    }

    this.cachePersistReason = reason;
    devLogger.log(
      `[nostr] Scheduling cached events persist (${reason}) with debounce ${EVENTS_CACHE_PERSIST_DELAY_MS}ms`,
    );
    this.cachePersistTimerId = setTimeout(() => {
      this.cachePersistTimerId = null;
      this.cachePersistIdleId = scheduleIdleTask(() => {
        this.cachePersistIdleId = null;
        this.cachePersistInFlight = this.persistLocalData(reason).finally(() => {
          this.cachePersistInFlight = null;
        });
      });
    }, EVENTS_CACHE_PERSIST_DELAY_MS);

    return this.cachePersistInFlight;
  }

  /**
   * Executes the actual persistence logic, writing to IndexedDB (preferred) or localStorage.
   *
   * @param {string} reason - Debug label.
   * @returns {Promise<boolean>} True if successful.
   * @private
   */
  async persistLocalData(reason = "unspecified") {
    const payload = this.buildCachePayload();
    const startedAt = Date.now();
    let summary = null;
    let target = "localStorage";

    try {
      summary = await this.eventsCacheStore.persistSnapshot(payload);
      if (summary?.persisted) {
        target = "IndexedDB";
      }
    } catch (error) {
      devLogger.warn("[nostr] Failed to persist events cache to IndexedDB:", error);
    }

    if (!summary?.persisted) {
      this.persistCacheToLocalStorage(payload);
    }

    const durationMs = Date.now() - startedAt;
    devLogger.log(
      `[nostr] Cached events persisted via ${target} (reason=${reason}, duration=${durationMs}ms, events+${summary?.eventWrites ?? 0}/-${summary?.eventDeletes ?? 0}, tombstones+${summary?.tombstoneWrites ?? 0}/-${summary?.tombstoneDeletes ?? 0})`,
    );

    return summary?.persisted;
  }

  persistCacheToLocalStorage(payload) {
    if (typeof localStorage === "undefined") {
      return;
    }

    const serializedEvents = {};
    for (const [id, vid] of payload.events.entries()) {
      serializedEvents[id] = vid;
    }

    const serializedPayload = {
      ...payload,
      events: serializedEvents,
      tombstones: Array.from(payload.tombstones.entries()),
    };

    try {
      localStorage.setItem(
        EVENTS_CACHE_STORAGE_KEY,
        JSON.stringify(serializedPayload),
      );
    } catch (err) {
      devLogger.warn("[nostr] Failed to persist events cache:", err);
    }
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
   * Subscribes to Kind 30078 video events from relays.
   *
   * Strategy: "Buffering & Debouncing"
   * Relays often send bursts of events (e.g., historical dumps or new floods).
   * Processing every single event immediately would cause layout thrashing and UI lag.
   *
   * Instead, we:
   * 1. Push incoming events into `eventBuffer`.
   * 2. Schedule a flush operation (`flushEventBuffer`) with a short delay (75ms).
   * 3. When the flush runs, we process the entire batch:
   *    - Convert/Validate events.
   *    - Update the `activeMap` (latest version logic).
   *    - Persist to local cache.
   *    - Notify the UI (`onVideo`).
   *
   * This ensures O(1) renders per batch instead of O(N) renders per event.
   *
   * @param {function(object): void} onVideo - Callback fired when new valid videos are processed. Receives the `Video` object.
   * @param {{ since?: number, until?: number, limit?: number }} [options] - Filter options.
   * @returns {import("nostr-tools").Sub} The subscription object. Call `unsub()` to stop.
   */
  subscribeVideos(onVideo, options = {}) {
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

    const sub = this.pool.sub(this.relays, [filter]);
    const invalidDuringSub = [];

    // We'll collect events here instead of processing them instantly
    let eventBuffer = [];
    const EVENT_FLUSH_DEBOUNCE_MS = 75;
    let flushTimerId = null;

    /**
     * Flushes the pending event buffer.
     *
     * This batch processing is critical for performance during the initial
     * relay dump (thousands of events). It prevents React from re-rendering
     * for every single event.
     */
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

          // Merge any NIP-71 metadata we might already have cached for this video
          this.mergeNip71MetadataIntoVideo(video);
          // Determine the "true" creation time of the root video
          this.applyRootCreatedAt(video);

          const activeKey = getActiveKey(video);
          const wasDeletedEvent = video.deleted === true;

          // If this is a deletion event (Kind 5 or deletion marker), record a tombstone
          // to prevent older versions from resurrecting.
          if (wasDeletedEvent) {
            this.recordTombstone(activeKey, video.created_at);
          } else {
            // Otherwise, check if this video is already known to be deleted
            this.applyTombstoneGuard(video);
          }

          // Store in allEvents (history preservation)
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

          // Latest-wins logic: only update activeMap if this version is newer
          const prevActive = this.activeMap.get(activeKey);
          if (!prevActive || video.created_at > prevActive.created_at) {
            this.activeMap.set(activeKey, video);
            onVideo(video); // Trigger the callback that re-renders

            // Fetch NIP-71 metadata (categorization tags) in the background
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
      this.saveLocalData("subscribeVideos:flush");
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
    const requestedLimit = Number(options?.limit);
    const resolvedLimit = this.clampVideoRequestLimit(requestedLimit, DEFAULT_VIDEO_REQUEST_LIMIT);

    const filter = {
      kinds: [30078],
      "#t": ["video"],
      limit: resolvedLimit,
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
    return repostEventHelper({
      client: this,
      eventId,
      options,
      resolveActiveSigner,
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
      resolveActiveSigner,
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey,
      inferMimeTypeFromUrl,
    });
  }

  async rebroadcastEvent(eventId, options = {}) {
    return rebroadcastEventHelper({ client: this, eventId, options });
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
            logRelayCountFailure(url, error);
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
   * Fetches the complete edit history for a video.
   *
   * Why this is complex:
   * 1. **Video Root ID**: Modern videos use a `videoRootId` inside the JSON content to link versions.
   * 2. **NIP-33 `d` Tags**: Relays index by the `d` tag, not the JSON content.
   * 3. **Legacy Data**: Older videos might not have a `videoRootId` and rely solely on the `d` tag or even the original Event ID.
   *
   * Strategy:
   * - First, check local memory (`allEvents`) for matches on `videoRootId` OR `d` tag.
   * - If the root event is missing locally, fetch it by ID.
   * - If we suspect missing history (e.g., only 1 version found), perform a relay query for the specific `d` tag.
   * - Merge and sort all findings to present a linear history.
   *
   * @param {object} video - The video object to find history for.
   * @returns {Promise<object[]>} Sorted array of video objects (newest first).
   */
  async hydrateVideoHistory(video) {
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

        // A video is "the same" if:
        // 1. It shares the same V3 `videoRootId`.
        // 2. It shares the same NIP-33 `d` tag (for addressable updates).
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
