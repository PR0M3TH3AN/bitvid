// js/services/commentThreadCache.js
//
// localStorage comment-cache subsystem extracted from commentThreadService.js to
// keep that service under the file-size budget. Each function takes the service
// instance (`ctx`) so behavior is identical to the former methods; the service
// keeps thin delegators so existing call sites are unchanged. No behavior change.

import {
  FEATURE_IMPROVED_COMMENT_FETCHING,
  FIVE_MINUTES_MS,
} from "../constants.js";
import { normalizeHexId } from "../utils/hex.js";

const COMMENT_CACHE_PREFIX = "bitvid:comments:";
const COMMENT_CACHE_TTL_MS = FIVE_MINUTES_MS;
const COMMENT_CACHE_VERSION = 2;

function logDev(loggerCandidate, ...args) {
  if (loggerCandidate?.info) {
    loggerCandidate.info(...args);
  }
}

export function getCommentCacheKey(videoEventId) {
  const normalized = normalizeHexId(videoEventId);
  if (!normalized) {
    return "";
  }

  return `${COMMENT_CACHE_PREFIX}${normalized.toLowerCase()}`;
}

export function handleCommentCacheError(ctx, context, videoEventId, error) {
  ctx.commentCacheDiagnostics = {
    ...ctx.commentCacheDiagnostics,
    storageUnavailable: true,
  };

  const message =
    typeof videoEventId === "string" && videoEventId.trim()
      ? `[commentThread] Failed to ${context} comment cache for ${videoEventId}.`
      : `[commentThread] Failed to ${context} comment cache.`;

  if (ctx.logger?.user?.warn) {
    ctx.logger.user.warn(message, error);
  } else if (ctx.logger?.warn) {
    ctx.logger.warn(message, error);
  }

  if (ctx.logger?.dev?.warn && ctx.logger.dev !== ctx.logger.user) {
    ctx.logger.dev.warn(message, error);
  }
}

export function getCachedComments(ctx, videoEventId) {
  if (
    !FEATURE_IMPROVED_COMMENT_FETCHING ||
    typeof localStorage === "undefined"
  ) {
    return null;
  }

  const cacheKey = ctx.getCommentCacheKey(videoEventId);
  if (!cacheKey) {
    logDev(
      ctx.logger?.dev,
      "[commentThread] Comment cache skipped: invalid video id.",
    );
    return null;
  }

  let raw = null;
  try {
    raw = localStorage.getItem(cacheKey);
  } catch (error) {
    ctx.handleCommentCacheError("read", videoEventId, error);
    return null;
  }

  if (raw === null) {
    logDev(
      ctx.logger?.dev,
      `[commentThread] Comment cache miss for ${videoEventId}: no entry present.`,
    );
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      logDev(
        ctx.logger?.dev,
        `[commentThread] Comment cache rejected for ${videoEventId}: malformed payload.`,
      );
      ctx.removeCommentCache(cacheKey);
      return null;
    }

    const cacheVersion = Number.isFinite(parsed.version)
      ? Number(parsed.version)
      : null;

    if (cacheVersion !== COMMENT_CACHE_VERSION) {
      logDev(
        ctx.logger?.dev,
        `[commentThread] Comment cache rejected for ${videoEventId}: version ${cacheVersion} != ${COMMENT_CACHE_VERSION}.`,
      );
      ctx.removeCommentCache(cacheKey);
      return null;
    }

    const comments = Array.isArray(parsed.comments)
      ? parsed.comments
      : null;
    const timestamp = Number(parsed.timestamp);

    if (
      Array.isArray(comments) &&
      Number.isFinite(timestamp) &&
      Date.now() - timestamp <= COMMENT_CACHE_TTL_MS
    ) {
      logDev(
        ctx.logger?.dev,
        `[commentThread] Loaded ${comments.length} cached comments for ${videoEventId}.`,
      );
      return comments;
    }

    logDev(
      ctx.logger?.dev,
      `[commentThread] Comment cache rejected for ${videoEventId}: entry expired.`,
    );
    ctx.removeCommentCache(cacheKey);
  } catch (error) {
    if (ctx.logger?.warn) {
      ctx.logger.warn(
        `[commentThread] Failed to parse cached comments for ${videoEventId}:`,
        error,
      );
    }
    logDev(
      ctx.logger?.dev,
      `[commentThread] Comment cache rejected for ${videoEventId}: parse error.`,
    );
    ctx.removeCommentCache(cacheKey);
  }

  return null;
}

export function cacheComments(ctx, videoEventId, comments) {
  if (
    !FEATURE_IMPROVED_COMMENT_FETCHING ||
    typeof localStorage === "undefined" ||
    !Array.isArray(comments)
  ) {
    return;
  }

  const cacheKey = ctx.getCommentCacheKey(videoEventId);
  if (!cacheKey) {
    return;
  }

  try {
    localStorage.setItem(
      cacheKey,
      JSON.stringify({
        version: COMMENT_CACHE_VERSION,
        comments,
        timestamp: Date.now(),
      }),
    );
    logDev(
      ctx.logger?.dev,
      `[commentThread] Cached ${comments.length} comments for ${videoEventId}.`,
    );
  } catch (error) {
    ctx.handleCommentCacheError("write", videoEventId, error);
  }
}

export function removeCommentCache(ctx, cacheKey) {
  if (!cacheKey || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(cacheKey);
  } catch (error) {
    if (ctx.logger?.warn) {
      ctx.logger.warn(
        `[commentThread] Failed to clear cached comments for ${cacheKey}:`,
        error,
      );
    }
  }
}

export function clearCommentCache(ctx, videoEventId = null) {
  if (!FEATURE_IMPROVED_COMMENT_FETCHING || typeof localStorage === "undefined") {
    return;
  }

  if (videoEventId) {
    ctx.removeCommentCache(ctx.getCommentCacheKey(videoEventId));
    return;
  }

  try {
    const keys = Object.keys(localStorage);
    keys
      .filter((key) => key.startsWith(COMMENT_CACHE_PREFIX))
      .forEach((key) => ctx.removeCommentCache(key));
  } catch (error) {
    if (ctx.logger?.warn) {
      ctx.logger.warn(
        "[commentThread] Failed to clear comment cache:",
        error,
      );
    }
  }
}

export function persistCommentCache(ctx) {
  if (!FEATURE_IMPROVED_COMMENT_FETCHING || !ctx.videoEventId) {
    return;
  }

  const comments = ctx.serializeCommentsForCache();
  ctx.cacheComments(ctx.videoEventId, comments);
}

export function serializeCommentsForCache(ctx) {
  const events = Array.from(ctx.eventsById.values());
  return events.sort((a, b) => {
    const aTime = Number.isFinite(a?.created_at) ? a.created_at : 0;
    const bTime = Number.isFinite(b?.created_at) ? b.created_at : 0;
    if (aTime !== bTime) {
      return aTime - bTime;
    }

    const aId = normalizeHexId(a?.id);
    const bId = normalizeHexId(b?.id);
    if (aId && bId) {
      return aId.localeCompare(bId);
    }
    if (aId) {
      return -1;
    }
    if (bId) {
      return 1;
    }
    return 0;
  });
}
