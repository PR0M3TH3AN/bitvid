// Regression: relay add/remove/mode/restore all funnel through
// handleRelayOperation, which must call runRelayOperation on the MAIN profile
// controller (it owns the onRelayOperation callback). When relay logic was
// extracted into ProfileRelayController, the call was left as
// `this.runRelayOperation` — undefined on the relay controller — so every relay
// operation threw "this.runRelayOperation is not a function". This guards the
// routing so removal/add actually reach the operation handler.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { ProfileRelayController } from "../js/ui/profileModal/ProfileRelayController.js";

const PK = "a".repeat(64);

function makeController() {
  const calls = [];
  const mainController = {
    normalizeHexPubkey: (v) => (typeof v === "string" ? v.trim().toLowerCase() : ""),
    getActivePubkey: () => PK,
    showError: (msg) => calls.push(["showError", msg]),
    showSuccess: (msg) => calls.push(["showSuccess", msg]),
    runRelayOperation: async (args) => {
      calls.push(["runRelayOperation", args]);
      return { ok: true, changed: true };
    },
    services: {},
    callbacks: {},
  };
  const controller = Object.create(ProfileRelayController.prototype);
  controller.mainController = mainController;
  // populateProfileRelays / refreshRelayHealthPanel are called after the op;
  // stub them so the routing test stays focused and DOM-free.
  controller.populateProfileRelays = () => {};
  controller.refreshRelayHealthPanel = () => {};
  return { controller, calls, mainController };
}

test("handleRelayOperation routes to mainController.runRelayOperation", async () => {
  const { controller, calls } = makeController();

  const result = await controller.handleRelayOperation(
    { action: "remove", url: "wss://dead.example.com" },
    { successMessage: "Relay removed." },
  );

  const opCall = calls.find((c) => c[0] === "runRelayOperation");
  assert.ok(opCall, "must invoke runRelayOperation on the main controller");
  assert.equal(opCall[1].action, "remove");
  assert.equal(opCall[1].url, "wss://dead.example.com");
  assert.equal(opCall[1].activePubkey, PK, "forwards the active pubkey");
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
});

test("handleRelayOperation surfaces a login error when there is no active pubkey", async () => {
  const { controller, calls, mainController } = makeController();
  mainController.getActivePubkey = () => "";

  const result = await controller.handleRelayOperation({ action: "remove", url: "wss://x" });

  assert.equal(result.reason, "no-active-pubkey");
  assert.ok(
    !calls.some((c) => c[0] === "runRelayOperation"),
    "must not attempt the operation without a pubkey",
  );
});
