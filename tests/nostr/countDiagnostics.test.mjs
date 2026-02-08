import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../test-setup.mjs";

// Setup globals before importing any module
globalThis.__BITVID_DEV_MODE_OVERRIDE__ = true;
globalThis.__BITVID_VERBOSE_DEV_MODE_OVERRIDE__ = false;

// Mock console.warn BEFORE importing logger so consoleAdapter binds to our mock
let warnCalls = [];
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  warnCalls.push(args);
};

// Force initial import to ensure logger binds to our mock
await import("../../js/nostr/countDiagnostics.js");

describe("countDiagnostics", () => {
  let countDiagnosticsModule;

  after(() => {
    console.warn = originalConsoleWarn;
  });

  beforeEach(async () => {
    warnCalls = [];
    window.__BITVID_VERBOSE_DEV_MODE__ = undefined;

    // Reload module to get fresh state (empty seenWarningKeys)
    // Use unique timestamp to bust module cache
    // Note: This relies on Node.js module caching behavior where query params create new module instances
    countDiagnosticsModule = await import(`../../js/nostr/countDiagnostics.js?t=${Date.now()}-${Math.random()}`);
  });

  describe("isVerboseDiagnosticsEnabled", () => {
    it("should return false by default (when override is false and window flag is undefined)", () => {
      assert.equal(countDiagnosticsModule.isVerboseDiagnosticsEnabled(), false);
    });

    it("should return true when window.__BITVID_VERBOSE_DEV_MODE__ is true", () => {
      window.__BITVID_VERBOSE_DEV_MODE__ = true;
      assert.equal(countDiagnosticsModule.isVerboseDiagnosticsEnabled(), true);
    });

    it("should return false when window.__BITVID_VERBOSE_DEV_MODE__ is false", () => {
      window.__BITVID_VERBOSE_DEV_MODE__ = false;
      assert.equal(countDiagnosticsModule.isVerboseDiagnosticsEnabled(), false);
    });

    it("should fallback to config default if window flag is not boolean", () => {
      window.__BITVID_VERBOSE_DEV_MODE__ = "invalid";
      assert.equal(countDiagnosticsModule.isVerboseDiagnosticsEnabled(), false);
    });
  });

  describe("Logging Functions", () => {
    it("should NOT log when verbose mode is disabled", () => {
      window.__BITVID_VERBOSE_DEV_MODE__ = false;
      const {
        logCountTimeoutCleanupFailure,
        logRelayCountFailure,
        logRebroadcastCountFailure,
        logViewCountFailure
      } = countDiagnosticsModule;

      logCountTimeoutCleanupFailure(new Error("test error"));
      logRelayCountFailure("wss://relay1.com", new Error("test error"));
      logRebroadcastCountFailure(new Error("test error"));
      logViewCountFailure(new Error("test error"));

      assert.equal(warnCalls.length, 0, "Should not log when verbose mode is disabled");
    });

    it("should log when verbose mode is enabled", () => {
      window.__BITVID_VERBOSE_DEV_MODE__ = true;
      const {
        logCountTimeoutCleanupFailure,
        logRelayCountFailure,
        logRebroadcastCountFailure,
        logViewCountFailure
      } = countDiagnosticsModule;

      // 1. logCountTimeoutCleanupFailure
      logCountTimeoutCleanupFailure(new Error("cleanup error"));
      assert.equal(warnCalls.length, 1);
      assert.match(warnCalls[0][0], /cleanup failed/);

      // 2. logRelayCountFailure
      logRelayCountFailure("wss://relay-enabled.com", new Error("relay error"));
      assert.equal(warnCalls.length, 2);
      assert.match(warnCalls[1][0], /request failed on wss:\/\/relay-enabled\.com/);

      // 3. logRebroadcastCountFailure
      logRebroadcastCountFailure(new Error("rebroadcast error"));
      assert.equal(warnCalls.length, 3);
      assert.match(warnCalls[2][0], /rebroadcast failed/);

      // 4. logViewCountFailure
      logViewCountFailure(new Error("view error"));
      assert.equal(warnCalls.length, 4);
      assert.match(warnCalls[3][0], /view request failed/);
    });

    it("should throttle repeated logs", () => {
      window.__BITVID_VERBOSE_DEV_MODE__ = true;
      const {
        logCountTimeoutCleanupFailure,
        logRelayCountFailure,
        logRebroadcastCountFailure,
        logViewCountFailure
      } = countDiagnosticsModule;

      // First calls should log
      logCountTimeoutCleanupFailure(new Error("cleanup error"));
      logRelayCountFailure("wss://relay-throttled.com", new Error("relay error"));
      logRebroadcastCountFailure(new Error("rebroadcast error"));
      logViewCountFailure(new Error("view error"));

      assert.equal(warnCalls.length, 4, "Initial calls should log");
      const initialLogs = [...warnCalls];
      warnCalls = []; // Clear log buffer

      // Repeated calls should throttle
      logCountTimeoutCleanupFailure(new Error("cleanup error again"));
      logRelayCountFailure("wss://relay-throttled.com", new Error("relay error again"));
      logRebroadcastCountFailure(new Error("rebroadcast error again"));
      logViewCountFailure(new Error("view error again"));

      assert.equal(warnCalls.length, 0, "Repeated calls should be throttled");
    });

    it("should log distinct relay failures separately (different keys)", () => {
      window.__BITVID_VERBOSE_DEV_MODE__ = true;
      const { logRelayCountFailure } = countDiagnosticsModule;

      logRelayCountFailure("wss://relay-1.com", new Error("relay error 1"));
      assert.equal(warnCalls.length, 1);
      assert.match(warnCalls[0][0], /wss:\/\/relay-1\.com/);

      warnCalls = [];
      logRelayCountFailure("wss://relay-2.com", new Error("relay error 2"));
      assert.equal(warnCalls.length, 1);
      assert.match(warnCalls[0][0], /wss:\/\/relay-2\.com/);
    });

    it("should suppress 'Failed to connect to relay' errors", () => {
      window.__BITVID_VERBOSE_DEV_MODE__ = true;
      const { logRelayCountFailure } = countDiagnosticsModule;

      logRelayCountFailure("wss://relay-fail.com", new Error("Failed to connect to relay wss://relay-fail.com"));
      assert.equal(warnCalls.length, 0, "Should suppress connection errors");

      // Also test with object that has message
      logRelayCountFailure("wss://relay-fail-obj.com", { message: "Failed to connect to relay wss://relay-fail-obj.com" });
      assert.equal(warnCalls.length, 0, "Should suppress connection errors (object)");
    });
  });
});
