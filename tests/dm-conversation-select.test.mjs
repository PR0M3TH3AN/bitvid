// Scenario (SCN-dm-open-conversation):
//   Given the DM contact list is rendered,
//   When the user clicks a conversation (onSelectConversation → controller
//     delegate → ProfileDirectMessageActions.handleDmConversationSelect),
//   Then it focuses that conversation and re-renders the thread WITHOUT throwing
//     — i.e. it must call controller/main-controller methods on the right
//     receiver, not on the Actions instance (the bug that made opening any
//     conversation throw "… is not a function" — KNOWN_BUGS #0 follow-up).

import test from "node:test";
import assert from "node:assert/strict";

const { ProfileDirectMessageActions } = await import(
  "../js/ui/profileModal/ProfileDirectMessageActions.js"
);

test("handleDmConversationSelect focuses + renders via the correct receivers", async () => {
  const calls = [];
  const renderer = {
    renderDmAppShell: async (...args) => {
      calls.push(["renderDmAppShell", args.length]);
    },
  };
  const controller = {
    dmMobileView: "list",
    activeDmConversationId: "",
    directMessagesCache: { conversations: [] },
    helper: {
      resolveActiveDmActor: () => "actor-pubkey",
      resolveRemoteForConversationId: () => "remote-pubkey",
    },
    renderer,
    setDirectMessageRecipient: (...args) => calls.push(["setDirectMessageRecipient", args[0]]),
    setFocusedDmConversation: (id) => calls.push(["setFocusedDmConversation", id]),
  };
  const mainController = {};

  const actions = new ProfileDirectMessageActions(mainController, controller);
  // Actions.setDirectMessageRecipient delegates to controller; keep the real one.

  await actions.handleDmConversationSelect({ id: "conv-123" });

  assert.equal(controller.dmMobileView, "thread", "switches to thread view");
  assert.equal(controller.activeDmConversationId, "conv-123", "sets active conversation");
  assert.ok(
    calls.some(([m, v]) => m === "setFocusedDmConversation" && v === "conv-123"),
    "focuses the selected conversation on the controller",
  );
  assert.ok(
    calls.some(([m]) => m === "renderDmAppShell"),
    "re-renders the DM thread",
  );
});

test("handleDmConversationSelect ignores an empty conversation id", async () => {
  const controller = {
    dmMobileView: "list",
    helper: {
      resolveActiveDmActor: () => "actor",
      resolveRemoteForConversationId: () => "remote",
    },
    renderer: { renderDmAppShell: async () => {} },
    setFocusedDmConversation: () => {
      throw new Error("should not focus on empty id");
    },
  };
  const actions = new ProfileDirectMessageActions({}, controller);
  await actions.handleDmConversationSelect({ id: "   " });
  assert.equal(controller.dmMobileView, "list", "no-op for blank conversation id");
});
