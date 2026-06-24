// Regression: clicking the "Message" button added the user to the sidebar but
// the right-hand message pane stayed on the previously-active conversation.
// setDirectMessageRecipient relied on setFocusedDmConversation (which only
// tracks read-state) and never updated activeDmConversationId — the value
// buildDmConversationData reads to decide which thread the right pane renders.
//
// Scenario (SCN-dm-select-makes-active):
//   Given a controller whose activeDmConversationId points at an old thread,
//   When a new recipient is selected via setDirectMessageRecipient,
//   Then activeDmConversationId becomes the new recipient's conversation id
//     (so the right pane switches), and the mobile pane shows the thread.

import test from "node:test";
import assert from "node:assert/strict";

import { ProfileDirectMessageController } from "../../js/ui/profileModal/ProfileDirectMessageController.js";

// The method does `instanceof HTMLElement` guards; the stubbed DOM refs are null,
// so the constructor just needs the global to exist.
if (typeof globalThis.HTMLElement === "undefined") {
  globalThis.HTMLElement = class HTMLElement {};
}

const ACTOR = "a".repeat(64);
const OLD = "b".repeat(64);
const NEW = "c".repeat(64);

function makeFakeController() {
  const focusCalls = [];
  return {
    activeDmConversationId: `dm:${[ACTOR, OLD].sort().join(":")}`,
    dmMobileView: "list",
    dmPrivacyToggleTouched: true,
    directMessagesCache: [],
    focusCalls,
    mainController: {
      normalizeHexPubkey: (v) => (typeof v === "string" && v.trim() ? v.trim() : ""),
      state: { setDmRecipient: () => {} },
    },
    helper: {
      resolveActiveDmActor: () => ACTOR,
      buildDmConversationId: (actor, remote) =>
        `dm:${[actor, remote].sort().join(":")}`,
      ensureDmRecipientData: () => {},
    },
    renderer: {
      profileMessagesList: null,
      dmAppShellContainer: null,
      setMessagesAnnouncement: () => {},
      renderDirectMessageConversation: () => {},
      renderDmAppShell: () => {},
    },
    updateMessageThreadSelection() {},
    setFocusedDmConversation(id) {
      focusCalls.push(id);
    },
  };
}

test("selecting a recipient makes its conversation active in the right pane", () => {
  const ctx = makeFakeController();
  const expectedId = `dm:${[ACTOR, NEW].sort().join(":")}`;

  const result = ProfileDirectMessageController.prototype.setDirectMessageRecipient.call(
    ctx,
    NEW,
    { reason: "external" },
  );

  assert.equal(result, NEW, "returns the normalized recipient");
  assert.equal(
    ctx.activeDmConversationId,
    expectedId,
    "activeDmConversationId must move to the selected recipient (not stay on the old thread)",
  );
  assert.equal(ctx.dmMobileView, "thread", "mobile pane switches to the thread");
  assert.deepEqual(
    ctx.focusCalls,
    [expectedId],
    "still tracks read-state for the focused conversation",
  );
});

test("the auto thread-default does not force the mobile thread view", () => {
  const ctx = makeFakeController();
  ProfileDirectMessageController.prototype.setDirectMessageRecipient.call(ctx, NEW, {
    reason: "thread-default",
  });
  assert.equal(
    ctx.dmMobileView,
    "list",
    "thread-default keeps the inbox list visible on mobile",
  );
});
