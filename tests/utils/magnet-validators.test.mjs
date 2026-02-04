import assert from "node:assert/strict";
import test from "node:test";

import { isValidMagnetUri } from "../../js/utils/magnetValidators.js";

// Basic validation tests
test("isValidMagnetUri: returns false for empty/null/undefined", () => {
  assert.equal(isValidMagnetUri(""), false);
  assert.equal(isValidMagnetUri(null), false);
  assert.equal(isValidMagnetUri(undefined), false);
});

test("isValidMagnetUri: returns false for non-string input", () => {
  assert.equal(isValidMagnetUri(123), false);
  assert.equal(isValidMagnetUri({}), false);
  assert.equal(isValidMagnetUri([]), false);
});

test("isValidMagnetUri: returns false for whitespace-only string", () => {
  assert.equal(isValidMagnetUri("   "), false);
  assert.equal(isValidMagnetUri("\t\n"), false);
});

// Valid hex info hash tests
test("isValidMagnetUri: accepts 40-character hex info hash directly", () => {
  const hexHash = "a".repeat(40);
  assert.equal(isValidMagnetUri(hexHash), true);
});

test("isValidMagnetUri: accepts valid magnet URI with hex info hash", () => {
  const hexHash = "1234567890abcdef1234567890abcdef12345678";
  const magnet = `magnet:?xt=urn:btih:${hexHash}`;
  assert.equal(isValidMagnetUri(magnet), true);
});

test("isValidMagnetUri: accepts magnet URI with uppercase hex hash", () => {
  const hexHash = "1234567890ABCDEF1234567890ABCDEF12345678";
  const magnet = `magnet:?xt=urn:btih:${hexHash}`;
  assert.equal(isValidMagnetUri(magnet), true);
});

test("isValidMagnetUri: accepts magnet URI with mixed case hex hash", () => {
  const hexHash = "1234567890AbCdEf1234567890aBcDeF12345678";
  const magnet = `magnet:?xt=urn:btih:${hexHash}`;
  assert.equal(isValidMagnetUri(magnet), true);
});

// Valid base32 info hash tests
test("isValidMagnetUri: accepts valid magnet URI with base32 info hash", () => {
  const base32Hash = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // 32 chars
  const magnet = `magnet:?xt=urn:btih:${base32Hash}`;
  assert.equal(isValidMagnetUri(magnet), true);
});

test("isValidMagnetUri: accepts base32 hash with lowercase (normalized)", () => {
  const base32Hash = "abcdefghijklmnopqrstuvwxyz234567";
  const magnet = `magnet:?xt=urn:btih:${base32Hash}`;
  assert.equal(isValidMagnetUri(magnet), true);
});

// Magnet URI with additional parameters
test("isValidMagnetUri: accepts magnet with trackers", () => {
  const hexHash = "a".repeat(40);
  const magnet = `magnet:?xt=urn:btih:${hexHash}&tr=wss://tracker.example.com`;
  assert.equal(isValidMagnetUri(magnet), true);
});

test("isValidMagnetUri: accepts magnet with display name", () => {
  const hexHash = "a".repeat(40);
  const magnet = `magnet:?xt=urn:btih:${hexHash}&dn=My+Video+File`;
  assert.equal(isValidMagnetUri(magnet), true);
});

test("isValidMagnetUri: accepts magnet with web seed", () => {
  const hexHash = "a".repeat(40);
  const magnet = `magnet:?xt=urn:btih:${hexHash}&ws=https://example.com/file.mp4`;
  assert.equal(isValidMagnetUri(magnet), true);
});

test("isValidMagnetUri: accepts magnet with multiple parameters", () => {
  const hexHash = "a".repeat(40);
  const magnet = `magnet:?xt=urn:btih:${hexHash}&dn=Test&tr=wss://t1.com&tr=wss://t2.com&ws=https://seed.com/file`;
  assert.equal(isValidMagnetUri(magnet), true);
});

// Invalid magnet URI tests
test("isValidMagnetUri: rejects non-magnet protocol", () => {
  assert.equal(isValidMagnetUri("http://example.com"), false);
  assert.equal(isValidMagnetUri("https://example.com"), false);
  assert.equal(isValidMagnetUri("ftp://example.com"), false);
});

test("isValidMagnetUri: rejects magnet without xt parameter", () => {
  assert.equal(isValidMagnetUri("magnet:?dn=Test"), false);
  assert.equal(isValidMagnetUri("magnet:?tr=wss://tracker.com"), false);
});

test("isValidMagnetUri: rejects magnet with invalid xt format", () => {
  assert.equal(isValidMagnetUri("magnet:?xt=invalid"), false);
  assert.equal(isValidMagnetUri("magnet:?xt=urn:sha1:abc"), false);
});

test("isValidMagnetUri: rejects magnet with btmh (v2) hash only", () => {
  // BitTorrent v2 hashes are not supported
  const v2Hash = "a".repeat(64);
  const magnet = `magnet:?xt=urn:btmh:${v2Hash}`;
  assert.equal(isValidMagnetUri(magnet), false);
});

test("isValidMagnetUri: rejects magnet with invalid hex hash length", () => {
  const shortHash = "a".repeat(39); // 39 chars, should be 40
  const longHash = "a".repeat(41); // 41 chars, should be 40

  assert.equal(isValidMagnetUri(`magnet:?xt=urn:btih:${shortHash}`), false);
  assert.equal(isValidMagnetUri(`magnet:?xt=urn:btih:${longHash}`), false);
});

test("isValidMagnetUri: rejects magnet with invalid base32 hash length", () => {
  const shortHash = "A".repeat(31); // 31 chars, should be 32
  const longHash = "A".repeat(33); // 33 chars, should be 32

  assert.equal(isValidMagnetUri(`magnet:?xt=urn:btih:${shortHash}`), false);
  assert.equal(isValidMagnetUri(`magnet:?xt=urn:btih:${longHash}`), false);
});

test("isValidMagnetUri: rejects magnet with invalid characters in hash", () => {
  const invalidHex = "g".repeat(40); // 'g' is not valid hex
  assert.equal(isValidMagnetUri(`magnet:?xt=urn:btih:${invalidHex}`), false);
});

// Edge cases
test("isValidMagnetUri: handles whitespace around valid magnet", () => {
  const hexHash = "a".repeat(40);
  const magnet = `  magnet:?xt=urn:btih:${hexHash}  `;
  assert.equal(isValidMagnetUri(magnet), true);
});

test("isValidMagnetUri: handles URL-encoded magnet URI", () => {
  // This depends on whether safeDecodeMagnet handles encoding
  const hexHash = "a".repeat(40);
  const encoded = encodeURIComponent(`magnet:?xt=urn:btih:${hexHash}`);
  // The result depends on safeDecodeMagnet implementation
  // At minimum it should not crash
  const result = isValidMagnetUri(encoded);
  assert.equal(typeof result, "boolean");
});

test("isValidMagnetUri: accepts magnet with multiple xt values (first valid)", () => {
  const hexHash = "a".repeat(40);
  const magnet = `magnet:?xt=urn:btih:${hexHash}&xt=urn:sha1:invalid`;
  assert.equal(isValidMagnetUri(magnet), true);
});

test("isValidMagnetUri: validates real-world magnet examples", () => {
  // Real structure of WebTorrent magnets
  const realMagnet = "magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny&tr=wss%3A%2F%2Ftracker.btorrent.xyz";
  assert.equal(isValidMagnetUri(realMagnet), true);
});
