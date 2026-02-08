import assert from "node:assert/strict";
import { test, describe, it } from "node:test";
import { summarizeDmEventForLog, sanitizeDecryptError } from "../../js/nostr/dmDecryptDiagnostics.js";

describe("dmDecryptDiagnostics", () => {
  describe("summarizeDmEventForLog", () => {
    it("should return a default object when event is null or undefined", () => {
      const expected = {
        kind: null,
        createdAt: null,
        hasContent: false,
        contentLength: 0,
        tagCount: 0,
      };
      assert.deepEqual(summarizeDmEventForLog(null), expected);
      assert.deepEqual(summarizeDmEventForLog(undefined), expected);
    });

    it("should return a default object when event is not an object", () => {
      const expected = {
        kind: null,
        createdAt: null,
        hasContent: false,
        contentLength: 0,
        tagCount: 0,
      };
      assert.deepEqual(summarizeDmEventForLog("invalid"), expected);
      assert.deepEqual(summarizeDmEventForLog(123), expected);
    });

    it("should summarize a valid event correctly", () => {
      const event = {
        kind: 4,
        created_at: 1678901234.567,
        content: "test content",
        tags: [["p", "pubkey"], ["e", "eventid"]],
      };
      const expected = {
        kind: 4,
        createdAt: 1678901234, // Math.floor applied
        hasContent: true,
        contentLength: 12,
        tagCount: 2,
      };
      assert.deepEqual(summarizeDmEventForLog(event), expected);
    });

    it("should handle non-finite created_at", () => {
      const event = {
        kind: 4,
        created_at: NaN,
        content: "test",
        tags: [],
      };
      const summary = summarizeDmEventForLog(event);
      assert.strictEqual(summary.createdAt, null);
    });

    it("should handle non-finite kind", () => {
      const event = {
        kind: Infinity,
        created_at: 1000,
        content: "test",
        tags: [],
      };
      const summary = summarizeDmEventForLog(event);
      assert.strictEqual(summary.kind, null);
    });

    it("should handle missing or invalid content", () => {
      const event1 = { kind: 4, created_at: 1000, tags: [] };
      const summary1 = summarizeDmEventForLog(event1);
      assert.strictEqual(summary1.hasContent, false);
      assert.strictEqual(summary1.contentLength, 0);

      const event2 = { kind: 4, created_at: 1000, content: 123, tags: [] };
      const summary2 = summarizeDmEventForLog(event2);
      assert.strictEqual(summary2.hasContent, false);
      assert.strictEqual(summary2.contentLength, 0);
    });

    it("should handle missing or invalid tags", () => {
      const event1 = { kind: 4, created_at: 1000, content: "test" };
      const summary1 = summarizeDmEventForLog(event1);
      assert.strictEqual(summary1.tagCount, 0);

      const event2 = { kind: 4, created_at: 1000, content: "test", tags: "invalid" };
      const summary2 = summarizeDmEventForLog(event2);
      assert.strictEqual(summary2.tagCount, 0);
    });
  });

  describe("sanitizeDecryptError", () => {
    it("should return null when error is null or undefined", () => {
      assert.strictEqual(sanitizeDecryptError(null), null);
      assert.strictEqual(sanitizeDecryptError(undefined), null);
    });

    it("should handle string errors", () => {
      const error = "Something went wrong";
      const expected = {
        name: "",
        code: "",
        message: "Something went wrong",
      };
      assert.deepEqual(sanitizeDecryptError(error), expected);
    });

    it("should handle Error objects with standard properties", () => {
      const error = {
        name: "Error",
        code: "ERR_CODE",
        message: "Error message",
      };
      const expected = {
        name: "Error",
        code: "ERR_CODE",
        message: "Error message",
      };
      assert.deepEqual(sanitizeDecryptError(error), expected);
    });

    it("should handle Error objects with missing properties", () => {
      const error = {
        message: "Just a message",
      };
      const expected = {
        name: "",
        code: "",
        message: "Just a message",
      };
      assert.deepEqual(sanitizeDecryptError(error), expected);
    });

    it("should handle Error objects with non-string properties", () => {
      const error = {
        name: 123,
        code: null,
        message: ["not a string"],
      };
      const expected = {
        name: "",
        code: "",
        message: "",
      };
      assert.deepEqual(sanitizeDecryptError(error), expected);
    });
  });
});
