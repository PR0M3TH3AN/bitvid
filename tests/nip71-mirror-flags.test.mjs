// Per-video NIP-71 mirror opt-in: persistence (per pubkey+videoRootId) and the
// pure toggle-decision used by the My Videos tab.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  isMirrorEnabled,
  setMirrorEnabled,
  resolveMirrorToggle,
  resolveEditSync,
  resolveDeleteSync,
  isAutoShareEnabled,
  setAutoShareEnabled,
  resolvePublishSync,
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

test("resolveEditSync: keeps a mirrored video in lockstep, unshares when ineligible", () => {
  // not mirrored, or feature off → do nothing
  assert.deepEqual(resolveEditSync({ featureOn: true, enabled: false, eligible: true }), { action: "none" });
  assert.deepEqual(resolveEditSync({ featureOn: false, enabled: true, eligible: true }), { action: "none" });
  // mirrored + still eligible → re-publish (no drift)
  assert.deepEqual(resolveEditSync({ featureOn: true, enabled: true, eligible: true }), { action: "publish" });
  // mirrored but became ineligible (e.g. now private) → pull it down
  assert.deepEqual(resolveEditSync({ featureOn: true, enabled: true, eligible: false }), { action: "unshare" });
});

test("resolveDeleteSync: attempts teardown whenever the feature is on, regardless of the local flag", () => {
  // Spec correction: the previous expectation gated teardown on the local
  // `enabled` flag (enabled:false -> none). That flag is browser-local only, so
  // a video shared on one device and deleted from another (or after a cache
  // clear) would skip teardown and orphan the NIP-71 mirror on other apps. The
  // teardown (NIP-09 + empty tombstone) is idempotent, so delete must attempt it
  // whenever the feature is on. `enabled` is intentionally ignored for delete.
  assert.deepEqual(resolveDeleteSync({ featureOn: true, enabled: true }), { action: "unshare" });
  assert.deepEqual(resolveDeleteSync({ featureOn: true, enabled: false }), { action: "unshare" });
  assert.deepEqual(resolveDeleteSync({ featureOn: true, enabled: undefined }), { action: "unshare" });
  // The feature flag still fully gates it: a build with the mirror off never publishes.
  assert.deepEqual(resolveDeleteSync({ featureOn: false, enabled: true }), { action: "none" });
  assert.deepEqual(resolveDeleteSync({ featureOn: false, enabled: false }), { action: "none" });
});

test("auto-share preference persists per pubkey, off by default", () => {
  localStorage.clear();
  assert.equal(isAutoShareEnabled(PK), false);
  setAutoShareEnabled(PK, true);
  assert.equal(isAutoShareEnabled(PK), true);
  assert.equal(isAutoShareEnabled("c".repeat(64)), false, "scoped per pubkey");
  setAutoShareEnabled(PK, false);
  assert.equal(isAutoShareEnabled(PK), false);
});

test("resolvePublishSync: auto-mirror a new video only when auto-share on AND eligible", () => {
  assert.deepEqual(resolvePublishSync({ featureOn: true, autoShare: true, eligible: true }), { action: "publish" });
  assert.deepEqual(resolvePublishSync({ featureOn: true, autoShare: true, eligible: false }), { action: "none" });
  assert.deepEqual(resolvePublishSync({ featureOn: true, autoShare: false, eligible: true }), { action: "none" });
  assert.deepEqual(resolvePublishSync({ featureOn: false, autoShare: true, eligible: true }), { action: "none" });
});
