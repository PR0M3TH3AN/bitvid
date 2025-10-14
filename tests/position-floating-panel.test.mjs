import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import positionFloatingPanel from "../js/ui/utils/positionFloatingPanel.js";

test("flips to top when bottom placement collides with viewport", () => {
  const dom = new JSDOM(
    `
      <div class="popover">
        <button id="trigger">Open</button>
        <div id="panel" class="popover__panel" data-state="closed" hidden></div>
      </div>
    `,
    { pretendToBeVisual: true },
  );
  const { window } = dom;
  const { document } = window;

  window.innerWidth = 360;
  window.innerHeight = 320;

  const trigger = document.getElementById("trigger");
  const panel = document.getElementById("panel");

  trigger.getBoundingClientRect = () => ({
    top: 260,
    bottom: 300,
    left: 100,
    right: 140,
    width: 40,
    height: 40,
  });

  panel.getBoundingClientRect = () => ({
    top: 0,
    bottom: 120,
    left: 0,
    right: 200,
    width: 200,
    height: 120,
  });
  Object.defineProperties(panel, {
    offsetWidth: { value: 200 },
    offsetHeight: { value: 120 },
  });

  const positioner = positionFloatingPanel(trigger, panel, {
    offset: 8,
    viewportPadding: 12,
  });

  panel.hidden = false;
  panel.dataset.state = "open";
  positioner.update();

  assert.equal(panel.dataset.floatingPlacement, "top");
  assert.equal(panel.style.position, "fixed");
  assert.equal(panel.style.getPropertyValue("--floating-fallback-top"), "132px");
  assert.equal(panel.style.getPropertyValue("--floating-fallback-left"), "100px");

  positioner.destroy();
  assert.equal(panel.dataset.floatingPanel, undefined);
  assert.equal(trigger.dataset.floatingAnchor, undefined);
});

test("respects RTL alignment and clamps within the viewport", () => {
  const dom = new JSDOM(
    `
      <div dir="rtl" class="popover">
        <button id="trigger">Open</button>
        <div id="panel" class="popover__panel" data-state="closed" hidden></div>
      </div>
    `,
    { pretendToBeVisual: true, url: "https://example.com" },
  );
  const { window } = dom;
  const { document } = window;

  window.innerWidth = 320;
  window.innerHeight = 240;
  document.documentElement.dir = "rtl";
  document.body.dir = "rtl";

  const trigger = document.getElementById("trigger");
  const panel = document.getElementById("panel");

  trigger.getBoundingClientRect = () => ({
    top: 32,
    bottom: 72,
    left: 220,
    right: 260,
    width: 40,
    height: 40,
  });

  panel.getBoundingClientRect = () => ({
    top: 0,
    bottom: 80,
    left: 0,
    right: 120,
    width: 120,
    height: 80,
  });
  Object.defineProperties(panel, {
    offsetWidth: { value: 120 },
    offsetHeight: { value: 80 },
  });

  const positioner = positionFloatingPanel(trigger, panel, {
    alignment: "start",
    viewportPadding: 16,
  });

  panel.hidden = false;
  panel.dataset.state = "open";
  positioner.update();

  // In RTL mode, start alignment hugs the right edge of the trigger.
  assert.equal(panel.dataset.floatingPlacement, "bottom");
  assert.equal(panel.dataset.floatingDir, "rtl");
  assert.equal(panel.style.getPropertyValue("--floating-fallback-left"), "140px");

  positioner.destroy();
});

test("updates when scroll containers move the trigger", async () => {
  const dom = new JSDOM(
    `
      <div class="popover">
        <button id="trigger">Open</button>
        <div id="panel" class="popover__panel" data-state="closed" hidden></div>
      </div>
    `,
    { pretendToBeVisual: true },
  );
  const { window } = dom;
  const { document } = window;

  window.innerWidth = 480;
  window.innerHeight = 360;

  const trigger = document.getElementById("trigger");
  const panel = document.getElementById("panel");

  let anchorTop = 100;
  trigger.getBoundingClientRect = () => ({
    top: anchorTop,
    bottom: anchorTop + 40,
    left: 40,
    right: 80,
    width: 40,
    height: 40,
  });

  panel.getBoundingClientRect = () => ({
    top: 0,
    bottom: 60,
    left: 0,
    right: 180,
    width: 180,
    height: 60,
  });
  Object.defineProperties(panel, {
    offsetWidth: { value: 180 },
    offsetHeight: { value: 60 },
  });

  let scrollHandler = null;
  const originalAddEventListener = window.addEventListener;
  window.addEventListener = (type, listener, options) => {
    if (type === "scroll" && options === true) {
      scrollHandler = listener;
    }
    return originalAddEventListener.call(window, type, listener, options);
  };

  const positioner = positionFloatingPanel(trigger, panel, {
    offset: 12,
  });

  panel.hidden = false;
  panel.dataset.state = "open";
  positioner.update();

  assert.equal(panel.style.getPropertyValue("--floating-fallback-top"), "152px");
  assert.ok(scrollHandler, "scroll listener should be registered");

  anchorTop = 60;
  scrollHandler?.({ type: "scroll" });
  assert.equal(panel.style.getPropertyValue("--floating-fallback-top"), "112px");

  positioner.destroy();
  window.addEventListener = originalAddEventListener;
});
