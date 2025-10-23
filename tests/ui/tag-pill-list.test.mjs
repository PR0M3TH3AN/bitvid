import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { renderTagPillStrip, updateTagPillStrip } from "../../js/ui/components/tagPillList.js";

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
    assert.equal(button.dataset.size, "compact");
    assert.equal(button.dataset.tag, tag);
    assert.equal(button.title, `#${tag}`);

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
  assert.equal(activations[0].tag, "nostr");
  assert.equal(activations[0].button, buttons[0]);
  assert(activations[0].event instanceof document.defaultView.Event);
});

test("updateTagPillStrip replaces buttons and rewires handlers", () => {
  const { document } = new JSDOM("<!DOCTYPE html>").window;
  const firstActivations = [];
  const secondActivations = [];

  const { root, buttons: initialButtons } = renderTagPillStrip({
    document,
    tags: ["nostr"],
    onTagActivate(tag) {
      firstActivations.push(tag);
    },
  });

  document.body.append(root);

  initialButtons[0].click();
  assert.deepEqual(firstActivations, ["nostr"]);

  const { buttons: updatedButtons } = updateTagPillStrip({
    root,
    document,
    tags: ["video"],
    onTagActivate(tag, { button }) {
      secondActivations.push({ tag, button });
    },
  });

  assert.equal(root.querySelectorAll("button").length, 1);
  assert.equal(updatedButtons[0].dataset.tag, "video");

  const updatedIcon = updatedButtons[0].querySelector(".video-tag-pill__icon svg");
  assert(updatedIcon, "updated button should contain the svg icon");

  // Ensure the old handler is removed by dispatching a click on the detached button.
  initialButtons[0].dispatchEvent(new document.defaultView.Event("click", { bubbles: true }));
  assert.deepEqual(firstActivations, ["nostr"]);

  updatedButtons[0].click();
  assert.deepEqual(secondActivations, [{ tag: "video", button: updatedButtons[0] }]);
});
