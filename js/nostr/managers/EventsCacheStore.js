import { devLogger, userLogger } from "../../utils/logger.js";
import { CACHE_POLICIES } from "../cachePolicies.js";
import { NOTE_TYPES } from "../../nostrEventSchemas.js";

const EVENTS_CACHE_TTL_MS = CACHE_POLICIES[NOTE_TYPES.VIDEO_POST]?.ttl ?? (10 * 60 * 1000);
const EVENTS_CACHE_DB_NAME = "bitvid-events-cache";
const EVENTS_CACHE_DB_VERSION = 1;
const EVENTS_CACHE_IDLE_TIMEOUT_MS = 1500;

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
 * **Schema:**
 * - `events`: Store for video objects. Key: `id`.
 * - `tombstones`: Store for deletion timestamps. Key: `key`.
 * - `meta`: Store for versioning and timestamps. Key: `key`.
 *
 * **Strategy: Incremental Persistence**
 * - Snapshots are saved periodically (debounced) to avoid write trashing.
 * - "Fingerprints" (hashes/stringified) are tracked in memory to minimize I/O.
 * - Only changed items (where fingerprint differs) are written to IDB.
 * - If the TTL expires, the cache is cleared on restore to force a fresh fetch.
 */
export class EventsCacheStore {
  /**
   * Initializes the EventsCacheStore.
   * Tracks fingerprints of persisted items to avoid redundant writes.
   */
  constructor() {
    /** @type {Promise<IDBDatabase>|null} Singleton promise for opening the DB */
    this.dbPromise = null;
    /** @type {Map<string, string>} Map of Event ID -> JSON Fingerprint */
    this.persistedEventFingerprints = new Map();
    /** @type {Map<string, string>} Map of Tombstone Key -> Fingerprint */
    this.persistedTombstoneFingerprints = new Map();
    /** @type {boolean} Whether we have loaded existing fingerprints from IDB */
    this.hasLoadedFingerprints = false;
  }

  isSupported() {
    return typeof indexedDB !== "undefined";
  }

  /**
   * Opens (or returns existing) connection to the IndexedDB database.
   * Handles schema upgrades (creating object stores).
   *
   * @returns {Promise<IDBDatabase|null>} The database instance or null if not supported.
   */
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

  /**
   * Pre-loads fingerprints of all persisted items into memory.
   *
   * This is critical for the "Incremental Persistence" strategy. By knowing
   * what is already on disk (via fingerprints), we can avoid writing unchanged records.
   *
   * @param {IDBDatabase} db - The database instance.
   */
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
   * @param {Set<string>|null} [dirtyEventIds] - Optional set of event IDs that have changed.
   * @param {Set<string>|null} [dirtyTombstoneKeys] - Optional set of tombstone keys that have changed.
   * @returns {Promise<{persisted: boolean, eventWrites: number, eventDeletes: number, tombstoneWrites: number, tombstoneDeletes: number}>}
   * Stats about the persistence operation.
   */
  async persistSnapshot(payload, dirtyEventIds = null, dirtyTombstoneKeys = null) {
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
    let skipped = 0;

    // Optimization: If dirtyEventIds is provided, only check those events.
    // Otherwise, iterate over all events in the payload.
    const eventsIterable =
      dirtyEventIds instanceof Set
        ? Array.from(dirtyEventIds).map((id) => [id, events.get(id)])
        : events.entries();

    for (const [id, video] of eventsIterable) {
      if (!id || !video) {
        continue;
      }

      if (
        dirtyEventIds &&
        !dirtyEventIds.has(id) &&
        this.persistedEventFingerprints.has(id)
      ) {
        skipped++;
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

    // Optimization: Skip deletion scan if we are processing partial updates (dirtyEventIds)
    // AND the total number of events hasn't decreased. This avoids checking 'has()' on thousands of items.
    const shouldScanEventDeletions =
      !dirtyEventIds || events.size < this.persistedEventFingerprints.size;

    if (shouldScanEventDeletions) {
      for (const persistedId of Array.from(
        this.persistedEventFingerprints.keys()
      )) {
        if (events.has(persistedId)) {
          continue;
        }
        eventsStore.delete(persistedId);
        this.persistedEventFingerprints.delete(persistedId);
        eventDeletes++;
      }
    }

    // Optimization: If dirtyTombstoneKeys is provided, only check those.
    const tombstonesIterable =
      dirtyTombstoneKeys instanceof Set
        ? Array.from(dirtyTombstoneKeys).map((key) => [key, tombstones.get(key)])
        : tombstones.entries();

    for (const [key, timestamp] of tombstonesIterable) {
      if (!key || !Number.isFinite(timestamp)) {
        continue;
      }

      if (
        dirtyTombstoneKeys &&
        !dirtyTombstoneKeys.has(key) &&
        this.persistedTombstoneFingerprints.has(key)
      ) {
        skipped++;
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

    const shouldScanTombstoneDeletions =
      !dirtyTombstoneKeys ||
      tombstones.size < this.persistedTombstoneFingerprints.size;

    if (shouldScanTombstoneDeletions) {
      for (const persistedKey of Array.from(
        this.persistedTombstoneFingerprints.keys()
      )) {
        if (tombstones.has(persistedKey)) {
          continue;
        }
        tombstoneStore.delete(persistedKey);
        this.persistedTombstoneFingerprints.delete(persistedKey);
        tombstoneDeletes++;
      }
    }

    metaStore.put({ key: "meta", savedAt, version: 1 });

    await waitForTransaction(tx);

    return {
      persisted: true,
      eventWrites,
      eventDeletes,
      tombstoneWrites,
      tombstoneDeletes,
      skipped,
    };
  }
}
