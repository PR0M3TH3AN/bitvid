// js/feedEngine/watchHistoryFeed.js

import { pointerKey, normalizePointerInput } from "../nostr.js";
import watchHistoryService from "../watchHistoryService.js";
import nostrService from "../services/nostrService.js";
import { createWatchHistoryMetadataResolver } from "../watchHistoryMetadata.js";
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

      const pointerType =
        typeof item?.pointer?.type === "string" ? item.pointer.type : null;
      const pointerValue =
        typeof item?.pointer?.value === "string" ? item.pointer.value : null;

      const watchedAtValue = Number.isFinite(item?.watchedAt)
        ? Math.max(0, Math.floor(Number(item.watchedAt)))
        : Number.isFinite(item?.metadata?.watchedAt)
        ? Math.max(0, Math.floor(Number(item.metadata.watchedAt)))
        : 0;

      let video = item.video || null;
      let profile = item.metadata?.profile || null;

      if (isWatchHistoryDebugEnabled()) {
        debugInfo("Hydrating watch history item.", {
          pointerKey: pointerKeyValue || null,
          pointerType,
          pointerValue,
          hasInitialVideo: Boolean(video),
          hasInitialProfile: Boolean(profile),
          watchedAt: watchedAtValue || null,
        });
      }

      if (pointerKeyValue && typeof service?.getLocalMetadata === "function") {
        try {
          const stored = service.getLocalMetadata(pointerKeyValue);
          if (stored) {
            const hadVideo = Boolean(video);
            const hadProfile = Boolean(profile);
            video = video || stored.video || null;
            profile = profile || stored.profile || null;
            if (isWatchHistoryDebugEnabled()) {
              debugInfo("Loaded cached metadata for pointer.", {
                pointerKey: pointerKeyValue,
                hadVideo,
                hadProfile,
                cachedVideo: Boolean(stored.video),
                cachedProfile: Boolean(stored.profile),
                resultingVideo: Boolean(video),
                resultingProfile: Boolean(profile),
              });
            }
          }
        } catch (error) {
          context?.log?.(
            "[watch-history-feed] Failed to read cached metadata",
            error,
          );
          if (isWatchHistoryDebugEnabled()) {
            debugWarn("Failed to read cached metadata for pointer.", {
              pointerKey: pointerKeyValue || null,
              error,
            });
          }
        }
      }

      if (!video && resolver?.resolveVideo) {
        if (isWatchHistoryDebugEnabled()) {
          debugInfo("Resolving video via metadata resolver.", {
            pointerKey: pointerKeyValue || null,
            pointerType,
            pointerValue,
          });
        }
        try {
          video = await resolver.resolveVideo(item.pointer);
          if (isWatchHistoryDebugEnabled()) {
            if (video) {
              debugInfo("Metadata resolver returned video candidate.", {
                pointerKey: pointerKeyValue || null,
                videoId: typeof video.id === "string" ? video.id : null,
                title:
                  typeof video.title === "string" && video.title.trim()
                    ? video.title
                    : null,
                invalid: Boolean(video.invalid),
              });
            } else {
              debugWarn("Metadata resolver returned no video candidate.", {
                pointerKey: pointerKeyValue || null,
              });
            }
          }
        } catch (error) {
          context?.log?.(
            "[watch-history-feed] Failed to resolve video from pointer",
            error,
          );
          if (isWatchHistoryDebugEnabled()) {
            debugWarn("Metadata resolver threw while resolving video.", {
              pointerKey: pointerKeyValue || null,
              error,
            });
          }
        }
      }

      if (video?.pubkey && !profile && resolver?.resolveProfile) {
        if (isWatchHistoryDebugEnabled()) {
          debugInfo("Resolving profile for video author.", {
            pointerKey: pointerKeyValue || null,
            pubkey: video.pubkey,
          });
        }
        try {
          profile = resolver.resolveProfile(video.pubkey) || null;
          if (isWatchHistoryDebugEnabled()) {
            if (profile) {
              const label =
                profile.display_name ||
                profile.name ||
                profile.username ||
                profile.nip05 ||
                null;
              debugInfo("Resolved profile for video author.", {
                pointerKey: pointerKeyValue || null,
                pubkey: video.pubkey,
                label: label || null,
              });
            } else {
              debugWarn("Resolver returned no profile for video author.", {
                pointerKey: pointerKeyValue || null,
                pubkey: video.pubkey,
              });
            }
          }
        } catch (error) {
          context?.log?.(
            "[watch-history-feed] Failed to resolve profile for pointer",
            error,
          );
          if (isWatchHistoryDebugEnabled()) {
            debugWarn("Profile resolver threw while hydrating metadata.", {
              pointerKey: pointerKeyValue || null,
              pubkey: video.pubkey,
              error,
            });
          }
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

      if (isWatchHistoryDebugEnabled()) {
        const summary = {
          pointerKey: pointerKeyValue || null,
          pointerType,
          pointerValue,
          watchedAt: watchedAtValue || null,
          videoId: typeof video?.id === "string" ? video.id : null,
          title:
            typeof video?.title === "string" && video.title?.trim()
              ? video.title
              : null,
          invalid: Boolean(video?.invalid),
          hasProfile: Boolean(profile),
        };
        if (video) {
          debugInfo("Hydrated watch history entry metadata.", summary);
        } else {
          debugWarn("Hydrated entry is missing resolved video metadata.", summary);
        }
      }

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
            if (isWatchHistoryDebugEnabled()) {
              debugInfo("Stored metadata cache entry for pointer.", {
                pointerKey: pointerKeyValue,
                cachedVideo: Boolean(metadata.video),
                cachedProfile: Boolean(metadata.profile),
              });
            }
          } catch (error) {
            context?.log?.(
              "[watch-history-feed] Failed to persist metadata cache",
              error,
            );
            if (isWatchHistoryDebugEnabled()) {
              debugWarn("Failed to persist metadata cache entry.", {
                pointerKey: pointerKeyValue,
                error,
              });
            }
          }
        } else if (typeof service?.removeLocalMetadata === "function") {
          try {
            service.removeLocalMetadata(pointerKeyValue);
            if (isWatchHistoryDebugEnabled()) {
              debugInfo("Cleared metadata cache entry for pointer.", {
                pointerKey: pointerKeyValue,
              });
            }
          } catch (error) {
            context?.log?.(
              "[watch-history-feed] Failed to clear cached metadata",
              error,
            );
            if (isWatchHistoryDebugEnabled()) {
              debugWarn("Failed to clear cached metadata entry.", {
                pointerKey: pointerKeyValue,
                error,
              });
            }
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

