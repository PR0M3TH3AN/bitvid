import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";

import { createToastManager } from "../../torrent/ui/toastService.js";

let dom;

describe("torrent/ui/toastService", () => {
  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
      pretendToBeVisual: true,
    });
  });

  afterEach(() => {
    if (dom) {
      dom.window.close();
      dom = null;
    }
  });

  it("renders a toast with Tailwind token classes and removes it on dismiss", async () => {
    const documentRef = dom.window.document;
    documentRef.defaultView.requestAnimationFrame = (cb) => cb();
    const toastManager = createToastManager(documentRef);
    const handle = toastManager.success("Magnet copied", { sticky: true });

    const container = documentRef.getElementById("beacon-toast-container");
    assert.ok(container, "toast container should be created");
    assert.equal(container.classList.contains("flex"), true);

    const wrapper = container.firstElementChild;
    assert.ok(wrapper, "toast wrapper should exist");
    assert.equal(wrapper.classList.contains("beacon-toast-motion"), true);
    assert.equal(wrapper.getAttribute("data-beacon-motion"), "enter");

    const toast = wrapper.querySelector("div[role='status']");
    assert.ok(toast, "toast element should be present");
    assert.equal(toast.textContent.includes("Magnet copied"), true);
    assert.equal(toast.classList.contains("torrent-toast"), true);
    assert.equal(toast.classList.contains("torrent-toast--success"), true);

    const closeButton = toast.querySelector("button[aria-label='Dismiss notification']");
    assert.ok(closeButton, "close button should be rendered");

    handle.dismiss();
    assert.equal(wrapper.getAttribute("data-beacon-motion"), "exit");

    await new Promise((resolve) => setTimeout(resolve, 250));

    assert.equal(container.childElementCount, 0);
  });
});
