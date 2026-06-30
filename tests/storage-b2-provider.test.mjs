// #38: Backblaze B2 as a first-class storage provider.
//
// B2 doesn't map onto the generic-S3 "paste an endpoint" model: its S3-compatible
// endpoint is region-scoped (s3.<region>.backblazeb2.com) and a public bucket is
// addressed virtual-hosted-style, so the public download URL is
// https://<bucket>.s3.<region>.backblazeb2.com/<key> — NOT endpoint/bucket/key.
//
// These tests pin the derivation that makes B2 work: region -> endpoint, and the
// (forcePathStyle:false) public-URL derivation, plus the explicit-override path.

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  deriveB2Endpoint,
  derivePublicBaseUrl,
  validateS3Connection,
  buildS3ObjectUrl,
} from "../js/services/s3Service.js";
import { PROVIDERS } from "../js/services/storageService.js";

test("PROVIDERS exposes a dedicated Backblaze B2 id", () => {
  assert.equal(PROVIDERS.B2, "backblaze_b2");
});

test("deriveB2Endpoint builds the region-scoped S3 endpoint", () => {
  assert.equal(
    deriveB2Endpoint("us-west-004"),
    "https://s3.us-west-004.backblazeb2.com",
  );
  assert.equal(
    deriveB2Endpoint("  EU-CENTRAL-003 "),
    "https://s3.eu-central-003.backblazeb2.com",
    "trims + lowercases",
  );
});

test("deriveB2Endpoint returns empty for a missing/placeholder region (so callers can require it)", () => {
  assert.equal(deriveB2Endpoint(""), "");
  assert.equal(deriveB2Endpoint("auto"), "");
  assert.equal(deriveB2Endpoint(undefined), "");
});

test("deriveB2Endpoint refuses a pasted host/endpoint in the region box", () => {
  assert.equal(deriveB2Endpoint("s3.us-west-004.backblazeb2.com"), "");
  assert.equal(deriveB2Endpoint("https://s3.us-west-004.backblazeb2.com"), "");
});

test("a B2 bucket's public URL derives virtual-hosted (the S3-style download host)", () => {
  // This is the crux: with the derived endpoint + forcePathStyle false, the bucket
  // becomes a subdomain — the URL a public B2 bucket actually serves files from.
  const endpoint = deriveB2Endpoint("us-west-004");
  const publicBaseUrl = derivePublicBaseUrl({
    endpoint,
    bucket: "my-videos",
    forcePathStyle: false,
  });
  assert.equal(
    publicBaseUrl,
    "https://my-videos.s3.us-west-004.backblazeb2.com",
  );
});

test("validateS3Connection derives the B2 public URL end-to-end (no manual public URL)", () => {
  const normalized = validateS3Connection({
    endpoint: deriveB2Endpoint("us-west-004"),
    region: "us-west-004",
    accessKeyId: "k",
    secretAccessKey: "s",
    bucket: "my-videos",
    forcePathStyle: false,
    // publicBaseUrl intentionally omitted -> must derive
  });
  assert.equal(normalized.endpoint, "https://s3.us-west-004.backblazeb2.com");
  assert.equal(
    normalized.publicBaseUrl,
    "https://my-videos.s3.us-west-004.backblazeb2.com",
  );
  assert.equal(normalized.forcePathStyle, false);
});

test("an explicit Public Access URL (custom domain / CDN) overrides the derived B2 URL", () => {
  const normalized = validateS3Connection({
    endpoint: deriveB2Endpoint("us-west-004"),
    region: "us-west-004",
    accessKeyId: "k",
    secretAccessKey: "s",
    bucket: "my-videos",
    forcePathStyle: false,
    publicBaseUrl: "https://cdn.example.com",
  });
  assert.equal(normalized.publicBaseUrl, "https://cdn.example.com");
});

test("object URLs for a B2 connection resolve under the virtual-hosted bucket host", () => {
  const endpoint = deriveB2Endpoint("us-west-004");
  const url = buildS3ObjectUrl({
    publicBaseUrl: derivePublicBaseUrl({
      endpoint,
      bucket: "my-videos",
      forcePathStyle: false,
    }),
    endpoint,
    bucket: "my-videos",
    key: "u/npub1/abc/video.mp4",
    forcePathStyle: false,
  });
  assert.equal(
    url,
    "https://my-videos.s3.us-west-004.backblazeb2.com/u/npub1/abc/video.mp4",
  );
});
