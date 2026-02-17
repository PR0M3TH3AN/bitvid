import { describe, it, before, after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../test-setup.mjs";

describe("countDiagnostics", () => {
  let countDiagnostics;
  let warnCalls = [];
  let originalConsoleWarn;

  before(async () => {
    // Setup environment before importing modules
    globalThis.__BITVID_DEV_MODE_OVERRIDE__ = true;
    globalThis.__BITVID_VERBOSE_DEV_MODE_OVERRIDE__ = true;

    // Mock console.warn
    originalConsoleWarn = console.warn;
    console.warn = (...args) => {
      warnCalls.push(args);
      // originalConsoleWarn(...args); // Uncomment to see logs
    };

    // Dynamic import to pick up the overrides
    countDiagnostics = await import("../../js/nostr/countDiagnostics.js");
  });

  after(() => {
    if (originalConsoleWarn) {
      console.warn = originalConsoleWarn;
    }
  });

  afterEach(() => {
    warnCalls = [];
    // Reset window flags between tests if needed, though most tests set them explicitly
    if (typeof window !== "undefined") {
      delete window.__BITVID_VERBOSE_DEV_MODE__;
    }
  });

  describe("isVerboseDiagnosticsEnabled", () => {
    it("should return true by default (due to override)", () => {
      assert.equal(countDiagnostics.isVerboseDiagnosticsEnabled(), true);
    });

    it("should return false if window.__BITVID_VERBOSE_DEV_MODE__ is false", () => {
      window.__BITVID_VERBOSE_DEV_MODE__ = false;
      assert.equal(countDiagnostics.isVerboseDiagnosticsEnabled(), false);
    });

    it("should return true if window.__BITVID_VERBOSE_DEV_MODE__ is true", () => {
      window.__BITVID_VERBOSE_DEV_MODE__ = true;
      assert.equal(countDiagnostics.isVerboseDiagnosticsEnabled(), true);
    });

    it("should fall back to isVerboseDevMode if window flag is not boolean", () => {
      window.__BITVID_VERBOSE_DEV_MODE__ = "invalid";
      assert.equal(countDiagnostics.isVerboseDiagnosticsEnabled(), true);

      window.__BITVID_VERBOSE_DEV_MODE__ = 123;
      assert.equal(countDiagnostics.isVerboseDiagnosticsEnabled(), true);
    });
  });

  describe("logRelayCountFailure", () => {
    it("should log warning for new relay URL", () => {
      const relayUrl = "wss://relay.example.com";
      const error = new Error("Connection failed");

      countDiagnostics.logRelayCountFailure(relayUrl, error);

      assert.equal(warnCalls.length, 1);
      assert.match(warnCalls[0][0], /COUNT request failed on wss:\/\/relay.example.com/);
      assert.deepEqual(warnCalls[0][1], error);
    });

    it("should suppress 'Failed to connect to relay' errors", () => {
      const relayUrl = "wss://relay.bad.com";
      const error = new Error("Failed to connect to relay wss://relay.bad.com");

      countDiagnostics.logRelayCountFailure(relayUrl, error);

      assert.equal(warnCalls.length, 0);
    });

    it("should throttle duplicate warnings for the same relay", () => {
      const relayUrl = "wss://relay.throttled.com";
      const error = new Error("Timeout");

      // First call logs
      countDiagnostics.logRelayCountFailure(relayUrl, error);
      assert.equal(warnCalls.length, 1);

      // Second call suppresses
      countDiagnostics.logRelayCountFailure(relayUrl, error);
      assert.equal(warnCalls.length, 1);
    });

    it("should handle empty or non-string relay URLs", () => {
      const error = new Error("Unknown error");

      countDiagnostics.logRelayCountFailure(null, error);
      assert.equal(warnCalls.length, 1);
      assert.match(warnCalls[0][0], /COUNT request failed on \(unknown relay\)/);

      warnCalls = [];
      // This call should be throttled because both null and "" map to "(unknown relay)"
      countDiagnostics.logRelayCountFailure("", error);
      assert.equal(warnCalls.length, 0);
    });
  });

  describe("Other Loggers", () => {
    // These use fixed keys so we can only test them once for "logging" behavior per process/suite run

    it("should log timeout cleanup failure once", () => {
      const error = new Error("Cleanup failed");
      countDiagnostics.logCountTimeoutCleanupFailure(error);

      assert.equal(warnCalls.length, 1);
      assert.match(warnCalls[0][0], /COUNT timeout cleanup failed/);

      // Verify throttling immediately
      countDiagnostics.logCountTimeoutCleanupFailure(error);
      assert.equal(warnCalls.length, 1);
    });

    it("should log rebroadcast failure once", () => {
      const error = new Error("Rebroadcast failed");
      countDiagnostics.logRebroadcastCountFailure(error);

      assert.equal(warnCalls.length, 1);
      assert.match(warnCalls[0][0], /COUNT request for rebroadcast failed/);

      // Verify throttling
      countDiagnostics.logRebroadcastCountFailure(error);
      assert.equal(warnCalls.length, 1);
    });

    it("should log view count failure once", () => {
      const error = new Error("View count failed");
      countDiagnostics.logViewCountFailure(error);

      assert.equal(warnCalls.length, 1);
      assert.match(warnCalls[0][0], /COUNT view request failed/);

      // Verify throttling
      countDiagnostics.logViewCountFailure(error);
      assert.equal(warnCalls.length, 1);
    });
  });

  describe("Verbose Mode Disabled", () => {
    beforeEach(() => {
        window.__BITVID_VERBOSE_DEV_MODE__ = false;
    });

    it("should not log even for new keys when disabled", () => {
      const relayUrl = "wss://relay.silent.com";
      const error = new Error("Silent error");

      countDiagnostics.logRelayCountFailure(relayUrl, error);
      assert.equal(warnCalls.length, 0);
    });

    it("should not consume throttle key when disabled", () => {
      const relayUrl = "wss://relay.delayed.com";
      const error = new Error("Delayed error");

      // Disabled: no log, key not added
      countDiagnostics.logRelayCountFailure(relayUrl, error);
      assert.equal(warnCalls.length, 0);

      // Enable verbose mode
      window.__BITVID_VERBOSE_DEV_MODE__ = true;

      // Should log now because previous call didn't register key
      countDiagnostics.logRelayCountFailure(relayUrl, error);
      assert.equal(warnCalls.length, 1);
      assert.match(warnCalls[0][0], /COUNT request failed on wss:\/\/relay.delayed.com/);
    });
  });
});
