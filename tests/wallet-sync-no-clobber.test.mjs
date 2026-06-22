// Regression (data-loss): saving the Wallet pane with an EMPTY URI must NOT wipe
// the encrypted synced copy on relays. This happened on a fresh device — the user
// opened the pane (field empty, wallet not yet restored), clicked Save, and the
// "removed" branch called walletSync.disable() which published a {cleared:true}
// note, destroying the good remote copy another device relied on.
//
// Correct behavior: an empty save only clears the LOCAL wallet; the remote synced
// note is changed solely via the explicit sync toggle (enable/disable) or a
// successful save (push).

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { ProfileWalletController } from "../js/ui/profileModal/ProfileWalletController.js";

const PUBKEY = "a".repeat(64);

function makeController() {
  const calls = { disable: 0, push: 0 };
  const mainController = {
    normalizeHexPubkey: (v) => (typeof v === "string" ? v : ""),
    getActivePubkey: () => PUBKEY,
    showSuccess: () => {},
    showStatus: () => {},
    showError: () => {},
    callbacks: { onWalletSave: () => {} },
    services: { nwcSettings: {} },
  };
  const controller = new ProfileWalletController(mainController);

  // Stub the instance methods handleWalletSave depends on (no real DOM/services).
  controller.isWalletBusy = () => false;
  controller.getWalletFormValues = () => ({ uri: "", defaultZap: null, error: null });
  controller.validateWalletUri = () => ({ valid: true, sanitized: "", message: "" });
  controller.persistWalletSettings = async () => ({});
  controller.setWalletPaneBusy = () => {};
  controller.updateWalletStatus = () => {};
  controller.refreshWalletPaneState = () => {};

  // Sync is opted-in on this device (the dangerous precondition), with spies.
  controller.getWalletSyncService = () => ({
    isEnabled: () => true,
    disable: async () => {
      calls.disable += 1;
      return { ok: true };
    },
    push: async () => {
      calls.push += 1;
      return { ok: true };
    },
  });

  return { controller, calls };
}

test("empty save does NOT clear the remote synced wallet note", async () => {
  const { controller, calls } = makeController();
  const result = await controller.handleWalletSave();

  assert.equal(result.reason, "cleared", "empty save takes the removal branch");
  assert.equal(
    calls.disable,
    0,
    "an empty save must NOT call walletSync.disable() (no remote {cleared} publish)",
  );
  assert.equal(calls.push, 0, "an empty save must not push either");
});

test("a real save with a URI DOES push the synced copy (sanity)", async () => {
  const { controller, calls } = makeController();
  controller.getWalletFormValues = () => ({
    uri: "nostr+walletconnect://abc",
    defaultZap: null,
    error: null,
  });
  controller.validateWalletUri = () => ({
    valid: true,
    sanitized: "nostr+walletconnect://abc",
    message: "",
  });

  const result = await controller.handleWalletSave();
  assert.equal(result.reason, "saved");
  assert.equal(calls.push, 1, "a real save re-pushes when sync is enabled");
  assert.equal(calls.disable, 0, "a real save never clears the remote");
});
