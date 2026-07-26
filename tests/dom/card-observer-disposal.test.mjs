import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { createCardObserver } from "../../js/dom/cardObserver.js";

test("card observer disconnect unregisters every card and releases its observer", () => {
  const dom = new JSDOM("<div id=grid><article class='card' data-video-id=a></article><article class='card' data-video-id=b></article></div>");
  const originalHTMLElement = globalThis.HTMLElement;
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  globalThis.HTMLElement = dom.window.HTMLElement;
  let disconnects = 0;
  globalThis.IntersectionObserver = class {
    observe() {}
    takeRecords() { return []; }
    disconnect() { disconnects += 1; }
  };

  const unregistered = [];
  try {
    const observer = createCardObserver({
      onCardUnregister: ({ card }) => unregistered.push(card.dataset.videoId),
    });
    const grid = dom.window.document.getElementById("grid");
    observer.observe(grid);
    observer.disconnect(grid);

    assert.deepEqual(unregistered.sort(), ["a", "b"]);
    assert.equal(disconnects, 1);
    assert.equal(observer.getState(grid), null);
  } finally {
    dom.window.close();
    if (originalHTMLElement === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = originalHTMLElement;
    if (originalIntersectionObserver === undefined) delete globalThis.IntersectionObserver;
    else globalThis.IntersectionObserver = originalIntersectionObserver;
  }
});
