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

function attachFocus(element, activeElementRef) {
  element.focus = () => {
    activeElementRef.active = element;
    if (typeof element.setAttribute === "function") {
      element.setAttribute("data-focused", "true");
    }
  };
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
    `<!DOCTYPE html><html><body data-ds="new"><div id="root"></div></body></html>`,
    {
      pretendToBeVisual: true,
      url: "https://example.com",
    },
  );

  windowRef = dom.window;
  documentRef = windowRef.document;

  windowRef.innerWidth = 320;
  windowRef.innerHeight = 320;
  Object.defineProperty(documentRef.documentElement, "clientWidth", {
    value: 320,
    configurable: true,
  });
  Object.defineProperty(documentRef.documentElement, "clientHeight", {
    value: 320,
    configurable: true,
  });

  global.window = windowRef;
  global.document = documentRef;
  global.HTMLElement = windowRef.HTMLElement;
  global.Element = windowRef.Element;
  global.Node = windowRef.Node;
<<<<<<< HEAD
  global.HTMLStyleElement = windowRef.HTMLStyleElement;
=======
>>>>>>> origin/main
  global.getComputedStyle = windowRef.getComputedStyle.bind(windowRef);
  global.ResizeObserver = StubObserver;
  if (!global.PointerEvent) {
    global.PointerEvent = windowRef.PointerEvent || windowRef.Event;
  }
  windowRef.scrollTo = () => {};
<<<<<<< HEAD
  const rootStyle = documentRef.createElement("style");
  rootStyle.id = "testRootVars";
  rootStyle.textContent = `
    :root {
      --popover-inline-safe-max: calc(100vw - var(--space-xl));
      --overlay-panel-padding-block: 240px;
    }
  `;
  documentRef.head.appendChild(rootStyle);
=======
  documentRef.documentElement.style.setProperty(
    "--popover-inline-safe-max",
    "calc(100vw - var(--space-xl))",
  );
  documentRef.documentElement.style.setProperty(
    "--overlay-panel-padding-block",
    "240px",
  );
>>>>>>> origin/main

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

  register(new URL("./ui/mocks/floating-ui-test-loader.mjs", import.meta.url));

  ({ default: createPopover } = await import("../js/ui/overlay/popoverEngine.js"));
});

afterEach(() => {
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.Element;
  delete global.Node;
  delete global.getComputedStyle;
  delete global.ResizeObserver;
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

test("flips placement when bottom placement would collide with viewport", async () => {
  const trigger = documentRef.createElement("button");
  trigger.id = "trigger";
  trigger.type = "button";
  trigger.textContent = "Open";
  trigger.setAttribute("tabindex", "0");
  documentRef.body.appendChild(trigger);

  const active = { active: null };
  attachFocus(trigger, active);

  setupBoundingClientRect(trigger, {
    x: 180,
    y: 260,
    top: 260,
    bottom: 300,
    left: 180,
    right: 220,
    width: 40,
    height: 40,
  });

  setMockedPosition({ x: 96.3, y: 80.7, placement: "top-start" });

  const popover = createPopover(
    trigger,
    ({ container }) => {
      const panel = documentRef.createElement("div");
      panel.className = "popover__panel card";
      panel.dataset.testPanel = "collision";
      setupBoundingClientRect(panel, {
        x: 0,
        y: 0,
        top: 0,
        bottom: 140,
        left: 0,
        right: 220,
        width: 220,
        height: 140,
      });

      panel.focus = () => {
        active.active = panel;
      };

      const menu = documentRef.createElement("ul");
      menu.className = "menu";
      for (let index = 0; index < 2; index += 1) {
        const item = documentRef.createElement("button");
        item.className = "menu__item";
        item.setAttribute("role", "menuitem");
        item.textContent = `Action ${index + 1}`;
        item.focus = () => {
          active.active = item;
        };
        menu.appendChild(item);
      }
      panel.appendChild(menu);
      container.appendChild(panel);
      return panel;
    },
    { document: documentRef },
  );

  const opened = await popover.open();
  assert.equal(opened, true, "popover should open");

  const panel = documentRef.querySelector('[data-test-panel="collision"]');
  assert.ok(panel, "panel should render");
<<<<<<< HEAD
  const panelStyles = windowRef.getComputedStyle(panel);
  assert.equal(panel.dataset.popoverState, "open");
  assert.equal(panel.dataset.state, "open");
  assert.equal(panel.dataset.popoverPlacement, "top-start");
  assert.equal(panelStyles.getPropertyValue("--popover-strategy").trim(), "fixed");
  assert.equal(panelStyles.getPropertyValue("--popover-left").trim(), "96px");
  assert.equal(panelStyles.getPropertyValue("--popover-top").trim(), "81px");
  assert.equal(
    panelStyles.getPropertyValue("--popover-max-width").trim(),
    "calc(100vw - var(--space-xl))",
  );

  const top = Number.parseInt(panelStyles.getPropertyValue("--popover-top"), 10);
  const left = Number.parseInt(panelStyles.getPropertyValue("--popover-left"), 10);
=======
  assert.equal(panel.dataset.popoverState, "open");
  assert.equal(panel.dataset.state, "open");
  assert.equal(panel.dataset.popoverPlacement, "top-start");
  assert.equal(panel.style.position, "fixed");
  assert.equal(panel.style.left, "96px");
  assert.equal(panel.style.top, "81px");
  assert.equal(panel.style.maxWidth, "calc(100vw - var(--space-xl))");

  const top = Number.parseInt(panel.style.top, 10);
  const left = Number.parseInt(panel.style.left, 10);
>>>>>>> origin/main
  assert.ok(Number.isFinite(top));
  assert.ok(Number.isFinite(left));
  assert.ok(top >= 0, "top should stay within viewport");
  assert.ok(left >= 0, "left should stay within viewport");
  assert.ok(top + panel.offsetHeight <= windowRef.innerHeight);
  assert.ok(left + panel.offsetWidth <= windowRef.innerWidth);

  popover.destroy();
});

test("closes previously open popovers without restoring focus", async () => {
  const container = documentRef.getElementById("root");
  const active = { active: null };

  const createTrigger = (id, rectLeft) => {
    const button = documentRef.createElement("button");
    button.id = id;
    button.type = "button";
    button.textContent = id;
    button.setAttribute("tabindex", "0");
    attachFocus(button, active);
    setupBoundingClientRect(button, {
      x: rectLeft,
      y: 80,
      top: 80,
      bottom: 120,
      left: rectLeft,
      right: rectLeft + 40,
      width: 40,
      height: 40,
    });
    container.appendChild(button);
    return button;
  };

  const triggerA = createTrigger("triggerA", 40);
  const triggerB = createTrigger("triggerB", 160);

  let panelA;
  let panelB;

  const popoverA = createPopover(
    triggerA,
    ({ container: portal }) => {
      const panel = documentRef.createElement("div");
      panel.className = "popover__panel";
      panel.dataset.testPanel = "panel-a";
      setupBoundingClientRect(panel, {
        x: 0,
        y: 0,
        top: 0,
        bottom: 100,
        left: 0,
        right: 160,
        width: 160,
        height: 100,
      });
      panel.focus = () => {
        active.active = panel;
      };
      portal.appendChild(panel);
      panelA = panel;
      return panel;
    },
    { document: documentRef },
  );

  const popoverB = createPopover(
    triggerB,
    ({ container: portal }) => {
      const panel = documentRef.createElement("div");
      panel.className = "popover__panel";
      panel.dataset.testPanel = "panel-b";
      setupBoundingClientRect(panel, {
        x: 0,
        y: 0,
        top: 0,
        bottom: 100,
        left: 0,
        right: 160,
        width: 160,
        height: 100,
      });
      panel.focus = () => {
        active.active = panel;
      };
      portal.appendChild(panel);
      panelB = panel;
      return panel;
    },
    { document: documentRef },
  );

  await popoverA.open();
  assert.equal(popoverA.isOpen(), true);
  assert.equal(triggerA.getAttribute("aria-expanded"), "true");
  assert.equal(panelA?.dataset.popoverState, "open");
  assert.equal(panelA?.dataset.state, "open");

  await popoverB.open();
  assert.equal(popoverB.isOpen(), true);
  assert.equal(triggerB.getAttribute("aria-expanded"), "true");
  assert.equal(panelB?.dataset.popoverState, "open");
  assert.equal(panelB?.dataset.state, "open");

  assert.equal(popoverA.isOpen(), false, "first popover should close");
  assert.equal(triggerA.getAttribute("aria-expanded"), "false");
  assert.equal(panelA?.dataset.popoverState, "closed");
  assert.equal(panelA?.dataset.state, "closed");
  assert.notEqual(active.active, triggerA, "focus should not jump back to first trigger");

  popoverA.destroy();
  popoverB.destroy();
});

test("restores focus to the trigger when closed", async () => {
  const trigger = documentRef.createElement("button");
  trigger.id = "restoreTrigger";
  trigger.type = "button";
  trigger.textContent = "Restore";
  trigger.setAttribute("tabindex", "0");
  documentRef.body.appendChild(trigger);

  const active = { active: null };
  attachFocus(trigger, active);

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

  let firstItem = null;
  const popover = createPopover(
    trigger,
    ({ container }) => {
      const panel = documentRef.createElement("div");
      panel.className = "popover__panel";
      panel.dataset.testPanel = "restore";
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
      panel.focus = () => {
        active.active = panel;
      };

      const menu = documentRef.createElement("ul");
      menu.className = "menu";

      firstItem = documentRef.createElement("button");
      firstItem.className = "menu__item";
      firstItem.setAttribute("role", "menuitem");
      firstItem.textContent = "Play";
      attachFocus(firstItem, active);
      menu.appendChild(firstItem);

      const secondItem = documentRef.createElement("button");
      secondItem.className = "menu__item";
      secondItem.setAttribute("role", "menuitem");
      secondItem.textContent = "Share";
      attachFocus(secondItem, active);
      menu.appendChild(secondItem);

      panel.appendChild(menu);
      container.appendChild(panel);
      return panel;
    },
    { document: documentRef },
  );

  trigger.focus();
  await popover.open();
  assert.equal(popover.isOpen(), true);
  assert.equal(active.active, firstItem);

  const closed = popover.close();
  assert.equal(closed, true);
  assert.equal(popover.isOpen(), false);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(active.active, trigger, "focus should return to trigger");

  popover.destroy();
});
