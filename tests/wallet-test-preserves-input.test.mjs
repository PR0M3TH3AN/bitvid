// Regression: testing the wallet connection must NOT wipe a URI the user typed
// but hasn't saved yet. handleWalletTest used to refreshWalletPaneState() in its
// finally, which re-renders the form from SAVED settings (empty for an unsaved
// URI) and cleared the field — so a subsequent Save saw an empty field and
// "removed" the wallet.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { ProfileWalletController } from "../js/ui/profileModal/ProfileWalletController.js";

const PUBKEY = "a".repeat(64);
const TYPED_URI = "nostr+walletconnect://abc?relay=wss://r.example&secret=def";

// isSecretInputElement accepts any object with a string `value`, so a plain
// object is a faithful stand-in for the input (no DOM needed).
function fakeInput(value = "", dataset = {}) {
  return { value, dataset };
}

test("testing an unsaved typed URI preserves it (does not wipe the field)", async () => {
  const controller = new ProfileWalletController({
    normalizeHexPubkey: (v) => (typeof v === "string" ? v : ""),
    getActivePubkey: () => PUBKEY,
    showSuccess: () => {},
    showStatus: () => {},
    showError: () => {},
    callbacks: { onWalletTest: () => {} },
    services: {
      nwcSettings: {
        // The wallet has NOT been saved yet — saved settings are empty.
        getActiveNwcSettings: () => ({ nwcUri: "" }),
        createDefaultNwcSettings: () => ({ nwcUri: "" }),
      },
    },
  });

  // Simulate the user having typed (unmasked) a URI into the field.
  controller.walletUriInput = fakeInput(TYPED_URI, { secretValue: TYPED_URI, secretMasked: "false" });
  controller.walletDefaultZapInput = fakeInput("", {});

  // Stub the network/test + busy state; let the real test() finally run.
  controller.isWalletBusy = () => false;
  controller.testWalletConnection = async () => ({ ok: true });
  controller.setWalletPaneBusy = () => {};
  controller.updateWalletStatus = () => {};
  controller.applyWalletControlState = () => {}; // not under test

  await controller.handleWalletTest();

  assert.equal(
    controller.getSecretInputValue(controller.walletUriInput),
    TYPED_URI,
    "the typed URI must survive a Test so the next Save persists it (not 'remove')",
  );
});
