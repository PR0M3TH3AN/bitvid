// Regression for "clicking a video no longer opens the player": coordinator
// methods run with `this` bound to the APPLICATION (bindCoordinator), so a
// cross-method `this.helper()` call inside the coordinator only works when
// app.js also adds an explicit delegate — the zap-badge helpers were plain
// methods, `this.subscribeModalZapTotal` didn't exist on the app, and EVERY
// modal open threw. This test drives subscribeModalViewCount through the REAL
// bindCoordinator with ONLY the delegates app.js actually defines, so any
// future cross-method `this.` call without a delegate fails here first.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-modal-open-no-missing-delegate
//       given: "a coordinator bound to an app stub exposing only app.js's real modal delegates"
//       when: "subscribeModalViewCount runs (the modal-open path) and teardown runs (close path)"
//       then: "no TypeError; the zap badge is visible from open (0 sats) and updates to the summed total; hidden on teardown"
//   observable_outcomes:
//     - "subscribeModalViewCount does not throw (the user-facing 'video will not open' bug)"
//     - "badge visible at open showing 0 sats, updates to the summed total, hidden on teardown (no video open)"
//   determinism_controls:
//     - "JSDOM; scripted subscription-manager double; store flushed manually"
//   anti_cheat_rationale:
//     prevents: ["over-mocking internal logic", "hard-coded return value"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import { createModalCoordinator } from "../js/app/modalCoordinator.js";
import bindCoordinator from "../js/app/bindCoordinator.js";
import zapTotalsStore, {
  initZapTotals,
  requestVideoZapTotal,
  getVideoZapTotalSnapshot,
  onZapTotalsChanged,
} from "../js/zapTotals.js";
import { formatViewCount } from "../js/viewCounter.js";

const A1 = "30078:" + "c".repeat(64) + ":video-1";

test("modal open path survives binding and drives the zap badge", async () => {
  const dom = new JSDOM(
    '<!DOCTYPE html><body><span id="videoZapTotal" class="hidden"><span data-zap-total-text></span></span></body>',
    { pretendToBeVisual: true },
  );
  global.document = dom.window.document;

  let receipts = [];
  initZapTotals({
    nostrClient: {
      relays: ["wss://relay.example"],
      getSubscriptionManager: () => ({ list: async () => receipts }),
    },
    tools: { nip57: { getSatoshisAmountFromBolt11: () => NaN } },
  });

  const coordinator = createModalCoordinator({
    devLogger: { warn: () => {}, log: () => {}, error: () => {} },
    subscribeToVideoViewCount: () => "token-1",
    unsubscribeFromVideoViewCount: () => {},
    formatViewCount,
    requestVideoZapTotal,
    getVideoZapTotalSnapshot,
    onZapTotalsChanged,
  });

  // App stub with ONLY the delegates app.js really defines for this path.
  const app = {
    videoModal: {
      getViewCountElement: () => dom.window.document.createElement("span"),
      updateViewCountLabel: () => {},
      setViewCountPointer: () => {},
    },
    formatViewCountLabel: (n) => `${n} views`,
  };
  app._modal = bindCoordinator(app, coordinator);
  app.teardownModalViewCountSubscription = (...args) =>
    app._modal.teardownModalViewCountSubscription(...args);
  app.subscribeModalViewCount = (...args) =>
    app._modal.subscribeModalViewCount(...args);

  const pointer = ["a", A1];
  // The bug: this line threw "this.subscribeModalZapTotal is not a function".
  app.subscribeModalViewCount(pointer, `a:${A1}`);

  const badge = dom.window.document.getElementById("videoZapTotal");
  // Always visible while a video is open (mirrors the view counter); 0 sats
  // until a receipt lands.
  assert.equal(badge.classList.contains("hidden"), false, "visible while open");
  assert.match(
    badge.querySelector("[data-zap-total-text]").textContent,
    /^0 sats$/,
  );

  receipts = [
    {
      id: "r1",
      kind: 9735,
      tags: [["a", A1], ["description", JSON.stringify({ tags: [["amount", "21000"]] })]],
    },
  ];
  await zapTotalsStore.flush();
  assert.equal(badge.classList.contains("hidden"), false, "stays visible");
  assert.match(
    badge.querySelector("[data-zap-total-text]").textContent,
    /21 sats/,
  );

  // Modal close path re-hides the badge (no video open) — also used to throw
  // via the missing this.teardownModalZapTotal delegate.
  app.teardownModalViewCountSubscription();
  assert.equal(badge.classList.contains("hidden"), true, "teardown hides the badge");
});
