import { infoHashFromMagnet } from "./magnets.js";
import { TorrentClient, torrentClient } from "./webtorrent.js";

const containerState = new WeakMap();
const ROOT_MARGIN = "200px 0px";

function now() {
  return Date.now();
}

function getCacheEntry(key) {
  if (!key) {
    return null;
  }
  const entry = probeCache.get(key);
  if (!entry) {
    return null;
  }
  if (now() - entry.ts > PROBE_CACHE_TTL_MS) {
    probeCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCacheEntry(key, value) {
  if (!key) {
    return;
  }
  probeCache.set(key, { ts: now(), value });
}

function formatTime(ts) {
  if (!Number.isFinite(ts)) {
    return "";
  }
  try {
    return new Date(ts).toLocaleTimeString([], { hour12: false });
  } catch (err) {
    return new Date(ts).toLocaleTimeString();
  }
}

function buildTooltip({ peers = 0, checkedAt, reason } = {}) {
  const parts = [];
  if (Number.isFinite(peers)) {
    parts.push(`Peers: ${Math.max(0, peers)}`);
  }
  if (Number.isFinite(checkedAt)) {
    const formatted = formatTime(checkedAt);
    if (formatted) {
      parts.push(`Checked ${formatted}`);
    }
  }
  if (typeof reason === "string" && reason && reason !== "peer") {
    let normalizedReason;
    if (reason === "timeout") {
      normalizedReason = "Timed out";
    } else if (reason === "no-trackers") {
      normalizedReason = "No WSS trackers";
    } else if (reason === "invalid") {
      normalizedReason = "Invalid magnet";
    } else {
      normalizedReason = reason.charAt(0).toUpperCase() + reason.slice(1);
    }
    parts.push(normalizedReason);
  }
  if (!parts.length) {
    return "WebTorrent status unknown";
  }
  return `WebTorrent • ${parts.join(" • ")}`;
}

function normalizeResult(result) {
  const fallback = {
    healthy: false,
    peers: 0,
    reason: "error",
    appendedTrackers: false,
    hasProbeTrackers: false,
    usedTrackers: Array.isArray(TorrentClient.PROBE_TRACKERS)
      ? [...TorrentClient.PROBE_TRACKERS]
      : [],
    durationMs: 0,
  };
  if (!result || typeof result !== "object") {
    return { ...fallback, checkedAt: now() };
  }
  const peers = Number.isFinite(result.peers)
    ? Math.max(0, Number(result.peers))
    : 0;
  const healthy = Boolean(result.healthy) && peers > 0;
  const reason = typeof result.reason === "string" ? result.reason : "error";
  return {
    healthy,
    peers: healthy ? Math.max(1, peers) : peers,
    reason,
    appendedTrackers: Boolean(result.appendedTrackers),
    hasProbeTrackers:
      typeof result.hasProbeTrackers === "boolean"
        ? result.hasProbeTrackers
        : healthy || Boolean(result.appendedTrackers),
    usedTrackers: Array.isArray(result.usedTrackers)
      ? result.usedTrackers.slice()
      : fallback.usedTrackers,
    durationMs: Number.isFinite(result.durationMs)
      ? Math.max(0, Number(result.durationMs))
      : 0,
    checkedAt: now(),
  };
}

function queueProbe(magnet, cacheKey, priority = 0) {
  if (!magnet) {
    return Promise.resolve(null);
  }

  const cached = getCacheEntry(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  if (probeInflight.has(cacheKey)) {
    return probeInflight.get(cacheKey);
  }

  const job = probeQueue
    .run(
      () =>
        torrentClient
          .probePeers(magnet, {
            timeoutMs: PROBE_TIMEOUT_MS,
            maxWebConns: 2,
            polls: PROBE_POLL_COUNT,
          })
          .catch((err) => ({
            healthy: false,
            peers: 0,
            reason: "error",
            error: err,
            appendedTrackers: false,
            hasProbeTrackers: false,
          })),
      priority
    )
    .then((result) => {
      const normalized = normalizeResult(result);
      if (cacheKey) {
        setCacheEntry(cacheKey, normalized);
      }
      return normalized;
    })
    .finally(() => {
      if (cacheKey) {
        probeInflight.delete(cacheKey);
      }
    });

  if (cacheKey) {
    probeInflight.set(cacheKey, job);
  }

  return job;
}

const PROBE_CACHE_TTL_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 8000;
const PROBE_CONCURRENCY = 3;
const PROBE_POLL_COUNT = 3;

class ProbeQueue {
  constructor(max = 2) {
    this.max = Math.max(1, Number(max) || 1);
    this.running = 0;
    this.queue = [];
  }

  run(task, priority = 0) {
    return new Promise((resolve, reject) => {
      const normalizedPriority = Number.isFinite(priority) ? priority : 0;
      const job = {
        task,
        resolve,
        reject,
        priority: normalizedPriority,
      };
      this.enqueue(job);
      this.drain();
    });
  }

  enqueue(job) {
    if (!this.queue.length) {
      this.queue.push(job);
      return;
    }
    const index = this.queue.findIndex(
      (existing) => existing.priority < job.priority
    );
    if (index === -1) {
      this.queue.push(job);
    } else {
      this.queue.splice(index, 0, job);
    }
  }

  drain() {
    if (this.running >= this.max) {
      return;
    }
    const job = this.queue.shift();
    if (!job) {
      return;
    }
    this.running += 1;
    let finished = false;
    const finalize = () => {
      if (finished) {
        return;
      }
      finished = true;
      this.running -= 1;
      this.drain();
    };

    let result;
    try {
      result = job.task();
    } catch (err) {
      job.reject(err);
      finalize();
      return;
    }

    Promise.resolve(result)
      .then((value) => {
        job.resolve(value);
      })
      .catch((err) => {
        job.reject(err);
      })
      .finally(() => {
        finalize();
      });
  }
}

const probeQueue = new ProbeQueue(PROBE_CONCURRENCY);
const probeCache = new Map();
const probeInflight = new Map();

function ensureState(container) {
  let state = containerState.get(container);
  if (state) {
    return state;
  }

  const pendingByCard = new WeakMap();
  const observedCards = new WeakSet();
  state = { observer: null, pendingByCard, observedCards };

  const observer = new IntersectionObserver(
    (entries) => {
      processObserverEntries(entries, state);
    },
    { root: null, rootMargin: ROOT_MARGIN, threshold: 0.01 }
  );

  state.observer = observer;
  containerState.set(container, state);
  return state;
}

function getViewportCenter() {
  if (typeof window === "undefined") {
    return null;
  }
  const width = Number(window.innerWidth) || 0;
  const height = Number(window.innerHeight) || 0;
  if (width <= 0 && height <= 0) {
    return null;
  }
  return {
    x: width > 0 ? width / 2 : 0,
    y: height > 0 ? height / 2 : 0,
  };
}

function calculateDistanceSquared(entry, viewportCenter) {
  if (!viewportCenter) {
    return Number.POSITIVE_INFINITY;
  }
  const rect = getIntersectionRect(entry);
  if (!rect) {
    return Number.POSITIVE_INFINITY;
  }
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = centerX - viewportCenter.x;
  const dy = centerY - viewportCenter.y;
  return dx * dx + dy * dy;
}

function computeVisibilityPriority({ ratio, distance }) {
  const normalizedRatio = Number.isFinite(ratio)
    ? Math.min(Math.max(ratio, 0), 1)
    : 0;
  const distanceScore = Number.isFinite(distance) ? 1 / (1 + distance) : 0;
  return normalizedRatio * 1000 + distanceScore;
}

function prioritizeEntries(entries, viewportCenter) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  return entries
    .filter((entry) => entry.isIntersecting && entry.target instanceof HTMLElement)
    .map((entry) => {
      const ratio =
        typeof entry.intersectionRatio === "number" ? entry.intersectionRatio : 0;
      const distance = calculateDistanceSquared(entry, viewportCenter);
      const priority = computeVisibilityPriority({ ratio, distance });
      return { entry, ratio, distance, priority };
    })
    .sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.distance - b.distance;
    });
}

function processObserverEntries(entries, state) {
  if (!state || !entries || entries.length === 0) {
    return;
  }
  const viewportCenter = getViewportCenter();
  const prioritized = prioritizeEntries(entries, viewportCenter);
  prioritized.forEach(({ entry, priority }) => {
    const card = entry.target;
    handleCardVisible({ card, pendingByCard: state.pendingByCard, priority });
  });
}

function getIntersectionRect(entry) {
  if (!entry) {
    return null;
  }
  const rect = entry.intersectionRect;
  if (rect && rect.width > 0 && rect.height > 0) {
    return rect;
  }
  const fallback = entry.boundingClientRect;
  if (fallback && fallback.width > 0 && fallback.height > 0) {
    return fallback;
  }
  return rect || fallback || null;
}

function setBadge(card, state, details) {
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const normalizedState =
    typeof state === "string" && state ? state : "unknown";
  const peersValue =
    details && Number.isFinite(details.peers)
      ? Math.max(0, Number(details.peers))
      : 0;
  const hasPeerCount = details ? Number.isFinite(details.peers) : false;
  const peersTextValue = hasPeerCount ? String(peersValue) : "";

  card.dataset.streamHealthState = normalizedState;
  if (hasPeerCount) {
    card.dataset.streamHealthPeers = peersTextValue;
  } else if (card.dataset.streamHealthPeers) {
    delete card.dataset.streamHealthPeers;
  }

  if (details && typeof details.reason === "string" && details.reason) {
    card.dataset.streamHealthReason = details.reason;
  } else if (card.dataset.streamHealthReason) {
    delete card.dataset.streamHealthReason;
  }

  const badge = card.querySelector(".torrent-health-badge");
  if (!badge) {
    return;
  }

  const hadMargin = badge.classList.contains("mt-3");

  const baseClasses = [
    "torrent-health-badge",
    "text-xs",
    "font-semibold",
    "px-2",
    "py-1",
    "rounded",
    "inline-flex",
    "items-center",
    "gap-1",
    "transition-colors",
    "duration-200",
  ];
  if (hadMargin) {
    baseClasses.unshift("mt-3");
  }
  badge.className = baseClasses.join(" ");

  const map = {
    healthy: {
      icon: "🟢",
      aria: "WebTorrent peers available",
      classes: ["bg-green-900", "text-green-200"],
      role: "status",
    },
    unhealthy: {
      icon: "🔴",
      aria: "WebTorrent peers unavailable",
      classes: ["bg-red-900", "text-red-200"],
      role: "alert",
    },
    checking: {
      icon: "⏳",
      aria: "Checking WebTorrent peers",
      classes: ["bg-gray-800", "text-gray-300"],
      role: "status",
    },
    unknown: {
      icon: "⚪",
      aria: "WebTorrent status unknown",
      classes: ["bg-gray-800", "text-gray-300"],
      role: "status",
    },
  };

  const entry = map[normalizedState] || map.unknown;
  entry.classes.forEach((cls) => badge.classList.add(cls));

  const peersText =
    normalizedState === "healthy" && peersValue > 0 ? ` (${peersValue})` : "";

  const iconPrefix = entry.icon ? `${entry.icon} ` : "";
  badge.textContent = `${iconPrefix}WebTorrent${peersText}`;
  const tooltip =
    normalizedState === "checking" || normalizedState === "unknown"
      ? entry.aria
      : buildTooltip({
          peers: peersValue,
          checkedAt: details?.checkedAt,
          reason: details?.reason,
        });
  badge.setAttribute("aria-label", tooltip);
  badge.setAttribute("title", tooltip);
  badge.setAttribute("aria-live", entry.role === "alert" ? "assertive" : "polite");
  badge.setAttribute("role", entry.role);
  badge.dataset.streamHealthState = normalizedState;
  if (hasPeerCount) {
    badge.dataset.streamHealthPeers = peersTextValue;
  } else if (badge.dataset.streamHealthPeers) {
    delete badge.dataset.streamHealthPeers;
  }
}

function handleCardVisible({ card, pendingByCard, priority = 0 }) {
  if (!(card instanceof HTMLElement)) {
    return;
  }
  const magnet = card.dataset.magnet || "";
  if (!magnet) {
    setBadge(card, "unhealthy", { reason: "missing-source" });
    return;
  }

  const infoHash = infoHashFromMagnet(magnet);
  if (!infoHash) {
    setBadge(card, "unhealthy", { reason: "invalid" });
    return;
  }

  if (pendingByCard.has(card)) {
    return;
  }

  const cached = getCacheEntry(infoHash);
  if (cached) {
    const cachedState = cached.healthy
      ? "healthy"
      : cached.hasProbeTrackers
      ? "unhealthy"
      : "unknown";
    setBadge(card, cachedState, cached);
    return;
  }

  setBadge(card, "checking");

  const probePromise = queueProbe(magnet, infoHash, priority);

  pendingByCard.set(card, probePromise);

  probePromise
    .then((result) => {
      pendingByCard.delete(card);
      if (!card.isConnected) {
        return;
      }
      if (!result) {
        setBadge(card, "unknown");
        return;
      }
      if (!result.hasProbeTrackers) {
        setBadge(card, "unknown", result);
        return;
      }
      if (result.healthy) {
        setBadge(card, "healthy", result);
        return;
      }
      setBadge(card, "unhealthy", result);
    })
    .catch((err) => {
      console.warn("[gridHealth] probe failed", err);
      pendingByCard.delete(card);
      if (!card.isConnected) {
        return;
      }
      setBadge(card, "unhealthy");
    });
}

export function attachHealthBadges(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const state = ensureState(container);
  const cards = container.querySelectorAll(".video-card");
  cards.forEach((card) => {
    if (!(card instanceof HTMLElement)) {
      return;
    }
    if (state.observedCards.has(card)) {
      return;
    }
    state.observedCards.add(card);
    state.observer.observe(card);
    if (!card.dataset.magnet) {
      setBadge(card, "unhealthy", { reason: "missing-source" });
    }
  });
  processObserverEntries(state.observer.takeRecords(), state);
}

export function refreshHealthBadges(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const state = containerState.get(container);
  if (!state) {
    return;
  }
  const records = state.observer.takeRecords();
  processObserverEntries(records, state);
}
