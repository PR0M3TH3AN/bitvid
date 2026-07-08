import "./test-helpers/setup-localstorage.mjs";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  setAuthorModerationOverride,
  getAuthorModerationOverride,
  hasAuthorModerationOverride,
  clearAuthorModerationOverride,
  getAuthorModerationOverridesList,
  loadAuthorModerationOverridesFromStorage,
} from "../js/state/cache.js";

const HEX = "a".repeat(64);
const HEX2 = "b".repeat(64);

beforeEach(() => {
  localStorage.clear();
  clearAuthorModerationOverride(HEX);
  clearAuthorModerationOverride(HEX2);
});

test("set + get + has recognizes an account-level override", () => {
  const entry = setAuthorModerationOverride(HEX, { showAnyway: true });
  assert.equal(entry.authorPubkey, HEX);
  assert.equal(entry.showAnyway, true);
  assert.equal(hasAuthorModerationOverride(HEX), true);
  assert.equal(getAuthorModerationOverride(HEX)?.showAnyway, true);
  assert.equal(hasAuthorModerationOverride(HEX2), false);
});

test("hex input is normalized (uppercase accepted, stored lowercase)", () => {
  setAuthorModerationOverride(HEX.toUpperCase(), { showAnyway: true });
  assert.equal(hasAuthorModerationOverride(HEX), true, "uppercase resolves to the same entry");
});

test("clearing removes it; showAnyway:false is treated as a removal", () => {
  setAuthorModerationOverride(HEX, { showAnyway: true });
  assert.equal(clearAuthorModerationOverride(HEX), true);
  assert.equal(hasAuthorModerationOverride(HEX), false);

  setAuthorModerationOverride(HEX, { showAnyway: true });
  assert.equal(setAuthorModerationOverride(HEX, { showAnyway: false }), null);
  assert.equal(hasAuthorModerationOverride(HEX), false);
});

test("survives a reload via persist → load roundtrip", () => {
  setAuthorModerationOverride(HEX, { showAnyway: true });
  setAuthorModerationOverride(HEX2, { showAnyway: true });
  // A reload repopulates the in-memory map from localStorage.
  loadAuthorModerationOverridesFromStorage();
  const list = getAuthorModerationOverridesList()
    .map((entry) => entry.authorPubkey)
    .sort();
  assert.deepEqual(list, [HEX, HEX2].sort());
});

test("blank/invalid pubkey is ignored", () => {
  assert.equal(setAuthorModerationOverride("", { showAnyway: true }), null);
  assert.equal(setAuthorModerationOverride("not-a-key", { showAnyway: true }), null);
  assert.equal(getAuthorModerationOverridesList().length, 0);
});
