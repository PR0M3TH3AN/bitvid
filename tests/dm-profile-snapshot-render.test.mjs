import test from "node:test";
import assert from "node:assert/strict";

import { ProfileDirectMessageActions } from "../js/ui/profileModal/ProfileDirectMessageActions.js";

test("DM pane renders a persisted snapshot while the relay load is still active", () => {
  const scheduled = [];
  const actor = "a".repeat(64);
  const controller = {
    activeMessagesRequest: Symbol("relay-load"),
    directMessagesCache: [],
    directMessagesLastActor: null,
    helper: { resolveActiveDmActor: () => actor },
    renderer: {
      scheduleDirectMessagesRender: (detail) => scheduled.push(detail),
      setMessagesLoadingState: () => {},
    },
  };
  const actions = new ProfileDirectMessageActions({}, controller);
  const messages = [{ event: { id: "cached-message" } }];

  actions.handleDirectMessagesUpdated({ messages, reason: "snapshot" });

  assert.deepEqual(controller.directMessagesCache, messages);
  assert.equal(controller.directMessagesLastActor, actor);
  assert.deepEqual(scheduled, [{ messages, actorPubkey: actor, reason: "snapshot" }]);
});

test("DM pane waits for relay increments but ignores unrelated updates during a load", () => {
  const controller = {
    activeMessagesRequest: Symbol("relay-load"),
    directMessagesCache: [],
    directMessagesLastActor: null,
    helper: { resolveActiveDmActor: () => "a".repeat(64) },
    renderer: {
      scheduleDirectMessagesRender: () => assert.fail("unrelated update must not render"),
      setMessagesLoadingState: () => {},
    },
  };
  const actions = new ProfileDirectMessageActions({}, controller);

  actions.handleDirectMessagesUpdated({ messages: [{ event: { id: "other" } }], reason: "load" });

  assert.deepEqual(controller.directMessagesCache, []);
});
