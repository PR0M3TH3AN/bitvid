import { EventsCacheStore } from "./EventsCacheStore.js";
import { devLogger, userLogger } from "../../utils/logger.js";
import { isDevMode } from "../../config.js";
import { NOTE_TYPES } from "../../nostrEventSchemas.js";
import { CACHE_POLICIES } from "../cachePolicies.js";

const EVENTS_CACHE_STORAGE_KEY = "bitvid:eventsCache:v1";
const EVENTS_CACHE_TTL_MS = CACHE_POLICIES[NOTE_TYPES.VIDEO_POST]?.ttl ?? (10 * 60 * 1000);
const EVENTS_CACHE_PERSIST_DELAY_MS = 450;
const EVENTS_CACHE_IDLE_TIMEOUT_MS = 1500;

function scheduleIdleTask(callback, timeout = EVENTS_CACHE_IDLE_TIMEOUT_MS) {
  if (typeof requestIdleCallback === "function") {
    return requestIdleCallback(callback, { timeout });
  }
  return setTimeout(callback, timeout);
}

export class PersistenceManager {
  constructor(client) {
    this.client = client;
    this.eventsCacheStore = new EventsCacheStore();
    this.cachePersistTimerId = null;
    this.cachePersistIdleId = null;
    this.cachePersistInFlight = null;
    this.cachePersistReason = null;
    this.hasRestoredLocalData = false;
  }

  /**
   * Restores application state from the best available local cache.
   *
   * 1. Attempts to load from `IndexedDB` (preferred).
   * 2. Falls back to `localStorage` if IDB fails or is empty.
   * 3. Rehydrates `allEvents`, `activeMap`, and `tombstones`.
   *
   * This implements the "Stale-While-Revalidate" pattern: the UI renders
   * immediately with this data while network requests proceed in the background.
   *
   * @returns {Promise<boolean>} True if data was successfully restored.
   */
  async restoreLocalData() {
    if (this.hasRestoredLocalData) {
      return this.client.allEvents.size > 0;
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

    this.client.allEvents.clear();
    this.client.rawEvents.clear();
    this.client.activeMap.clear();
    this.client.rootCreatedAtByRoot.clear();
    this.client.tombstones.clear();
    this.client.dirtyEventIds.clear();
    this.client.dirtyTombstones.clear();

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
        this.client.tombstones.set(normalizedKey, timestamp);
      }
    }

    const eventEntries =
      events instanceof Map ? events.entries() : Object.entries(events);

    for (const [id, video] of eventEntries) {
      if (!id || !video || typeof video !== "object") {
        continue;
      }

      this.client.applyRootCreatedAt(video);
      const activeKey = this.client.getActiveKey(video);

      if (video.deleted) {
        this.client.recordTombstone(activeKey, video.created_at);
      } else {
        this.client.applyTombstoneGuard(video);
      }

      this.client.allEvents.set(id, video);
      if (video.deleted) {
        continue;
      }

      const existing = this.client.activeMap.get(activeKey);
      if (!existing || video.created_at > existing.created_at) {
        this.client.activeMap.set(activeKey, video);
      }
    }

    if (this.client.allEvents.size > 0 && isDevMode) {
      devLogger.log(
        `[nostr] Restored ${this.client.allEvents.size} cached events from ${sourceLabel}`,
      );
    }

    this.client.dirtyEventIds.clear();
    this.client.dirtyTombstones.clear();

    return this.client.allEvents.size > 0;
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
      events: new Map(this.client.allEvents),
      tombstones: new Map(this.client.tombstones),
    };
  }

  /**
   * Schedules a persistence operation to save current state to cache.
   *
   * - Uses a debounce strategy (75ms) to prevent write thrashing during bursts.
   * - Can be forced to run immediately via `options.immediate`.
   * - Coordinates with `requestIdleCallback` to avoid blocking the main thread.
   *
   * @param {string} [reason="unspecified"] - Debug label for why persistence was triggered.
   * @param {object} [options] - Configuration.
   * @param {boolean} [options.immediate=false] - If true, bypasses debounce and persists immediately.
   * @returns {Promise<boolean>|null} The persistence promise or null if debounced.
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
    // Strategy:
    // 1. Try to persist to IndexedDB (preferred, large capacity).
    // 2. If IDB fails or returns false, fall back to LocalStorage (limited capacity).
    // The `EventsCacheStore` handles differential updates (only saving changed fingerprints)
    // to keep IDB writes fast.

    // Capture snapshots of dirty sets to optimize persistence
    const dirtyEventIdsSnapshot = new Set(this.client.dirtyEventIds);
    const dirtyTombstonesSnapshot = new Set(this.client.dirtyTombstones);

    // Clear the tracked items from the main sets so we don't re-process them next time.
    // New items added during the async save will remain in the main sets.
    for (const id of dirtyEventIdsSnapshot) {
      this.client.dirtyEventIds.delete(id);
    }
    for (const key of dirtyTombstonesSnapshot) {
      this.client.dirtyTombstones.delete(key);
    }

    const payload = this.buildCachePayload();
    const startedAt = Date.now();
    let summary = null;
    let target = "localStorage";

    try {
      summary = await this.eventsCacheStore.persistSnapshot(
        payload,
        dirtyEventIdsSnapshot,
        dirtyTombstonesSnapshot
      );
      if (summary?.persisted) {
        target = "IndexedDB";
      }
    } catch (error) {
      devLogger.warn(
        "[nostr] Failed to persist events cache to IndexedDB:",
        error
      );
    }

    if (!summary?.persisted) {
      // If persistence failed, re-queue the dirty items for the next attempt.
      for (const id of dirtyEventIdsSnapshot) {
        this.client.dirtyEventIds.add(id);
      }
      for (const key of dirtyTombstonesSnapshot) {
        this.client.dirtyTombstones.add(key);
      }
      this.persistCacheToLocalStorage(payload);
    }

    const durationMs = Date.now() - startedAt;
    devLogger.log(
      `[nostr] Cached events persisted via ${target} (reason=${reason}, duration=${durationMs}ms, events+${summary?.eventWrites ?? 0}/-${summary?.eventDeletes ?? 0}, tombstones+${summary?.tombstoneWrites ?? 0}/-${summary?.tombstoneDeletes ?? 0}, skipped=${summary?.skipped ?? 0})`,
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
}
