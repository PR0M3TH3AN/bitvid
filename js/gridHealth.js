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

function formatCount(health) {
  if (!health || !Number.isFinite(health.seeders) || health.seeders <= 0) {
    return "";
  }
  return ` (${health.seeders})`;
}

function setBadge(card, visual, health) {
  const el = card.querySelector(".stream-health");
  if (!el) {
    return;
  }
  const map = {
    good: {
      text: "🟢",
      aria: "Streamable: seeders available",
    },
    none: {
      text: "🟡",
      aria: "No seeders reported by trackers",
    },
    noresp: {
      text: "⚫",
      aria: "No tracker response",
    },
    checking: {
      text: "🟦",
      aria: "Checking stream availability",
    },
    unknown: {
      text: "⚪",
      aria: "Unknown stream availability",
    },
  };
  const entry = map[visual] || map.unknown;
  const countText = formatCount(health);
  const label = countText ? `${entry.aria}${countText}` : entry.aria;
  el.textContent = `${entry.text}${countText}`;
  el.setAttribute("aria-label", label);
  el.setAttribute("title", label);
  el.dataset.streamHealthState = visual;
  const pill = el.closest("[data-stream-health-pill]");
  if (pill instanceof HTMLElement) {
    pill.dataset.streamHealthState = visual;
    pill.setAttribute("title", label);
    pill.setAttribute("aria-label", label);
  }
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
