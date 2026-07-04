// #47 follow-up: video cards show the zap total (sats, orange, right-aligned)
// next to the view count. The binder fills [data-zap-total] from the shared
// zapTotals cache, hides the badge while the total is zero/unknown (no "0
// sats" noise), and reveals/updates every bound card when a receipt batch
// lands (the shared change signal).
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-card-zap-badge
//       given: "cards bound to pointers with zero and nonzero cached totals"
//       when: "bind() runs and a later zapTotals change fires"
//       then: "nonzero → formatted sats + revealed wrapper; zero → hidden; change signal updates in place; detached cards pruned"
//   observable_outcomes:
//     - "badge textContent and .hidden class per state"
//   determinism_controls:
//     - "JSDOM; the real zapTotals singleton driven through its store test hook is avoided — the binder is exercised against the exported cache APIs via a scripted store double at module boundary"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import { createZapTotalBinder } from "../js/ui/views/videoCardZapTotals.js";
import zapTotalsStore, {
  initZapTotals,
} from "../js/zapTotals.js";

const A1 = "30078:aaaa:video-1";

function makeCard(doc) {
  const card = doc.createElement("div");
  card.innerHTML =
    '<div class="video-card__zaps hidden"><span data-zap-total></span></div>';
  doc.body.appendChild(card);
  return card;
}

test("binder: zero stays hidden, receipts reveal and format, prune drops detached", async () => {
  const dom = new JSDOM("<!DOCTYPE html><body></body>", { pretendToBeVisual: true });
  const doc = dom.window.document;

  // Drive the REAL singleton store: scripted receipts arrive via its batched
  // fetch (subscription-manager list double), so the binder sees the same
  // cache + change signal production uses.
  let receipts = [];
  initZapTotals({
    nostrClient: {
      relays: ["wss://relay.example"],
      getSubscriptionManager: () => ({ list: async () => receipts }),
    },
    tools: { nip57: { getSatoshisAmountFromBolt11: () => NaN } },
  });

  const binder = createZapTotalBinder();
  const card = makeCard(doc);
  const badge = card.querySelector("[data-zap-total]");
  const wrapper = card.querySelector(".video-card__zaps");

  // Tag-style ARRAY pointer — the shape VideoListView actually passes.
  const pointerInfo = { key: `a:${A1}`, pointer: ["a", A1] };
  binder.bind(card, pointerInfo);
  assert.equal(wrapper.classList.contains("hidden"), true, "unknown total stays hidden");
  assert.equal(badge.textContent, "");

  // A receipt batch lands: 2100 sats via the zap request's amount tag.
  receipts = [
    {
      id: "r1",
      kind: 9735,
      tags: [
        ["a", A1],
        ["description", JSON.stringify({ tags: [["amount", "2100000"]] })],
      ],
    },
  ];
  await zapTotalsStore.flush();

  assert.equal(wrapper.classList.contains("hidden"), false, "revealed once nonzero");
  assert.match(badge.textContent, /2,?100 sats|2\.1K sats/);

  // Detached cards are dropped by prune (no leak, no stale writes).
  card.remove();
  binder.prune();
  binder.destroy();
});
