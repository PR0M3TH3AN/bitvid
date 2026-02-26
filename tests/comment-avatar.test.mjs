import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCommentAvatarKey,
  resolveCommentAvatarAsset,
  registerCommentAvatarFailure,
} from "../js/ui/components/video-modal/utils/commentAvatar.js";

test("normalizeCommentAvatarKey returns empty string for non-string inputs", () => {
  assert.equal(normalizeCommentAvatarKey(null), "");
  assert.equal(normalizeCommentAvatarKey(undefined), "");
  assert.equal(normalizeCommentAvatarKey(123), "");
  assert.equal(normalizeCommentAvatarKey({}), "");
  assert.equal(normalizeCommentAvatarKey([]), "");
});

test("normalizeCommentAvatarKey returns empty string for empty or whitespace-only strings", () => {
  assert.equal(normalizeCommentAvatarKey(""), "");
  assert.equal(normalizeCommentAvatarKey("   "), "");
  assert.equal(normalizeCommentAvatarKey("\t\n"), "");
});

test("normalizeCommentAvatarKey returns normalized lowercased string", () => {
  assert.equal(normalizeCommentAvatarKey("FooBar"), "foobar");
  assert.equal(normalizeCommentAvatarKey("  BazQux  "), "bazqux");
  assert.equal(normalizeCommentAvatarKey("ABC"), "abc");
});

test("resolveCommentAvatarAsset returns default avatar if source is in failures", () => {
  const failures = new Set(["https://example.com/failed.jpg"]);
  const result = resolveCommentAvatarAsset({
    cache: new Map(),
    failures,
    defaultAvatar: "default.png",
    pubkey: "somekey",
    sanitizedPicture: "https://example.com/failed.jpg",
  });

  assert.deepEqual(result, { url: "default.png", source: "" });
});

test("resolveCommentAvatarAsset returns cached asset if pubkey matches and source matches", () => {
  const cache = new Map();
  cache.set("somekey", { url: "cached.jpg", source: "https://example.com/pic.jpg" });

  const result = resolveCommentAvatarAsset({
    cache,
    failures: new Set(),
    defaultAvatar: "default.png",
    pubkey: "somekey",
    sanitizedPicture: "https://example.com/pic.jpg",
  });

  assert.deepEqual(result, { url: "cached.jpg", source: "https://example.com/pic.jpg" });
});

test("resolveCommentAvatarAsset returns cached asset if source is empty", () => {
  const cache = new Map();
  cache.set("somekey", { url: "cached.jpg", source: "https://example.com/pic.jpg" });

  const result = resolveCommentAvatarAsset({
    cache,
    failures: new Set(),
    defaultAvatar: "default.png",
    pubkey: "somekey",
    sanitizedPicture: "",
  });

  assert.deepEqual(result, { url: "cached.jpg", source: "https://example.com/pic.jpg" });
});

test("resolveCommentAvatarAsset updates cache and returns new asset if not cached", () => {
  const cache = new Map();
  const result = resolveCommentAvatarAsset({
    cache,
    failures: new Set(),
    defaultAvatar: "default.png",
    pubkey: "newkey",
    sanitizedPicture: "https://example.com/new.jpg",
  });

  assert.deepEqual(result, { url: "https://example.com/new.jpg", source: "https://example.com/new.jpg" });
  assert.ok(cache.has("newkey"));
  assert.deepEqual(cache.get("newkey"), { url: "https://example.com/new.jpg", source: "https://example.com/new.jpg" });
});

test("resolveCommentAvatarAsset updates cache when source changes for existing key", () => {
  const cache = new Map();
  cache.set("somekey", { url: "old.jpg", source: "https://example.com/old.jpg" });

  const result = resolveCommentAvatarAsset({
    cache,
    failures: new Set(),
    defaultAvatar: "default.png",
    pubkey: "somekey",
    sanitizedPicture: "https://example.com/new.jpg",
  });

  assert.deepEqual(result, { url: "https://example.com/new.jpg", source: "https://example.com/new.jpg" });
  assert.deepEqual(cache.get("somekey"), { url: "https://example.com/new.jpg", source: "https://example.com/new.jpg" });
});

test("resolveCommentAvatarAsset uses default avatar when no source provided", () => {
  const cache = new Map();
  const result = resolveCommentAvatarAsset({
    cache,
    failures: new Set(),
    defaultAvatar: "default.png",
    pubkey: "somekey",
    sanitizedPicture: null,
  });

  assert.deepEqual(result, { url: "default.png", source: "" });
  assert.deepEqual(cache.get("somekey"), { url: "default.png", source: "" });
});

test("registerCommentAvatarFailure ignores invalid or default source urls", () => {
  const failures = new Set();
  const cache = new Map();
  const defaultAvatar = "default.png";

  registerCommentAvatarFailure({ cache, failures, defaultAvatar, sourceUrl: null });
  assert.equal(failures.size, 0);

  registerCommentAvatarFailure({ cache, failures, defaultAvatar, sourceUrl: "" });
  assert.equal(failures.size, 0);

  registerCommentAvatarFailure({ cache, failures, defaultAvatar, sourceUrl: "default.png" });
  assert.equal(failures.size, 0);
});

test("registerCommentAvatarFailure adds source to failures", () => {
  const failures = new Set();
  const cache = new Map();
  const defaultAvatar = "default.png";
  const failedUrl = "https://example.com/fail.jpg";

  registerCommentAvatarFailure({ cache, failures, defaultAvatar, sourceUrl: failedUrl });
  assert.ok(failures.has(failedUrl));
});

test("registerCommentAvatarFailure updates cache entries matching the failed source", () => {
  const failures = new Set();
  const cache = new Map();
  const defaultAvatar = "default.png";
  const failedUrl = "https://example.com/fail.jpg";

  cache.set("user1", { url: failedUrl, source: failedUrl });
  cache.set("user2", { url: "other.jpg", source: "other.jpg" });

  registerCommentAvatarFailure({ cache, failures, defaultAvatar, sourceUrl: failedUrl });

  assert.ok(failures.has(failedUrl));
  assert.deepEqual(cache.get("user1"), { url: defaultAvatar, source: "" });
  assert.deepEqual(cache.get("user2"), { url: "other.jpg", source: "other.jpg" });
});
