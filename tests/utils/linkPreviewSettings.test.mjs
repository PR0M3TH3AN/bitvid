import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../test-setup.mjs";

// Ensure JSDOM Event constructors are available globally so the module uses them
globalThis.CustomEvent = window.CustomEvent;
globalThis.Event = window.Event;

import {
  getLinkPreviewSettings,
  setLinkPreviewAutoFetch,
  allowLinkPreviewDomain,
  isLinkPreviewDomainAllowed,
  subscribeToLinkPreviewSettings,
} from "../../js/utils/linkPreviewSettings.js";

const STORAGE_KEY = "bitvid:linkPreviewSettings:v1";

describe("linkPreviewSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe("getLinkPreviewSettings", () => {
    it("returns defaults when storage is empty", () => {
      const settings = getLinkPreviewSettings();
      assert.deepEqual(settings, {
        autoFetchUnknownDomains: true,
        allowedDomains: [],
      });
    });

    it("returns stored settings", () => {
      const stored = {
        autoFetchUnknownDomains: false,
        allowedDomains: ["example.com"],
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      const settings = getLinkPreviewSettings();
      assert.deepEqual(settings, stored);
    });

    it("returns defaults when storage is invalid", () => {
      window.localStorage.setItem(STORAGE_KEY, "invalid-json");
      const settings = getLinkPreviewSettings();
      assert.deepEqual(settings, {
        autoFetchUnknownDomains: true,
        allowedDomains: [],
      });
    });

    it("sanitizes settings from storage", () => {
      const stored = {
        autoFetchUnknownDomains: "invalid-boolean", // Should default to true
        allowedDomains: ["example.com", 123, null], // Should filter non-strings
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      const settings = getLinkPreviewSettings();
      assert.equal(settings.autoFetchUnknownDomains, true);
      assert.deepEqual(settings.allowedDomains, ["example.com"]);
    });
  });

  describe("setLinkPreviewAutoFetch", () => {
    it("updates settings and persists to storage", () => {
      const newSettings = setLinkPreviewAutoFetch(false);
      assert.equal(newSettings.autoFetchUnknownDomains, false);

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      assert.equal(stored.autoFetchUnknownDomains, false);
    });

    it("emits an event on change", (t) => {
      let emittedSettings;
      const handler = (e) => {
        emittedSettings = e.detail.settings;
      };
      window.addEventListener("bitvid:link-preview-settings", handler);

      setLinkPreviewAutoFetch(false);

      assert.ok(emittedSettings);
      assert.equal(emittedSettings.autoFetchUnknownDomains, false);

      window.removeEventListener("bitvid:link-preview-settings", handler);
    });
  });

  describe("allowLinkPreviewDomain", () => {
    it("adds a domain and persists to storage", () => {
      const domain = "example.com";
      const newSettings = allowLinkPreviewDomain(domain);
      assert.ok(newSettings.allowedDomains.includes(domain));

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      assert.ok(stored.allowedDomains.includes(domain));
    });

    it("handles duplicates", () => {
      allowLinkPreviewDomain("example.com");
      const newSettings = allowLinkPreviewDomain("example.com");
      assert.equal(newSettings.allowedDomains.length, 1);
    });

    it("normalizes domains", () => {
      const domain = "  EXAMPLE.COM  ";
      const newSettings = allowLinkPreviewDomain(domain);
      assert.ok(newSettings.allowedDomains.includes("example.com"));
    });

    it("emits an event on change", (t) => {
      let emittedSettings;
      const handler = (e) => {
        emittedSettings = e.detail.settings;
      };
      window.addEventListener("bitvid:link-preview-settings", handler);

      allowLinkPreviewDomain("example.com");

      assert.ok(emittedSettings);
      assert.ok(emittedSettings.allowedDomains.includes("example.com"));

      window.removeEventListener("bitvid:link-preview-settings", handler);
    });

    it("respects silent option", (t) => {
      let emitted = false;
      const handler = () => {
        emitted = true;
      };
      window.addEventListener("bitvid:link-preview-settings", handler);

      allowLinkPreviewDomain("silent.com", { silent: true });

      assert.equal(emitted, false);

      window.removeEventListener("bitvid:link-preview-settings", handler);
    });
  });

  describe("isLinkPreviewDomainAllowed", () => {
    it("returns true for allowed domains", () => {
      allowLinkPreviewDomain("example.com");
      assert.equal(isLinkPreviewDomainAllowed("example.com"), true);
    });

    it("returns false for disallowed domains", () => {
      assert.equal(isLinkPreviewDomainAllowed("example.com"), false);
    });

    it("handles normalization", () => {
      allowLinkPreviewDomain("example.com");
      assert.equal(isLinkPreviewDomainAllowed("EXAMPLE.COM"), true);
    });

    it("accepts settings object as second argument", () => {
      const settings = { allowedDomains: ["manual.com"] };
      assert.equal(isLinkPreviewDomainAllowed("manual.com", settings), true);
    });
  });

  describe("subscribeToLinkPreviewSettings", () => {
    it("calls callback on event emission", (t) => {
      let receivedSettings;
      const unsubscribe = subscribeToLinkPreviewSettings((e) => {
        receivedSettings = e.detail.settings;
      });

      setLinkPreviewAutoFetch(false);

      assert.ok(receivedSettings);
      assert.equal(receivedSettings.autoFetchUnknownDomains, false);

      unsubscribe();
    });

    it("unsubscribes correctly", (t) => {
      let callCount = 0;
      const unsubscribe = subscribeToLinkPreviewSettings(() => {
        callCount++;
      });

      setLinkPreviewAutoFetch(false);
      assert.equal(callCount, 1);

      unsubscribe();
      setLinkPreviewAutoFetch(true);
      assert.equal(callCount, 1);
    });
  });
});
