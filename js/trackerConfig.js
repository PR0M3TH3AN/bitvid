import { WSS_TRACKERS as DEFAULT_WSS_TRACKERS } from "./constants.js";

export const TRACKER_TIMEOUT_MS = 6000;
const TRACKER_PER_MAGNET = 10;
export const HEALTH_TTL_MS = 2 * 60 * 1000;
export const CONCURRENCY = 6;
export const TRACKER_ERROR_COOLDOWN_MS = 60 * 1000;

export function resolveTrackerList({ magnetTrackers } = {}) {
  const combined = [];
  const seen = new Set();

  const pushUnique = (url) => {
    if (typeof url !== "string") {
      return;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    if (!/^wss:\/\//i.test(trimmed)) {
      return;
    }
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    combined.push(trimmed);
  };

  if (Array.isArray(magnetTrackers)) {
    magnetTrackers.forEach(pushUnique);
  }

  DEFAULT_WSS_TRACKERS.forEach(pushUnique);

  return combined.slice(0, TRACKER_PER_MAGNET);
}
