import assert from "node:assert/strict";
import { test, describe, it, before, after, beforeEach } from "node:test";
import { shouldSuppressWarning, collectCandidateStrings } from "../../js/nostr/maxListenerDiagnostics.js";

// Helper to control verbose mode mock
function setVerboseMode(enabled) {
  if (!globalThis.window) {
    globalThis.window = {};
  }
  globalThis.window.__BITVID_VERBOSE_DEV_MODE__ = enabled;
}

describe("maxListenerDiagnostics", () => {
  let originalWindow;

  before(() => {
    originalWindow = globalThis.window;
  });

  after(() => {
    globalThis.window = originalWindow;
  });

  beforeEach(() => {
     // Default to non-verbose for most tests
     setVerboseMode(false);
  });

  describe("collectCandidateStrings", () => {
    it("should return empty array for null/undefined/falsy", () => {
      assert.deepEqual(collectCandidateStrings(null), []);
      assert.deepEqual(collectCandidateStrings(undefined), []);
      assert.deepEqual(collectCandidateStrings(false), []);
      assert.deepEqual(collectCandidateStrings(0), []);
    });

    it("should return array with string for string input", () => {
      assert.deepEqual(collectCandidateStrings("test warning"), ["test warning"]);
    });

    it("should extract relevant fields from object", () => {
      const errorObj = {
        name: "ErrorName",
        message: "ErrorMessage",
        code: "ErrorCode",
        type: "ErrorType",
        other: "OtherField"
      };
      const result = collectCandidateStrings(errorObj);
      assert.ok(result.includes("ErrorName"));
      assert.ok(result.includes("ErrorMessage"));
      assert.ok(result.includes("ErrorCode"));
      assert.ok(result.includes("ErrorType"));
      assert.ok(!result.includes("OtherField"));
      assert.equal(result.length, 4);
    });

    it("should ignore non-string fields in object", () => {
       const errorObj = {
        message: 123,
        code: null
      };
      assert.deepEqual(collectCandidateStrings(errorObj), []);
    });
  });

  describe("shouldSuppressWarning", () => {
    it("should NOT suppress anything if verbose mode is enabled", () => {
      setVerboseMode(true);
      assert.equal(shouldSuppressWarning("MaxListenersExceededWarning"), false);
      assert.equal(shouldSuppressWarning({ code: "MaxListenersExceededWarning" }), false);
    });

    it("should suppress warning by code string", () => {
      setVerboseMode(false);
      assert.equal(shouldSuppressWarning("MaxListenersExceededWarning"), true);
    });

    it("should suppress warning by object code property", () => {
      setVerboseMode(false);
      assert.equal(shouldSuppressWarning({ code: "MaxListenersExceededWarning" }), true);
    });

    it("should suppress warning by message snippet", () => {
      setVerboseMode(false);
      assert.equal(shouldSuppressWarning("Possible EventEmitter memory leak detected. 11 listeners added."), true);
    });

    it("should suppress warning by object message property snippet", () => {
      setVerboseMode(false);
      assert.equal(shouldSuppressWarning({ message: "Possible EventEmitter memory leak detected" }), true);
    });

    it("should NOT suppress unrelated warnings", () => {
      setVerboseMode(false);
      assert.equal(shouldSuppressWarning("Some other warning"), false);
      assert.equal(shouldSuppressWarning({ message: "Some other warning" }), false);
    });

    it("should handle multiple arguments", () => {
        setVerboseMode(false);
        // First arg unrelated, second arg matching
        assert.equal(shouldSuppressWarning("unrelated", { code: "MaxListenersExceededWarning" }), true);
        // Both unrelated
        assert.equal(shouldSuppressWarning("unrelated", "also unrelated"), false);
    });
  });

  describe("process.emitWarning patch", () => {
      it("should have patched process.emitWarning", () => {
          assert.ok(process.emitWarning.__BITVID_MAX_LISTENER_PATCHED__, "process.emitWarning should be patched");
      });
  });
});
