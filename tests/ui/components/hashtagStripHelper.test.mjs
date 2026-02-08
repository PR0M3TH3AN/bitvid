import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { HashtagStripHelper } from "../../../js/ui/components/hashtagStripHelper.js";

// Capture original global ResizeObserver in case it was polyfilled by setup scripts
const originalGlobalResizeObserver = globalThis.ResizeObserver;

function createDom(options = {}) {
  const dom = new JSDOM("<!DOCTYPE html><body><div id='container'></div></body>", {
    pretendToBeVisual: true,
  });

  const win = dom.window;
  const doc = win.document;

  // Mock RequestAnimationFrame if needed
  if (options.mockRaf) {
    let rafId = 0;
    const pendingRafs = new Map();
    win.requestAnimationFrame = (callback) => {
      rafId++;
      pendingRafs.set(rafId, callback);
      return rafId;
    };
    win.cancelAnimationFrame = (id) => {
      pendingRafs.delete(id);
    };
    win.triggerRaf = () => {
      const callbacks = Array.from(pendingRafs.values());
      pendingRafs.clear();
      callbacks.forEach((cb) => cb());
      return callbacks.length > 0;
    };
  } else if (options.removeRaf) {
    delete win.requestAnimationFrame;
    delete win.cancelAnimationFrame;
  }

  // Mock setTimeout if needed
  if (options.mockTimeout) {
    let timeoutId = 0;
    const pendingTimeouts = new Map();
    win.setTimeout = (callback, delay) => {
      timeoutId++;
      pendingTimeouts.set(timeoutId, callback);
      return timeoutId;
    };
    win.clearTimeout = (id) => {
      pendingTimeouts.delete(id);
    };
    win.triggerTimeout = () => {
      const callbacks = Array.from(pendingTimeouts.values());
      pendingTimeouts.clear();
      callbacks.forEach((cb) => cb());
      return callbacks.length > 0;
    };
  } else if (options.removeTimeout) {
    // JSDOM provides setTimeout by default, remove it if requested
    // Note: removing setTimeout might break other things, so use with caution
    // But for testing fallback path where RAF is missing, we usually want setTimeout available.
    // If we want to test "no RAF, use setTimeout", we remove RAF.
  }

  // Mock ResizeObserver
  let resizeCallback = null;
  let observedElement = null;
  let disconnectCalled = false;

  class MockResizeObserver {
    constructor(callback) {
      resizeCallback = callback;
    }
    observe(element) {
      observedElement = element;
    }
    disconnect() {
      disconnectCalled = true;
      observedElement = null;
    }
  }

  if (options.useResizeObserver) {
    win.ResizeObserver = MockResizeObserver;
  } else {
    delete win.ResizeObserver;
    // Important: HashtagStripHelper falls back to globalThis.ResizeObserver if window.ResizeObserver is missing.
    // We must ensure globalThis.ResizeObserver is also hidden for the fallback tests.
    // We rely on the test case to restore it using t.after().
    if (globalThis.ResizeObserver) {
        delete globalThis.ResizeObserver;
    }
  }

  // Helper to trigger resize from observer
  win.triggerResizeObserver = () => {
    if (resizeCallback && observedElement) {
      resizeCallback([{ target: observedElement }]);
      return true;
    }
    return false;
  };

  // Mock window event listeners for fallback path
  const eventListeners = new Map();
  const originalAddEventListener = win.addEventListener;
  const originalRemoveEventListener = win.removeEventListener;

  win.addEventListener = (event, handler) => {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    eventListeners.get(event).add(handler);
    originalAddEventListener.call(win, event, handler);
  };

  win.removeEventListener = (event, handler) => {
    if (eventListeners.has(event)) {
      eventListeners.get(event).delete(handler);
    }
    originalRemoveEventListener.call(win, event, handler);
  };

  win.getEventListeners = (event) => {
    return eventListeners.get(event) || new Set();
  };

  win.triggerEvent = (eventName) => {
      const event = new win.Event(eventName);
      win.dispatchEvent(event);
  };

  return {
    window: win,
    document: doc,
    ResizeObserver: MockResizeObserver,
    getResizeObserverState: () => ({ resizeCallback, observedElement, disconnectCalled }),
  };
}

test("HashtagStripHelper uses ResizeObserver when available", (t) => {
  const { window, document, getResizeObserverState } = createDom({
    useResizeObserver: true,
  });
  const container = document.getElementById("container");

  const helper = new HashtagStripHelper({ window, document });

  // Initial render with data to setup observer
  helper.mount(container);
  helper.update([{ tags: [["t", "test"]] }]);

  const state = getResizeObserverState();
  assert.ok(state.observedElement === container, "Should observe the container");

  // Spy on render via side effect: _tagStrip reference change
  const initialStrip = helper._tagStrip;
  assert.ok(initialStrip, "Initial strip should be rendered");

  // Trigger resize
  window.triggerResizeObserver();

  assert.notEqual(helper._tagStrip, initialStrip, "Strip should be re-rendered (new element created)");
  assert.ok(helper._tagStrip.isConnected, "New strip should be in the DOM");

  // Teardown
  helper.destroy();
  assert.ok(getResizeObserverState().disconnectCalled, "Should disconnect observer on destroy");
});

test("HashtagStripHelper falls back to window resize with RAF", (t) => {
  t.after(() => {
    if (originalGlobalResizeObserver) {
        globalThis.ResizeObserver = originalGlobalResizeObserver;
    }
  });

  const { window, document } = createDom({
    useResizeObserver: false,
    mockRaf: true,
  });
  const container = document.getElementById("container");

  const helper = new HashtagStripHelper({ window, document });

  helper.mount(container);
  helper.update([{ tags: [["t", "test"]] }]);

  const listeners = window.getEventListeners("resize");
  assert.equal(listeners.size, 1, "Should add window resize listener");

  const initialStrip = helper._tagStrip;
  assert.ok(initialStrip, "Initial strip rendered");

  // Trigger resize event
  window.triggerEvent("resize");

  // Should not re-render immediately (debounced)
  assert.equal(helper._tagStrip, initialStrip, "Should not re-render immediately");

  // Trigger RAF
  const rafTriggered = window.triggerRaf();
  assert.ok(rafTriggered, "RAF callback should have been scheduled");

  // Now it should have re-rendered
  assert.notEqual(helper._tagStrip, initialStrip, "Strip should be re-rendered after RAF");

  // Teardown
  helper.destroy();
  assert.equal(window.getEventListeners("resize").size, 0, "Should remove resize listener on destroy");
});

test("HashtagStripHelper falls back to window resize with setTimeout when RAF is missing", (t) => {
  t.after(() => {
      if (originalGlobalResizeObserver) {
          globalThis.ResizeObserver = originalGlobalResizeObserver;
      }
  });

  const { window, document } = createDom({
    useResizeObserver: false,
    mockRaf: false, // Ensure RAF is missing/removed
    removeRaf: true,
    mockTimeout: true,
  });
  const container = document.getElementById("container");

  const helper = new HashtagStripHelper({ window, document });

  helper.mount(container);
  helper.update([{ tags: [["t", "test"]] }]);

  const listeners = window.getEventListeners("resize");
  assert.equal(listeners.size, 1, "Should add window resize listener");

  const initialStrip = helper._tagStrip;

  // Trigger resize event
  window.triggerEvent("resize");

  // Should not re-render immediately
  assert.equal(helper._tagStrip, initialStrip, "Should not re-render immediately");

  // Trigger Timeout
  const timeoutTriggered = window.triggerTimeout();
  assert.ok(timeoutTriggered, "Timeout callback should have been scheduled");

  // Now it should have re-rendered
  assert.notEqual(helper._tagStrip, initialStrip, "Strip should be re-rendered after timeout");

  // Teardown
  helper.destroy();
  assert.equal(window.getEventListeners("resize").size, 0, "Should remove resize listener on destroy");
});

test("HashtagStripHelper handles teardown correctly", (t) => {
    const { window, document, getResizeObserverState } = createDom({
      useResizeObserver: true,
    });
    const container = document.getElementById("container");

    const helper = new HashtagStripHelper({ window, document });
    helper.mount(container);
    helper.update([{ tags: [["t", "test"]] }]);

    assert.ok(getResizeObserverState().observedElement, "Observed before destroy");

    helper.destroy();

    assert.ok(getResizeObserverState().disconnectCalled, "Disconnected after destroy");
    assert.equal(helper.container, null, "Container reference cleared");
    assert.equal(helper._tagStrip, null, "Tag strip reference cleared");
});
