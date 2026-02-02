// js/feedEngine/kidsAudienceFilterStage.js

import nostrService from "../services/nostrService.js";
import { toSet } from "./utils.js";

const DEFAULT_DISALLOWED_WARNINGS = [
  "nudity",
  "sexual",
  "graphic-violence",
  "self-harm",
  "drugs",
];

function normalizeWarningValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function normalizeWarningList(values) {
  const normalized = new Set();

  if (values instanceof Set || Array.isArray(values)) {
    for (const value of values) {
      const entry = normalizeWarningValue(value);
      if (entry) {
        normalized.add(entry);
      }
    }
  } else if (typeof values === "string") {
    const entries = values.split(/[,;|]+/);
    for (const entry of entries) {
      const normalizedEntry = normalizeWarningValue(entry);
      if (normalizedEntry) {
        normalized.add(normalizedEntry);
      }
    }
  }

  return normalized;
}

function resolveDisallowedWarnings(context, fallback) {
  const runtimeOverride = context?.runtime?.disallowedWarnings;
  const configOverride = context?.config?.disallowedWarnings;
  const resolved = runtimeOverride ?? configOverride ?? fallback;

  return normalizeWarningList(resolved);
}

function parseContentWarnings(contentWarning) {
  if (!contentWarning) {
    return [];
  }

  if (Array.isArray(contentWarning)) {
    return contentWarning
      .map((value) => normalizeWarningValue(value))
      .filter(Boolean);
  }

  if (typeof contentWarning === "string") {
    return contentWarning
      .split(/[,;|]+/)
      .map((value) => normalizeWarningValue(value))
      .filter(Boolean);
  }

  return [];
}

export function createKidsAudienceFilterStage({
  stageName = "kids-audience-filter",
  disallowedWarnings = DEFAULT_DISALLOWED_WARNINGS,
} = {}) {
  return async function kidsAudienceFilterStage(items = [], context = {}) {
    const results = [];
    const disallowedSet = resolveDisallowedWarnings(context, disallowedWarnings);

    const blacklist = toSet(context?.runtime?.blacklistedEventIds);
    const isAuthorBlocked =
      typeof context?.runtime?.isAuthorBlocked === "function"
        ? context.runtime.isAuthorBlocked
        : () => false;

    const options = { blacklistedEventIds: blacklist, isAuthorBlocked };

    const includeFn =
      typeof context?.runtime?.shouldIncludeVideo === "function"
        ? context.runtime.shouldIncludeVideo
        : (video, includeOptions) => nostrService.shouldIncludeVideo(video, includeOptions);

    for (const item of items) {
      const video = item?.video;
      if (!video || typeof video !== "object") {
        results.push(item);
        continue;
      }

      const videoId = typeof video.id === "string" ? video.id : null;
      const addWhy = (reason, extra = {}) => {
        context?.addWhy?.({
          stage: stageName,
          type: "filter",
          reason,
          videoId,
          ...extra,
        });
      };

      if (video.isForKids !== true) {
        addWhy("not-for-kids");
        continue;
      }

      if (video.isNsfw === true) {
        addWhy("nsfw");
        continue;
      }

      if (video.invalid === true) {
        addWhy("invalid");
        continue;
      }

      let include = true;
      try {
        include = includeFn(video, options) !== false;
      } catch (error) {
        context?.log?.(`[${stageName}] shouldIncludeVideo threw`, error);
        include = false;
      }

      if (!include) {
        addWhy("blacklist");
        continue;
      }

      if (disallowedSet.size > 0) {
        const warnings = parseContentWarnings(video.contentWarning);
        for (const warning of warnings) {
          if (disallowedSet.has(warning)) {
            addWhy("content-warning", { warning });
            include = false;
            break;
          }
        }
      }

      if (!include) {
        continue;
      }

      results.push(item);
    }

    return results;
  };
}
