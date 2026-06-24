// Regression (#19): the DM app-shell renderer wires its callbacks on
// `this.controller` (the ProfileDirectMessageController), but the controller was
// missing the delegation methods that forward to `this.actions` — so clicking Send
// threw "this.controller.handleDmAppShellSendMessage is not a function" and no DM
// could be sent (same class for mark-read / settings / toggles).

import test from "node:test";
import assert from "node:assert/strict";

const { ProfileDirectMessageController } = await import(
  "../js/ui/profileModal/ProfileDirectMessageController.js"
);

// These are the app-shell callbacks the renderer invokes on the controller; each
// must exist and forward to the matching method on `this.actions`.
const DELEGATED = [
  "handleDmAppShellSendMessage",
  "handleDmConversationMarkRead",
  "handleDmMarkAllConversationsRead",
  "handleReadReceiptsToggle",
  "handleTypingIndicatorsToggle",
  "openDmSettingsModal",
];

test("controller delegates every DM app-shell callback to this.actions", () => {
  const proto = ProfileDirectMessageController.prototype;
  for (const name of DELEGATED) {
    assert.equal(
      typeof proto[name],
      "function",
      `controller.${name} delegation must exist (renderer calls it)`,
    );

    const received = [];
    const fakeController = {
      actions: {
        [name]: (...args) => {
          received.push(args);
          return `ok:${name}`;
        },
      },
    };
    const result = proto[name].call(fakeController, "arg-a", "arg-b");
    assert.equal(result, `ok:${name}`, `${name} must return the actions result`);
    assert.deepEqual(
      received[0],
      ["arg-a", "arg-b"],
      `${name} must forward its arguments to this.actions.${name}`,
    );
  }
});

test("controller delegates resolveProfileSummaryForPubkey to this.helper", () => {
  // ProfileModerationController calls dmController.resolveProfileSummaryForPubkey;
  // the method lives on the helper, so the controller must delegate it.
  const proto = ProfileDirectMessageController.prototype;
  assert.equal(typeof proto.resolveProfileSummaryForPubkey, "function");
  const received = [];
  const fake = {
    helper: {
      resolveProfileSummaryForPubkey: (...args) => {
        received.push(args);
        return "summary";
      },
    },
  };
  const result = proto.resolveProfileSummaryForPubkey.call(fake, "pubkey-x");
  assert.equal(result, "summary");
  assert.deepEqual(received[0], ["pubkey-x"]);
});
