// js/feedEngine/stages.js

import { getApplication } from "../applicationContext.js";
import nostrService from "../services/nostrService.js";
import { dedupeToNewestByRoot } from "../utils/videoDeduper.js";
import { isPlainObject, toSet } from "./utils.js";

function resolveDedupeFunction(customDedupe) {
  if (typeof customDedupe === "function") {
    return customDedupe;
  }

  const app = getApplication?.();
  if (app && typeof app.dedupeVideosByRoot === "function") {
    return (videos) => app.dedupeVideosByRoot(videos);
  }

  return (videos) => dedupeToNewestByRoot(videos);
}

export function createDedupeByRootStage({
  stageName = "dedupe-by-root",
  dedupe: customDedupe,
} = {}) {
  const dedupeFn = resolveDedupeFunction(customDedupe);

  return async function dedupeByRootStage(items = [], context = {}) {
    const videos = items.map((item) => item?.video).filter(Boolean);
    const dedupedVideos = dedupeFn(videos) || [];
    const allowedIds = new Set();

    for (const video of dedupedVideos) {
      if (video && typeof video.id === "string") {
        allowedIds.add(video.id);
      }
    }

    if (!allowedIds.size) {
      return items;
    }

    const keep = [];
    for (const item of items) {
      const video = item?.video;
      const videoId = video && typeof video.id === "string" ? video.id : "";
      if (!videoId || allowedIds.has(videoId)) {
        keep.push(item);
        continue;
      }

      const rootId =
        typeof video?.videoRootId === "string" && video.videoRootId
          ? video.videoRootId
          : videoId;

      if (typeof item?.metadata === "object" && item.metadata) {
        item.metadata.droppedByStage = stageName;
      }

      context?.addWhy?.({
        stage: stageName,
        type: "dedupe",
        reason: "older-root-version",
        videoId,
        rootId,
      });
    }

    return keep;
  };
}

export function createBlacklistFilterStage({
  stageName = "blacklist-filter",
  shouldIncludeVideo,
} = {}) {
  const includeFn =
    typeof shouldIncludeVideo === "function"
      ? shouldIncludeVideo
      : (video, options) => nostrService.shouldIncludeVideo(video, options);

  return async function blacklistFilterStage(items = [], context = {}) {
    const blacklist = toSet(context?.runtime?.blacklistedEventIds);
    const isAuthorBlocked =
      typeof context?.runtime?.isAuthorBlocked === "function"
        ? context.runtime.isAuthorBlocked
        : () => false;

    const options = { blacklistedEventIds: blacklist, isAuthorBlocked };
    const results = [];

    for (const item of items) {
      const video = item?.video;
      if (!video || typeof video !== "object") {
        results.push(item);
        continue;
      }

      let include = false;
      try {
        include = includeFn(video, options) !== false;
      } catch (error) {
        context?.log?.(`[${stageName}] shouldIncludeVideo threw`, error);
        include = false;
      }

      if (!include) {
        context?.addWhy?.({
          stage: stageName,
          type: "filter",
          reason: "blacklist",
          videoId: typeof video.id === "string" ? video.id : null,
          pubkey: typeof video.pubkey === "string" ? video.pubkey : null,
        });
        continue;
      }

      results.push(item);
    }

    return results;
  };
}

function resolveSuppressionHook(context) {
  if (!context || typeof context !== "object") {
    return null;
  }

  const fromHooks = context?.hooks?.watchHistory;
  if (isPlainObject(fromHooks) && typeof fromHooks.shouldSuppress === "function") {
    return fromHooks.shouldSuppress;
  }

  const runtime = context?.runtime?.watchHistory;
  if (isPlainObject(runtime) && typeof runtime.shouldSuppress === "function") {
    return runtime.shouldSuppress;
  }

  return null;
}

export function createWatchHistorySuppressionStage({
  stageName = "watch-history-suppression",
  shouldSuppress,
} = {}) {
  return async function watchHistorySuppressionStage(items = [], context = {}) {
    const hook =
      typeof shouldSuppress === "function" ? shouldSuppress : resolveSuppressionHook(context);

    if (typeof hook !== "function") {
      return items;
    }

    const results = [];

    for (const item of items) {
      let suppress = false;
      try {
        suppress = await hook(item, context);
      } catch (error) {
        context?.log?.(`[${stageName}] suppression hook threw`, error);
        suppress = false;
      }

      if (suppress) {
        const detail = {
          stage: stageName,
          type: "filter",
          reason: "watch-history",
        };
        if (item?.video && typeof item.video.id === "string") {
          detail.videoId = item.video.id;
        }
        if (item?.pointer) {
          detail.pointer = item.pointer;
        } else if (item?.metadata && item.metadata.pointerKey) {
          detail.pointerKey = item.metadata.pointerKey;
        }
        context?.addWhy?.(detail);
        continue;
      }

      results.push(item);
    }

    return results;
  };
}
