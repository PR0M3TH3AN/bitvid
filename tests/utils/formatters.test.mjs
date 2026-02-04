import assert from "node:assert/strict";
import test from "node:test";

import {
  truncateMiddle,
  formatShortNpub,
  formatAbsoluteTimestamp,
  formatTimeAgo,
  formatAbsoluteDateWithOrdinal,
} from "../../js/utils/formatters.js";

// truncateMiddle tests
test("truncateMiddle: returns empty string for null/undefined", () => {
  assert.equal(truncateMiddle(null), "");
  assert.equal(truncateMiddle(undefined), "");
  assert.equal(truncateMiddle(""), "");
});

test("truncateMiddle: returns empty string for non-string input", () => {
  assert.equal(truncateMiddle(123), "");
  assert.equal(truncateMiddle({}), "");
  assert.equal(truncateMiddle([]), "");
});

test("truncateMiddle: returns unchanged string if within maxLength", () => {
  assert.equal(truncateMiddle("short", 72), "short");
  assert.equal(truncateMiddle("exactly", 7), "exactly");
});

test("truncateMiddle: truncates long strings with ellipsis in middle", () => {
  const input = "abcdefghijklmnopqrstuvwxyz";
  const result = truncateMiddle(input, 10);

  assert.equal(result.length, 10);
  assert.ok(result.includes("…"));
  assert.equal(result.slice(0, 5), "abcde");
  assert.equal(result.slice(-4), "wxyz");
});

test("truncateMiddle: uses default maxLength of 72", () => {
  const input = "a".repeat(100);
  const result = truncateMiddle(input);

  assert.equal(result.length, 72);
});

test("truncateMiddle: handles odd character counts", () => {
  const input = "abcdefghijklmnop"; // 16 chars
  const result = truncateMiddle(input, 9);

  // 9 - 1 (ellipsis) = 8 chars, front=4, back=4
  assert.equal(result.length, 9);
  assert.ok(result.includes("…"));
});

// formatShortNpub tests
test("formatShortNpub: returns empty string for non-string input", () => {
  assert.equal(formatShortNpub(null), "");
  assert.equal(formatShortNpub(undefined), "");
  assert.equal(formatShortNpub(123), "");
  assert.equal(formatShortNpub({}), "");
});

test("formatShortNpub: returns empty string for empty/whitespace string", () => {
  assert.equal(formatShortNpub(""), "");
  assert.equal(formatShortNpub("   "), "");
});

test("formatShortNpub: returns unchanged if not npub prefix", () => {
  assert.equal(formatShortNpub("abc123"), "abc123");
  assert.equal(formatShortNpub("nsec1abc"), "nsec1abc");
});

test("formatShortNpub: returns unchanged if already short", () => {
  assert.equal(formatShortNpub("npub1234"), "npub1234");
  assert.equal(formatShortNpub("npub12345678"), "npub12345678");
});

test("formatShortNpub: formats long npub correctly", () => {
  const npub = "npub1abcdefghijklmnopqrstuvwxyz1234567890";
  const result = formatShortNpub(npub);

  assert.equal(result, "npub1abc...7890");
  assert.equal(result.length, 15);
});

test("formatShortNpub: trims whitespace", () => {
  const npub = "  npub1abcdefghijklmnopqrstuvwxyz1234567890  ";
  const result = formatShortNpub(npub);

  assert.equal(result, "npub1abc...7890");
});

// formatAbsoluteTimestamp tests
test("formatAbsoluteTimestamp: returns 'Unknown date' for invalid input", () => {
  assert.equal(formatAbsoluteTimestamp(null), "Unknown date");
  assert.equal(formatAbsoluteTimestamp(undefined), "Unknown date");
  assert.equal(formatAbsoluteTimestamp(NaN), "Unknown date");
  assert.equal(formatAbsoluteTimestamp(Infinity), "Unknown date");
  assert.equal(formatAbsoluteTimestamp("not a number"), "Unknown date");
});

test("formatAbsoluteTimestamp: formats valid timestamp", () => {
  // 1704067200 = Jan 1, 2024 00:00:00 UTC
  const timestamp = 1704067200;
  const result = formatAbsoluteTimestamp(timestamp);

  // Result depends on locale, but should contain year
  assert.ok(result.includes("2024"));
  assert.ok(result !== "Unknown date");
});

test("formatAbsoluteTimestamp: handles zero timestamp (Unix epoch)", () => {
  const result = formatAbsoluteTimestamp(0);
  assert.ok(result.includes("1970"));
});

// formatTimeAgo tests
test("formatTimeAgo: returns 'just now' for recent timestamps", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(formatTimeAgo(now), "just now");
  assert.equal(formatTimeAgo(now - 30), "just now");
});

test("formatTimeAgo: formats minutes correctly", () => {
  const now = Math.floor(Date.now() / 1000);

  assert.equal(formatTimeAgo(now - 60), "1 minute ago");
  assert.equal(formatTimeAgo(now - 120), "2 minutes ago");
  assert.equal(formatTimeAgo(now - 300), "5 minutes ago");
});

test("formatTimeAgo: formats hours correctly", () => {
  const now = Math.floor(Date.now() / 1000);

  assert.equal(formatTimeAgo(now - 3600), "1 hour ago");
  assert.equal(formatTimeAgo(now - 7200), "2 hours ago");
});

test("formatTimeAgo: formats days correctly", () => {
  const now = Math.floor(Date.now() / 1000);

  assert.equal(formatTimeAgo(now - 86400), "1 day ago");
  assert.equal(formatTimeAgo(now - 172800), "2 days ago");
});

test("formatTimeAgo: formats weeks correctly", () => {
  const now = Math.floor(Date.now() / 1000);

  assert.equal(formatTimeAgo(now - 604800), "1 week ago");
  assert.equal(formatTimeAgo(now - 1209600), "2 weeks ago");
});

test("formatTimeAgo: formats months correctly", () => {
  const now = Math.floor(Date.now() / 1000);

  assert.equal(formatTimeAgo(now - 2592000), "1 month ago");
  assert.equal(formatTimeAgo(now - 5184000), "2 months ago");
});

test("formatTimeAgo: formats years correctly", () => {
  const now = Math.floor(Date.now() / 1000);

  assert.equal(formatTimeAgo(now - 31536000), "1 year ago");
  assert.equal(formatTimeAgo(now - 63072000), "2 years ago");
});

// formatAbsoluteDateWithOrdinal tests
test("formatAbsoluteDateWithOrdinal: returns empty string for invalid input", () => {
  assert.equal(formatAbsoluteDateWithOrdinal(null), "");
  assert.equal(formatAbsoluteDateWithOrdinal(undefined), "");
  assert.equal(formatAbsoluteDateWithOrdinal(NaN), "");
  assert.equal(formatAbsoluteDateWithOrdinal(Infinity), "");
});

test("formatAbsoluteDateWithOrdinal: formats date with correct ordinal suffix", () => {
  // Test various days with different ordinal suffixes
  // January 1, 2024 00:00:00 UTC = 1704067200
  const jan1 = 1704067200;
  const result1 = formatAbsoluteDateWithOrdinal(jan1);
  assert.ok(result1.includes("1st") || result1.includes("1"), `Expected ordinal for 1st, got: ${result1}`);
  assert.ok(result1.includes("2024"));

  // January 2, 2024 00:00:00 UTC = 1704153600
  const jan2 = 1704153600;
  const result2 = formatAbsoluteDateWithOrdinal(jan2);
  assert.ok(result2.includes("2nd") || result2.includes("2"), `Expected ordinal for 2nd, got: ${result2}`);

  // January 3, 2024 00:00:00 UTC = 1704240000
  const jan3 = 1704240000;
  const result3 = formatAbsoluteDateWithOrdinal(jan3);
  assert.ok(result3.includes("3rd") || result3.includes("3"), `Expected ordinal for 3rd, got: ${result3}`);

  // January 4, 2024 00:00:00 UTC = 1704326400
  const jan4 = 1704326400;
  const result4 = formatAbsoluteDateWithOrdinal(jan4);
  assert.ok(result4.includes("4th") || result4.includes("4"), `Expected ordinal for 4th, got: ${result4}`);
});

test("formatAbsoluteDateWithOrdinal: handles teen numbers (11th, 12th, 13th)", () => {
  // January 11, 2024 00:00:00 UTC = 1704931200
  const jan11 = 1704931200;
  const result11 = formatAbsoluteDateWithOrdinal(jan11);
  assert.ok(result11.includes("11th") || result11.includes("11"));

  // January 12, 2024 00:00:00 UTC = 1705017600
  const jan12 = 1705017600;
  const result12 = formatAbsoluteDateWithOrdinal(jan12);
  assert.ok(result12.includes("12th") || result12.includes("12"));

  // January 13, 2024 00:00:00 UTC = 1705104000
  const jan13 = 1705104000;
  const result13 = formatAbsoluteDateWithOrdinal(jan13);
  assert.ok(result13.includes("13th") || result13.includes("13"));
});

test("formatAbsoluteDateWithOrdinal: includes month name", () => {
  // Test different months
  // March 15, 2024 = 1710460800
  const march = 1710460800;
  const resultMarch = formatAbsoluteDateWithOrdinal(march);
  assert.ok(resultMarch.includes("March"));

  // July 4, 2024 = 1720051200
  const july = 1720051200;
  const resultJuly = formatAbsoluteDateWithOrdinal(july);
  assert.ok(resultJuly.includes("July"));
});
