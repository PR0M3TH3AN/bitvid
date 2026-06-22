// Sanitizing hex-only filter fields (ids/authors/#e/#p/#q) before they reach a
// relay. One odd-length/non-hex value otherwise makes strict relays reject the
// whole REQ ("uneven size input to from_hex"), silently dropping results.

import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeHexFilterFields } from "../js/nostr/toolkit.js";

const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);
const ODD = "abc"; // odd length -> from_hex failure
const SHORT = "a".repeat(63); // wrong length

test("strips invalid hex from authors but keeps valid entries", () => {
  const out = sanitizeHexFilterFields({ kinds: [0], authors: [HEX_A, ODD, HEX_B] });
  assert.deepEqual(out.authors, [HEX_A, HEX_B]);
  assert.deepEqual(out.kinds, [0], "non-hex fields untouched");
});

test("lowercases and trims valid hex", () => {
  const out = sanitizeHexFilterFields({ ids: [` ${HEX_A.toUpperCase()} `] });
  assert.deepEqual(out.ids, [HEX_A]);
});

test("drops the whole filter when a populated hex field becomes empty", () => {
  // If every author was invalid, removing the key would broaden the query to
  // "all authors" — drop the filter instead.
  const out = sanitizeHexFilterFields({ kinds: [1], authors: [ODD, SHORT] });
  assert.equal(out, null);
});

test("sanitizes event/pubkey tag filters (#e/#p/#q)", () => {
  const out = sanitizeHexFilterFields({
    kinds: [1984],
    "#e": [HEX_A, ODD],
    "#p": [HEX_B],
  });
  assert.deepEqual(out["#e"], [HEX_A]);
  assert.deepEqual(out["#p"], [HEX_B]);
});

test("leaves non-hex tag fields (#a/#d/#t) alone", () => {
  const filter = {
    kinds: [21, 22],
    "#a": ["30078:" + HEX_A + ":some-d-tag"],
    "#d": ["subscriptions"],
    "#t": ["music"],
  };
  const out = sanitizeHexFilterFields(filter);
  assert.deepEqual(out["#a"], filter["#a"]);
  assert.deepEqual(out["#d"], filter["#d"]);
  assert.deepEqual(out["#t"], filter["#t"]);
});

test("returns the same object when nothing needs sanitizing (no needless copy)", () => {
  const filter = { kinds: [0], authors: [HEX_A] };
  const out = sanitizeHexFilterFields(filter);
  assert.equal(out, filter);
});

test("ignores empty/absent hex fields", () => {
  const out = sanitizeHexFilterFields({ kinds: [1], authors: [] });
  assert.deepEqual(out, { kinds: [1], authors: [] });
});
