import { userLogger } from "../utils/logger.js";
import { safeDecodeURIComponent } from "../utils/safeDecode.js";

// js/services/playbackServiceHelpers.js

export const HOSTED_URL_SUCCESS_MESSAGE = "✅ Streaming from hosted URL";
export const DEFAULT_UNSUPPORTED_BTITH_MESSAGE =
  "This magnet link is missing a compatible BitTorrent v1 info hash.";
export const AUTH_STATUS_CODES = new Set([401, 403]);
export const SSL_ERROR_PATTERN = /(ssl|cert|certificate)/i;
export const CORS_ERROR_PATTERN = /cors/i;
export const PROBE_CACHE_TTL_MS = 45000;
export const WEBSEED_PARAM_KEYS = new Set(["ws", "webseed"]);

/**
 * A simple event emitter implementation for internal use.
 */
export class SimpleEventEmitter {
  constructor(logger = null) {
    this.logger = typeof logger === "function" ? logger : null;
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof handler !== "function") {
      return () => {};
    }
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    const handlers = this.listeners.get(eventName);
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (!handlers.size) {
        this.listeners.delete(eventName);
      }
    };
  }

  emit(eventName, detail) {
    const handlers = this.listeners.get(eventName);
    if (!handlers || !handlers.size) {
      return;
    }
    for (const handler of Array.from(handlers)) {
      try {
        handler(detail);
      } catch (err) {
        if (this.logger) {
          this.logger("[SimpleEventEmitter] Listener error", err);
        } else {
          userLogger.warn("[SimpleEventEmitter] Listener error", err);
        }
      }
    }
  }
}

/**
 * Extracts webseed URLs from a magnet link's query parameters (ws/webseed).
 * @param {string} magnetUri - The magnet URI to parse.
 * @returns {string[]} An array of decoded webseed URLs.
 */
export const extractWebSeedsFromMagnet = (magnetUri) => {
  if (typeof magnetUri !== "string") {
    return [];
  }
  const trimmed = magnetUri.trim();
  if (!trimmed) {
    return [];
  }
  const [withoutFragment] = trimmed.split("#", 1);
  const [, query = ""] = withoutFragment.split("?", 2);
  if (!query) {
    return [];
  }

  const webSeeds = [];
  for (const segment of query.split("&")) {
    if (!segment) {
      continue;
    }
    const [rawKey, rawValue = ""] = segment.split("=", 2);
    if (!rawKey) {
      continue;
    }
    const key = rawKey.trim().toLowerCase();
    if (!WEBSEED_PARAM_KEYS.has(key)) {
      continue;
    }
    const decodedValue = safeDecodeURIComponent(rawValue.replace(/\+/g, "%20"));
    const candidate = decodedValue.trim();
    if (candidate) {
      webSeeds.push(candidate);
    }
  }
  return webSeeds;
};

/**
 * Analyzes the result of a hosted URL probe to generate a user-friendly error message.
 * @param {Object} probeResult - The result from probing the URL.
 * @param {string} probeResult.outcome - 'timeout', 'bad', 'opaque', 'unknown', 'error'.
 * @param {number} [probeResult.status] - HTTP status code.
 * @param {Error} [probeResult.error] - The error object if available.
 * @returns {Object} Details containing category, message, and status.
 */
export const getHostedUrlFailureDetails = (probeResult = {}) => {
  const outcome = probeResult?.outcome || "error";
  const status = Number.isFinite(probeResult?.status)
    ? probeResult.status
    : null;
  const error = probeResult?.error;
  const isAuthStatus = status !== null && AUTH_STATUS_CODES.has(status);

  if (outcome === "timeout") {
    return {
      category: "external",
      message:
        "Hosted URL timed out. We’ll try WebTorrent if available.",
      status,
    };
  }

  if (outcome === "bad") {
    if (isAuthStatus) {
      return {
        category: "auth",
        message:
          "Hosted URL requires authorization or a signed request. Please log in or re-sign.",
        status,
      };
    }

    if (status === 404) {
      return {
        category: "external",
        message: "Hosted URL not found (404).",
        status,
      };
    }

    if (status === 403) {
      return {
        category: "external",
        message: "Hosted URL blocked (403).",
        status,
      };
    }

    if (status && status >= 500) {
      return {
        category: "external",
        message: `Hosted URL unavailable (HTTP ${status}).`,
        status,
      };
    }

    if (status) {
      return {
        category: "external",
        message: `Hosted URL failed (HTTP ${status}).`,
        status,
      };
    }
  }

  if (outcome === "opaque" || outcome === "unknown") {
    return {
      category: "external",
      message:
        "Hosted URL blocked by browser security (CORS/SSL). We’ll try WebTorrent if available.",
      status,
    };
  }

  if (outcome === "error") {
    const message = error?.message || "";
    if (SSL_ERROR_PATTERN.test(message)) {
      return {
        category: "external",
        message:
          "Hosted URL blocked due to SSL certificate issues.",
        status,
      };
    }
    if (CORS_ERROR_PATTERN.test(message)) {
      return {
        category: "external",
        message:
          "Hosted URL blocked by CORS. We’ll try WebTorrent if available.",
        status,
      };
    }
    return {
      category: "external",
      message:
        "Hosted URL failed to load due to network or security restrictions.",
      status,
    };
  }

  return {
    category: "external",
    message: "Hosted URL failed to load.",
    status,
  };
};

/**
 * Maps HTMLMediaElement errors to user-friendly messages.
 * @param {HTMLVideoElement} videoElement
 * @returns {string} Error message.
 */
export const getHostedVideoErrorMessage = (videoElement) => {
  if (!videoElement?.error) {
    return "";
  }

  const error = videoElement.error;
  const code = error.code;
  const mediaErrorCodes =
    typeof MediaError !== "undefined"
      ? MediaError
      : {
          MEDIA_ERR_ABORTED: 1,
          MEDIA_ERR_NETWORK: 2,
          MEDIA_ERR_DECODE: 3,
          MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
        };

  switch (code) {
    case mediaErrorCodes.MEDIA_ERR_ABORTED:
      return "Hosted playback was interrupted.";
    case mediaErrorCodes.MEDIA_ERR_NETWORK:
      return "Hosted playback failed due to network/CORS restrictions.";
    case mediaErrorCodes.MEDIA_ERR_DECODE:
      return "Hosted playback failed to decode the video.";
    case mediaErrorCodes.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "Hosted playback failed: source not supported or blocked.";
    default:
      return "Hosted playback failed to load.";
  }
};

/**
 * Maps WebTorrent errors to user-friendly messages.
 * @param {Error} error
 * @returns {string} Error message.
 */
export const getTorrentErrorMessage = (error) => {
  if (!error) {
    return "WebTorrent could not start. Please try again.";
  }
  const message = error.message || "";
  if (message.includes(DEFAULT_UNSUPPORTED_BTITH_MESSAGE)) {
    return DEFAULT_UNSUPPORTED_BTITH_MESSAGE;
  }
  if (/tracker|announce|peer/i.test(message)) {
    return "WebTorrent could not reach any peers or trackers.";
  }
  if (/permission|blocked|denied/i.test(message)) {
    return "WebTorrent was blocked by the browser or network.";
  }
  return "WebTorrent could not start. Please try again.";
};
