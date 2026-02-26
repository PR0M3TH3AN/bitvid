import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCommentAvatarKey,
  resolveCommentAvatarAsset,
  registerCommentAvatarFailure,
} from "../js/ui/components/video-modal/utils/commentAvatar.js";

describe("commentAvatar utils", () => {
  describe("normalizeCommentAvatarKey", () => {
    it("should return empty string for non-string inputs", () => {
      assert.equal(normalizeCommentAvatarKey(null), "");
      assert.equal(normalizeCommentAvatarKey(undefined), "");
      assert.equal(normalizeCommentAvatarKey(123), "");
      assert.equal(normalizeCommentAvatarKey({}), "");
    });

    it("should return empty string for empty or whitespace-only strings", () => {
      assert.equal(normalizeCommentAvatarKey(""), "");
      assert.equal(normalizeCommentAvatarKey("   "), "");
      assert.equal(normalizeCommentAvatarKey("\t\n"), "");
    });

    it("should return lowercased string for valid inputs", () => {
      assert.equal(normalizeCommentAvatarKey("TestKey"), "testkey");
      assert.equal(normalizeCommentAvatarKey("  TestKey  "), "testkey");
      assert.equal(normalizeCommentAvatarKey("TESTKEY"), "testkey");
    });
  });

  describe("resolveCommentAvatarAsset", () => {
    const defaultAvatar = "default.png";

    it("should return default avatar if source is in failures", () => {
      const failures = new Set(["bad-source.jpg"]);
      const result = resolveCommentAvatarAsset({
        failures,
        defaultAvatar,
        pubkey: "pubkey1",
        sanitizedPicture: "bad-source.jpg",
      });
      assert.deepEqual(result, { url: defaultAvatar, source: "" });
    });

    it("should return cached data if pubkey is in cache and source matches", () => {
      const cache = new Map();
      cache.set("pubkey1", { url: "cached.jpg", source: "source.jpg" });
      const result = resolveCommentAvatarAsset({
        cache,
        defaultAvatar,
        pubkey: "pubkey1",
        sanitizedPicture: "source.jpg",
      });
      assert.deepEqual(result, { url: "cached.jpg", source: "source.jpg" });
    });

    it("should return cached data if source is empty and pubkey is in cache", () => {
      const cache = new Map();
      cache.set("pubkey1", { url: "cached.jpg", source: "source.jpg" });
      const result = resolveCommentAvatarAsset({
        cache,
        defaultAvatar,
        pubkey: "pubkey1",
        sanitizedPicture: "",
      });
      assert.deepEqual(result, { url: "cached.jpg", source: "source.jpg" });
    });

    it("should update cache and return new source if cache miss (different source)", () => {
      const cache = new Map();
      cache.set("pubkey1", { url: "old.jpg", source: "old-source.jpg" });
      const result = resolveCommentAvatarAsset({
        cache,
        defaultAvatar,
        pubkey: "pubkey1",
        sanitizedPicture: "new-source.jpg",
      });
      assert.deepEqual(result, {
        url: "new-source.jpg",
        source: "new-source.jpg",
      });
      assert.equal(cache.get("pubkey1").url, "new-source.jpg");
      assert.equal(cache.get("pubkey1").source, "new-source.jpg");
    });

    it("should update cache and return new source if cache miss (new pubkey)", () => {
      const cache = new Map();
      const result = resolveCommentAvatarAsset({
        cache,
        defaultAvatar,
        pubkey: "pubkey2",
        sanitizedPicture: "source.jpg",
      });
      assert.deepEqual(result, { url: "source.jpg", source: "source.jpg" });
      assert.equal(cache.get("pubkey2").url, "source.jpg");
    });

    it("should return default avatar if source is missing and not cached", () => {
      const cache = new Map();
      const result = resolveCommentAvatarAsset({
        cache,
        defaultAvatar,
        pubkey: "pubkey3",
        sanitizedPicture: "",
      });
      assert.deepEqual(result, { url: defaultAvatar, source: "" });
      assert.deepEqual(cache.get("pubkey3"), { url: defaultAvatar, source: "" });
    });
  });

  describe("registerCommentAvatarFailure", () => {
    const defaultAvatar = "default.png";

    it("should ignore invalid inputs", () => {
      const failures = new Set();
      registerCommentAvatarFailure({ failures, defaultAvatar, sourceUrl: null });
      registerCommentAvatarFailure({ failures, defaultAvatar, sourceUrl: "" });
      registerCommentAvatarFailure({
        failures,
        defaultAvatar,
        sourceUrl: defaultAvatar,
      });
      assert.equal(failures.size, 0);
    });

    it("should add valid source to failures", () => {
      const failures = new Set();
      registerCommentAvatarFailure({
        failures,
        defaultAvatar,
        sourceUrl: "bad.jpg",
      });
      assert.ok(failures.has("bad.jpg"));
    });

    it("should update cache entries matching the failed source", () => {
      const failures = new Set();
      const cache = new Map();
      cache.set("pubkey1", { url: "bad.jpg", source: "bad.jpg" });
      cache.set("pubkey2", { url: "good.jpg", source: "good.jpg" });

      registerCommentAvatarFailure({
        cache,
        failures,
        defaultAvatar,
        sourceUrl: "bad.jpg",
      });

      assert.ok(failures.has("bad.jpg"));
      assert.deepEqual(cache.get("pubkey1"), {
        url: defaultAvatar,
        source: "",
      });
      assert.deepEqual(cache.get("pubkey2"), {
        url: "good.jpg",
        source: "good.jpg",
      });
    });
  });
});
