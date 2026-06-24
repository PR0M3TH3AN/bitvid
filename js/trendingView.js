// js/trendingView.js
//
// The "Trending" tab presentation hook. The ranking lives in the feed engine
// (createTrendingSorter), but view counts arrive asynchronously as the grid
// cards subscribe to them. So while this view is active we listen for
// viewCounter's coalesced "counts changed" signal and re-run the Trending feed
// (a cheap re-rank over the in-memory active set, no relay re-fetch) so the order
// visibly settles into true trending as counts stream in.

import { attachFeedInfoPopover } from "./ui/components/FeedInfoPopover.js";
import { onViewCountsChanged } from "./viewCounter.js";

const TRENDING_RERANK_DEBOUNCE_MS = 700;

let unsubscribeCounts = null;
let rerankTimer = null;

export function teardownTrendingView() {
  if (typeof unsubscribeCounts === "function") {
    try {
      unsubscribeCounts();
    } catch (error) {
      // best effort
    }
    unsubscribeCounts = null;
  }
  if (rerankTimer) {
    clearTimeout(rerankTimer);
    rerankTimer = null;
  }
}

export function initTrendingView({ getApp, isActive } = {}) {
  const infoTrigger = document.getElementById("trendingInfoTrigger");
  if (infoTrigger) {
    attachFeedInfoPopover(
      infoTrigger,
      "Trending ranks recently-added videos by their view count. The order settles as counts load in."
    );
  }

  // Reset any prior subscription (re-entering the tab).
  teardownTrendingView();

  const stillActive = typeof isActive === "function" ? isActive : () => true;

  unsubscribeCounts = onViewCountsChanged(() => {
    if (rerankTimer) {
      return;
    }
    rerankTimer = setTimeout(() => {
      rerankTimer = null;
      if (!stillActive()) {
        teardownTrendingView();
        return;
      }
      const app = typeof getApp === "function" ? getApp() : null;
      if (app && typeof app.refreshTrendingFeed === "function") {
        Promise.resolve(
          app.refreshTrendingFeed({ reason: "view-count-update" })
        ).catch(() => {});
      }
    }, TRENDING_RERANK_DEBOUNCE_MS);
  });
}
