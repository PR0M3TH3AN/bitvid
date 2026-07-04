// js/ui/views/videoCardZapTotals.js
//
// Per-card zap-total binding (#47 follow-up): fills each video card's
// [data-zap-total] span from the shared zapTotals cache and reveals the
// orange sats badge once a nonzero total is known. bind() reads the cached
// total AND schedules a batched receipt fetch for unknown pointers
// (requestVideoZapTotal); one shared onZapTotalsChanged listener re-renders
// every bound card when a batch lands. Kept out of VideoListView.js for its
// file-size budget.

import {
  requestVideoZapTotal,
  getVideoZapTotalSnapshot,
  onZapTotalsChanged,
} from "../../zapTotals.js";
import { formatViewCount } from "../../viewCounter.js";

function defaultFormatSats(sats) {
  return `${formatViewCount(sats)} sats`;
}

export function createZapTotalBinder({ formatSats = defaultFormatSats } = {}) {
  const entries = new Map(); // pointerKey → { pointer, elements:Set }
  let unsubscribe = null;

  const renderElement = (el, sats) => {
    const wrapper = el.closest?.(".video-card__zaps") || null;
    if (Number.isFinite(sats) && sats > 0) {
      el.textContent = formatSats(sats);
      wrapper?.classList?.remove("hidden");
    } else {
      el.textContent = "";
      wrapper?.classList?.add("hidden");
    }
  };

  const renderKey = (key) => {
    const entry = entries.get(key);
    if (!entry) {
      return;
    }
    const sats = getVideoZapTotalSnapshot(entry.pointer);
    for (const el of Array.from(entry.elements)) {
      if (!el || !el.isConnected) {
        entry.elements.delete(el);
        continue;
      }
      renderElement(el, sats);
    }
    if (!entry.elements.size) {
      entries.delete(key);
    }
  };

  const ensureSubscribed = () => {
    if (!unsubscribe) {
      unsubscribe = onZapTotalsChanged(() => {
        for (const key of Array.from(entries.keys())) {
          renderKey(key);
        }
      });
    }
  };

  return {
    bind(cardEl, pointerInfo) {
      if (!cardEl || !pointerInfo?.key || !pointerInfo?.pointer) {
        return;
      }
      const el = cardEl.querySelector?.("[data-zap-total]");
      if (!el) {
        return;
      }
      let entry = entries.get(pointerInfo.key);
      if (!entry) {
        entry = { pointer: pointerInfo.pointer, elements: new Set() };
        entries.set(pointerInfo.key, entry);
      }
      entry.elements.add(el);
      ensureSubscribed();
      // Cached total now (also schedules the batched fetch when unknown).
      renderElement(el, requestVideoZapTotal(pointerInfo.pointer));
    },
    prune() {
      for (const [key, entry] of Array.from(entries.entries())) {
        for (const el of Array.from(entry.elements)) {
          if (!el || !el.isConnected) {
            entry.elements.delete(el);
          }
        }
        if (!entry.elements.size) {
          entries.delete(key);
        }
      }
    },
    destroy() {
      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch (error) {
          // best effort
        }
        unsubscribe = null;
      }
      entries.clear();
    },
  };
}
