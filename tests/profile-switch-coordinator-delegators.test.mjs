// Switching to a saved nsec account threw "this.prepareStoredNsecSwitch is not a
// function". Root cause: bindCoordinator binds every coordinator method to the
// Application (`this` === app), so when a coordinator method calls a SIBLING via
// `this.sibling(...)` it resolves against the Application — which therefore needs
// an app-level delegator for that sibling. handleProfileSwitchRequest calls
// this.prepareStoredNsecSwitch / this.handleModerationSettingsChange /
// this.waitForIdentityRefresh; the nsec one was missing its delegator.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-profile-switch-coordinator-delegators
//       given: "the Application class"
//       when: "handleProfileSwitchRequest runs (bound to app) and calls siblings"
//       then: "every sibling it calls exists as an app-level method/delegator"
//   observable_outcomes:
//     - "Application.prototype.prepareStoredNsecSwitch is a function"
//     - "the other siblings it invokes are also app methods"
//   determinism_controls:
//     - "static prototype inspection; no network/clock/DOM"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import { strict as assert } from "node:assert";
import { Application } from "../js/app.js";

// Every coordinator sibling that handleProfileSwitchRequest calls via `this.X`
// must exist as an app-level method, because bindCoordinator binds the coordinator
// methods to the Application instance.
const REQUIRED_APP_METHODS = [
  "handleProfileSwitchRequest",
  "prepareStoredNsecSwitch", // was missing -> the reported bug
  "handleModerationSettingsChange",
  "waitForIdentityRefresh",
];

for (const name of REQUIRED_APP_METHODS) {
  test(`Application exposes ${name}() so the bound profile-switch flow can call it`, () => {
    assert.equal(
      typeof Application.prototype[name],
      "function",
      `Application.prototype.${name} must be a function (coordinator siblings are ` +
        `bound to app; handleProfileSwitchRequest calls it via this.${name}())`,
    );
  });
}
