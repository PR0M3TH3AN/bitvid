// Scenario (SCN-cors-error-classifier):
//   A browser CORS rejection during upload surfaces as an opaque network error
//   with no HTTP status. isLikelyCorsError() must recognize the messages the
//   major browsers actually produce (so the upload path can attach CORS guidance
//   instead of a bare "Failed to fetch"), without false-positiving on ordinary
//   errors (so we don't wrongly tell users to fix CORS).

import "../test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";

globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = true;
const { isLikelyCorsError } = await import("../../js/services/r2Service.js");

test("recognizes the browsers' CORS/network rejection messages", () => {
  assert.equal(isLikelyCorsError(new TypeError("Failed to fetch")), true); // Chrome
  assert.equal(isLikelyCorsError(new Error("NetworkError when attempting to fetch resource.")), true); // Firefox
  assert.equal(isLikelyCorsError(new TypeError("Load failed")), true); // Safari
});

test("does NOT false-positive on ordinary upload errors", () => {
  assert.equal(isLikelyCorsError(new Error("Access Denied")), false);
  assert.equal(isLikelyCorsError(new Error("File is empty (0 bytes).")), false);
  assert.equal(isLikelyCorsError(new Error("NoSuchBucket")), false);
  assert.equal(isLikelyCorsError(null), false);
  assert.equal(isLikelyCorsError(undefined), false);
  assert.equal(isLikelyCorsError({}), false);
});
