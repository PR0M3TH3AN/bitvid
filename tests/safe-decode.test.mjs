import assert from "node:assert/strict";
import test from "node:test";

import {
  safeDecodeURIComponent,
  safeDecodeURIComponentLoose,
} from "../js/utils/safeDecode.js";

import { safeDecodeMagnet } from "../js/magnetUtils.js";

test("safeDecodeURIComponent returns original value on malformed sequences", () => {
  const malformed = "%E0%A4%A";
  assert.equal(
    safeDecodeURIComponent(malformed),
    malformed,
    "Malformed sequences should return the original input"
  );
});

test("safeDecode helpers handle double-encoded values when applied repeatedly", () => {
  const raw = "magnet:?xt=urn:btih:abcdef";
  const doubleEncoded = encodeURIComponent(encodeURIComponent(raw));

  const firstPass = safeDecodeURIComponent(doubleEncoded);
  assert.equal(
    firstPass,
    encodeURIComponent(raw),
    "First pass should peel one encoding layer"
  );

  const secondPass = safeDecodeURIComponent(firstPass);
  assert.equal(
    secondPass,
    raw,
    "Second pass should reveal the original string"
  );

  assert.equal(
    safeDecodeMagnet(doubleEncoded),
    raw,
    "safeDecodeMagnet should continue to handle double-encoded magnets"
  );
});

test("safeDecodeURIComponentLoose trims inputs by default", () => {
  const padded = "   magnet:?dn=Example";
  assert.equal(
    safeDecodeURIComponentLoose(padded),
    "magnet:?dn=Example",
    "Loose decoder should trim whitespace when decoding"
  );
});

test("safeDecodeURIComponentLoose preserves whitespace when trim is false", () => {
  const padded = "   magnet:?dn=Example";
  assert.equal(
    safeDecodeURIComponentLoose(padded, { trim: false }),
    padded,
    "Loose decoder should return the original string when trim is disabled and decoding is unnecessary"
  );
});

test("safeDecodeURIComponent handles empty strings consistently", () => {
  assert.equal(safeDecodeURIComponent(""), "", "Empty input should stay empty");
  assert.equal(
    safeDecodeURIComponentLoose(""),
    "",
    "Loose decoder should return empty for empty input"
  );
});
