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

test("VideoModal trims tag strip to fit modal width", async (t) => {
  const { window, modal, cleanup } = await setupModal();
  t.after(cleanup);

  const root = modal.videoTagsRoot;
  assert.ok(root, "tag container should be available after hydrate");

  modal.setTagPreferenceStateResolver((tag) => {
    if (tag === "#alpha") {
      return "interest";
    }
    if (tag === "#beta") {
      return "disinterest";
    }
    return "neutral";
  });

  let containerWidth = 180;
  Object.defineProperty(root, "clientWidth", {
    configurable: true,
    get() {
      return containerWidth;
    },
  });
  root.getBoundingClientRect = () => ({ width: containerWidth });

  const elementPrototype = window.HTMLElement.prototype;
  const originalScrollWidthDescriptor =
    Object.getOwnPropertyDescriptor(elementPrototype, "scrollWidth") || null;

  Object.defineProperty(elementPrototype, "scrollWidth", {
    configurable: true,
    get() {
      if (this.classList?.contains("video-tag-strip")) {
        const buttonCount = this.querySelectorAll("button[data-tag]").length;
        return buttonCount * 90;
      }
      if (originalScrollWidthDescriptor?.get) {
        return originalScrollWidthDescriptor.get.call(this);
      }
      return 0;
    },
  });

  t.after(() => {
    if (originalScrollWidthDescriptor) {
      Object.defineProperty(
        elementPrototype,
        "scrollWidth",
        originalScrollWidthDescriptor,
      );
    } else {
      delete elementPrototype.scrollWidth;
    }
    delete root.clientWidth;
    delete root.getBoundingClientRect;
  });

  modal.renderVideoTags(["gamma", "beta", "delta", "alpha"]);

  const trimmedButtons = [
    ...root.querySelectorAll("button[data-tag]"),
  ];
  assert.equal(trimmedButtons.length, 2, "tag list should be trimmed to fit");
  assert.deepEqual(
    trimmedButtons.map((button) => button.dataset.tag),
    ["#alpha", "#beta"],
    "leading tags should remain after trimming",
  );
  assert.equal(
    trimmedButtons[0].dataset.preferenceState,
    "interest",
    "interest styling should persist on trimmed buttons",
  );
  assert.equal(
    trimmedButtons[0].dataset.variant,
    "success",
    "interest variant token should remain on trimmed buttons",
  );
  assert.equal(
    trimmedButtons[1].dataset.preferenceState,
    "disinterest",
    "disinterest styling should persist on trimmed buttons",
  );
  assert.equal(
    trimmedButtons[1].dataset.variant,
    "critical",
    "disinterest variant token should remain on trimmed buttons",
  );
  assert.equal(
    root.hasAttribute("hidden"),
    false,
    "tag container should stay visible when pills remain",
  );

  containerWidth = 300;
  modal.reflowVideoTags();

  const expandedButtons = [
    ...root.querySelectorAll("button[data-tag]"),
  ];
  assert.equal(
    expandedButtons.length,
    3,
    "reflow should allow more tags when width increases",
  );
  assert.deepEqual(
    expandedButtons.map((button) => button.dataset.tag),
    ["#alpha", "#beta", "#delta"],
    "reflow should restore full list order before trimming",
  );
});

