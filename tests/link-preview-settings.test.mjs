import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

// Mock Event if not present (unlikely in Node 22, but safe)
if (typeof globalThis.Event === "undefined") {
  globalThis.Event = class Event {
    constructor(type, options = {}) {
      this.type = type;
      this.bubbles = !!options.bubbles;
      this.cancelable = !!options.cancelable;
    }
  };
}

// Mock CustomEvent if not present (Node environment)
if (typeof globalThis.CustomEvent === "undefined") {
  globalThis.CustomEvent = class CustomEvent extends globalThis.Event {
    constructor(type, options = {}) {
      super(type, options);
      this.detail = options.detail || null;
    }
  };
}

// Mock EventTarget methods on window if not present
// setup-localstorage.mjs provides window object but not these methods
if (typeof window.dispatchEvent === "undefined") {
  const listeners = new Map();

  window.addEventListener = (type, handler) => {
    if (!listeners.has(type)) {
      listeners.set(type, new Set());
    }
    listeners.get(type).add(handler);
  };

  window.removeEventListener = (type, handler) => {
    if (listeners.has(type)) {
      listeners.get(type).delete(handler);
    }
  };

  window.dispatchEvent = (event) => {
    const type = event.type;
    if (listeners.has(type)) {
      for (const handler of listeners.get(type)) {
        handler(event);
      }
      return true;
    }
    return false;
  };

  // Helper to clear listeners between tests
  window._clearListeners = () => listeners.clear();
}

// Import the module under test
import {
  getLinkPreviewSettings,
  setLinkPreviewAutoFetch,
  allowLinkPreviewDomain,
  isLinkPreviewDomainAllowed,
  subscribeToLinkPreviewSettings,
} from "../js/utils/linkPreviewSettings.js";

beforeEach(() => {
  window.localStorage.clear();
  if (window._clearListeners) window._clearListeners();
});

test("getLinkPreviewSettings returns default settings when storage is empty", () => {
  const settings = getLinkPreviewSettings();
  assert.equal(settings.autoFetchUnknownDomains, true);
  assert.deepEqual(settings.allowedDomains, []);
});

test("getLinkPreviewSettings parses stored settings correctly", () => {
  const stored = {
    autoFetchUnknownDomains: false,
    allowedDomains: ["example.com", "test.org"],
  };
  window.localStorage.setItem("bitvid:linkPreviewSettings:v1", JSON.stringify(stored));

  const settings = getLinkPreviewSettings();
  assert.equal(settings.autoFetchUnknownDomains, false);
  assert.deepEqual(settings.allowedDomains, ["example.com", "test.org"]);
});

test("getLinkPreviewSettings handles corrupted JSON", () => {
  window.localStorage.setItem("bitvid:linkPreviewSettings:v1", "{invalid-json");

  const settings = getLinkPreviewSettings();
  assert.equal(settings.autoFetchUnknownDomains, true); // Fallback to default
  assert.deepEqual(settings.allowedDomains, []);
});

test("getLinkPreviewSettings sanitizes invalid types in storage", () => {
  const invalidTypes = {
    autoFetchUnknownDomains: "invalid-string", // Should be boolean
    allowedDomains: "not-an-array", // Should be array
  };
  window.localStorage.setItem("bitvid:linkPreviewSettings:v1", JSON.stringify(invalidTypes));

  const settings = getLinkPreviewSettings();
  assert.equal(settings.autoFetchUnknownDomains, true); // Default
  assert.deepEqual(settings.allowedDomains, []); // Default
});

test("getLinkPreviewSettings handles non-object JSON", () => {
  window.localStorage.setItem("bitvid:linkPreviewSettings:v1", "123");

  const settings = getLinkPreviewSettings();
  assert.equal(settings.autoFetchUnknownDomains, true);
  assert.deepEqual(settings.allowedDomains, []);
});

test("setLinkPreviewAutoFetch updates setting and persists", () => {
  const newSettings = setLinkPreviewAutoFetch(false);
  assert.equal(newSettings.autoFetchUnknownDomains, false);

  const stored = JSON.parse(window.localStorage.getItem("bitvid:linkPreviewSettings:v1"));
  assert.equal(stored.autoFetchUnknownDomains, false);
});

test("setLinkPreviewAutoFetch emits event", () => {
  return new Promise((resolve, reject) => {
    subscribeToLinkPreviewSettings((e) => {
      try {
        assert.equal(e.detail.settings.autoFetchUnknownDomains, false);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    setLinkPreviewAutoFetch(false);
  });
});

test("allowLinkPreviewDomain adds domain and persists", () => {
  let settings = allowLinkPreviewDomain("example.com");
  assert.deepEqual(settings.allowedDomains, ["example.com"]);

  settings = allowLinkPreviewDomain("TEST.ORG"); // Should normalize
  assert.deepEqual(settings.allowedDomains, ["example.com", "test.org"]);

  const stored = JSON.parse(window.localStorage.getItem("bitvid:linkPreviewSettings:v1"));
  assert.deepEqual(stored.allowedDomains, ["example.com", "test.org"]);
});

test("allowLinkPreviewDomain ignores duplicates", () => {
  allowLinkPreviewDomain("example.com");
  const settings = allowLinkPreviewDomain("example.com");
  assert.deepEqual(settings.allowedDomains, ["example.com"]);
});

test("allowLinkPreviewDomain respects silent option", () => {
  let eventEmitted = false;
  subscribeToLinkPreviewSettings(() => {
    eventEmitted = true;
  });

  allowLinkPreviewDomain("silent.com", { silent: true });
  assert.equal(eventEmitted, false);

  const settings = getLinkPreviewSettings();
  assert.ok(settings.allowedDomains.includes("silent.com"));
});

test("isLinkPreviewDomainAllowed checks against settings", () => {
  allowLinkPreviewDomain("allowed.com");

  assert.equal(isLinkPreviewDomainAllowed("allowed.com"), true);
  assert.equal(isLinkPreviewDomainAllowed("ALLOWED.COM"), true); // Case insensitive
  assert.equal(isLinkPreviewDomainAllowed("blocked.com"), false);
});

test("isLinkPreviewDomainAllowed checks against provided settings", () => {
  const customSettings = {
    allowedDomains: ["custom.com"],
  };

  assert.equal(isLinkPreviewDomainAllowed("custom.com", customSettings), true);
  assert.equal(isLinkPreviewDomainAllowed("other.com", customSettings), false);
});

test("subscribeToLinkPreviewSettings returns unsubscribe function", () => {
  let callCount = 0;
  const unsubscribe = subscribeToLinkPreviewSettings(() => {
    callCount++;
  });

  setLinkPreviewAutoFetch(false);
  assert.equal(callCount, 1);

  unsubscribe();
  setLinkPreviewAutoFetch(true);
  assert.equal(callCount, 1); // Should not increase
});
