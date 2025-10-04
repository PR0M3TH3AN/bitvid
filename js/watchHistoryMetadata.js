// js/watchHistoryMetadata.js

import { getApplication } from "./applicationContext.js";
import nostrService from "./services/nostrService.js";
import { nostrClient } from "./nostr.js";

const isDevEnv =
  typeof process !== "undefined" && process?.env?.NODE_ENV !== "production";

function normalizeVideoCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  if (candidate.deleted) {
    return null;
  }
  return candidate;
}

export function createWatchHistoryMetadataResolver({
  appResolver = getApplication,
  nostr = nostrService,
  client = nostrClient,
} = {}) {
  const caches = {
    activeVideos: null,
    catalogPromise: null,
  };

  function getAppInstance() {
    try {
      return typeof appResolver === "function" ? appResolver() : getApplication();
    } catch (error) {
      if (isDevEnv) {
        console.warn(
          "[watchHistoryMetadata] Failed to resolve application instance:",
          error,
        );
      }
      return null;
    }
  }

  async function resolveVideo(pointer) {
    if (!pointer || typeof pointer !== "object") {
      return null;
    }

    const app = getAppInstance();
    const type = pointer.type === "a" ? "a" : "e";
    const value = typeof pointer.value === "string" ? pointer.value.trim() : "";
    if (!value) {
      return null;
    }

    if (type === "e") {
      const fromAppCache = app?.videosMap?.get?.(value);
      const normalizedAppCache = normalizeVideoCandidate(fromAppCache);
      if (normalizedAppCache) {
        return normalizedAppCache;
      }

      const fromClientCache = client?.allEvents instanceof Map
        ? client.allEvents.get(value)
        : null;
      const normalizedClientCache = normalizeVideoCandidate(fromClientCache);
      if (normalizedClientCache) {
        return normalizedClientCache;
      }

      if (typeof app?.getOldEventById === "function") {
        try {
          const fetched = await app.getOldEventById(value);
          const normalized = normalizeVideoCandidate(fetched);
          if (normalized) {
            return normalized;
          }
        } catch (error) {
          if (isDevEnv) {
            console.warn(
              "[watchHistoryMetadata] Failed to fetch old event by id:",
              error,
            );
          }
        }
      }

      if (typeof client?.getEventById === "function") {
        try {
          const fetched = await client.getEventById(value);
          const normalized = normalizeVideoCandidate(fetched);
          if (normalized) {
            return normalized;
          }
        } catch (error) {
          if (isDevEnv) {
            console.warn(
              "[watchHistoryMetadata] Failed to fetch event by id:",
              error,
            );
          }
        }
      }

      return null;
    }

    const compareAddress = (candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return false;
      }
      if (typeof app?.getVideoAddressPointer !== "function") {
        return false;
      }
      try {
        const address = app.getVideoAddressPointer(candidate);
        return typeof address === "string" && address.trim() === value;
      } catch (error) {
        if (isDevEnv) {
          console.warn(
            "[watchHistoryMetadata] Failed to compute address pointer:",
            error,
          );
        }
      }
      return false;
    };

    if (app?.videosMap instanceof Map) {
      for (const cached of app.videosMap.values()) {
        if (compareAddress(cached)) {
          const normalized = normalizeVideoCandidate(cached);
          if (normalized) {
            return normalized;
          }
        }
      }
    }

    const blacklist = app?.blacklistedEventIds instanceof Set
      ? app.blacklistedEventIds
      : undefined;
    const filterOptions = {
      blacklistedEventIds: blacklist,
      isAuthorBlocked: (pubkey) => {
        try {
          return (
            typeof app?.isAuthorBlocked === "function" &&
            app.isAuthorBlocked(pubkey)
          );
        } catch (error) {
          if (isDevEnv) {
            console.warn(
              "[watchHistoryMetadata] Failed to evaluate isAuthorBlocked:",
              error,
            );
          }
          return false;
        }
      },
    };

    if (!Array.isArray(caches.activeVideos)) {
      try {
        caches.activeVideos = nostr.getFilteredActiveVideos
          ? nostr.getFilteredActiveVideos(filterOptions)
          : [];
      } catch (error) {
        if (isDevEnv) {
          console.warn(
            "[watchHistoryMetadata] Failed to read active videos cache:",
            error,
          );
        }
        caches.activeVideos = [];
      }
    }

    for (const candidate of Array.isArray(caches.activeVideos)
      ? caches.activeVideos
      : []) {
      if (compareAddress(candidate)) {
        const normalized = normalizeVideoCandidate(candidate);
        if (normalized) {
          return normalized;
        }
      }
    }

    if (!caches.catalogPromise && typeof nostr.fetchVideos === "function") {
      caches.catalogPromise = nostr
        .fetchVideos(filterOptions)
        .catch((error) => {
          if (isDevEnv) {
            console.warn(
              "[watchHistoryMetadata] Failed to fetch video catalog:",
              error,
            );
          }
          return [];
        });
    }

    if (caches.catalogPromise) {
      try {
        const catalog = await caches.catalogPromise;
        for (const candidate of Array.isArray(catalog) ? catalog : []) {
          if (compareAddress(candidate)) {
            const normalized = normalizeVideoCandidate(candidate);
            if (normalized) {
              return normalized;
            }
          }
        }
      } catch (error) {
        if (isDevEnv) {
          console.warn(
            "[watchHistoryMetadata] Failed to resolve catalog pointer:",
            error,
          );
        }
      }
    }

    return null;
  }

  function resolveProfile(pubkey) {
    if (typeof pubkey !== "string" || !pubkey.trim()) {
      return null;
    }
    const app = getAppInstance();
    if (!app) {
      return null;
    }
    try {
      const cacheEntry =
        typeof app.getProfileCacheEntry === "function"
          ? app.getProfileCacheEntry(pubkey)
          : null;
      if (cacheEntry && typeof cacheEntry === "object") {
        return cacheEntry.profile || null;
      }
    } catch (error) {
      if (isDevEnv) {
        console.warn(
          "[watchHistoryMetadata] Failed to read profile cache entry:",
          error,
        );
      }
    }
    return null;
  }

  function reset() {
    caches.activeVideos = null;
    caches.catalogPromise = null;
  }

  return {
    resolveVideo,
    resolveProfile,
    reset,
    caches,
  };
}

