// js/feedEngine/sources.js

import nostrService from "../services/nostrService.js";
import watchHistoryService from "../watchHistoryService.js";
import { isPlainObject, toArray, toSet } from "./utils.js";

function resolveService(candidate, fallback) {
  if (candidate && typeof candidate === "object") {
    return candidate;
  }
  return fallback;
}

function normalizeAuthor(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed;
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

export function createActiveNostrSource({ service } = {}) {
  const resolvedService = resolveService(service, nostrService);

  return async function activeNostrSource(context = {}) {
    const options = {
      blacklistedEventIds: toSet(context?.runtime?.blacklistedEventIds),
      isAuthorBlocked:
        typeof context?.runtime?.isAuthorBlocked === "function"
          ? context.runtime.isAuthorBlocked
          : () => false,
    };

    let videos = [];
    try {
      videos = await Promise.resolve(
        resolvedService.getFilteredActiveVideos(options)
      );
    } catch (error) {
      context?.log?.("[active-source] Failed to resolve active videos", error);
      videos = [];
    }

    return (Array.isArray(videos) ? videos : []).map((video) => ({
      video,
      metadata: {
        source: "nostr:active",
      },
    }));
  };
}

export function createSubscriptionAuthorsSource({ service } = {}) {
  const resolvedService = resolveService(service, nostrService);

  return async function subscriptionAuthorsSource(context = {}) {
    const runtimeAuthors = toArray(
      context?.runtime?.subscriptionAuthors || context?.runtime?.authors
    ).map(normalizeAuthor);
    const configAuthors = toArray(context?.config?.actorFilters).map(
      normalizeAuthor
    );
    const hookAuthors = [];

    const hook = context?.hooks?.subscriptions;
    if (isPlainObject(hook) && typeof hook.resolveAuthors === "function") {
      try {
        const resolved = await hook.resolveAuthors(context);
        hookAuthors.push(...toArray(resolved).map(normalizeAuthor));
      } catch (error) {
        context?.log?.("[subscriptions-source] resolveAuthors threw", error);
      }
    }

    const authors = new Set(
      [...runtimeAuthors, ...configAuthors, ...hookAuthors].filter(Boolean)
    );

    if (!authors.size) {
      return [];
    }

    const limitCandidate = Number(context?.runtime?.limit);
    const limit =
      Number.isFinite(limitCandidate) && limitCandidate > 0
        ? Math.floor(limitCandidate)
        : null;

    const options = {
      blacklistedEventIds: toSet(context?.runtime?.blacklistedEventIds),
      isAuthorBlocked:
        typeof context?.runtime?.isAuthorBlocked === "function"
          ? context.runtime.isAuthorBlocked
          : () => false,
      limit,
    };

    const authorList = Array.from(authors);
    const hasTargetedLookup =
      resolvedService &&
      typeof resolvedService.getActiveVideosByAuthors === "function";

    let videos = [];
    try {
      if (hasTargetedLookup) {
        videos = await Promise.resolve(
          resolvedService.getActiveVideosByAuthors(authorList, options)
        );
      } else {
        videos = await Promise.resolve(
          resolvedService.getFilteredActiveVideos(options)
        );
      }
    } catch (error) {
      context?.log?.(
        "[subscriptions-source] Failed to resolve videos from nostrService",
        error
      );
      videos = [];
    }

    const filtered = (Array.isArray(videos) ? videos : []).filter((video) => {
      const author = normalizeAuthor(video?.pubkey);
      return author && authors.has(author);
    });

    const sorted = filtered
      .slice()
      .sort(
        (a, b) => (Number(b?.created_at) || 0) - (Number(a?.created_at) || 0)
      );

    const limited = limit ? sorted.slice(0, limit) : sorted;

    return limited.map((video) => ({
      video,
      metadata: {
        source: "nostr:subscriptions",
        matchedAuthor: normalizeAuthor(video?.pubkey),
      },
    }));
  };
}

export function createWatchHistoryPointerSource({ service } = {}) {
  const resolvedService = resolveService(service, watchHistoryService);

  return async function watchHistoryPointerSource(context = {}) {
    const actor = normalizeActorCandidate(
      context?.config?.actor,
      context?.runtime?.watchHistory?.actor,
      context?.runtime?.actor
    );

    if (!resolvedService || typeof resolvedService.getQueuedPointers !== "function") {
      return [];
    }

    let pointers = [];
    try {
      pointers = await Promise.resolve(
        resolvedService.getQueuedPointers(actor || undefined)
      );
    } catch (error) {
      context?.log?.(
        "[watch-history-source] Failed to load queued pointers",
        error
      );
      pointers = [];
    }

    const results = [];
    const hook = context?.hooks?.watchHistory;
    const resolveVideoHook =
      isPlainObject(hook) && typeof hook.resolveVideo === "function"
        ? hook.resolveVideo
        : null;

    for (const pointer of Array.isArray(pointers) ? pointers : []) {
      const dto = {
        video: null,
        pointer,
        metadata: {
          source: "watch-history",
          actor: actor || null,
        },
      };

      if (pointer && isPlainObject(pointer) && pointer.video) {
        dto.video = pointer.video;
      }

      if (!dto.video && resolveVideoHook) {
        try {
          const resolvedVideo = await resolveVideoHook(pointer, context);
          if (resolvedVideo) {
            dto.video = resolvedVideo;
          }
        } catch (error) {
          context?.log?.(
            "[watch-history-source] resolveVideo hook threw",
            error
          );
        }
      }

      results.push(dto);
    }

    return results;
  };
}
