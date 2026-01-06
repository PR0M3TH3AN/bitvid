// js/feedEngine/watchHistoryFeed.js

import { pointerKey, normalizePointerInput } from "../nostr/watchHistory.js";
import { convertEventToVideo } from "../nostr/index.js";
import watchHistoryService from "../watchHistoryService.js";
import nostrService from "../services/nostrService.js";
import { nostrClient } from "../nostrClientFacade.js";
import {
  isWatchHistoryDebugEnabled,
  logWatchHistoryDebug,
} from "../watchHistoryDebug.js";
import {
  createBlacklistFilterStage,
  createWatchHistorySuppressionStage,
} from "./stages.js";
import { isPlainObject } from "./utils.js";

const WATCH_HISTORY_FEED_LOG_NAMESPACE = "watchHistoryFeed";

function debugInfo(message, details) {
  logWatchHistoryDebug(WATCH_HISTORY_FEED_LOG_NAMESPACE, "info", message, details);
}

function debugWarn(message, details) {
  logWatchHistoryDebug(WATCH_HISTORY_FEED_LOG_NAMESPACE, "warn", message, details);
}

function normalizeActorCandidate(...values) {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return "";
}

function resolveWatchedAt(...candidates) {
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate)) {
      continue;
    }
    let normalized = Math.floor(Number(candidate));
    if (normalized <= 0) {
      continue;
    }
    if (normalized > 10_000_000_000) {
      normalized = Math.floor(normalized / 1000);
    }
    if (normalized > 0) {
      return normalized;
    }
  }
  return 0;
}

function resolveResumeSeconds(candidate) {
  const candidates = [
    candidate?.resumeSeconds,
    candidate?.resume,
    candidate?.resumeAt,
    candidate?.resumePosition,
    candidate?.resumeTime,
    candidate?.progress?.resume,
    candidate?.progress?.seconds,
    candidate?.progress?.position,
    candidate?.pointer?.resumeSeconds,
    candidate?.pointer?.resume,
    candidate?.pointer?.resumeAt,
  ];

  for (const entry of candidates) {
    if (!Number.isFinite(entry)) {
      continue;
    }
    const normalized = Math.max(0, Math.floor(entry));
    if (normalized > 0) {
      return normalized;
    }
  }
  return null;
}

function resolveCompleted(candidate) {
  const candidates = [
    candidate?.completed,
    candidate?.complete,
    candidate?.progress?.completed,
    candidate?.progress?.complete,
    candidate?.pointer?.completed,
    candidate?.pointer?.complete,
  ];
  return candidates.some((value) => value === true);
}

function normalizeHistoryEntry(raw) {
  const pointer = normalizePointerInput(raw?.pointer || raw);
  if (!pointer) {
    return null;
  }

  const key = pointerKey(pointer);
  if (!key) {
    return null;
  }

  const watchedAt = resolveWatchedAt(
    raw?.watchedAt,
    raw?.timestamp,
    raw?.created_at,
    pointer?.watchedAt,
    raw?.metadata?.watchedAt,
    pointer?.metadata?.watchedAt,
  );

  const resumeAt = (() => {
    const fromPointer = Number.isFinite(pointer?.resumeAt)
      ? Math.max(0, Math.floor(pointer.resumeAt))
      : Number.isFinite(pointer?.metadata?.resumeAt)
      ? Math.max(0, Math.floor(pointer.metadata.resumeAt))
      : null;
    if (fromPointer !== null) {
      return fromPointer;
    }
    return resolveResumeSeconds(raw);
  })();

  const completed =
    pointer?.completed === true ||
    pointer?.metadata?.completed === true ||
    resolveCompleted(raw);

  const pointerVideo =
    (pointer?.video && isPlainObject(pointer.video) ? pointer.video : null) ||
    (pointer?.metadata?.video && isPlainObject(pointer.metadata.video)
      ? pointer.metadata.video
      : null);

  const pointerProfile =
    (pointer?.profile && isPlainObject(pointer.profile) ? pointer.profile : null) ||
    (pointer?.metadata?.profile && isPlainObject(pointer.metadata.profile)
      ? pointer.metadata.profile
      : null);

  return {
    pointer,
    pointerKey: key,
    watchedAt,
    video:
      isPlainObject(raw?.video) && raw.video
        ? raw.video
        : pointerVideo,
    metadata: {
      source: "watch-history",
      pointerKey: key,
      watchedAt,
      resumeAt,
      completed,
      session: raw?.session === true || pointer.session === true,
      video: pointerVideo,
      profile: pointerProfile,
    },
  };
}

function createWatchHistorySource({ service = watchHistoryService } = {}) {
  return async function watchHistorySource(context = {}) {
    const actor = normalizeActorCandidate(
      context?.runtime?.watchHistory?.actor,
      context?.config?.actor,
      context?.runtime?.actor,
    );

    if (!service || typeof service.loadLatest !== "function") {
      return [];
    }

    let items = [];
    try {
      items = await Promise.resolve(service.loadLatest(actor || undefined));
    } catch (error) {
      context?.log?.("[watch-history-feed] Failed to load history", error);
      items = [];
    }

    const results = [];
    for (const raw of Array.isArray(items) ? items : []) {
      const normalized = normalizeHistoryEntry(raw);
      if (normalized) {
        results.push(normalized);
      }
    }

    results.sort((a, b) => {
      if (a.watchedAt !== b.watchedAt) {
        return b.watchedAt - a.watchedAt;
      }
      return a.pointerKey.localeCompare(b.pointerKey);
    });

    return results;
  };
}

function normalizeAddressKey(address) {
  if (typeof address !== "string") return "";
  const parts = address.split(":");
  if (parts.length < 3) return address;
  const kind = parts[0];
  const pubkey = parts[1].toLowerCase();
  const dTag = parts.slice(2).join(":"); // Preserve d-tag case
  return `${kind}:${pubkey}:${dTag}`;
}

function resolveEventAddress(event) {
  if (!event || typeof event !== "object") {
    return "";
  }
  const kind = Number(event.kind);
  const pubkey = typeof event.pubkey === "string" ? event.pubkey.toLowerCase() : "";
  if (!Number.isFinite(kind) || !pubkey) {
    return "";
  }
  const dTag = event.tags?.find((t) => t[0] === "d" && t[1]);
  if (dTag) {
    return `${kind}:${pubkey}:${dTag[1]}`;
  }
  return "";
}

function checkLocalCacheForVideo(pointer) {
  if (!pointer || typeof pointer !== "object" || !nostrClient?.allEvents) {
    return null;
  }

  if (pointer.type === "e" && pointer.value) {
    const cached = nostrClient.allEvents.get(pointer.value);
    if (cached) {
      return cached;
    }
  }

  // Address lookup requires scanning if not using 'e'
  // We handle this in batch inside the hydration stage to avoid repeated scanning
  return null;
}

function createWatchHistoryHydrationStage() {
  return async function watchHistoryHydrationStage(items = [], context = {}) {
    const missing = [];
    const missingAddresses = [];
    const idMap = new Map();

    const itemsToHydrate = items.filter(item => !item.video && item.pointer);
    let addressScanNeeded = false;

    // First pass: try to resolve from cache for IDs, and collect addresses
    for (const item of itemsToHydrate) {
      const pointer = item.pointer;

      if (pointer?.type === "e" && pointer.value) {
        const cached = checkLocalCacheForVideo(pointer);
        if (cached) {
          item.video = cached;
          if (item.metadata) item.metadata.video = cached;
          continue;
        }

        missing.push(pointer.value);
        if (!idMap.has(pointer.value)) {
          idMap.set(pointer.value, []);
        }
        idMap.get(pointer.value).push(item);
      } else if (pointer?.type === "a" && pointer.value) {
        addressScanNeeded = true;
        // Don't add to missingAddresses yet, check cache first
      }
    }

    // Second pass: Scan cache for addresses if needed
    if (addressScanNeeded && nostrClient?.allEvents) {
      // Create a temporary index of cached videos by address
      // Only iterate once
      const cacheByAddress = new Map();
      for (const video of nostrClient.allEvents.values()) {
        const address = resolveEventAddress(video);
        if (address) {
          cacheByAddress.set(normalizeAddressKey(address), video);
        }
      }

      for (const item of itemsToHydrate) {
        const pointer = item.pointer;
        if (pointer?.type === "a" && pointer.value) {
          const key = normalizeAddressKey(pointer.value);
          const cached = cacheByAddress.get(key);
          if (cached) {
            item.video = cached;
            if (item.metadata) item.metadata.video = cached;
            continue;
          }

          missingAddresses.push(pointer.value);
          if (!idMap.has(key)) {
            idMap.set(key, []);
          }
          idMap.get(key).push(item);
        }
      }
    }

    if (!missing.length && !missingAddresses.length) {
      return items;
    }

    const uniqueIds = Array.from(new Set(missing));
    const uniqueAddresses = Array.from(new Set(missingAddresses));

    const readRelays =
      Array.isArray(nostrClient?.readRelays) && nostrClient.readRelays.length
        ? nostrClient.readRelays
        : null;

    const fallbackRelays =
      Array.isArray(nostrClient?.relays) && nostrClient.relays.length
        ? nostrClient.relays
        : null;

    const relays = readRelays || fallbackRelays;

    if (!relays || !nostrClient?.pool) {
      return items;
    }

    const filters = [];
    if (uniqueIds.length) {
      filters.push({ ids: uniqueIds });
    }

    if (uniqueAddresses.length) {
      const addressFilters = new Map();
      for (const address of uniqueAddresses) {
        const parts = address.split(":");
        if (parts.length < 3) continue;
        const kind = Number(parts[0]);
        const pubkey = parts[1];
        const normalizedPubkey = pubkey.toLowerCase();
        const dTag = parts.slice(2).join(":");

        const key = `${kind}:${normalizedPubkey}`;
        if (!addressFilters.has(key)) {
          addressFilters.set(key, { kinds: [kind], authors: [normalizedPubkey], "#d": [] });
        }
        addressFilters.get(key)["#d"].push(dTag);
      }

      for (const filter of addressFilters.values()) {
        filters.push(filter);
      }
    }

    try {
      const events = await nostrClient.pool.list(relays, filters);

      for (const event of events) {
        if (!event) {
          continue;
        }
        try {
          const video = convertEventToVideo(event);
          if (video && !video.invalid) {
            // Match by ID
            if (event.id) {
              const targets = idMap.get(event.id);
              if (targets) {
                for (const target of targets) {
                  target.video = video;
                  if (target.metadata) {
                    target.metadata.video = video;
                  }
                }
              }
            }

            // Match by Address
            const address = resolveEventAddress(event);
            if (address) {
              const key = normalizeAddressKey(address);
              const targets = idMap.get(key);
              if (targets) {
                for (const target of targets) {
                  target.video = video;
                  if (target.metadata) {
                    target.metadata.video = video;
                  }
                }
              }
            }
          }
        } catch (err) {
          debugWarn(`[watchHistoryFeed] Failed to convert event ${event.id}:`, err);
        }
      }
    } catch (error) {
      debugWarn("[watchHistoryFeed] Hydration fetch failed:", error);
    }

    return items;
  };
}

function createWatchHistoryHydratorStage({ service = watchHistoryService } = {}) {
  return async function watchHistoryHydratorStage(items = [], context = {}) {
    const results = [];

    for (const item of Array.isArray(items) ? items : []) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const pointerKeyValue =
        typeof item.pointerKey === "string" && item.pointerKey
          ? item.pointerKey
          : pointerKey(item.pointer);

      const watchedAtValue = Number.isFinite(item?.watchedAt)
        ? Math.max(0, Math.floor(Number(item.watchedAt)))
        : Number.isFinite(item?.metadata?.watchedAt)
        ? Math.max(0, Math.floor(Number(item.metadata.watchedAt)))
        : 0;

      const metadata = {
        ...(isPlainObject(item.metadata) ? item.metadata : {}),
        pointerKey: pointerKeyValue,
        watchedAt: watchedAtValue || null,
        resumeAt: item.metadata?.resumeAt ?? null,
        completed: item.metadata?.completed ?? false,
        session: item.metadata?.session === true,
      };

      const nextItem = {
        ...item,
        pointerKey: pointerKeyValue,
        watchedAt: watchedAtValue,
        metadata,
      };
      results.push(nextItem);
    }

    return results;
  };
}

function createWatchHistorySorter() {
  return function watchHistorySorter(items = []) {
    if (!Array.isArray(items)) {
      return [];
    }
    const copy = [...items];
    copy.sort((a, b) => {
      if (a?.watchedAt !== b?.watchedAt) {
        return (b?.watchedAt || 0) - (a?.watchedAt || 0);
      }
      const aKey = typeof a?.pointerKey === "string" ? a.pointerKey : "";
      const bKey = typeof b?.pointerKey === "string" ? b.pointerKey : "";
      return aKey.localeCompare(bKey);
    });
    return copy;
  };
}

export function createWatchHistoryFeedDefinition({
  service = watchHistoryService,
  nostr = nostrService,
  shouldIncludeVideo,
} = {}) {
  const blacklistStage = createBlacklistFilterStage({
    shouldIncludeVideo:
      typeof shouldIncludeVideo === "function"
        ? shouldIncludeVideo
        : (video, options) =>
            (nostr?.shouldIncludeVideo
              ? nostr.shouldIncludeVideo(video, options)
              : true),
  });

  return {
    source: createWatchHistorySource({ service }),
    stages: [
      createWatchHistoryHydratorStage({ service }),
      createWatchHistoryHydrationStage(),
      blacklistStage,
      createWatchHistorySuppressionStage(),
    ],
    sorter: createWatchHistorySorter(),
    defaultConfig: {
      actorFilters: [],
    },
  };
}

export function registerWatchHistoryFeed(engine, options = {}) {
  if (!engine || typeof engine.registerFeed !== "function") {
    return null;
  }

  const definition = createWatchHistoryFeedDefinition(options);
  return engine.registerFeed("watch-history", definition);
}
