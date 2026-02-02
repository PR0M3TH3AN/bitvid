import { devLogger } from "../utils/logger.js";

function noopClone(value) {
  return value;
}

export function createProfileSettingsStore({ clone = noopClone, logger = devLogger } = {}) {
  const cache = new Map();

  const cloneValue = (value) => {
    try {
      return clone(value);
    } catch (error) {
      if (logger && typeof logger.warn === "function") {
        logger.warn("[profileSettingsStore] Failed to clone value", error);
      }
      return value;
    }
  };

  const store = {
    set(key, value) {
      if (!key) {
        return store;
      }
      cache.set(key, cloneValue(value));
      return store;
    },
    get(key) {
      if (!key || !cache.has(key)) {
        return undefined;
      }
      return cloneValue(cache.get(key));
    },
    has(key) {
      if (!key) {
        return false;
      }
      return cache.has(key);
    },
    delete(key) {
      if (!key) {
        return false;
      }
      return cache.delete(key);
    },
    clear() {
      cache.clear();
      return store;
    },
    keys() {
      return Array.from(cache.keys());
    },
    values() {
      return Array.from(cache.values()).map((value) => cloneValue(value));
    },
    entries() {
      return Array.from(cache.entries()).map(([key, value]) => [
        key,
        cloneValue(value),
      ]);
    },
  };

  Object.defineProperty(store, "size", {
    get() {
      return cache.size;
    },
  });

  return store;
}

export default createProfileSettingsStore;
