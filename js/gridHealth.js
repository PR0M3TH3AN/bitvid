import { infoHashFromMagnet } from "./magnets.js";
import {
  getDefaultHealth,
  getHealthCached,
  queueHealthCheck,
} from "./healthService.js";

const containerState = new WeakMap();
const ROOT_MARGIN = "200px 0px";

function ensureState(container) {
  let state = containerState.get(container);
  if (state) {
    return state;
  }

  const pendingByCard = new WeakMap();
  const observedCards = new WeakSet();

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const card = entry.target;
        if (!(card instanceof HTMLElement)) {
          return;
        }
        if (!entry.isIntersecting) {
          return;
        }
        handleCardVisible({ card, pendingByCard });
      });
    },
    { root: null, rootMargin: ROOT_MARGIN, threshold: 0.01 }
  );

  state = { observer, pendingByCard, observedCards };
  containerState.set(container, state);
  return state;
}

function toVisual(health) {
  if (!health) {
    return "unknown";
  }
  if (health.ok && health.seeders > 0) {
    return "good";
  }
  if (health.responded) {
    if (health.seeders > 0) {
      return "good";
    }
    return "none";
  }
  return "noresp";
}

function setBadge(card, visual, health) {
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
    good: {
      icon: "✅",
      aria: "WebTorrent fallback ready",
      classes: ["bg-green-900", "text-green-200"],
      role: "status",
    },
    none: {
      icon: "⚠️",
      aria: "No seeders reported by trackers",
      classes: ["bg-amber-900", "text-amber-200"],
      role: "status",
    },
    noresp: {
      icon: "❌",
      aria: "No tracker response",
      classes: ["bg-red-900", "text-red-200"],
      role: "alert",
    },
    checking: {
      icon: "⏳",
      aria: "Checking Torrent availability",
      classes: ["bg-gray-800", "text-gray-300"],
      role: "status",
    },
    unknown: {
      icon: "⚠️",
      aria: "Torrent availability unknown",
      classes: ["bg-amber-900", "text-amber-200"],
      role: "status",
    },
  };

  const entry = map[visual] || map.unknown;
  entry.classes.forEach((cls) => badge.classList.add(cls));

  const seederCount =
    health && Number.isFinite(health.seeders) && health.seeders > 0
      ? health.seeders
      : null;
  const countText = seederCount ? ` (${seederCount})` : "";
  const ariaCount = seederCount ? ` with ${seederCount} seeders` : "";

  const iconPrefix = entry.icon ? `${entry.icon} ` : "";
  badge.textContent = `${iconPrefix}Torrent${countText}`;
  const ariaLabel = `${entry.aria}${ariaCount}`;
  badge.setAttribute("aria-label", ariaLabel);
  badge.setAttribute("title", ariaLabel);
  badge.setAttribute("aria-live", "polite");
  badge.setAttribute("role", entry.role);
  badge.dataset.streamHealthState = visual;
}

function applyHealth(card, health) {
  if (!health) {
    setBadge(card, "unknown");
    return;
  }
  const visual = toVisual(health);
  setBadge(card, visual, health);
}

function handleCardVisible({ card, pendingByCard }) {
  if (!(card instanceof HTMLElement)) {
    return;
  }
  const magnet = card.dataset.magnet || "";
  if (!magnet) {
    setBadge(card, "unknown");
    return;
  }

  const infoHash = infoHashFromMagnet(magnet);
  if (!infoHash) {
    setBadge(card, "unknown");
    return;
  }

  const cached = getHealthCached(infoHash);
  if (cached) {
    applyHealth(card, cached);
    return;
  }

  if (pendingByCard.has(card)) {
    return;
  }

  setBadge(card, "checking", getDefaultHealth());
  const pending = queueHealthCheck(magnet).then((health) => {
    pendingByCard.delete(card);
    if (!card.isConnected) {
      return;
    }
    applyHealth(card, health);
  });
  pending.catch(() => {
    pendingByCard.delete(card);
    if (!card.isConnected) {
      return;
    }
    setBadge(card, "noresp");
  });
  pendingByCard.set(card, pending);
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
      setBadge(card, "unknown");
    }
  });
}

export function refreshHealthBadges(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const state = containerState.get(container);
  if (!state) {
    return;
  }
  state.observer.takeRecords().forEach((entry) => {
    if (entry.isIntersecting) {
      handleCardVisible({ card: entry.target, pendingByCard: state.pendingByCard });
    }
  });
}
