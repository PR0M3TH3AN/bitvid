import "./bufferPolyfill.js";
import Client from "https://esm.sh/bittorrent-tracker@11.0.0/client?bundle";
import { infoHashFromMagnet, trackersFromMagnet } from "./magnets.js";
import {
  resolveTrackerList,
  TRACKER_TIMEOUT_MS,
  TRACKER_ERROR_COOLDOWN_MS,
} from "./trackerConfig.js";

const trackerState = new Map();

function now() {
  return Date.now();
}

function randomPeerId() {
  const bytes = new Uint8Array(20);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

function getDefaultHealth() {
  return {
    ok: false,
    seeders: 0,
    leechers: 0,
    responded: false,
    from: [],
  };
}

function getTrackerEntry(url) {
  const existing = trackerState.get(url);
  if (existing) {
    return existing;
  }
  const entry = {
    consecutiveErrors: 0,
    lastErrorAt: 0,
    cooldownUntil: 0,
  };
  trackerState.set(url, entry);
  return entry;
}

function markTrackerSuccess(url) {
  const entry = getTrackerEntry(url);
  entry.consecutiveErrors = 0;
  entry.cooldownUntil = 0;
}

function markTrackerError(url) {
  const entry = getTrackerEntry(url);
  const nowTs = now();
  if (entry.lastErrorAt && nowTs - entry.lastErrorAt < TRACKER_ERROR_COOLDOWN_MS) {
    entry.consecutiveErrors += 1;
  } else {
    entry.consecutiveErrors = 1;
  }
  entry.lastErrorAt = nowTs;
  if (entry.consecutiveErrors >= 2) {
    entry.cooldownUntil = nowTs + TRACKER_ERROR_COOLDOWN_MS;
  }
}

function isTrackerUsable(url) {
  const entry = getTrackerEntry(url);
  return entry.cooldownUntil === 0 || entry.cooldownUntil <= now();
}

export async function trackerPing(magnet, trackers) {
  const infoHash = infoHashFromMagnet(magnet);
  if (!infoHash) {
    return getDefaultHealth();
  }

  const magnetTrackers = trackers || trackersFromMagnet(magnet);
  const announceList = resolveTrackerList({ magnetTrackers });
  const usable = announceList.filter(isTrackerUsable);
  const announces = usable.length ? usable : announceList;

  if (!announces.length) {
    return getDefaultHealth();
  }

  const peerId = randomPeerId();
  const result = getDefaultHealth();
  const clients = new Set();
  let settled = false;
  let timeoutId = null;

  const finalize = () => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    clients.forEach((client) => {
      try {
        client.destroy();
      } catch (err) {
        // ignore
      }
    });
    clients.clear();
  };

  return new Promise((resolve) => {
    if (Number.isFinite(TRACKER_TIMEOUT_MS) && TRACKER_TIMEOUT_MS > 0) {
      timeoutId = setTimeout(() => {
        finalize();
        resolve(result);
      }, TRACKER_TIMEOUT_MS);
    }

    let remaining = announces.length;

    const handleComplete = (client, url) => {
      if (clients.has(client)) {
        clients.delete(client);
      }
      if (url && result.from.includes(url) && result.ok) {
        markTrackerSuccess(url);
      }
      remaining -= 1;
      if (remaining <= 0 && !settled) {
        finalize();
        resolve(result);
      }
    };

    const handleResult = (url, data) => {
      result.responded = true;
      if (url && !result.from.includes(url)) {
        result.from.push(url);
      }
      const seeders = Number.isFinite(data?.complete)
        ? Number(data.complete)
        : 0;
      const leechers = Number.isFinite(data?.incomplete)
        ? Number(data.incomplete)
        : 0;
      if (seeders > result.seeders) {
        result.seeders = seeders;
      }
      if (leechers > result.leechers) {
        result.leechers = leechers;
      }
      if (seeders > 0) {
        result.ok = true;
      }
    };

    announces.forEach((url) => {
      let client;
      try {
        client = new Client({
          infoHash,
          peerId,
          announce: [url],
        });
      } catch (err) {
        markTrackerError(url);
        remaining -= 1;
        if (remaining <= 0 && !settled) {
          finalize();
          resolve(result);
        }
        return;
      }

      clients.add(client);

      const cleanupAndResolve = () => {
        if (settled) {
          return;
        }
        finalize();
        resolve(result);
      };

      client.once("update", (data) => {
        handleResult(url, data);
        markTrackerSuccess(url);
        if (result.ok) {
          cleanupAndResolve();
          return;
        }
        handleComplete(client, url);
      });

      client.once("error", () => {
        markTrackerError(url);
        handleComplete(client, url);
      });

      client.once("warning", () => {
        handleComplete(client, url);
      });

      try {
        client.start();
      } catch (err) {
        markTrackerError(url);
        handleComplete(client, url);
      }
    });

    if (announces.length === 0) {
      finalize();
      resolve(result);
    }
  });
}

