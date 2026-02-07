import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCommentAvatarKey,
  resolveCommentAvatarAsset,
  registerCommentAvatarFailure,
} from "../../js/ui/components/video-modal/utils/commentAvatar.js";

test("normalizeCommentAvatarKey handles inputs correctly", () => {
  // Non-string inputs
  assert.equal(normalizeCommentAvatarKey(null), "");
  assert.equal(normalizeCommentAvatarKey(undefined), "");
  assert.equal(normalizeCommentAvatarKey(123), "");
  assert.equal(normalizeCommentAvatarKey({}), "");

  // Whitespace
  assert.equal(normalizeCommentAvatarKey("  ABC  "), "abc");
  assert.equal(normalizeCommentAvatarKey("\tXYZ\n"), "xyz");

  // Empty string
  assert.equal(normalizeCommentAvatarKey(""), "");
  assert.equal(normalizeCommentAvatarKey("   "), "");

  // Lowercase
  assert.equal(normalizeCommentAvatarKey("HeLLo"), "hello");
});

test("resolveCommentAvatarAsset resolves avatars correctly", () => {
  const defaultAvatar = "default.png";
  const pubkey = "pk1";
  const sanitizedPicture = "https://example.com/avatar.png";

  // Scenario 1: Basic resolution (no cache, no failures)
  let result = resolveCommentAvatarAsset({
    cache: new Map(),
    failures: new Set(),
    defaultAvatar,
    pubkey,
    sanitizedPicture,
  });
  assert.deepEqual(result, { url: sanitizedPicture, source: sanitizedPicture });

  // Scenario 2: Missing picture
  result = resolveCommentAvatarAsset({
    cache: new Map(),
    failures: new Set(),
    defaultAvatar,
    pubkey,
    sanitizedPicture: null,
  });
  assert.deepEqual(result, { url: defaultAvatar, source: "" });

  // Scenario 3: Known failure
  const failures = new Set([sanitizedPicture]);
  result = resolveCommentAvatarAsset({
    cache: new Map(),
    failures,
    defaultAvatar,
    pubkey,
    sanitizedPicture,
  });
  assert.deepEqual(result, { url: defaultAvatar, source: "" });

  // Scenario 4: Cache hit (matching source)
  const cache = new Map();
  cache.set(pubkey, { url: sanitizedPicture, source: sanitizedPicture });
  result = resolveCommentAvatarAsset({
    cache,
    failures: new Set(),
    defaultAvatar,
    pubkey,
    sanitizedPicture,
  });
  assert.deepEqual(result, { url: sanitizedPicture, source: sanitizedPicture });

  // Scenario 5: Cache hit (source mismatch - new avatar)
  const newPicture = "https://example.com/new.png";
  result = resolveCommentAvatarAsset({
    cache, // cache has old picture
    failures: new Set(),
    defaultAvatar,
    pubkey,
    sanitizedPicture: newPicture,
  });
  assert.deepEqual(result, { url: newPicture, source: newPicture });
  // Verify cache update
  assert.deepEqual(cache.get(pubkey), { url: newPicture, source: newPicture });

  // Scenario 6: Cache hit (source mismatch - removed avatar)
  // Note: Implementation preserves cached avatar if input is empty (persistence)
  result = resolveCommentAvatarAsset({
    cache, // cache has new picture
    failures: new Set(),
    defaultAvatar,
    pubkey,
    sanitizedPicture: "", // avatar removed or missing
  });
  assert.deepEqual(result, { url: newPicture, source: newPicture });
  // Verify cache remains unchanged
  assert.deepEqual(cache.get(pubkey), { url: newPicture, source: newPicture });

  // Scenario 7: Cache hit (cached failure)
  cache.set(pubkey, { url: defaultAvatar, source: "" });
  result = resolveCommentAvatarAsset({
    cache,
    failures: new Set(),
    defaultAvatar,
    pubkey,
    sanitizedPicture: "", // no new picture provided
  });
  assert.deepEqual(result, { url: defaultAvatar, source: "" });
});

test("registerCommentAvatarFailure registers failures correctly", () => {
  const defaultAvatar = "default.png";
  const sourceUrl = "https://example.com/bad.png";

  // Scenario 1: Basic failure registration
  const failures = new Set();
  const cache = new Map();
  registerCommentAvatarFailure({
    cache,
    failures,
    defaultAvatar,
    sourceUrl,
  });
  assert.ok(failures.has(sourceUrl));

  // Scenario 2: Cache invalidation on failure
  cache.set("pk1", { url: sourceUrl, source: sourceUrl });
  cache.set("pk2", {
    url: "https://example.com/good.png",
    source: "https://example.com/good.png",
  });

  registerCommentAvatarFailure({
    cache,
    failures,
    defaultAvatar,
    sourceUrl,
  });

  // Should update pk1 to default
  assert.deepEqual(cache.get("pk1"), { url: defaultAvatar, source: "" });
  // Should keep pk2
  assert.deepEqual(cache.get("pk2"), {
    url: "https://example.com/good.png",
    source: "https://example.com/good.png",
  });

  // Scenario 3: Ignore invalid inputs
  const failures2 = new Set();
  registerCommentAvatarFailure({
    cache: new Map(),
    failures: failures2,
    defaultAvatar,
    sourceUrl: "",
  });
  assert.equal(failures2.size, 0);

  registerCommentAvatarFailure({
    cache: new Map(),
    failures: failures2,
    defaultAvatar,
    sourceUrl: defaultAvatar,
  });
  assert.equal(failures2.size, 0);

  registerCommentAvatarFailure({
    cache: new Map(),
    failures: failures2,
    defaultAvatar,
    sourceUrl: null,
  });
  assert.equal(failures2.size, 0);
});
