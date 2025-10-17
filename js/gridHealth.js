import { createCardObserver } from "./dom/cardObserver.js";
import { infoHashFromMagnet } from "./magnets.js";
import { updateVideoCardSourceVisibility } from "./utils/cardSourceVisibility.js";
import { TorrentClient, torrentClient } from "./webtorrent.js";
import { userLogger } from "./utils/logger.js";

const badgeUpdateListeners = new Set();

function notifyBadgeUpdate(payload) {
  if (!payload) {
    return;
  }

  badgeUpdateListeners.forEach((listener) => {
    if (typeof listener !== "function") {
      return;
    }
    try {
      listener(payload);
    } catch (err) {
      userLogger.warn("[gridHealth] badge listener failed", err);
    }
  });
}

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
const PROBE_CONCURRENCY = 96;
const PROBE_POLL_COUNT = 3;
const PRIORITY_BASELINE = 1_000_000;

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
    while (this.running < this.max && this.queue.length > 0) {
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
        continue;
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
}

const probeQueue = new ProbeQueue(PROBE_CONCURRENCY);
const probeCache = new Map();
const probeInflight = new Map();

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

function prioritizeEntries(entries, viewportCenter) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  const filtered = entries
    .filter((entry) => entry.isIntersecting && entry.target instanceof HTMLElement)
    .map((entry) => {
      const rect = getIntersectionRect(entry);
      if (!rect) {
        return null;
      }
      const ratio =
        typeof entry.intersectionRatio === "number" ? entry.intersectionRatio : 0;
      const centerY = rect.top + rect.height / 2;
      const verticalDistance = viewportCenter
        ? Math.abs(centerY - viewportCenter.y)
        : Number.POSITIVE_INFINITY;
      return { entry, ratio, centerY, verticalDistance };
    })
    .filter(Boolean);

  if (filtered.length === 0) {
    return [];
  }

  if (!viewportCenter) {
    return filtered
      .sort((a, b) => {
        if (b.ratio !== a.ratio) {
          return b.ratio - a.ratio;
        }
        return a.centerY - b.centerY;
      })
      .map((item, index) => ({
        entry: item.entry,
        priority: PRIORITY_BASELINE - index,
      }));
  }

  const ordered = filtered
    .slice()
    .sort((a, b) => a.centerY - b.centerY);

  let centerIndex = 0;
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ordered.length; i += 1) {
    const candidate = ordered[i];
    if (candidate.verticalDistance < minDistance) {
      minDistance = candidate.verticalDistance;
      centerIndex = i;
    }
  }

  const prioritized = [];
  const pushCandidate = (candidate) => {
    if (!candidate) {
      return;
    }
    prioritized.push(candidate);
  };

  pushCandidate(ordered[centerIndex]);

  let left = centerIndex - 1;
  let right = centerIndex + 1;
  while (left >= 0 || right < ordered.length) {
    const leftCandidate = left >= 0 ? ordered[left] : null;
    const rightCandidate = right < ordered.length ? ordered[right] : null;

    if (leftCandidate && rightCandidate) {
      const leftDistance = leftCandidate.verticalDistance;
      const rightDistance = rightCandidate.verticalDistance;
      const distanceDelta = Math.abs(leftDistance - rightDistance);
      if (distanceDelta <= 0.5) {
        if (rightCandidate.ratio > leftCandidate.ratio) {
          pushCandidate(rightCandidate);
          right += 1;
        } else {
          pushCandidate(leftCandidate);
          left -= 1;
        }
      } else if (leftDistance < rightDistance) {
        pushCandidate(leftCandidate);
        left -= 1;
      } else {
        pushCandidate(rightCandidate);
        right += 1;
      }
    } else if (rightCandidate) {
      pushCandidate(rightCandidate);
      right += 1;
    } else if (leftCandidate) {
      pushCandidate(leftCandidate);
      left -= 1;
    }
  }

  return prioritized.map((candidate, index) => ({
    entry: candidate.entry,
    priority: PRIORITY_BASELINE - index,
  }));
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

  updateVideoCardSourceVisibility(card);

  const badge = card.querySelector(".torrent-health-badge");
  if (!badge) {
    return;
  }

  const hadCompactMargin =
    badge.classList.contains("mt-sm") || badge.classList.contains("mt-3");

  const classes = ["badge", "torrent-health-badge"];
  if (hadCompactMargin) {
    classes.push("mt-sm");
  }
  badge.className = classes.join(" ");

  const map = {
    healthy: {
      icon: "🟢",
      aria: "WebTorrent peers available",
      variant: "success",
      role: "status",
    },
    unhealthy: {
      icon: "🔴",
      aria: "WebTorrent peers unavailable",
      variant: "critical",
      role: "alert",
    },
    checking: {
      icon: "⏳",
      aria: "Checking WebTorrent peers",
      variant: "neutral",
      role: "status",
    },
    unknown: {
      icon: "⚪",
      aria: "WebTorrent status unknown",
      variant: "neutral",
      role: "status",
    },
  };

  const entry = map[normalizedState] || map.unknown;
  if (entry.variant) {
    badge.dataset.variant = entry.variant;
  } else if (badge.dataset.variant) {
    delete badge.dataset.variant;
  }

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
  const ariaLive = entry.role === "alert" ? "assertive" : "polite";
  badge.setAttribute("aria-live", ariaLive);
  badge.setAttribute("role", entry.role);
  badge.dataset.streamHealthState = normalizedState;
  if (hasPeerCount) {
    badge.dataset.streamHealthPeers = peersTextValue;
  } else if (badge.dataset.streamHealthPeers) {
    delete badge.dataset.streamHealthPeers;
  }

  const payload = {
    card,
    state: normalizedState,
    peers: hasPeerCount ? peersValue : null,
    reason: details && typeof details.reason === "string" ? details.reason : null,
    checkedAt:
      details && Number.isFinite(details.checkedAt) ? Number(details.checkedAt) : null,
    text: badge.textContent,
    tooltip,
    role: entry.role,
    ariaLive,
  };
  notifyBadgeUpdate(payload);
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

  if (!(pendingByCard instanceof WeakMap)) {
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
      userLogger.warn("[gridHealth] probe failed", err);
      pendingByCard.delete(card);
      if (!card.isConnected) {
        return;
      }
      setBadge(card, "unhealthy");
    });
}

const gridCardObserver = createCardObserver({
  rootMargin: ROOT_MARGIN,
  threshold: 0.01,
  createState: () => ({ pendingByCard: new WeakMap() }),
  prepareEntries: (entries) => {
    const viewportCenter = getViewportCenter();
    return prioritizeEntries(entries, viewportCenter);
  },
  isCardVisible: (entry) => {
    if (!entry) {
      return false;
    }
    const isIntersecting = Boolean(entry.isIntersecting);
    const ratio = typeof entry.intersectionRatio === "number" ? entry.intersectionRatio : 0;
    return isIntersecting && ratio > 0;
  },
  onCardRegister: ({ card }) => {
    if (!card.dataset.magnet) {
      setBadge(card, "unhealthy", { reason: "missing-source" });
    }
  },
  onCardVisible: ({ card, meta, state }) => {
    if (!state || !(state.pendingByCard instanceof WeakMap)) {
      return;
    }
    const priority =
      meta && typeof meta === "object" && Number.isFinite(meta.priority)
        ? meta.priority
        : PRIORITY_BASELINE;
    handleCardVisible({
      card,
      pendingByCard: state.pendingByCard,
      priority,
    });
  },
});

export function attachHealthBadges(container, options = {}) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  if (options && typeof options.onUpdate === "function") {
    badgeUpdateListeners.add(options.onUpdate);
  }
  gridCardObserver.observe(container);
}

export function refreshHealthBadges(container) {
  gridCardObserver.refresh(container);
}
