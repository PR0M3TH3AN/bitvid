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

function createWatchHistoryHydrationStage() {
  return async function watchHistoryHydrationStage(items = [], context = {}) {
    const missing = [];
    const idMap = new Map();

    for (const item of items) {
      if (item.video) {
        continue;
      }
      const pointer = item.pointer;
      if (pointer?.type === "e" && pointer.value) {
        missing.push(pointer.value);
        if (!idMap.has(pointer.value)) {
          idMap.set(pointer.value, []);
        }
        idMap.get(pointer.value).push(item);
      }
    }

    if (!missing.length) {
      return items;
    }

    const uniqueIds = Array.from(new Set(missing));
    const relays =
      Array.isArray(nostrClient?.relays) && nostrClient.relays.length
        ? nostrClient.relays
        : null;

    if (!relays || !nostrClient?.pool) {
      return items;
    }

    try {
      const events = await nostrClient.pool.list(relays, [
        { ids: uniqueIds },
      ]);

      for (const event of events) {
        if (!event || !event.id) {
          continue;
        }
        try {
          const video = convertEventToVideo(event);
          if (video && !video.invalid) {
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

