import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import createPopover from "../js/ui/overlay/popoverEngine.js";

function createFloatingUiMock() {
  const baseDefaults = {
    x: 96,
    y: 136,
    placement: "bottom-start",
    strategy: "fixed",
    middlewareData: {},
  };

  const state = {
    defaultPosition: { ...baseDefaults },
    nextPosition: null,
    computePositionCalls: [],
    autoUpdateCalls: [],
    autoUpdateCleanupCalls: 0,
  };

  return {
    state,
    reset() {
      state.defaultPosition = { ...baseDefaults };
      state.nextPosition = null;
      state.computePositionCalls = [];
      state.autoUpdateCalls = [];
      state.autoUpdateCleanupCalls = 0;
    },
    queueResult(overrides = {}) {
      state.nextPosition = {
        ...state.defaultPosition,
        ...overrides,
        middlewareData: {
          ...(state.defaultPosition.middlewareData || {}),
          ...(overrides.middlewareData || {}),
        },
      };
    },
    api: {
      arrow: (options = {}) => ({ name: "arrow", options }),
      offset: (value = 0) => ({ name: "offset", options: value }),
      flip: (options = {}) => ({ name: "flip", options }),
      shift: (options = {}) => ({ name: "shift", options }),
      autoUpdate: (...args) => {
        state.autoUpdateCalls.push(args);
        return () => {
          state.autoUpdateCleanupCalls += 1;
        };
      },
      computePosition: async (...args) => {
        state.computePositionCalls.push(args);
        const result = state.nextPosition || state.defaultPosition;
        state.nextPosition = null;
        return result;
      },
    },
  };
}

const floatingUiMock = createFloatingUiMock();

function resetFloatingUiMock() {
  floatingUiMock.reset();
}

function queueComputePositionResult(overrides = {}) {
  floatingUiMock.queueResult(overrides);
}

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

function attachFocus(element, activeElementRef) {
  element.focus = () => {
    activeElementRef.active = element;
    if (typeof element.setAttribute === "function") {
      element.setAttribute("data-focused", "true");
    }
  };
}

beforeEach(() => {
  resetFloatingUiMock();

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
    { document: documentRef, floatingUi: floatingUiMock.api },
  );

  queueComputePositionResult({
    x: 84.5,
    y: 92.4,
    placement: "top-start",
    strategy: "fixed",
    middlewareData: {},
  });

  const opened = await popover.open();
  assert.equal(opened, true, "popover should open");

  const panel = documentRef.querySelector('[data-test-panel="collision"]');
  assert.ok(panel, "panel should render");
  assert.equal(panel.dataset.popoverState, "open");
  assert.equal(panel.dataset.state, "open");
  assert.equal(panel.dataset.popoverPlacement, "top-start");
  assert.equal(panel.style.position, "fixed");
  assert.equal(panel.style.maxWidth, "calc(100vw - var(--space-xl))");

  const top = Number.parseInt(panel.style.top, 10);
  const left = Number.parseInt(panel.style.left, 10);
  assert.ok(Number.isFinite(top));
  assert.ok(Number.isFinite(left));
  assert.equal(top, Math.round(92.4));
  assert.equal(left, Math.round(84.5));
  assert.ok(top >= 0, "top should stay within viewport");
  assert.ok(left >= 0, "left should stay within viewport");
  assert.ok(top + panel.offsetHeight <= windowRef.innerHeight);
  assert.ok(left + panel.offsetWidth <= windowRef.innerWidth);

  popover.destroy();
});

test("aligns bottom-end panels with their trigger's right edge", async () => {
  const trigger = documentRef.createElement("button");
  trigger.id = "trigger";
  trigger.type = "button";
  trigger.textContent = "Open";
  trigger.setAttribute("tabindex", "0");
  documentRef.body.appendChild(trigger);

  const triggerRect = {
    x: 220,
    y: 180,
    top: 180,
    bottom: 220,
    left: 220,
    right: 268,
    width: 48,
    height: 40,
  };

  setupBoundingClientRect(trigger, triggerRect);

  const popover = createPopover(
    trigger,
    ({ container }) => {
      const panel = documentRef.createElement("div");
      panel.className = "popover__panel card";
      panel.dataset.testPanel = "alignment";
      const panelRect = {
        x: 0,
        y: 0,
        top: 0,
        bottom: 160,
        left: 0,
        right: 220,
        width: 220,
        height: 160,
      };
      setupBoundingClientRect(panel, panelRect);
      container.appendChild(panel);
      return panel;
    },
    { document: documentRef, placement: "bottom-end", floatingUi: floatingUiMock.api },
  );

  const panelWidth = 220;
  const expectedLeft = triggerRect.right - panelWidth;

  queueComputePositionResult({
    x: expectedLeft,
    y: triggerRect.bottom + 12,
    placement: "bottom-end",
    strategy: "fixed",
    middlewareData: {},
  });

  const opened = await popover.open();
  assert.equal(opened, true, "popover should open");

  const panel = documentRef.querySelector('[data-test-panel="alignment"]');
  assert.ok(panel, "panel should render");
  assert.equal(panel.dataset.popoverPlacement, "bottom-end");

  const left = Number.parseInt(panel.style.left, 10);
  const top = Number.parseInt(panel.style.top, 10);
  assert.equal(left, Math.round(expectedLeft));
  assert.equal(top, Math.round(triggerRect.bottom + 12));

  const panelRight = left + panel.offsetWidth;
  const triggerRight = Math.round(triggerRect.right);
  assert.equal(panelRight, triggerRight);

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
    { document: documentRef, floatingUi: floatingUiMock.api },
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
    { document: documentRef, floatingUi: floatingUiMock.api },
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
    { document: documentRef, floatingUi: floatingUiMock.api },
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
