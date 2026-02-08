import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeProfileMediaUrl } from "../../js/utils/profileMedia.js";

test("sanitizeProfileMediaUrl handles non-string inputs", () => {
  assert.equal(sanitizeProfileMediaUrl(null), "");
  assert.equal(sanitizeProfileMediaUrl(undefined), "");
  assert.equal(sanitizeProfileMediaUrl(123), "");
  assert.equal(sanitizeProfileMediaUrl({}), "");
});

test("sanitizeProfileMediaUrl handles empty or whitespace-only strings", () => {
  assert.equal(sanitizeProfileMediaUrl(""), "");
  assert.equal(sanitizeProfileMediaUrl("   "), "");
  assert.equal(sanitizeProfileMediaUrl("\t\n"), "");
});

test("sanitizeProfileMediaUrl trims whitespace and removes quotes", () => {
  assert.equal(sanitizeProfileMediaUrl("  http://example.com  "), "https://example.com");
  assert.equal(sanitizeProfileMediaUrl("'http://example.com'"), "https://example.com");
  assert.equal(sanitizeProfileMediaUrl('"http://example.com"'), "https://example.com");
  assert.equal(sanitizeProfileMediaUrl(" ' http://example.com ' "), "https://example.com");
});

test("sanitizeProfileMediaUrl allows data:image/ URLs", () => {
  const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  assert.equal(sanitizeProfileMediaUrl(dataUrl), dataUrl);
});

test("sanitizeProfileMediaUrl allows blob: URLs", () => {
  const blobUrl = "blob:http://example.com/550e8400-e29b-41d4-a716-446655440000";
  assert.equal(sanitizeProfileMediaUrl(blobUrl), blobUrl);
});

test("sanitizeProfileMediaUrl rejects specific placeholder images", () => {
  assert.equal(sanitizeProfileMediaUrl("images/robot.png"), "");
});

test("sanitizeProfileMediaUrl normalizes IPFS URLs", () => {
  assert.equal(sanitizeProfileMediaUrl("ipfs://CID"), "https://ipfs.io/ipfs/CID");
  assert.equal(sanitizeProfileMediaUrl("ipfs/CID"), "https://ipfs.io/ipfs/CID");
});

test("sanitizeProfileMediaUrl handles protocol-relative URLs", () => {
  assert.equal(sanitizeProfileMediaUrl("//example.com/image.jpg"), "https://example.com/image.jpg");
});

test("sanitizeProfileMediaUrl allows relative paths", () => {
  assert.equal(sanitizeProfileMediaUrl("/assets/image.jpg"), "/assets/image.jpg");
  assert.equal(sanitizeProfileMediaUrl("./image.jpg"), "./image.jpg");
  assert.equal(sanitizeProfileMediaUrl("../image.jpg"), "../image.jpg");
  assert.equal(sanitizeProfileMediaUrl("assets/image.jpg"), "assets/image.jpg");
});

test("sanitizeProfileMediaUrl adds protocol to domains and localhost", () => {
  assert.equal(sanitizeProfileMediaUrl("localhost:8080/image.jpg"), "http://localhost:8080/image.jpg");
  assert.equal(sanitizeProfileMediaUrl("example.com/image.jpg"), "https://example.com/image.jpg");
  assert.equal(sanitizeProfileMediaUrl("sub.example.com/image.jpg"), "https://sub.example.com/image.jpg");
  // IP address pattern in code: (?:\d{1,3}\.){3}\d{1,3}
  assert.equal(sanitizeProfileMediaUrl("127.0.0.1:8080/image.jpg"), "http://127.0.0.1:8080/image.jpg");
});

test("sanitizeProfileMediaUrl coerces http to https except for localhost", () => {
  assert.equal(sanitizeProfileMediaUrl("http://example.com/image.jpg"), "https://example.com/image.jpg");
  assert.equal(sanitizeProfileMediaUrl("http://localhost:8080/image.jpg"), "http://localhost:8080/image.jpg");
  assert.equal(sanitizeProfileMediaUrl("http://127.0.0.1:8080/image.jpg"), "http://127.0.0.1:8080/image.jpg");
});

test("sanitizeProfileMediaUrl rejects unsupported patterns", () => {
   // The code logs a warning and returns "" for things that don't match localhost or domain patterns
   // if they don't start with http/https
   assert.equal(sanitizeProfileMediaUrl("javascript:alert(1)"), "");
   assert.equal(sanitizeProfileMediaUrl("ftp://example.com/file"), ""); // Starts with ftp, not http/https/ipfs
});
