// Wire channel-profile video cards to the shared view counter. The main feed does
// this in VideoListView (ensureViewCountSubscription / registerVideoViewCountElement);
// the channel-profile grid renders its own VideoCards and never subscribed them, so
// every card's view count rendered blank. This mirrors the feed's behavior against
// the SAME batched view-count transport (one shared kind-30079 subscription), so the
// counts are identical to what the feed shows — the channel just wasn't displaying
// them (the counting itself is unchanged and shared).

import {
  subscribeToVideoViewCount,
  unsubscribeFromVideoViewCount,
  formatViewCount,
} from "./viewCounter.js";
import { devLogger } from "./utils/logger.js";

const activeSubscriptions = [];

function formatViewCountLabel(total) {
  const value = Number.isFinite(total) ? Number(total) : 0;
  return `${formatViewCount(value)} ${value === 1 ? "view" : "views"}`;
}

// Subscribe one channel card's [data-view-count] element to its pointer.
export function subscribeChannelCardViewCount(cardEl, pointerInfo) {
  const pointer = pointerInfo?.pointer;
  if (!cardEl || !pointer) {
    return;
  }
  const el = cardEl.querySelector("[data-view-count]");
  if (!el) {
    return;
  }
  if (!el.textContent || !el.textContent.trim()) {
    el.textContent = "– views";
  }

  try {
    const token = subscribeToVideoViewCount(
      pointer,
      ({ total, status, partial }) => {
        let text;
        if (Number.isFinite(total)) {
          text = formatViewCountLabel(total);
          if (partial) {
            text = `${text} (partial)`;
          }
        } else if (status === "hydrating") {
          text = "Loading views…";
        } else {
          text = "– views";
        }
        if (el.isConnected) {
          el.textContent = text;
          el.dataset.viewCountState = partial ? "partial" : status;
        }
      },
    );
    activeSubscriptions.push({ pointer, token });
  } catch (error) {
    devLogger.warn(
      "[ChannelProfile] Failed to subscribe card view count:",
      error,
    );
  }
}

// Tear down every channel-card view-count subscription (on grid re-render / close).
export function clearChannelCardViewCounts() {
  while (activeSubscriptions.length) {
    const { pointer, token } = activeSubscriptions.pop();
    try {
      unsubscribeFromVideoViewCount(pointer, token);
    } catch (error) {
      // best-effort teardown
    }
  }
}
