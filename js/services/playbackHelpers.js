// js/services/playbackHelpers.js
//
// Small, self-contained helpers extracted from playbackService.js to keep that
// orchestrator under the file-size budget. Pure logic with no dependency on the
// playback session state.

import { safeDecodeURIComponent } from "../utils/safeDecode.js";

/**
 * Minimal synchronous event emitter used by the playback session to surface
 * status/fallback/sourcechange events to the coordinator. Errors thrown by a
 * listener are swallowed (and optionally logged) so one bad listener can't
 * abort the rest of the playback pipeline.
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
          this.logger("[PlaybackService] Listener error", err);
        }
      }
    }
  }
}

const WEBSEED_PARAM_KEYS = new Set(["ws", "webseed"]);

/**
 * Extract every web seed URL (`ws=`/`webseed=`) from a magnet's query string,
 * in order, decoded. Used to seed WebTorrent's urlList from the magnet.
 *
 * @param {string} magnetUri
 * @returns {string[]}
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
