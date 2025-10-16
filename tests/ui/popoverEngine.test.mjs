import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import createPopover from "../../js/ui/overlay/popoverEngine.js";

let dom;
let documentRef;
let windowRef;

class StubObserver {
  constructor() {
    this.observe = () => {};
    this.unobserve = () => {};
    this.disconnect = () => {};
  }
}

function setupBoundingClientRect(element, rect) {
  element.getBoundingClientRect = () => ({ ...rect });
  Object.defineProperties(element, {
    offsetWidth: { value: rect.width, configurable: true },
    offsetHeight: { value: rect.height, configurable: true },
  });
}

beforeEach(() => {
  dom = new JSDOM(
    `<!DOCTYPE html><html><body><div id="app"><button id="trigger">Open</button></div></body></html>`,
    {
      pretendToBeVisual: true,
      url: "https://example.com",
    },
  );

  windowRef = dom.window;
  documentRef = windowRef.document;

  windowRef.innerWidth = 1024;
  windowRef.innerHeight = 768;
  Object.defineProperty(documentRef.documentElement, "clientWidth", {
    value: 1024,
    configurable: true,
  });
  Object.defineProperty(documentRef.documentElement, "clientHeight", {
    value: 768,
    configurable: true,
  });

  global.window = windowRef;
  global.document = documentRef;
  global.HTMLElement = windowRef.HTMLElement;
  global.Element = windowRef.Element;
  global.Node = windowRef.Node;
  global.getComputedStyle = windowRef.getComputedStyle.bind(windowRef);
  global.ResizeObserver = StubObserver;
  if (!global.PointerEvent) {
    global.PointerEvent = windowRef.PointerEvent || windowRef.Event;
  }
});

afterEach(() => {
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.Element;
  delete global.Node;
  delete global.getComputedStyle;
  delete global.ResizeObserver;
  if (dom) {
    dom.window.close();
  }
  dom = null;
  documentRef = null;
  windowRef = null;
});

test("opens a popover in the overlay root and positions the panel", async () => {
  const trigger = documentRef.getElementById("trigger");
  trigger.setAttribute("tabindex", "0");

  setupBoundingClientRect(trigger, {
    x: 100,
    y: 100,
    top: 100,
    bottom: 140,
    left: 100,
    right: 140,
    width: 40,
    height: 40,
  });

  const popover = createPopover(
    trigger,
    ({ container }) => {
      const panel = documentRef.createElement("div");
      panel.id = "popover-panel";
      setupBoundingClientRect(panel, {
        x: 0,
        y: 0,
        top: 0,
        bottom: 120,
        left: 0,
        right: 200,
        width: 200,
        height: 120,
      });
      container.appendChild(panel);
      return panel;
    },
    { document: documentRef },
  );

  await popover.open();

  const overlayRoot = documentRef.getElementById("uiOverlay");
  assert.ok(overlayRoot, "overlay root should be created");
  assert.equal(overlayRoot.getAttribute("aria-hidden"), "true");
  assert.equal(overlayRoot.dataset.component, "overlay-root");

  const panel = documentRef.getElementById("popover-panel");
  assert.ok(panel, "panel should be rendered");
  assert.equal(panel.dataset.popoverState, "open");
  assert.equal(panel.dataset.popoverPlacement, "bottom-start");
  assert.equal(panel.style.position, "fixed");
  assert.equal(panel.style.left, "100px");
  assert.equal(panel.style.top, "148px");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");

  popover.close();
  assert.equal(panel.dataset.popoverState, "closed");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");

  popover.destroy();
});

test("closes on outside pointer events and restores focus", async () => {
  const trigger = documentRef.getElementById("trigger");
  trigger.setAttribute("tabindex", "0");

  setupBoundingClientRect(trigger, {
    x: 50,
    y: 50,
    top: 50,
    bottom: 90,
    left: 50,
    right: 90,
    width: 40,
    height: 40,
  });

  const popover = createPopover(
    trigger,
    ({ container }) => {
      const panel = documentRef.createElement("div");
      setupBoundingClientRect(panel, {
        x: 0,
        y: 0,
        top: 0,
        bottom: 60,
        left: 0,
        right: 160,
        width: 160,
        height: 60,
      });
      container.appendChild(panel);
      return panel;
    },
    { document: documentRef },
  );

  trigger.focus();
  await popover.open();

  const other = documentRef.createElement("button");
  other.id = "outside";
  documentRef.body.appendChild(other);
  other.focus();
  assert.equal(documentRef.activeElement, other);

  const event = new windowRef.Event("pointerdown", { bubbles: true, composed: true });
  other.dispatchEvent(event);

  assert.equal(popover.isOpen(), false);
  assert.equal(documentRef.activeElement, trigger);

  popover.destroy();
});

test("ensures only one popover is open at a time", async () => {
  const trigger = documentRef.getElementById("trigger");
  trigger.setAttribute("tabindex", "0");
  setupBoundingClientRect(trigger, {
    x: 20,
    y: 20,
    top: 20,
    bottom: 60,
    left: 20,
    right: 60,
    width: 40,
    height: 40,
  });

  const secondTrigger = documentRef.createElement("button");
  secondTrigger.id = "second";
  secondTrigger.setAttribute("tabindex", "0");
  documentRef.body.appendChild(secondTrigger);
  setupBoundingClientRect(secondTrigger, {
    x: 220,
    y: 20,
    top: 20,
    bottom: 60,
    left: 220,
    right: 260,
    width: 40,
    height: 40,
  });

  const makePanel = (id) => ({ container }) => {
    const panel = documentRef.createElement("div");
    panel.id = id;
    setupBoundingClientRect(panel, {
      x: 0,
      y: 0,
      top: 0,
      bottom: 80,
      left: 0,
      right: 160,
      width: 160,
      height: 80,
    });
    container.appendChild(panel);
    return panel;
  };

  const popoverA = createPopover(trigger, makePanel("panel-a"), {
    document: documentRef,
  });
  const popoverB = createPopover(secondTrigger, makePanel("panel-b"), {
    document: documentRef,
  });

  await popoverA.open();
  assert.equal(popoverA.isOpen(), true);

  await popoverB.open();
  assert.equal(popoverB.isOpen(), true);
  assert.equal(popoverA.isOpen(), false);

  const panelA = documentRef.getElementById("panel-a");
  const panelB = documentRef.getElementById("panel-b");
  assert.equal(panelA.dataset.popoverState, "closed");
  assert.equal(panelB.dataset.popoverState, "open");

  popoverA.destroy();
  popoverB.destroy();
});

test("applies token-based sizing and arrow positioning", async () => {
  const trigger = documentRef.getElementById("trigger");
  trigger.setAttribute("tabindex", "0");
  setupBoundingClientRect(trigger, {
    x: 120,
    y: 120,
    top: 120,
    bottom: 160,
    left: 120,
    right: 160,
    width: 40,
    height: 40,
  });

  documentRef.documentElement.style.setProperty("--popover-inline-safe-max", "320px");
  documentRef.documentElement.style.setProperty("--overlay-panel-padding-block", "240px");

  const popover = createPopover(
    trigger,
    ({ container }) => {
      const panel = documentRef.createElement("div");
      panel.id = "panel-with-arrow";
      panel.className = "panel";
      setupBoundingClientRect(panel, {
        x: 0,
        y: 0,
        top: 0,
        bottom: 100,
        left: 0,
        right: 200,
        width: 200,
        height: 100,
      });

      const arrow = documentRef.createElement("div");
      arrow.className = "arrow";
      setupBoundingClientRect(arrow, {
        x: 0,
        y: 0,
        top: 0,
        bottom: 8,
        left: 0,
        right: 8,
        width: 8,
        height: 8,
      });
      container.appendChild(panel);
      panel.appendChild(arrow);
      return { panel, arrow };
    },
    {
      document: documentRef,
      maxWidthToken: "--popover-inline-safe-max",
      maxHeightToken: "--overlay-panel-padding-block",
      arrow: (panel) => panel.querySelector(".arrow"),
    },
  );

  await popover.open();

  const panel = documentRef.getElementById("panel-with-arrow");
  const arrow = panel.querySelector(".arrow");

  assert.equal(panel.style.maxWidth, "320px");
  assert.equal(panel.style.maxHeight, "240px");
  assert.equal(arrow.dataset.popoverArrowSide, "bottom");
  assert.notEqual(arrow.style.top, "");

  popover.destroy();
});
