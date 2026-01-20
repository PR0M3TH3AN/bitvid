// js/watchHistoryMetadata.js

import { getApplication } from "./applicationContext.js";
import nostrService from "./services/nostrService.js";
import { nostrClient } from "./nostrClientFacade.js";
import { logWatchHistoryDebug } from "./watchHistoryDebug.js";

function logInfo(message, details) {
  logWatchHistoryDebug("watchHistoryMetadata", "info", message, details);
}

function logWarn(message, details) {
  logWatchHistoryDebug("watchHistoryMetadata", "warn", message, details);
}

function normalizeVideoCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") {
    logInfo("Discarded non-object video candidate while normalizing.");
    return null;
  }
  if (candidate.deleted) {
    logInfo("Discarded deleted video candidate while normalizing.", {
      eventId: candidate.id || null,
    });
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
      logWarn("Failed to resolve application instance.", { error });
      return null;
    }
  }

  async function resolveVideo(pointer) {
    if (!pointer || typeof pointer !== "object") {
      logInfo("Received invalid pointer when resolving video metadata.", {
        pointerType: typeof pointer,
      });
      return null;
    }

    const app = getAppInstance();
    const type = pointer.type === "a" ? "a" : "e";
    const value = typeof pointer.value === "string" ? pointer.value.trim() : "";
    logInfo("Attempting to resolve watch history pointer.", {
      pointerType: type,
      pointerValue: value || null,
      hasAppInstance: Boolean(app),
    });
    if (!value) {
      logInfo("Pointer value was empty after trimming. Skipping resolution.");
      return null;
    }

    if (type === "e") {
      const fromAppCache = app?.videosMap?.get?.(value);
      const normalizedAppCache = normalizeVideoCandidate(fromAppCache);
      if (normalizedAppCache) {
        logInfo("Resolved pointer from application videos map.", {
          pointerValue: value,
        });
        return normalizedAppCache;
      }

      const fromClientCache = client?.allEvents instanceof Map
        ? client.allEvents.get(value)
        : null;
      const normalizedClientCache = normalizeVideoCandidate(fromClientCache);
      if (normalizedClientCache) {
        logInfo("Resolved pointer from nostr client event cache.", {
          pointerValue: value,
        });
        return normalizedClientCache;
      }

      if (typeof app?.getOldEventById === "function") {
        try {
          const fetched = await app.getOldEventById(value);
          const normalized = normalizeVideoCandidate(fetched);
          if (normalized) {
            logInfo("Resolved pointer via app.getOldEventById.", {
              pointerValue: value,
            });
            return normalized;
          }
        } catch (error) {
          logWarn("Failed to fetch old event by id.", {
            pointerValue: value,
            error,
          });
        }
      }

      if (typeof client?.getEventById === "function") {
        try {
          const fetched = await client.getEventById(value);
          const normalized = normalizeVideoCandidate(fetched);
          if (normalized) {
            logInfo("Resolved pointer via nostrClient.getEventById.", {
              pointerValue: value,
            });
            return normalized;
          }
        } catch (error) {
          logWarn("Failed to fetch event by id via nostrClient.", {
            pointerValue: value,
            error,
          });
        }
      }

      logInfo("Failed to resolve pointer by event id.", { pointerValue: value });
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
        const isMatch = typeof address === "string" && address.trim() === value;
        if (isMatch) {
          logInfo("Candidate matched address pointer.", {
            pointerValue: value,
            candidateId: candidate.id || null,
          });
        }
        return isMatch;
      } catch (error) {
        logWarn("Failed to compute address pointer for candidate.", {
          pointerValue: value,
          error,
        });
        return false;
      }
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
          logWarn("Failed to evaluate isAuthorBlocked callback.", {
            pointerValue: value,
            error,
          });
          return false;
        }
      },
    };

    if (!Array.isArray(caches.activeVideos)) {
      try {
        caches.activeVideos = nostr.getFilteredActiveVideos
          ? nostr.getFilteredActiveVideos(filterOptions)
          : [];
        logInfo("Loaded active videos cache for pointer resolution.", {
          pointerValue: value,
          candidateCount: Array.isArray(caches.activeVideos)
            ? caches.activeVideos.length
            : 0,
        });
      } catch (error) {
        logWarn("Failed to read active videos cache.", {
          pointerValue: value,
          error,
        });
        caches.activeVideos = [];
      }
    }

    for (const candidate of Array.isArray(caches.activeVideos)
      ? caches.activeVideos
      : []) {
      if (compareAddress(candidate)) {
        const normalized = normalizeVideoCandidate(candidate);
        if (normalized) {
          logInfo("Resolved pointer from active videos cache.", {
            pointerValue: value,
            candidateId: normalized.id || null,
          });
          return normalized;
        }
      }
    }

    if (!caches.catalogPromise && typeof nostr.fetchVideos === "function") {
      logInfo("Fetching video catalog for pointer resolution.", {
        pointerValue: value,
      });
      caches.catalogPromise = nostr
        .fetchVideos(filterOptions)
        .catch((error) => {
          logWarn("Failed to fetch video catalog while resolving pointer.", {
            pointerValue: value,
            error,
          });
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
              logInfo("Resolved pointer from fetched video catalog.", {
                pointerValue: value,
                candidateId: normalized.id || null,
              });
              return normalized;
            }
          }
        }
      } catch (error) {
        logWarn("Failed to resolve pointer from fetched catalog.", {
          pointerValue: value,
          error,
        });
      }
    }

    logInfo("Failed to resolve pointer after exhausting lookup strategies.", {
      pointerValue: value,
    });
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
        logInfo("Resolved profile from application cache.", { pubkey });
        return cacheEntry.profile || null;
      }
    } catch (error) {
      logWarn("Failed to read profile cache entry.", { pubkey, error });
    }
    logInfo("Profile cache miss during watch history hydration.", { pubkey });
    return null;
  }

  function reset() {
    caches.activeVideos = null;
    logInfo("Reset active videos cache for watch history metadata resolver.");
    caches.catalogPromise = null;
    logInfo("Reset catalog promise for watch history metadata resolver.");
  }

  return {
    resolveVideo,
    resolveProfile,
    reset,
    caches,
  };
}
