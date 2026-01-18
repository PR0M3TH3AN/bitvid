import logger from "../utils/logger.js";

const DEFAULT_EVENT_NAME = "feed-telemetry";

const toSafeNumber = (value, fallback = 0) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
};

const toSafeBoolean = (value) => Boolean(value);

const sanitizeTagMatchDetail = (detail = {}) => {
  const matchedTagCount = toSafeNumber(detail.matchedTagCount, 0);
  const matchedInterestCount = toSafeNumber(detail.matchedInterestCount, 0);
  const matchedDisinterestCount = toSafeNumber(detail.matchedDisinterestCount, 0);

  return {
    feed: typeof detail.feed === "string" ? detail.feed : "",
    feedVariant: typeof detail.feedVariant === "string" ? detail.feedVariant : "",
    position: Number.isFinite(detail.position) ? Math.floor(detail.position) : null,
    matchedTagCount,
    hasMatch: toSafeBoolean(detail.hasMatch ?? matchedTagCount > 0),
    matchedInterestCount,
    hasInterestMatch: toSafeBoolean(
      detail.hasInterestMatch ?? matchedInterestCount > 0
    ),
    matchedDisinterestCount,
    hasDisinterestMatch: toSafeBoolean(
      detail.hasDisinterestMatch ?? matchedDisinterestCount > 0
    ),
  };
};

const resolveLogger = (candidate) => {
  if (typeof candidate === "function") {
    return candidate;
  }
  if (candidate && typeof candidate.debug === "function") {
    return (...args) => candidate.debug(...args);
  }
  if (candidate && typeof candidate.log === "function") {
    return (...args) => candidate.log(...args);
  }
  return () => {};
};

export default class FeedTelemetry {
  constructor({ logger: loggerOverride, eventName = DEFAULT_EVENT_NAME } = {}) {
    this.log = resolveLogger(loggerOverride || logger.dev);
    this.eventName =
      typeof eventName === "string" && eventName.trim()
        ? eventName.trim()
        : DEFAULT_EVENT_NAME;
  }

  recordTagMatch(detail = {}) {
    const payload = sanitizeTagMatchDetail(detail);
    this.log(`[${this.eventName}] tag-match`, payload);
    return payload;
  }
}
