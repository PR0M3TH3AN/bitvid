// js/channelZapTotal.js
//
// Channel-page "sats zapped to this creator" total (#47, docs/zap-tally-plan.md
// D2 profile path). Uses a p:<pubkey> pointer in the shared zap-totals store, so
// it counts every zap tagged to the creator — direct profile zaps AND zaps to
// their videos (both carry a `p` tag) — from 9735 receipts + verified bitvid
// tallies. Hidden until there's a nonzero total. Kept out of channelProfile.js
// (file-size budget).

import {
  profilePointer,
  requestVideoZapTotal,
  getVideoZapTotalSnapshot,
  onZapTotalsChanged,
} from "./zapTotals.js";
import { formatViewCount } from "./viewCounter.js";
import { FEATURE_ZAP_TALLY } from "./constants.js";

let unsub = null;

function teardown() {
  if (typeof unsub === "function") {
    try {
      unsub();
    } catch (error) {
      // best effort
    }
    unsub = null;
  }
}

export function teardownChannelZapTotal() {
  teardown();
}

export function wireChannelZapTotal(pubkey, { document: doc = globalThis.document } = {}) {
  teardown();
  const el = doc && typeof doc.getElementById === "function"
    ? doc.getElementById("channelZapTotal")
    : null;
  if (!el) {
    return;
  }
  const pointer = FEATURE_ZAP_TALLY ? profilePointer(pubkey) : null;
  if (!pointer) {
    el.classList.add("hidden");
    return;
  }
  const render = () => {
    let sats = 0;
    try {
      sats = getVideoZapTotalSnapshot(pointer) || 0;
    } catch (error) {
      sats = 0;
    }
    if (sats > 0) {
      el.textContent = `⚡ ${formatViewCount(sats)} sats zapped`;
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  };
  requestVideoZapTotal(pointer); // primes the store (also schedules the fetch)
  render();
  unsub = onZapTotalsChanged(render);
}

export default wireChannelZapTotal;
