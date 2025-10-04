// js/feedEngine/watchHistoryFeed.js

import { pointerKey, normalizePointerInput } from "../nostr.js";
import watchHistoryService from "../watchHistoryService.js";
import nostrService from "../services/nostrService.js";
import { createWatchHistoryMetadataResolver } from "../watchHistoryMetadata.js";
import {
  createBlacklistFilterStage,
  createWatchHistorySuppressionStage,
} from "./stages.js";
import { isPlainObject } from "./utils.js";

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
  );

  const resumeAt = resolveResumeSeconds(raw);
  const completed = resolveCompleted(raw);

  return {
    pointer,
    pointerKey: key,
    watchedAt,
    video: isPlainObject(raw?.video) ? raw.video : null,
    metadata: {
      source: "watch-history",
      pointerKey: key,
      watchedAt,
      resumeAt,
      completed,
      session: raw?.session === true || pointer.session === true,
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

    const map = new Map();
    for (const raw of Array.isArray(items) ? items : []) {
      const normalized = normalizeHistoryEntry(raw);
      if (!normalized) {
        continue;
      }
      const existing = map.get(normalized.pointerKey);
      if (!existing || existing.watchedAt < normalized.watchedAt) {
        map.set(normalized.pointerKey, normalized);
      }
    }

    const results = Array.from(map.values());
    results.sort((a, b) => {
      if (a.watchedAt !== b.watchedAt) {
        return b.watchedAt - a.watchedAt;
      }
      return a.pointerKey.localeCompare(b.pointerKey);
    });

    return results;
  };
}

function createWatchHistoryHydratorStage({
  service = watchHistoryService,
  metadataResolver,
} = {}) {
  const resolver = metadataResolver || createWatchHistoryMetadataResolver();

  return async function watchHistoryHydratorStage(items = [], context = {}) {
    const shouldStoreMetadata =
      typeof service?.shouldStoreMetadata === "function"
        ? service.shouldStoreMetadata() !== false
        : true;

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

      let video = item.video || null;
      let profile = item.metadata?.profile || null;

      if (pointerKeyValue && typeof service?.getLocalMetadata === "function") {
        try {
          const stored = service.getLocalMetadata(pointerKeyValue);
          if (stored) {
            video = video || stored.video || null;
            profile = profile || stored.profile || null;
          }
        } catch (error) {
          context?.log?.(
            "[watch-history-feed] Failed to read cached metadata",
            error,
          );
        }
      }

      if (!video && resolver?.resolveVideo) {
        try {
          video = await resolver.resolveVideo(item.pointer);
        } catch (error) {
          context?.log?.(
            "[watch-history-feed] Failed to resolve video from pointer",
            error,
          );
        }
      }

      if (video?.pubkey && !profile && resolver?.resolveProfile) {
        try {
          profile = resolver.resolveProfile(video.pubkey) || null;
        } catch (error) {
          context?.log?.(
            "[watch-history-feed] Failed to resolve profile for pointer",
            error,
          );
        }
      }

      const metadata = {
        ...(isPlainObject(item.metadata) ? item.metadata : {}),
        pointerKey: pointerKeyValue,
        watchedAt: watchedAtValue || null,
        resumeAt: item.metadata?.resumeAt ?? null,
        completed: item.metadata?.completed ?? false,
        session: item.metadata?.session === true,
        video: video || null,
        profile: profile || null,
      };

      const nextItem = {
        ...item,
        pointerKey: pointerKeyValue,
        watchedAt: watchedAtValue,
        video: video || null,
        metadata,
      };
      results.push(nextItem);

      if (pointerKeyValue) {
        if (shouldStoreMetadata) {
          try {
            service?.setLocalMetadata?.(pointerKeyValue, {
              video: metadata.video,
              profile: metadata.profile,
            });
          } catch (error) {
            context?.log?.(
              "[watch-history-feed] Failed to persist metadata cache",
              error,
            );
          }
        } else if (typeof service?.removeLocalMetadata === "function") {
          try {
            service.removeLocalMetadata(pointerKeyValue);
          } catch (error) {
            context?.log?.(
              "[watch-history-feed] Failed to clear cached metadata",
              error,
            );
          }
        }
      }
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
  metadataResolverFactory = createWatchHistoryMetadataResolver,
  shouldIncludeVideo,
} = {}) {
  const metadataResolver = metadataResolverFactory({ nostr });

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
      createWatchHistoryHydratorStage({ service, metadataResolver }),
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

