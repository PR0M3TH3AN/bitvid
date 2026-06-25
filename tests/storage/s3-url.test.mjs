import test from "node:test";
import assert from "node:assert/strict";

import {
  buildS3PublicUrl,
  buildS3UrlFromBase,
  normalizeS3PublicBaseUrl,
} from "../../js/storage/s3-url.js";
import {
  derivePublicBaseUrl,
  buildS3ObjectUrl,
} from "../../js/services/s3Service.js";

// #6: the generic-S3 path's public-URL resolution must honor forcePathStyle.
// Upload tests mock buildS3ObjectUrl, so the real path-style/vhost logic in
// s3-url.js is asserted here directly (pure functions, no mocking).

const ENDPOINT = "https://s3.example.com";
const BUCKET = "mybucket";
const KEY = "u/npub1abc/hash/clip.mp4";

test("forcePathStyle=true puts the bucket in the PATH (generic S3 / MinIO style)", () => {
  const url = buildS3PublicUrl({
    endpoint: ENDPOINT,
    bucket: BUCKET,
    key: KEY,
    forcePathStyle: true,
  });
  assert.equal(url, `https://s3.example.com/mybucket/${KEY}`);
});

test("forcePathStyle=false puts the bucket in the HOST as a subdomain (virtual-hosted style)", () => {
  const url = buildS3PublicUrl({
    endpoint: ENDPOINT,
    bucket: BUCKET,
    key: KEY,
    forcePathStyle: false,
  });
  assert.equal(url, `https://mybucket.s3.example.com/${KEY}`);
});

test("vhost style does not double-prefix a bucket already present in the hostname", () => {
  const url = buildS3PublicUrl({
    endpoint: "https://mybucket.s3.example.com",
    bucket: BUCKET,
    key: KEY,
    forcePathStyle: false,
  });
  assert.equal(url, `https://mybucket.s3.example.com/${KEY}`);
});

test("path-style preserves an endpoint path prefix (e.g. self-hosted under /v1)", () => {
  const url = buildS3PublicUrl({
    endpoint: "https://host.internal/v1",
    bucket: BUCKET,
    key: KEY,
    forcePathStyle: true,
  });
  assert.equal(url, `https://host.internal/v1/mybucket/${KEY}`);
});

test("a bare endpoint (no scheme) is upgraded to https and trailing slashes are trimmed", () => {
  const url = buildS3PublicUrl({
    endpoint: "s3.example.com/",
    bucket: BUCKET,
    key: "k.mp4",
    forcePathStyle: true,
  });
  assert.equal(url, "https://s3.example.com/mybucket/k.mp4");
});

test("leading slashes on the key are normalized away (no //)", () => {
  const url = buildS3PublicUrl({
    endpoint: ENDPOINT,
    bucket: BUCKET,
    key: "///u/clip.mp4",
    forcePathStyle: true,
  });
  assert.equal(url, "https://s3.example.com/mybucket/u/clip.mp4");
});

test("missing endpoint or bucket yields an empty string (no malformed URL)", () => {
  assert.equal(buildS3PublicUrl({ bucket: BUCKET, key: KEY, forcePathStyle: true }), "");
  assert.equal(buildS3PublicUrl({ endpoint: ENDPOINT, key: KEY, forcePathStyle: true }), "");
});

test("buildS3UrlFromBase joins a custom public base URL with the key", () => {
  assert.equal(
    buildS3UrlFromBase({ publicBaseUrl: "https://cdn.example.com", key: KEY }),
    `https://cdn.example.com/${KEY}`,
  );
  // Trailing slash on the base is handled.
  assert.equal(
    buildS3UrlFromBase({ publicBaseUrl: "https://cdn.example.com/", key: "a/b.mp4" }),
    "https://cdn.example.com/a/b.mp4",
  );
  // Missing pieces → empty.
  assert.equal(buildS3UrlFromBase({ publicBaseUrl: "", key: KEY }), "");
  assert.equal(buildS3UrlFromBase({ publicBaseUrl: "https://cdn.example.com", key: "" }), "");
});

test("normalizeS3PublicBaseUrl trims trailing slashes and whitespace", () => {
  assert.equal(normalizeS3PublicBaseUrl("  https://cdn.example.com/// "), "https://cdn.example.com");
  assert.equal(normalizeS3PublicBaseUrl(""), "");
});

test("s3Service.derivePublicBaseUrl returns the bucket root honoring forcePathStyle", () => {
  assert.equal(
    derivePublicBaseUrl({ endpoint: ENDPOINT, bucket: BUCKET, forcePathStyle: true }),
    "https://s3.example.com/mybucket",
  );
  assert.equal(
    derivePublicBaseUrl({ endpoint: ENDPOINT, bucket: BUCKET, forcePathStyle: false }),
    "https://mybucket.s3.example.com",
  );
});

test("s3Service.buildS3ObjectUrl prefers an explicit publicBaseUrl over endpoint derivation", () => {
  // When a custom CDN/public base is configured, it wins — even if endpoint/bucket
  // would derive something different.
  const url = buildS3ObjectUrl({
    publicBaseUrl: "https://cdn.example.com",
    endpoint: ENDPOINT,
    bucket: BUCKET,
    key: KEY,
    forcePathStyle: true,
  });
  assert.equal(url, `https://cdn.example.com/${KEY}`);

  // Without a publicBaseUrl it falls back to endpoint derivation (path-style here).
  const derived = buildS3ObjectUrl({
    endpoint: ENDPOINT,
    bucket: BUCKET,
    key: KEY,
    forcePathStyle: true,
  });
  assert.equal(derived, `https://s3.example.com/mybucket/${KEY}`);
});
