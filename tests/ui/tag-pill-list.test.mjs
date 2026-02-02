import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  renderTagPillStrip,
} from "../../js/ui/components/tagPillList.js";

test("renderTagPillStrip builds buttons with labels and icons", () => {
  const { document } = new JSDOM("<!DOCTYPE html>").window;
  const { root, buttons } = renderTagPillStrip({
    document,
    tags: ["nostr", "video"],
  });

  assert.equal(root.tagName, "DIV");
  assert(root.classList.contains("video-tag-strip"));
  assert.equal(buttons.length, 2);

  for (const [index, button] of buttons.entries()) {
    const tag = index === 0 ? "nostr" : "video";
    assert.equal(button.tagName, "BUTTON");
    assert.equal(button.type, "button");
    assert.ok(button.classList.contains("pill"));
    assert.ok(button.classList.contains("video-tag-pill"));
    assert.ok(button.classList.contains("focus-ring"));
    assert.equal(button.dataset.tag, `#${tag}`);
    assert.equal(button.title, `#${tag}`);
    assert.equal(button.dataset.preferenceState, "neutral");
    assert.equal(button.hasAttribute("data-variant"), false);

    const label = button.querySelector(".video-tag-pill__label");
    assert(label, "label span should be present");
    assert.equal(label.textContent, `#${tag}`);

    const icon = button.querySelector(".video-tag-pill__icon");
    assert(icon, "icon span should be present");
    assert.equal(icon.getAttribute("aria-hidden"), "true");

    const svg = icon.querySelector("svg");
    assert(svg, "plus icon svg should be present");
    assert.equal(svg.getAttribute("viewBox"), "0 0 16 16");
  }
});

test("renderTagPillStrip applies preference state styling", () => {
  const { document } = new JSDOM("<!DOCTYPE html>").window;
  const { buttons } = renderTagPillStrip({
    document,
    tags: ["nostr", "video"],
    getTagState(tag) {
      return tag === "#nostr" ? "interest" : "disinterest";
    },
  });

  assert.equal(buttons[0].dataset.preferenceState, "interest");
  assert.equal(buttons[0].dataset.variant, "success");
  assert.equal(buttons[1].dataset.preferenceState, "disinterest");
  assert.equal(buttons[1].dataset.variant, "critical");
});

test("renderTagPillStrip wires the activation callback", () => {
  const { document } = new JSDOM("<!DOCTYPE html>").window;
  const activations = [];
  const { root, buttons } = renderTagPillStrip({
    document,
    tags: ["nostr"],
    onTagActivate(tag, { button, event }) {
      activations.push({ tag, button, event });
    },
  });

  document.body.append(root);

  buttons[0].click();

  assert.equal(activations.length, 1);
  assert.equal(activations[0].tag, "#nostr");
  assert.equal(activations[0].button, buttons[0]);
  assert(activations[0].event instanceof document.defaultView.Event);
});
