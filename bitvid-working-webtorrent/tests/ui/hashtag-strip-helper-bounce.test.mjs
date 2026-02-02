import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { HashtagStripHelper } from "../../js/ui/components/hashtagStripHelper.js";

function createDom() {
  const dom = new JSDOM("<!DOCTYPE html><body><div id='container'></div></body>", {
    pretendToBeVisual: true,
  });

  // Mock requestAnimationFrame to capture callback
  let rafCallback = null;
  dom.window.requestAnimationFrame = (cb) => {
    rafCallback = cb;
    return 1;
  };

  // Helper to trigger pending RAF
  dom.window.triggerRaf = () => {
    if (rafCallback) {
      const cb = rafCallback;
      rafCallback = null;
      cb();
      return true;
    }
    return false;
  };

  // Mock createElement to ensure scrollTo exists on created elements
  // This is required because JSDOM might not implement scrollTo on div elements
  // and _triggerScrollHint checks for it.
  const originalCreateElement = dom.window.document.createElement;
  dom.window.document.createElement = function(tagName, options) {
    const el = originalCreateElement.call(dom.window.document, tagName, options);
    if (typeof el.scrollTo !== 'function') {
      el.scrollTo = () => {};
    }
    return el;
  };

  return { dom, window: dom.window, document: dom.window.document };
}

test("HashtagStripHelper triggers scroll hint when content overflows", (t) => {
  const { window, document } = createDom();
  const container = document.getElementById("container");

  // Mock setTimeout
  const timeouts = [];
  window.setTimeout = (cb, delay) => {
    timeouts.push({ cb, delay });
    return timeouts.length;
  };

  const helper = new HashtagStripHelper({
    window,
    document,
    scrollable: true,
  });

  helper.mount(container);

  helper._sortedTags = ["Tag1", "Tag2", "Tag3"];

  // Render creates the element and requests RAF
  helper.render();

  const strip = container.querySelector(".video-tag-strip");
  assert(strip, "Strip element should be rendered");

  // Mock scroll properties on the newly created element
  Object.defineProperty(strip, "scrollWidth", { value: 200, configurable: true });
  Object.defineProperty(strip, "clientWidth", { value: 100, configurable: true });
  Object.defineProperty(strip, "scrollLeft", { value: 0, writable: true, configurable: true });
  Object.defineProperty(strip, "isConnected", { value: true, configurable: true });

  // Mock scrollTo to spy on calls
  let scrollToCalls = [];
  strip.scrollTo = (options) => {
    scrollToCalls.push(options);
  };

  // Trigger the RAF callback which was scheduled during render()
  const triggered = window.triggerRaf();
  assert(triggered, "Should have scheduled a RAF callback");

  assert.equal(timeouts.length, 1, "Should schedule initial timeout");

  // Execute first timeout
  const firstTimeout = timeouts.shift();
  assert.equal(firstTimeout.delay, 600, "First timeout should be 600ms");
  firstTimeout.cb(); // Execute

  assert.equal(scrollToCalls.length, 1, "Should have called scrollTo once");
  assert.equal(scrollToCalls[0].left, 40, "Should scroll to 40px");

  assert.equal(timeouts.length, 1, "Should schedule second timeout");
  const secondTimeout = timeouts.shift();
  assert.equal(secondTimeout.delay, 800, "Second timeout should be 800ms");

  // Execute second timeout
  secondTimeout.cb();

  assert.equal(scrollToCalls.length, 2, "Should have called scrollTo twice");
  assert.equal(scrollToCalls[1].left, 0, "Should scroll back to 0px");
});

test("HashtagStripHelper does not trigger scroll hint when no overflow", (t) => {
  const { window, document } = createDom();
  const container = document.getElementById("container");

  const timeouts = [];
  window.setTimeout = (cb, delay) => {
    timeouts.push({ cb, delay });
    return timeouts.length;
  };

  const helper = new HashtagStripHelper({
    window,
    document,
    scrollable: true,
  });

  helper.mount(container);
  helper._sortedTags = ["Tag1"];
  helper.render();

  const strip = container.querySelector(".video-tag-strip");

  // Mock properties
  Object.defineProperty(strip, "scrollWidth", { value: 100, configurable: true });
  Object.defineProperty(strip, "clientWidth", { value: 100, configurable: true });
  Object.defineProperty(strip, "isConnected", { value: true, configurable: true });

  strip.scrollTo = () => {
    throw new Error("Should not scroll");
  };

  // Trigger RAF
  const triggered = window.triggerRaf();
  assert(triggered, "Should have scheduled a RAF callback");

  assert.equal(timeouts.length, 0, "Should not schedule timeout");
});
