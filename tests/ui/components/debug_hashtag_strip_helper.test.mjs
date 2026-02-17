import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { HashtagStripHelper } from "../../../js/ui/components/hashtagStripHelper.js";

function createDom(options = {}) {
  const dom = new JSDOM("<!DOCTYPE html><body><div id='container'></div></body>", {
    pretendToBeVisual: true,
  });

  const win = dom.window;
  const doc = win.document;

  if (options.useResizeObserver) {
     win.ResizeObserver = class MockResizeObserver {
         observe() {}
         disconnect() {}
     };
  } else {
     delete win.ResizeObserver;
  }

  win.addEventListener = (event, handler) => {
      console.log(`DEBUG: window.addEventListener('${event}') called`);
  };

  return { window: win, document: doc };
}

test("Debug HashtagStripHelper fallback", (t) => {
  console.log("Global ResizeObserver type:", typeof globalThis.ResizeObserver);

  const { window, document } = createDom({ useResizeObserver: false });
  const container = document.getElementById("container");

  const helper = new HashtagStripHelper({ window, document });

  console.log("Helper window ResizeObserver:", typeof helper.window.ResizeObserver);

  helper.mount(container);
  // Need to update with tags to trigger render and observer setup
  helper.update([{ tags: [["t", "test"]] }]);
});
