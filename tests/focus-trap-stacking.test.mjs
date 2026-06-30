// Bug: opening the login modal's nsec passphrase/PIN field on top of the profile modal
// left it unclickable/untypable — the profile modal's focusin trap yanked focus back
// because it didn't recognize the stacked login modal. isInStackedModal() is the guard
// that makes the trap yield to a modal stacked on top.

import test from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import { isInStackedModal } from "../js/ui/focusTrapStacking.js";

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="profileModal" class="bv-modal">
    <input id="profileInput" />
  </div>
  <div id="loginModal" class="bv-modal">
    <input id="pinInput" />
  </div>
  <div id="closedModal" class="bv-modal hidden">
    <input id="closedInput" />
  </div>
  <input id="bareInput" />
</body></html>`);
const { document } = dom.window;
const profileModal = document.getElementById("profileModal");

test("yields focus to an input inside a different OPEN modal (the login PIN field)", () => {
  assert.equal(
    isInStackedModal(document.getElementById("pinInput"), profileModal),
    true,
  );
});

test("does NOT yield for focus moving inside the trapping modal itself", () => {
  assert.equal(
    isInStackedModal(document.getElementById("profileInput"), profileModal),
    false,
  );
});

test("does NOT yield to a HIDDEN modal's field", () => {
  assert.equal(
    isInStackedModal(document.getElementById("closedInput"), profileModal),
    false,
  );
});

test("does NOT yield for a target that isn't in any modal (trap should reclaim focus)", () => {
  assert.equal(
    isInStackedModal(document.getElementById("bareInput"), profileModal),
    false,
  );
});

test("safe for a null / non-element target", () => {
  assert.equal(isInStackedModal(null, profileModal), false);
  assert.equal(isInStackedModal({}, profileModal), false);
});
