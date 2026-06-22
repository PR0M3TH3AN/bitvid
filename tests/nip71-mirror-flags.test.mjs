// Per-video NIP-71 mirror opt-in: persistence (per pubkey+videoRootId) and the
// pure toggle-decision used by the My Videos tab.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  isMirrorEnabled,
  setMirrorEnabled,
  resolveMirrorToggle,
} from "../js/services/nip71MirrorFlags.js";

const PK = "a".repeat(64);

test("opt-in flag persists per pubkey+videoRootId and is off by default", () => {
  localStorage.clear();
  assert.equal(isMirrorEnabled(PK, "root-1"), false, "off by default");

  setMirrorEnabled(PK, "root-1", true);
  assert.equal(isMirrorEnabled(PK, "root-1"), true);
  assert.equal(isMirrorEnabled(PK, "root-2"), false, "scoped per videoRootId");
  assert.equal(isMirrorEnabled("b".repeat(64), "root-1"), false, "scoped per pubkey");

  setMirrorEnabled(PK, "root-1", false);
  assert.equal(isMirrorEnabled(PK, "root-1"), false, "can be turned back off");
});

test("resolveMirrorToggle: enabled => remove", () => {
  assert.deepEqual(
    resolveMirrorToggle({ enabled: true, eligibility: { ok: true } }),
    { action: "remove" },
  );
  // remove even if currently ineligible (so a now-private video can be pulled).
  assert.deepEqual(
    resolveMirrorToggle({ enabled: true, eligibility: { ok: false, reason: "private" } }),
    { action: "remove" },
  );
});

test("resolveMirrorToggle: off + eligible => publish", () => {
  assert.deepEqual(
    resolveMirrorToggle({ enabled: false, eligibility: { ok: true } }),
    { action: "publish" },
  );
});

test("resolveMirrorToggle: off + ineligible => blocked with reason", () => {
  assert.deepEqual(
    resolveMirrorToggle({ enabled: false, eligibility: { ok: false, reason: "no-url" } }),
    { action: "blocked", reason: "no-url" },
  );
  assert.deepEqual(
    resolveMirrorToggle({ enabled: false }),
    { action: "blocked", reason: "ineligible" },
  );
});
