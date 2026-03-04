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
 *
 * **Concurrency Note:**
 * This class assumes single-threaded access (JavaScript main thread).
 * It relies on `dirtyKeys` for optimization but falls back to full scans if needed.
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

  /**
   * Checks if IndexedDB is available in the current environment.
   * @returns {boolean} True if IndexedDB is supported.
   */
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

  /**
   * Computes a unique fingerprint for a video object.
   * Used to detect changes without deep comparison.
   *
   * @param {object} video - The video object to fingerprint.
   * @returns {string} The computed fingerprint (JSON string).
   */
  computeEventFingerprint(video) {
    try {
      return JSON.stringify(video);
    } catch (error) {
      devLogger.warn("[nostr] Failed to fingerprint cached event", error);
      return String(Date.now());
    }
  }

  /**
   * Computes a fingerprint for a tombstone timestamp.
   *
   * @param {number} timestamp - The timestamp.
   * @returns {string} The fingerprint.
   */
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

  /**
   * Reads metadata from the store (version, savedAt).
   * @param {IDBDatabase} db - The database instance.
   * @returns {Promise<object|undefined>} The metadata object.
   */
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
   * Core logic for incremental persistence.
   * Compares items against `fingerprintsMap` to decide what to write/delete.
   *
   * **Optimization Logic:**
   * 1. Iterates only `dirtyKeys` (if provided) or all `items`.
   * 2. Computes current fingerprint.
   * 3. Updates IDB only if fingerprint differs from `fingerprintsMap`.
   * 4. Updates `fingerprintsMap` with the new fingerprint.
   * 5. Checks if deletions are needed (if `items.size < fingerprintsMap.size`).
   *    - Note: `fingerprintsMap` grows during the loop as new items are added.
   *    - This ensures that if we deleted items from `items`, `items.size` will be smaller
   *      than `fingerprintsMap.size`, triggering the deletion scan.
   *
   * @param {object} params
   * @param {IDBObjectStore} params.store - The IDB store to write to.
   * @param {Map} params.items - The current state (Map of items).
   * @param {Map} params.fingerprintsMap - The map of persisted fingerprints.
   * @param {function} params.computeFingerprint - Helper to compute fingerprint.
   * @param {Set<string>|null} params.dirtyKeys - Optional set of keys that changed.
   * @param {function} params.isValid - Validator for items.
   * @param {function} params.createRecord - Helper to create IDB record object.
   * @returns {{writes: number, deletes: number, skipped: number}} Stats.
   */
  _diffAndStore({
    store,
    items,
    fingerprintsMap,
    computeFingerprint,
    dirtyKeys,
    isValid,
    createRecord,
  }) {
    let writes = 0;
    let deletes = 0;
    let skipped = 0;

    const iterable =
      dirtyKeys instanceof Set
        ? Array.from(dirtyKeys).map((key) => [key, items.get(key)])
        : items.entries();

    for (const [key, value] of iterable) {
      if (!isValid(key, value)) {
        continue;
      }

      if (dirtyKeys && !dirtyKeys.has(key) && fingerprintsMap.has(key)) {
        skipped++;
        continue;
      }

      const fingerprint = computeFingerprint(value);
      const prevFingerprint = fingerprintsMap.get(key);
      if (prevFingerprint === fingerprint) {
        continue;
      }

      store.put(createRecord(key, value, fingerprint));
      fingerprintsMap.set(key, fingerprint);
      writes++;
    }

    // Deletion detection strategy:
    // If dirtyKeys is null, we are doing a full scan, so check everything.
    // If dirtyKeys is provided, we only check deletions if 'items' is smaller than our known persisted set.
    // NOTE: fingerprintsMap is mutated in the loop above (adding new/updated items).
    // So if items were removed from 'items' map, fingerprintsMap.size (which includes the removed ones)
    // will be larger than items.size, correctly triggering the scan.
    const shouldScanDeletions = !dirtyKeys || items.size < fingerprintsMap.size;

    if (shouldScanDeletions) {
      for (const persistedKey of Array.from(fingerprintsMap.keys())) {
        if (items.has(persistedKey)) {
          continue;
        }
        store.delete(persistedKey);
        fingerprintsMap.delete(persistedKey);
        deletes++;
      }
    }

    return { writes, deletes, skipped };
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
  async persistSnapshot(
    payload,
    dirtyEventIds = null,
    dirtyTombstoneKeys = null
  ) {
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

    const eventsResult = this._diffAndStore({
      store: eventsStore,
      items: events,
      fingerprintsMap: this.persistedEventFingerprints,
      computeFingerprint: (v) => this.computeEventFingerprint(v),
      dirtyKeys: dirtyEventIds,
      isValid: (id, video) => id && video,
      createRecord: (id, video, fingerprint) => ({ id, video, fingerprint }),
    });

    const tombstonesResult = this._diffAndStore({
      store: tombstoneStore,
      items: tombstones,
      fingerprintsMap: this.persistedTombstoneFingerprints,
      computeFingerprint: (v) => this.computeTombstoneFingerprint(v),
      dirtyKeys: dirtyTombstoneKeys,
      isValid: (key, timestamp) => key && Number.isFinite(timestamp),
      createRecord: (key, timestamp, fingerprint) => ({
        key,
        timestamp,
        fingerprint,
      }),
    });

    metaStore.put({ key: "meta", savedAt, version: 1 });

    await waitForTransaction(tx);

    return {
      persisted: true,
      eventWrites: eventsResult.writes,
      eventDeletes: eventsResult.deletes,
      tombstoneWrites: tombstonesResult.writes,
      tombstoneDeletes: tombstonesResult.deletes,
      skipped: eventsResult.skipped + tombstonesResult.skipped,
    };
  }
}
