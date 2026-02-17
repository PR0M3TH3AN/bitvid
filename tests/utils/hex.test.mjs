import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHexString,
  normalizeHexId,
  normalizeHexPubkey,
  normalizeHexHash,
  HEX64_REGEX,
} from "../../js/utils/hex.js";

describe("hex utils", () => {
  describe("normalizeHexString", () => {
    it("should return empty string for non-string inputs", () => {
      assert.equal(normalizeHexString(undefined), "");
      assert.equal(normalizeHexString(null), "");
      assert.equal(normalizeHexString(123), "");
      assert.equal(normalizeHexString({}), "");
    });

    it("should return empty string for empty or whitespace-only strings", () => {
      assert.equal(normalizeHexString(""), "");
      assert.equal(normalizeHexString("   "), "");
    });

    it("should trim and lowercase valid hex strings", () => {
      assert.equal(normalizeHexString("ABC"), "abc");
      assert.equal(normalizeHexString("  DEF  "), "def");
      assert.equal(normalizeHexString("AbCdEf"), "abcdef");
    });
  });

  describe("aliases", () => {
    it("should export normalizeHexId as an alias", () => {
      assert.equal(normalizeHexId, normalizeHexString);
    });

    it("should export normalizeHexPubkey as an alias", () => {
      assert.equal(normalizeHexPubkey, normalizeHexString);
    });
  });

  describe("HEX64_REGEX", () => {
    it("should match valid 64-character hex strings", () => {
      const validHex = "a".repeat(64);
      assert.match(validHex, HEX64_REGEX);
      const mixedCase = "A".repeat(32) + "b".repeat(32);
      assert.match(mixedCase, HEX64_REGEX);
    });

    it("should not match strings with incorrect length", () => {
      assert.doesNotMatch("a".repeat(63), HEX64_REGEX);
      assert.doesNotMatch("a".repeat(65), HEX64_REGEX);
    });

    it("should not match strings with non-hex characters", () => {
      const invalidChar = "a".repeat(63) + "g";
      assert.doesNotMatch(invalidChar, HEX64_REGEX);
    });

    it("should not match empty strings", () => {
      assert.doesNotMatch("", HEX64_REGEX);
    });
  });

  describe("normalizeHexHash", () => {
    it("should return empty string for non-string inputs", () => {
      assert.equal(normalizeHexHash(null), "");
      assert.equal(normalizeHexHash(undefined), "");
      assert.equal(normalizeHexHash(123), "");
    });

    it("should return empty string for invalid hex", () => {
      assert.equal(normalizeHexHash("invalid"), "");
      assert.equal(normalizeHexHash("g".repeat(64)), "");
    });

    it("should return normalized hex for valid inputs", () => {
      const valid = "A".repeat(64);
      const expected = "a".repeat(64);
      assert.equal(normalizeHexHash(valid), expected);
    });
  });
});
