import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import positionFloatingPanel from "../js/ui/utils/positionFloatingPanel.js";
import { createFloatingPanelStyles } from "../js/ui/utils/floatingPanelStyles.js";

function getScopeRule(document, scopeId) {
  const styleEl = document.querySelector('style[data-ds-dynamic="true"]');
  const rules = [];
  if (styleEl?.sheet?.cssRules) {
    rules.push(...Array.from(styleEl.sheet.cssRules));
  }
  const adoptedSheets = document.adoptedStyleSheets;
  if (Array.isArray(adoptedSheets)) {
    for (const sheet of adoptedSheets) {
      if (sheet?.cssRules) {
        rules.push(...Array.from(sheet.cssRules));
      }
    }
  }
  return rules.find((cssRule) => cssRule.selectorText === `[data-ds-style-id="${scopeId}"]`) || null;
}

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

  const styles = createFloatingPanelStyles(panel);

  const positioner = positionFloatingPanel(trigger, panel, {
    offset: 8,
    viewportPadding: 12,
    styles,
  });

  panel.hidden = false;
  panel.dataset.state = "open";
  positioner.update();

  assert.equal(panel.dataset.floatingPlacement, "top");
  assert.equal(styles.getStrategy(), "fixed");
  assert.deepEqual(styles.getFallbackPosition(), { top: 132, left: 100 });
  assert.equal(panel.dataset.floatingMode, "fallback");
  const scopeId = panel.getAttribute("data-ds-style-id");
  assert.ok(scopeId, "panel should receive a dynamic style scope id");
  const rule = getScopeRule(document, scopeId);
  assert.ok(rule, "scope rule should exist for the floating panel");
  const ruleStyleTop = rule ? rule["style"] : null;
  assert.ok(ruleStyleTop, "floating panel rule should expose a CSSStyleDeclaration");
  assert.equal(ruleStyleTop.getPropertyValue("--floating-fallback-top"), "132px");
  assert.equal(ruleStyleTop.getPropertyValue("--floating-fallback-left"), "100px");

  positioner.destroy();
  assert.equal(panel.dataset.floatingPanel, undefined);
  assert.equal(trigger.dataset.floatingAnchor, undefined);
  const ruleAfterDestroy = getScopeRule(document, scopeId);
  assert.equal(ruleAfterDestroy, null);
});

test("switches to absolute positioning when a transformed ancestor would capture fixed panels", () => {
  const dom = new JSDOM(
    `
      <div id="card">
        <div class="popover">
          <button id="trigger">Open</button>
          <div id="panel" class="popover__panel" data-state="closed" hidden></div>
        </div>
      </div>
    `,
    { pretendToBeVisual: true },
  );
  const { window } = dom;
  const { document } = window;

  window.innerWidth = 1024;
  window.innerHeight = 768;

  const trigger = document.getElementById("trigger");
  const panel = document.getElementById("panel");
  const wrapper = panel.parentElement;
  const card = document.getElementById("card");

  trigger.getBoundingClientRect = () => ({
    top: 120,
    bottom: 160,
    left: 320,
    right: 360,
    width: 40,
    height: 40,
  });

  panel.getBoundingClientRect = () => ({
    top: 0,
    bottom: 120,
    left: 0,
    right: 180,
    width: 180,
    height: 120,
  });
  Object.defineProperties(panel, {
    offsetWidth: { value: 180 },
    offsetHeight: { value: 120 },
  });

  wrapper.getBoundingClientRect = () => ({
    top: 80,
    bottom: 200,
    left: 280,
    right: 440,
    width: 160,
    height: 120,
  });

  const originalGetComputedStyle = window.getComputedStyle.bind(window);
  let positioner = null;

  try {
    window.getComputedStyle = (element) => {
      if (element === card) {
        return {
          transform: "matrix(1, 0, 0, 1, 0, 0)",
          perspective: "none",
          filter: "none",
          backdropFilter: "none",
          contain: "none",
          willChange: "",
          direction: "ltr",
        };
      }
      if (element === trigger) {
        return {
          transform: "none",
          perspective: "none",
          filter: "none",
          backdropFilter: "none",
          contain: "none",
          willChange: "",
          direction: "ltr",
        };
      }
      return originalGetComputedStyle(element);
    };

    const styles = createFloatingPanelStyles(panel);

    positioner = positionFloatingPanel(trigger, panel, {
      offset: 8,
      viewportPadding: 12,
      styles,
    });

    panel.hidden = false;
    panel.dataset.state = "open";
    positioner.update();

    assert.equal(styles.getStrategy(), "absolute");
    assert.equal(panel.dataset.floatingStrategy, "absolute");
    assert.deepEqual(styles.getFallbackPosition(), { top: 88, left: 40 });
  } finally {
    if (positioner) {
      positioner.destroy();
    }
    window.getComputedStyle = originalGetComputedStyle;
  }
});

test("retries measurement when the panel reports zero size", async () => {
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

  window.innerWidth = 640;
  window.innerHeight = 480;

  const trigger = document.getElementById("trigger");
  const panel = document.getElementById("panel");

  trigger.getBoundingClientRect = () => ({
    top: 100,
    bottom: 140,
    left: 360,
    right: 400,
    width: 40,
    height: 40,
  });

  let measurementCount = 0;
  const zeroRect = {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
  };
  const actualRect = {
    top: 0,
    bottom: 120,
    left: 0,
    right: 160,
    width: 160,
    height: 120,
  };

  panel.getBoundingClientRect = () => {
    measurementCount += 1;
    return measurementCount === 1 ? zeroRect : actualRect;
  };
  Object.defineProperties(panel, {
    offsetWidth: {
      get() {
        return measurementCount === 1 ? 0 : 160;
      },
    },
    offsetHeight: {
      get() {
        return measurementCount === 1 ? 0 : 120;
      },
    },
  });

  const styles = createFloatingPanelStyles(panel);

  const positioner = positionFloatingPanel(trigger, panel, {
    alignment: "end",
    styles,
  });

  panel.hidden = false;
  panel.dataset.state = "open";

  positioner.update();

  assert.deepEqual(styles.getFallbackPosition(), { top: null, left: null });

  await new Promise((resolve) =>
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        resolve();
      }),
    ),
  );

  assert.deepEqual(styles.getFallbackPosition(), { top: 148, left: 240 });

  positioner.destroy();
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

  const styles = createFloatingPanelStyles(panel);

  const positioner = positionFloatingPanel(trigger, panel, {
    alignment: "start",
    viewportPadding: 16,
    flip: false,
    styles,
  });

  panel.hidden = false;
  panel.dataset.state = "open";
  positioner.update();

  // In RTL mode, start alignment hugs the right edge of the trigger.
  assert.equal(panel.dataset.floatingPlacement, "bottom");
  assert.equal(panel.dataset.floatingDir, "rtl");
  assert.deepEqual(styles.getFallbackPosition(), { top: 72 + 8, left: 140 });

  positioner.destroy();
});

test("shifts inline alignment to keep panels inside the viewport", () => {
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

  window.innerWidth = 320;
  window.innerHeight = 320;

  const trigger = document.getElementById("trigger");
  const panel = document.getElementById("panel");

  trigger.getBoundingClientRect = () => ({
    top: 120,
    bottom: 160,
    left: 250,
    right: 290,
    width: 40,
    height: 40,
  });

  panel.getBoundingClientRect = () => ({
    top: 0,
    bottom: 140,
    left: 0,
    right: 180,
    width: 180,
    height: 140,
  });
  Object.defineProperties(panel, {
    offsetWidth: { value: 180 },
    offsetHeight: { value: 140 },
  });

  const styles = createFloatingPanelStyles(panel);

  const positioner = positionFloatingPanel(trigger, panel, {
    alignment: "start",
    viewportPadding: 16,
    styles,
  });

  panel.hidden = false;
  panel.dataset.state = "open";
  positioner.update();

  const position = styles.getFallbackPosition();
  assert.ok(position.left >= 16, "panel should respect inline viewport padding");
  assert.ok(
    position.left + 180 <= 320 - 16,
    "panel should fit within the viewport width",
  );

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

  const styles = createFloatingPanelStyles(panel);

  const positioner = positionFloatingPanel(trigger, panel, {
    offset: 12,
    styles,
  });

  panel.hidden = false;
  panel.dataset.state = "open";
  positioner.update();

  assert.deepEqual(styles.getFallbackPosition(), { top: 152, left: 40 });
  assert.ok(scrollHandler, "scroll listener should be registered");
  const scopeId = panel.getAttribute("data-ds-style-id");
  const rule = getScopeRule(document, scopeId);
  assert.ok(rule, "dynamic rule should be present for scroll updates");
  const fallbackRuleStyle = rule ? rule["style"] : null;
  assert.ok(fallbackRuleStyle, "dynamic rule should be present for scroll updates");
  assert.equal(fallbackRuleStyle.getPropertyValue("--floating-fallback-top"), "152px");

  anchorTop = 60;
  scrollHandler?.({ type: "scroll" });
  assert.deepEqual(styles.getFallbackPosition(), { top: 112, left: 40 });
  assert.equal(fallbackRuleStyle.getPropertyValue("--floating-fallback-top"), "112px");

  positioner.destroy();
  window.addEventListener = originalAddEventListener;
});

test("clamps inline overflow when the surface is wider than the viewport gutter", () => {
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

  window.innerWidth = 280;
  window.innerHeight = 240;

  const trigger = document.getElementById("trigger");
  const panel = document.getElementById("panel");

  trigger.getBoundingClientRect = () => ({
    top: 80,
    bottom: 120,
    left: 220,
    right: 260,
    width: 40,
    height: 40,
  });

  panel.getBoundingClientRect = () => ({
    top: 0,
    bottom: 160,
    left: 0,
    right: 260,
    width: 260,
    height: 160,
  });
  Object.defineProperties(panel, {
    offsetWidth: { value: 260 },
    offsetHeight: { value: 160 },
  });

  const styles = createFloatingPanelStyles(panel);

  const positioner = positionFloatingPanel(trigger, panel, {
    alignment: "start",
    viewportPadding: 12,
    flip: false,
    styles,
  });

  panel.hidden = false;
  panel.dataset.state = "open";
  positioner.update();

  const position = styles.getFallbackPosition();
  assert.equal(position.left, 12);
  assert.ok(position.left >= 12, "panel should clamp to the viewport padding");

  positioner.destroy();
});

test("falls back to computed positioning when anchors are supported but not preferred", () => {
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

  window.innerWidth = 640;
  window.innerHeight = 480;

  const trigger = document.getElementById("trigger");
  const panel = document.getElementById("panel");

  trigger.getBoundingClientRect = () => ({
    top: 100,
    bottom: 140,
    left: 200,
    right: 240,
    width: 40,
    height: 40,
  });

  panel.getBoundingClientRect = () => ({
    top: 0,
    bottom: 90,
    left: 0,
    right: 200,
    width: 200,
    height: 90,
  });
  Object.defineProperties(panel, {
    offsetWidth: { value: 200 },
    offsetHeight: { value: 90 },
  });

  const originalCSS = window.CSS;
  window.CSS = {
    supports: (value) =>
      value === "anchor-name: --floating-panel" || value === "position-anchor: --floating-panel",
  };

  const positioner = positionFloatingPanel(trigger, panel, {
    offset: 10,
  });

  panel.hidden = false;
  panel.dataset.state = "open";
  positioner.update();

  assert.equal(panel.dataset.floatingMode, "fallback");
  assert.equal(positioner.styles.getMode(), "fallback");
  assert.equal(panel.dataset.floatingPlacement, "bottom");
  assert.deepEqual(positioner.styles.getFallbackPosition(), { top: 150, left: 200 });

  positioner.destroy();
  window.CSS = originalCSS;
});

test("opts into anchor positioning when supported and preferred", () => {
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

  window.innerWidth = 640;
  window.innerHeight = 480;

  const trigger = document.getElementById("trigger");
  const panel = document.getElementById("panel");

  trigger.getBoundingClientRect = () => ({
    top: 100,
    bottom: 140,
    left: 200,
    right: 240,
    width: 40,
    height: 40,
  });

  panel.getBoundingClientRect = () => ({
    top: 0,
    bottom: 90,
    left: 0,
    right: 200,
    width: 200,
    height: 90,
  });
  Object.defineProperties(panel, {
    offsetWidth: { value: 200 },
    offsetHeight: { value: 90 },
  });

  const originalCSS = window.CSS;
  window.CSS = {
    supports: (value) =>
      value === "anchor-name: --floating-panel" || value === "position-anchor: --floating-panel",
  };

  const positioner = positionFloatingPanel(trigger, panel, {
    offset: 10,
    preferAnchors: true,
  });

  panel.hidden = false;
  panel.dataset.state = "open";
  positioner.update();

  assert.equal(panel.dataset.floatingMode, "anchor");
  assert.equal(positioner.styles.getMode(), "anchor");
  assert.equal(panel.dataset.floatingPlacement, "bottom");
  assert.deepEqual(positioner.styles.getFallbackPosition(), { top: 150, left: 200 });

  positioner.destroy();
  window.CSS = originalCSS;
});
