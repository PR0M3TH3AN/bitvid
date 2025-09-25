import PQueue from "https://esm.sh/p-queue@7.4.1";
import { trackerPing } from "./trackerPing.js";
import { infoHashFromMagnet } from "./magnets.js";
import { HEALTH_TTL_MS, CONCURRENCY } from "./trackerConfig.js";

const queue = new PQueue({ concurrency: CONCURRENCY });
const cache = new Map();
const inflight = new Map();

export function getDefaultHealth() {
  return {
    ok: false,
    seeders: 0,
    leechers: 0,
    responded: false,
    from: [],
  };
}

export function getHealthCached(infoHash) {
  if (!infoHash) {
    return null;
  }
  const entry = cache.get(infoHash);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.ts > HEALTH_TTL_MS) {
    cache.delete(infoHash);
    return null;
  }
  return entry.value;
}

export function setHealthCache(infoHash, value) {
  if (!infoHash) {
    return;
  }
  cache.set(infoHash, { ts: Date.now(), value });
}

export function queueHealthCheck(magnet, onResult) {
  const infoHash = infoHashFromMagnet(magnet);
  if (!infoHash) {
    const fallback = getDefaultHealth();
    if (typeof onResult === "function") {
      onResult(fallback);
    }
    return Promise.resolve(fallback);
  }

  const cached = getHealthCached(infoHash);
  if (cached) {
    if (typeof onResult === "function") {
      onResult(cached);
    }
    return Promise.resolve(cached);
  }

  if (inflight.has(infoHash)) {
    const pending = inflight.get(infoHash);
    if (typeof onResult === "function") {
      pending.then(onResult).catch(() => {});
    }
    return pending;
  }

  const jobPromise = queue
    .add(async () => {
      try {
        const health = await trackerPing(magnet);
        setHealthCache(infoHash, health);
        return health;
      } catch (err) {
        console.warn("trackerPing failed", err);
        return getDefaultHealth();
      }
    })
    .finally(() => {
      inflight.delete(infoHash);
    });

  inflight.set(infoHash, jobPromise);
  if (typeof onResult === "function") {
    jobPromise.then(onResult).catch(() => {});
  }
  return jobPromise;
}

export function purgeHealthCache() {
  const now = Date.now();
  Array.from(cache.keys()).forEach((infoHash) => {
    const entry = cache.get(infoHash);
    if (!entry || now - entry.ts > HEALTH_TTL_MS) {
      cache.delete(infoHash);
    }
  });
}
