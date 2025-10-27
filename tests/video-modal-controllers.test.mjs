import test from "node:test";
import assert from "node:assert/strict";

import { setupModal } from "./video-modal-accessibility.test.mjs";

test("CommentsController lifecycle manages comment references", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);

  assert.ok(modal.commentsRoot, "comments should be initialized after hydrate");

  modal.commentsController.destroy();
  assert.equal(modal.commentsRoot, null, "destroy should clear comment root");

  modal.commentsController.initialize({ playerModal: modal.getRoot() });
  assert.ok(modal.commentsRoot, "initialize should restore comment root");
});

test("ReactionsController delegates reaction updates", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);

  modal.reactionsController.update({ type: "set-user-reaction", reaction: "+" });
  assert.equal(
    modal.reactionState.userReaction,
    "+",
    "user reaction should be updated via controller",
  );

  modal.reactionsController.destroy();
  assert.equal(
    modal.reactionButtons["+"],
    null,
    "destroy should clear reaction button references",
  );
});

test("SimilarContentController toggles section visibility", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);

  const container = modal.similarContentContainer;
  assert.ok(container, "similar content container should exist");

  modal.similarContentController.update({ type: "set-visibility", visible: false });
  assert.equal(
    container.hasAttribute("hidden"),
    true,
    "controller should hide similar content when requested",
  );

  modal.similarContentController.update({ type: "set-visibility", visible: true });
  assert.equal(
    container.hasAttribute("hidden"),
    false,
    "controller should reveal similar content",
  );
});

test("ModerationController reset clears moderation overlay references", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);

  assert.ok(modal.moderationOverlay, "moderation overlay should be present");

  modal.moderationController.destroy();
  assert.equal(
    modal.moderationOverlay,
    null,
    "destroy should clear moderation overlay references",
  );

  modal.moderationController.initialize({ playerModal: modal.getRoot() });
  assert.ok(
    modal.moderationOverlay,
    "initialize should restore moderation overlay references",
  );
});

