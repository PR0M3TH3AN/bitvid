// Channel-profile cards showed BLANK view counts because the channel grid never
// subscribed its cards to the shared view counter (the main feed does). This wires
// each card's [data-view-count] element the same way. The count VALUES come from the
// same shared transport as the feed — the channel just wasn't displaying them.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-channel-card-view-count
//       given: "a channel card element with a [data-view-count] span + a pointer"
//       when: "subscribeChannelCardViewCount runs (and clearChannelCardViewCounts tears down)"
//       then: "the element gets a non-blank view label; missing pointer/element/card are safe no-ops"
//   observable_outcomes:
//     - "a card with a pointer gets a non-blank view label (no longer blank)"
//     - "no pointer / no [data-view-count] / no card -> no throw, no label forced"
//     - "clearChannelCardViewCounts is idempotent and never throws"
//   determinism_controls:
//     - "JSDOM element; real module against the (uninitialised) shared view counter"
//   anti_cheat_rationale:
//     prevents: ["asserting the blank (broken) state", "hard-coded return value"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import {
  subscribeChannelCardViewCount,
  clearChannelCardViewCounts,
} from "../js/channelViewCounts.js";

function makeCard(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  return dom.window.document.body.firstElementChild;
}

test("a card with a pointer gets a non-blank view-count label (fixes the blank)", () => {
  const card = makeCard('<div class="card"><span data-view-count></span></div>');
  subscribeChannelCardViewCount(card, { pointer: ["a", 30078, "root-1"], key: "k1" });
  const el = card.querySelector("[data-view-count]");
  assert.ok(el.textContent && el.textContent.trim().length > 0, "label is not blank");
  assert.match(el.textContent, /view|Loading/i, "shows a view/loading label");
  clearChannelCardViewCounts();
});

test("safe no-ops: missing pointer, missing [data-view-count], or missing card", () => {
  const cardNoEl = makeCard('<div class="card"></div>');
  const cardWithEl = makeCard('<div class="card"><span data-view-count></span></div>');
  assert.doesNotThrow(() => {
    subscribeChannelCardViewCount(cardWithEl, {}); // no pointer
    subscribeChannelCardViewCount(cardNoEl, { pointer: ["a", 30078, "x"] }); // no element
    subscribeChannelCardViewCount(null, { pointer: ["a", 30078, "x"] }); // no card
  });
  // A card with no pointer must not have its (absent) element forced to a label.
  assert.equal(cardWithEl.querySelector("[data-view-count]").textContent, "");
  clearChannelCardViewCounts();
});

test("clearChannelCardViewCounts is idempotent and never throws", () => {
  assert.doesNotThrow(() => {
    clearChannelCardViewCounts();
    clearChannelCardViewCounts();
  });
});
