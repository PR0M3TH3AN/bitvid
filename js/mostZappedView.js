// js/mostZappedView.js
//
// The "Most Zapped" tab presentation hook (#47). The ranking lives in the feed
// engine (createMostZappedSorter); zap totals arrive asynchronously as the
// feed's metric getter schedules batched receipt fetches. While this view is
// active we listen for zapTotals' change signal and re-run the feed (a cheap
// re-rank over the in-memory active set, no relay re-fetch) so the order
// visibly settles as totals stream in — same pattern as trendingView.

import { attachFeedInfoPopover } from "./ui/components/FeedInfoPopover.js";
import { onZapTotalsChanged } from "./zapTotals.js";

const MOST_ZAPPED_RERANK_DEBOUNCE_MS = 700;

let unsubscribeTotals = null;
let rerankTimer = null;

export function teardownMostZappedView() {
  if (typeof unsubscribeTotals === "function") {
    try {
      unsubscribeTotals();
    } catch (error) {
      // best effort
    }
    unsubscribeTotals = null;
  }
  if (rerankTimer) {
    clearTimeout(rerankTimer);
    rerankTimer = null;
  }
}

export function initMostZappedView({ getApp, isActive } = {}) {
  const infoTrigger = document.getElementById("mostZappedInfoTrigger");
  if (infoTrigger) {
    attachFeedInfoPopover(
      infoTrigger,
      "Most Zapped ranks recently-added videos by their zap total (sats). The order settles as zap receipts load in."
    );
  }

  // Reset any prior subscription (re-entering the tab).
  teardownMostZappedView();

  const stillActive = typeof isActive === "function" ? isActive : () => true;

  unsubscribeTotals = onZapTotalsChanged(() => {
    if (rerankTimer) {
      return;
    }
    rerankTimer = setTimeout(() => {
      rerankTimer = null;
      if (!stillActive()) {
        teardownMostZappedView();
        return;
      }
      const app = typeof getApp === "function" ? getApp() : null;
      if (app && typeof app.refreshMostZappedFeed === "function") {
        Promise.resolve(
          app.refreshMostZappedFeed({ reason: "zap-total-update" })
        ).catch(() => {});
      }
    }, MOST_ZAPPED_RERANK_DEBOUNCE_MS);
  });
}
