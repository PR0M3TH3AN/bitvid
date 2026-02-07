import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeStoragePointer,
  parseStoragePointer,
  buildStoragePointerValue,
  deriveStoragePrefixFromUrl,
  deriveStoragePointerFromUrl,
  buildStoragePrefixFromKey,
  getStoragePointerFromTags,
  resolveInfoJsonUrl,
} from "../../js/utils/storagePointer.js";

test("normalizeStoragePointer: trims whitespace and handles non-string inputs", () => {
  assert.equal(normalizeStoragePointer("  some-pointer  "), "some-pointer");
  assert.equal(normalizeStoragePointer("already-trimmed"), "already-trimmed");
  assert.equal(normalizeStoragePointer("   "), "");
  assert.equal(normalizeStoragePointer(""), "");
  assert.equal(normalizeStoragePointer(null), "");
  assert.equal(normalizeStoragePointer(undefined), "");
  assert.equal(normalizeStoragePointer(123), "");
  assert.equal(normalizeStoragePointer({}), "");
});

test("parseStoragePointer: parses valid pointer strings", () => {
  assert.deepEqual(parseStoragePointer("s3:my-prefix"), {
    provider: "s3",
    prefix: "my-prefix",
  });
  assert.deepEqual(parseStoragePointer("  R2:some/path  "), {
    provider: "r2",
    prefix: "some/path",
  });
  assert.deepEqual(parseStoragePointer("URL:https://example.com"), {
    provider: "url",
    prefix: "https://example.com",
  });
});

test("parseStoragePointer: returns null for invalid formats", () => {
  assert.equal(parseStoragePointer("no-separator"), null);
  assert.equal(parseStoragePointer(":no-provider"), null);
  assert.equal(parseStoragePointer("no-prefix:"), null);
  assert.equal(parseStoragePointer("   :   "), null);
  assert.equal(parseStoragePointer(""), null);
  assert.equal(parseStoragePointer(null), null);
});

test("buildStoragePointerValue: builds pointer string from object", () => {
  assert.equal(
    buildStoragePointerValue({ provider: "s3", prefix: "my-prefix" }),
    "s3:my-prefix"
  );
  assert.equal(
    buildStoragePointerValue({ provider: "  R2  ", prefix: "path/to/file" }),
    "r2:path/to/file"
  );
});

test("buildStoragePointerValue: returns empty string for invalid inputs", () => {
  assert.equal(buildStoragePointerValue({ provider: "s3" }), "");
  assert.equal(buildStoragePointerValue({ prefix: "my-prefix" }), "");
  assert.equal(buildStoragePointerValue({}), "");
  assert.equal(buildStoragePointerValue(), "");
});

test("deriveStoragePrefixFromUrl: extracts prefix from URL", () => {
  assert.equal(
    deriveStoragePrefixFromUrl("https://example.com/video.mp4"),
    "https://example.com/video"
  );
  assert.equal(
    deriveStoragePrefixFromUrl("https://example.com/path/to/video.mkv"),
    "https://example.com/path/to/video"
  );
  assert.equal(
    deriveStoragePrefixFromUrl("https://example.com/no-extension"),
    "https://example.com/no-extension"
  );
  assert.equal(
    deriveStoragePrefixFromUrl("https://example.com/trailing-slash/"),
    "https://example.com/trailing-slash"
  );
});

test("deriveStoragePrefixFromUrl: handles invalid URLs", () => {
  assert.equal(deriveStoragePrefixFromUrl("not-a-url"), "");
  assert.equal(deriveStoragePrefixFromUrl("ftp://unsupported-protocol.com"), "");
  assert.equal(deriveStoragePrefixFromUrl("https://example.com"), ""); // No path
  assert.equal(deriveStoragePrefixFromUrl(""), "");
});

test("deriveStoragePointerFromUrl: derives full pointer from URL", () => {
  assert.equal(
    deriveStoragePointerFromUrl("https://example.com/video.mp4"),
    "url:https://example.com/video"
  );
  assert.equal(
    deriveStoragePointerFromUrl("https://example.com/video.mp4", "custom"),
    "custom:https://example.com/video"
  );
});

test("buildStoragePrefixFromKey: builds prefix from base URL and key", () => {
  assert.equal(
    buildStoragePrefixFromKey({
      publicBaseUrl: "https://cdn.example.com",
      key: "videos/my-video.mp4",
    }),
    "https://cdn.example.com/videos/my-video"
  );
  assert.equal(
    buildStoragePrefixFromKey({
      publicBaseUrl: "https://cdn.example.com/",
      key: "/videos/my-video.mp4",
    }),
    "https://cdn.example.com/videos/my-video"
  );
});

test("buildStoragePrefixFromKey: returns empty string for missing inputs", () => {
  assert.equal(
    buildStoragePrefixFromKey({ publicBaseUrl: "https://example.com" }),
    ""
  );
  assert.equal(buildStoragePrefixFromKey({ key: "video.mp4" }), "");
  assert.equal(buildStoragePrefixFromKey({}), "");
});

test("getStoragePointerFromTags: extracts 's' tag from tags array", () => {
  const tags = [
    ["t", "nostr"],
    ["s", "s3:my-video"],
    ["alt", "a video"],
  ];
  assert.equal(getStoragePointerFromTags(tags), "s3:my-video");

  const multipleSTags = [
    ["s", "first"],
    ["s", "second"],
  ];
  assert.equal(getStoragePointerFromTags(multipleSTags), "first");
});

test("getStoragePointerFromTags: handles missing or malformed tags", () => {
  assert.equal(getStoragePointerFromTags([["t", "nostr"]]), "");
  assert.equal(getStoragePointerFromTags([]), "");
  assert.equal(getStoragePointerFromTags(null), "");
  assert.equal(getStoragePointerFromTags("not-an-array"), "");
  assert.equal(getStoragePointerFromTags([["s"]]), ""); // Empty 's' tag value
});

test("resolveInfoJsonUrl: resolves URL for info.json", () => {
  // Case 1: Storage pointer prefix is a URL
  assert.equal(
    resolveInfoJsonUrl({
      storagePointer: "url:https://example.com/video",
    }),
    "https://example.com/video.info.json"
  );

  // Case 2: Storage pointer prefix is a URL already ending in .info.json
  assert.equal(
    resolveInfoJsonUrl({
      storagePointer: "url:https://example.com/video.info.json",
    }),
    "https://example.com/video.info.json"
  );

  // Case 3: Storage pointer is not a URL, but fallback URL is provided
  assert.equal(
    resolveInfoJsonUrl({
      storagePointer: "s3:some-id",
      url: "https://example.com/video.mp4",
    }),
    "https://example.com/video.info.json"
  );

  // Case 4: Storage pointer is not a URL, no fallback URL, uses prefix as base
  assert.equal(
    resolveInfoJsonUrl({
      storagePointer: "s3:some-id",
    }),
    "some-id.info.json"
  );
});

test("resolveInfoJsonUrl: returns empty string for invalid storage pointer", () => {
  assert.equal(resolveInfoJsonUrl({ storagePointer: "invalid" }), "");
  assert.equal(resolveInfoJsonUrl({}), "");
});
