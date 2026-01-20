import test, { beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { register } from "node:module";

let dom;
let documentRef;
let windowRef;
let createPopover;
let computePositionStub;
let autoUpdateStub;
let mockedPosition;

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

function setMockedPosition(overrides = {}) {
  mockedPosition = {
    x: 0,
    y: 0,
    placement: "bottom-start",
    middlewareData: {},
    strategy: "fixed",
    ...overrides,
  };
}

beforeEach(async () => {
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
<<<<<<< HEAD
  global.HTMLStyleElement = windowRef.HTMLStyleElement;
=======
>>>>>>> origin/main
  global.Element = windowRef.Element;
  global.Node = windowRef.Node;
  global.getComputedStyle = windowRef.getComputedStyle.bind(windowRef);
  global.ResizeObserver = StubObserver;
  global.IntersectionObserver = StubObserver;
  windowRef.IntersectionObserver = StubObserver;
  windowRef.scrollTo = () => {};
  if (!global.PointerEvent) {
    global.PointerEvent = windowRef.PointerEvent || windowRef.Event;
  }

  setMockedPosition();

  computePositionStub = mock.fn(async () => ({ ...mockedPosition }));
  autoUpdateStub = mock.fn((reference, floating, update) => {
    if (typeof update === "function") {
      update();
    }
    return () => {};
  });

  globalThis.__floatingUiMock = {
    arrow: (...args) => ({ name: "arrow", args }),
    autoUpdate: autoUpdateStub,
    computePosition: computePositionStub,
    flip: (...args) => ({ name: "flip", args }),
    offset: (...args) => ({ name: "offset", args }),
    shift: (...args) => ({ name: "shift", args }),
  };

  register(new URL("./mocks/floating-ui-test-loader.mjs", import.meta.url));

  ({ default: createPopover } = await import("../../js/ui/overlay/popoverEngine.js"));
});

afterEach(() => {
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
<<<<<<< HEAD
  delete global.HTMLStyleElement;
=======
>>>>>>> origin/main
  delete global.Element;
  delete global.Node;
  delete global.getComputedStyle;
  delete global.ResizeObserver;
  delete global.IntersectionObserver;
  delete globalThis.__floatingUiMock;
  mock.restoreAll();
  if (dom) {
    dom.window.close();
  }
  dom = null;
  documentRef = null;
  windowRef = null;
  createPopover = null;
  computePositionStub = null;
  autoUpdateStub = null;
  mockedPosition = null;
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

  setMockedPosition({ x: 172.6, y: 248.4, placement: "bottom-start" });

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

  assert.equal(trigger.getAttribute("aria-haspopup"), "menu");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");

  await popover.open();

  const overlayRoot = documentRef.getElementById("uiOverlay");
  assert.ok(overlayRoot, "overlay root should be created");
  assert.equal(overlayRoot.getAttribute("aria-hidden"), "true");
  assert.equal(overlayRoot.dataset.component, "overlay-root");

  const panel = documentRef.getElementById("popover-panel");
  assert.ok(panel, "panel should be rendered");
  assert.equal(trigger.getAttribute("aria-controls"), panel.id);
  assert.equal(panel.dataset.popoverState, "open");
  assert.equal(panel.dataset.state, "open");
  assert.equal(panel.dataset.popoverPlacement, "bottom-start");
<<<<<<< HEAD
  const panelStyles = documentRef.defaultView.getComputedStyle(panel);
  assert.equal(panelStyles.getPropertyValue("--popover-strategy").trim(), "fixed");
  assert.equal(panelStyles.getPropertyValue("--popover-left").trim(), "173px");
  assert.equal(panelStyles.getPropertyValue("--popover-top").trim(), "248px");
=======
  assert.equal(panel.style.position, "fixed");
  assert.equal(panel.style.left, "173px");
  assert.equal(panel.style.top, "248px");
>>>>>>> origin/main
  assert.equal(panel.getAttribute("role"), "menu");
  assert.equal(documentRef.activeElement, panel);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");

  popover.close();
  assert.equal(panel.dataset.popoverState, "closed");
  assert.equal(panel.dataset.state, "closed");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");

  popover.destroy();
});

test("positions bottom-end panels flush with the trigger's right edge", async () => {
  const trigger = documentRef.getElementById("trigger");
  trigger.setAttribute("tabindex", "0");

  setupBoundingClientRect(trigger, {
    x: 240,
    y: 180,
    top: 180,
    bottom: 220,
    left: 240,
    right: 340,
    width: 100,
    height: 40,
  });

  const panelWidth = 220;
  setMockedPosition({
    x: 120.3,
    y: 264.7,
    placement: "bottom-end",
  });

  const popover = createPopover(
    trigger,
    ({ container }) => {
      const panel = documentRef.createElement("div");
      panel.id = "popover-bottom-end";
      setupBoundingClientRect(panel, {
        x: 0,
        y: 0,
        top: 0,
        bottom: 140,
        left: 0,
        right: panelWidth,
        width: panelWidth,
        height: 140,
      });
      container.appendChild(panel);
      return panel;
    },
    { document: documentRef, placement: "bottom-end" },
  );

  await popover.open();

  const panel = documentRef.getElementById("popover-bottom-end");
  assert.ok(panel);
<<<<<<< HEAD
  const panelStyles = documentRef.defaultView.getComputedStyle(panel);
  assert.equal(panel.dataset.popoverPlacement, "bottom-end");
  assert.equal(panelStyles.getPropertyValue("--popover-left").trim(), "120px");
  assert.equal(panelStyles.getPropertyValue("--popover-top").trim(), "265px");

  const triggerRight = Math.round(trigger.getBoundingClientRect().right);
  const panelRight =
    Number.parseInt(panelStyles.getPropertyValue("--popover-left"), 10) +
    panel.offsetWidth;
=======
  assert.equal(panel.dataset.popoverPlacement, "bottom-end");
  assert.equal(panel.style.left, "120px");
  assert.equal(panel.style.top, "265px");

  const triggerRight = Math.round(trigger.getBoundingClientRect().right);
  const panelRight = Number.parseInt(panel.style.left, 10) + panel.offsetWidth;
>>>>>>> origin/main
  assert.equal(panelRight, triggerRight);

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

test("supports roving focus, home/end navigation, and typeahead", async () => {
  const trigger = documentRef.getElementById("trigger");
  trigger.setAttribute("tabindex", "0");

  setupBoundingClientRect(trigger, {
    x: 40,
    y: 40,
    top: 40,
    bottom: 80,
    left: 40,
    right: 80,
    width: 40,
    height: 40,
  });

  const initialScroll = { x: 64, y: 128 };
  windowRef.scrollX = initialScroll.x;
  windowRef.scrollY = initialScroll.y;

  const scrollCalls = [];
  const originalScrollTo = windowRef.scrollTo;
  const originalRequestAnimationFrame = windowRef.requestAnimationFrame;
  const rafCalls = [];
  windowRef.scrollTo = (x, y) => {
    scrollCalls.push({ x, y });
    windowRef.scrollX = x;
    windowRef.scrollY = y;
  };
  windowRef.requestAnimationFrame = (callback) => {
    rafCalls.push(true);
    if (typeof callback === "function") {
      callback();
    }
    return rafCalls.length;
  };

  const focusMutations = [];
  const originalFocus = windowRef.HTMLElement.prototype.focus;
  const registerFocusMutation = (
    element,
    mutatedX,
    mutatedY,
    { supportsPreventScroll = true } = {},
  ) => {
    element.focus = function focus(options = {}) {
      focusMutations.push({ id: element.id || element.textContent, options });

      if (!supportsPreventScroll && options && typeof options === "object" && "preventScroll" in options) {
        throw new TypeError("preventScroll not supported");
      }

      windowRef.scrollX = mutatedX;
      windowRef.scrollY = mutatedY;
      if (typeof originalFocus === "function") {
        originalFocus.call(this, options);
      }
    };
  };

  const popover = createPopover(
    trigger,
    ({ container }) => {
      const panel = documentRef.createElement("div");
      panel.className = "popover__panel";
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

      const list = documentRef.createElement("div");
      panel.appendChild(list);

      const disabled = documentRef.createElement("button");
      disabled.className = "menu__item";
      disabled.type = "button";
      disabled.textContent = "Disabled";
      disabled.disabled = true;
      list.appendChild(disabled);

      const copy = documentRef.createElement("button");
      copy.className = "menu__item";
      copy.type = "button";
      copy.textContent = "Copy link";
      registerFocusMutation(copy, 400, 500, { supportsPreventScroll: false });
      list.appendChild(copy);

      const deleteBtn = documentRef.createElement("button");
      deleteBtn.className = "menu__item";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete video";
      registerFocusMutation(deleteBtn, 420, 520);
      list.appendChild(deleteBtn);

      const share = documentRef.createElement("button");
      share.className = "menu__item";
      share.type = "button";
      share.textContent = "Share";
      registerFocusMutation(share, 440, 540);
      list.appendChild(share);

      container.appendChild(panel);
      return panel;
    },
    { document: documentRef },
  );

  await popover.open();

  const panel = documentRef.querySelector(".popover__panel");
  const items = panel.querySelectorAll(".menu__item");
  const [disabled, copy, deleteBtn, share] = items;

  assert.equal(documentRef.activeElement, copy);
  assert.equal(panel.getAttribute("aria-activedescendant"), copy.id);
  assert.equal(copy.getAttribute("tabindex"), "0");
  assert.equal(disabled.getAttribute("tabindex"), "-1");

  copy.dispatchEvent(
    new windowRef.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  assert.equal(documentRef.activeElement, deleteBtn);
  assert.equal(panel.getAttribute("aria-activedescendant"), deleteBtn.id);

  deleteBtn.dispatchEvent(
    new windowRef.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  assert.equal(documentRef.activeElement, share);

  share.dispatchEvent(
    new windowRef.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  assert.equal(documentRef.activeElement, copy);

  copy.dispatchEvent(
    new windowRef.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
  );
  assert.equal(documentRef.activeElement, share);

  share.dispatchEvent(
    new windowRef.KeyboardEvent("keydown", { key: "Home", bubbles: true }),
  );
  assert.equal(documentRef.activeElement, copy);

  copy.dispatchEvent(
    new windowRef.KeyboardEvent("keydown", { key: "End", bubbles: true }),
  );
  assert.equal(documentRef.activeElement, share);

  share.dispatchEvent(
    new windowRef.KeyboardEvent("keydown", { key: "d", bubbles: true }),
  );
  assert.equal(documentRef.activeElement, deleteBtn);
  assert.equal(panel.getAttribute("aria-activedescendant"), deleteBtn.id);

  assert.ok(focusMutations.length >= 1, "focus mutations should occur");
  assert.ok(scrollCalls.length >= focusMutations.length);
  scrollCalls.forEach((call) => {
    assert.deepEqual(call, initialScroll);
  });
  assert.ok(rafCalls.length >= 1, "should schedule scroll restoration when preventScroll unsupported");
  assert.equal(windowRef.scrollX, initialScroll.x);
  assert.equal(windowRef.scrollY, initialScroll.y);

  popover.destroy();
  windowRef.scrollTo = originalScrollTo;
  windowRef.requestAnimationFrame = originalRequestAnimationFrame;
});

test("escape closes the popover and restores trigger focus", async () => {
  const trigger = documentRef.getElementById("trigger");
  trigger.setAttribute("tabindex", "0");

  setupBoundingClientRect(trigger, {
    x: 60,
    y: 60,
    top: 60,
    bottom: 100,
    left: 60,
    right: 100,
    width: 40,
    height: 40,
  });

  const popover = createPopover(
    trigger,
    ({ container }) => {
      const panel = documentRef.createElement("div");
      panel.className = "popover__panel";
      setupBoundingClientRect(panel, {
        x: 0,
        y: 0,
        top: 0,
        bottom: 90,
        left: 0,
        right: 180,
        width: 180,
        height: 90,
      });

      const first = documentRef.createElement("button");
      first.className = "menu__item";
      first.type = "button";
      first.textContent = "First";
      panel.appendChild(first);

      const second = documentRef.createElement("button");
      second.className = "menu__item";
      second.type = "button";
      second.textContent = "Second";
      panel.appendChild(second);

      container.appendChild(panel);
      return panel;
    },
    { document: documentRef },
  );

  await popover.open();

  const panel = documentRef.querySelector(".popover__panel");
  const first = panel.querySelector(".menu__item");
  assert.equal(documentRef.activeElement, first);

  first.dispatchEvent(
    new windowRef.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );

  assert.equal(popover.isOpen(), false);
  assert.equal(panel.dataset.popoverState, "closed");
  assert.equal(panel.dataset.state, "closed");
  assert.equal(panel.getAttribute("aria-activedescendant"), null);
  assert.equal(documentRef.activeElement, trigger);

  popover.destroy();
});

test("close respects restoreFocus option for contextual menus", async () => {
  const trigger = documentRef.getElementById("trigger");
  trigger.setAttribute("tabindex", "0");

  setupBoundingClientRect(trigger, {
    x: 80,
    y: 80,
    top: 80,
    bottom: 120,
    left: 80,
    right: 120,
    width: 40,
    height: 40,
  });

  const popover = createPopover(
    trigger,
    ({ container }) => {
      const panel = documentRef.createElement("div");
      panel.className = "popover__panel";
      setupBoundingClientRect(panel, {
        x: 0,
        y: 0,
        top: 0,
        bottom: 90,
        left: 0,
        right: 180,
        width: 180,
        height: 90,
      });

      const action = documentRef.createElement("button");
      action.className = "menu__item";
      action.type = "button";
      action.textContent = "Action";
      panel.appendChild(action);

      container.appendChild(panel);
      return panel;
    },
    { document: documentRef },
  );

  await popover.open();

  const action = documentRef.querySelector(".menu__item");
  assert.equal(documentRef.activeElement, action);

  popover.close({ restoreFocus: false });

  assert.equal(popover.isOpen(), false);
  assert.notEqual(documentRef.activeElement, trigger);
  assert.equal(documentRef.activeElement, action);

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
  assert.equal(panelA.dataset.state, "closed");
  assert.equal(panelB.dataset.state, "open");

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

<<<<<<< HEAD
  const rootStyle = documentRef.createElement("style");
  rootStyle.textContent = `
    :root {
      --popover-inline-safe-max: 320px;
      --overlay-panel-padding-block: 240px;
    }
  `;
  documentRef.head.appendChild(rootStyle);
=======
  documentRef.documentElement.style.setProperty("--popover-inline-safe-max", "320px");
  documentRef.documentElement.style.setProperty("--overlay-panel-padding-block", "240px");
>>>>>>> origin/main

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

  setMockedPosition({
    placement: "bottom",
    middlewareData: { arrow: { x: 12.4, y: 8.6 } },
  });

  await popover.open();

  const panel = documentRef.getElementById("panel-with-arrow");
  const arrow = panel.querySelector(".arrow");

  const panelStyles = getComputedStyle(panel);
<<<<<<< HEAD
  assert.equal(panelStyles.getPropertyValue("--popover-max-width").trim(), "320px");
  assert.equal(panelStyles.getPropertyValue("--popover-max-height").trim(), "240px");
  assert.equal(arrow.dataset.popoverArrowSide, "bottom");
  const arrowStyles = getComputedStyle(arrow);
  assert.notEqual(arrowStyles.getPropertyValue("--popover-arrow-top").trim(), "auto");
=======
  assert.equal(panelStyles.maxWidth, "320px");
  assert.equal(panelStyles.maxHeight, "240px");
  assert.equal(arrow.dataset.popoverArrowSide, "bottom");
  const arrowStyles = getComputedStyle(arrow);
  assert.notEqual(arrowStyles.top, "");
>>>>>>> origin/main

  popover.destroy();
});
