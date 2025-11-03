import test from "node:test";
import assert from "node:assert/strict";

import { setupModal } from "./video-modal-accessibility.test.mjs";
import VideoModalCommentController from "../js/ui/videoModalCommentController.js";
import { COMMENT_EVENT_KIND } from "../js/nostr/commentEvents.js";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([type="hidden"]):not([disabled])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  '[contenteditable="true"]',
  "[tabindex]",
  "audio[controls]",
  "video[controls]",
].join(",");

function createCommentEvent({ id, pubkey, content, createdAt, parentId = null }) {
  const tags = [["e", "video123"], ["a", "30078:authorpk:video-root"]];
  if (parentId) {
    tags.push(["e", parentId]);
  }
  assert.ok(
    tags.some((tag) => Array.isArray(tag) && tag[0] === "e" && tag[1] === "video123"),
    "comment fixture should include root #e tag",
  );
  assert.ok(
    tags.some(
      (tag) =>
        Array.isArray(tag) && tag[0] === "a" && tag[1] === "30078:authorpk:video-root",
    ),
    "comment fixture should include root #a tag",
  );
  return {
    id,
    pubkey,
    content,
    kind: 1,
    created_at: createdAt,
    tags,
  };
}

test("VideoModal comment section toggles visibility and renders hydrated comments", async (t) => {
  const { document, modal, cleanup } = await setupModal();
  t.after(cleanup);

  const commentsRoot = document.querySelector("[data-comments-root]");
  assert.ok(commentsRoot, "comment root should exist");

  modal.setCommentsVisibility(false);
  assert.equal(commentsRoot.hasAttribute("hidden"), true);
  assert.equal(commentsRoot.classList.contains("hidden"), true);

  modal.setCommentsVisibility(true);
  assert.equal(commentsRoot.hasAttribute("hidden"), false);
  assert.equal(commentsRoot.classList.contains("hidden"), false);

  const snapshot = {
    videoEventId: "video123",
    parentCommentId: null,
    commentsById: new Map([
      [
        "comment-1",
        createCommentEvent({
          id: "comment-1",
          pubkey: "pk1",
          content: "First!",
          createdAt: 1700000000,
        }),
      ],
      [
        "reply-1",
        createCommentEvent({
          id: "reply-1",
          pubkey: "pk2",
          content: "Thanks for sharing",
          createdAt: 1700000005,
          parentId: "comment-1",
        }),
      ],
    ]),
    childrenByParent: new Map([
      [null, ["comment-1"]],
      ["comment-1", ["reply-1"]],
    ]),
    profiles: new Map([
      ["pk1", { name: "Alice" }],
      ["pk2", { name: "Bob" }],
    ]),
  };

  modal.renderComments(snapshot);

  const renderedItems = Array.from(
    modal.commentsList.querySelectorAll("[data-comment-id]"),
  );
  assert.equal(renderedItems.length, 2, "should render top-level comment and reply");

  const topLevel = modal.commentsList.querySelector('[data-comment-id="comment-1"]');
  assert.ok(topLevel, "top-level comment node should render");
  assert.equal(topLevel.dataset.commentDepth, "0");

  const reply = modal.commentsList.querySelector('[data-comment-id="reply-1"]');
  assert.ok(reply, "reply node should render");
  assert.equal(reply.dataset.commentDepth, "1");
  assert.equal(reply.closest("ol").getAttribute("role"), "list");

  const countLabel = document.querySelector("[data-comments-count]");
  assert.equal(countLabel.textContent.trim(), "2 comments");

  const emptyState = document.querySelector("[data-comments-empty]");
  assert.equal(emptyState.hasAttribute("hidden"), true);
  assert.equal(modal.commentsList.getAttribute("data-empty"), null);
});

test("VideoModal comment composer updates messaging and dispatches events", async (t) => {
  const { window, document, modal, cleanup } = await setupModal();
  t.after(cleanup);

  const defaultHint = modal.commentComposerDefaultHint;
  assert.ok(defaultHint);

  modal.setCommentComposerState({ disabled: true, reason: "login-required" });
  assert.equal(modal.commentsInput.disabled, true);
  assert.equal(modal.commentsComposer.hasAttribute("hidden"), false);
  assert.equal(modal.commentsDisabledPlaceholder.hasAttribute("hidden"), true);
  assert.equal(modal.commentComposerHint.textContent.trim(), "Log in to add a comment.");
  assert.equal(modal.commentsStatusMessage.textContent.trim(), "");

  modal.setCommentComposerState({ disabled: false, reason: "error" });
  assert.equal(modal.commentsInput.disabled, false);
  assert.equal(
    modal.commentsStatusMessage.textContent.includes(
      "We couldn't post your comment. Try again?",
    ),
    true,
  );
  assert.ok(modal.commentRetryButton, "retry button should be rendered for error state");

  modal.showCommentsDisabledMessage("Comments have been turned off for this video.");
  modal.setCommentComposerState({ disabled: true, reason: "disabled" });
  assert.equal(modal.commentsComposer.hasAttribute("hidden"), true);
  assert.equal(modal.commentsDisabledPlaceholder.hasAttribute("hidden"), false);

  modal.setCommentComposerState({ disabled: false, reason: "" });
  assert.equal(modal.commentsComposer.hasAttribute("hidden"), false);
  assert.equal(modal.commentsDisabledPlaceholder.hasAttribute("hidden"), true);
  assert.equal(modal.commentComposerHint.textContent.trim(), defaultHint.trim());

  const loginRequests = [];
  const submitEvents = [];
  modal.addEventListener("comment:login-required", (event) => {
    loginRequests.push(event.detail);
  });
  modal.addEventListener("comment:submit", (event) => {
    submitEvents.push(event.detail);
  });

  modal.setCommentComposerState({ disabled: true, reason: "login-required" });
  modal.commentsComposer.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.equal(loginRequests.length, 1);
  assert.equal(submitEvents.length, 0);

  modal.setCommentComposerState({ disabled: false, reason: "" });
  modal.commentsInput.value = " New comment ";
  modal.updateCommentCharCount();
  modal.updateCommentSubmitState();
  assert.equal(modal.commentsSubmitButton.disabled, false);

  modal.commentsComposer.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );

  assert.equal(submitEvents.length, 1);
  const submitDetail = submitEvents[0];
  assert.deepStrictEqual(submitDetail.parentId, null);
  assert.equal(submitDetail.text, "New comment");
  assert.strictEqual(submitDetail.triggerElement, modal.commentsSubmitButton);
});

test(
  "VideoModalCommentController load preserves current video for submissions",
  async () => {
    const publishCalls = [];

    const controller = new VideoModalCommentController({
      commentThreadService: {
        setCallbacks: () => {},
        teardown: () => {},
        defaultLimit: 10,
        loadThread: () => Promise.resolve(),
        processIncomingEvent: () => {},
      },
      videoModal: {
        setCommentSectionCallbacks: () => {},
        hideCommentsDisabledMessage: () => {},
        showCommentsDisabledMessage: () => {},
        setCommentsVisibility: () => {},
        clearComments: () => {},
        resetCommentComposer: () => {},
        setCommentStatus: () => {},
        setCommentComposerState: () => {},
      },
      auth: {
        isLoggedIn: () => true,
      },
      services: {
        publishComment: async (payload) => {
          publishCalls.push(payload);
          return { ok: true, event: { id: "comment", tags: [] } };
        },
      },
      utils: {
        normalizeHexPubkey: (value) => value,
      },
    });

  const video = {
    id: "video123",
    pubkey: "AUTHORPK",
    enableComments: true,
    kind: 30078,
    tags: [["d", "video-root"]],
  };

    controller.load(video);
    controller.submit({ text: "Nice" });

    await controller.modalCommentPublishPromise;

    assert.equal(publishCalls.length, 1, "publishComment should be called once");
    const payload = publishCalls[0];
    assert.equal(payload.videoEventId, "video123");
    assert.equal(payload.videoAuthorPubkey, "AUTHORPK");
    assert.equal(payload.videoDefinitionAddress, "30078:AUTHORPK:video-root");
  },
);

test(
  "VideoModalCommentController publishes comment using event id fallback",
  async () => {
    const publishCalls = [];
    const statusMessages = [];
    let resetCalled = false;
    const composerStates = [];
    const appendedEvents = [];

    const videoModal = {
      setCommentComposerState: (state) => {
        composerStates.push({ ...state });
      },
      resetCommentComposer: () => {
        resetCalled = true;
      },
      setCommentStatus: (message) => {
        statusMessages.push(message);
      },
      appendComment: (event) => {
        appendedEvents.push(event);
      },
    };

    const processedEvents = [];

    const controller = new VideoModalCommentController({
      commentThreadService: {
        setCallbacks: () => {},
        processIncomingEvent: (event) => {
          processedEvents.push(event);
        },
      },
      videoModal,
      auth: {
        isLoggedIn: () => true,
      },
      services: {
        publishComment: async (payload, eventData) => {
          publishCalls.push([payload, eventData]);
          return {
            ok: true,
            event: {
              id: "legacy-comment",
              pubkey: "pk1",
              content: eventData.content,
              tags: [],
            },
          };
        },
      },
      utils: {
        normalizeHexPubkey: (value) => value?.toLowerCase?.() || value,
      },
    });

    controller.currentVideo = {
      id: "legacy-video",
      pubkey: "AUTHORPK",
      enableComments: true,
      kind: 30078,
      tags: [],
    };
    controller.modalCommentState.videoEventId = "legacy-video";

    await controller.handleVideoModalCommentSubmit({ text: "Legacy support" });

    assert.equal(publishCalls.length, 1, "publishComment should be invoked");
    const [payload, eventData] = publishCalls[0];
    assert.deepStrictEqual(payload, {
      videoEventId: "legacy-video",
      parentCommentId: null,
      videoKind: "30078",
      videoAuthorPubkey: "AUTHORPK",
      rootKind: "30078",
      rootAuthorPubkey: "AUTHORPK",
    });
    assert.equal(
      "videoDefinitionAddress" in payload,
      false,
      "payload should omit videoDefinitionAddress when unavailable",
    );
    assert.equal(eventData.content, "Legacy support");

    assert.equal(processedEvents.length, 1, "event should be processed optimistically");
    assert.equal(resetCalled, true, "composer should reset after publishing");
    assert.ok(
      statusMessages.includes("Comment posted."),
      "success message should be surfaced",
    );
    assert.equal(
      composerStates[composerStates.length - 1]?.disabled,
      false,
      "composer should be re-enabled after publishing",
    );
    assert.equal(appendedEvents.length, 0, "optimistic insert should avoid duplicate append");
  },
);

test(
  "VideoModalCommentController prompts login when publish requires authentication",
  async () => {
    const composerStates = [];
    const loginLifecycle = [];
    const errorMessages = [];

    const loginModal = {
      openModal: ({ triggerElement } = {}) => {
        loginLifecycle.push({ type: "openModal", triggerElement });
        return true;
      },
    };

    const controller = new VideoModalCommentController({
      commentThreadService: {
        setCallbacks: () => {},
        processIncomingEvent: () => {},
      },
      videoModal: {
        setCommentComposerState: (state) => {
          composerStates.push({ ...state });
        },
        resetCommentComposer: () => {
          throw new Error("composer should not reset when auth is required");
        },
        setCommentStatus: () => {},
        appendComment: () => {},
      },
      auth: {
        isLoggedIn: () => true,
        initializeLoginModalController: ({ logIfMissing }) => {
          loginLifecycle.push({ type: "initialize", logIfMissing });
        },
        getLoginModalController: () => loginModal,
        requestLogin: ({ allowAccountSelection }) => {
          loginLifecycle.push({ type: "request", allowAccountSelection });
          return Promise.resolve(true);
        },
      },
      callbacks: {
        showError: (message) => {
          errorMessages.push(message);
        },
        showStatus: () => {},
        muteAuthor: () => Promise.resolve(),
        shouldHideAuthor: () => false,
      },
      services: {
        publishComment: async () => ({ ok: false, error: "auth-required" }),
      },
      utils: {
        normalizeHexPubkey: (value) => value?.toLowerCase?.() || value,
      },
    });

    controller.currentVideo = {
      id: "video-auth",
      pubkey: "AUTHORPK",
      enableComments: true,
      kind: 30078,
      tags: [],
    };
    controller.modalCommentState.videoEventId = "video-auth";
    controller.modalCommentState.videoKind = "30078";
    controller.modalCommentState.videoAuthorPubkey = "AUTHORPK";

    const triggerElement = { id: "comment-trigger" };

    await controller.handleVideoModalCommentSubmit({
      text: "Needs auth",
      triggerElement,
    });

    const lastComposerState = composerStates[composerStates.length - 1];
    assert.deepStrictEqual(
      lastComposerState,
      { disabled: true, reason: "login-required" },
      "composer should remain disabled while prompting for login",
    );
    assert.equal(errorMessages.length, 0, "auth-required should not surface as an error");

    assert.equal(
      loginLifecycle.some((step) => step.type === "initialize"),
      true,
      "login modal controller should be initialized",
    );
    assert.equal(
      loginLifecycle.some((step) => step.type === "openModal"),
      true,
      "login modal should attempt to open",
    );
    const modalOpen = loginLifecycle.find((step) => step.type === "openModal");
    assert.equal(
      modalOpen?.triggerElement,
      triggerElement,
      "trigger element should propagate to login modal",
    );
  },
);

test(
  "VideoModalCommentController includes parent metadata when replying",
  async () => {
    const publishCalls = [];

    const parentEvent = {
      id: "parent-1",
      kind: COMMENT_EVENT_KIND,
      pubkey: "parentpk",
      tags: [],
    };

    const controller = new VideoModalCommentController({
      commentThreadService: {
        setCallbacks: () => {},
        getCommentEvent: (id) => (id === "parent-1" ? parentEvent : null),
        processIncomingEvent: () => {},
      },
      videoModal: {
        setCommentComposerState: () => {},
        setCommentStatus: () => {},
        resetCommentComposer: () => {},
        appendComment: () => {},
      },
      auth: {
        isLoggedIn: () => true,
      },
      services: {
        publishComment: async (payload) => {
          publishCalls.push(payload);
          return { ok: true, event: { id: "reply", tags: [] } };
        },
      },
      utils: {
        normalizeHexPubkey: (value) => value?.toLowerCase?.() || value,
      },
    });

    controller.currentVideo = {
      id: "video123",
      pubkey: "AUTHORPK",
      enableComments: true,
      kind: 30078,
    };
    controller.modalCommentState = {
      videoEventId: "video123",
      videoDefinitionAddress: null,
      videoKind: "30078",
      videoAuthorPubkey: "AUTHORPK",
      parentCommentId: "parent-1",
      parentCommentKind: String(COMMENT_EVENT_KIND),
      parentCommentPubkey: null,
    };

    await controller.handleVideoModalCommentSubmit({
      text: "Replying",
      parentId: "parent-1",
    });

    assert.equal(publishCalls.length, 1, "reply should trigger publish call");
    const payload = publishCalls[0];
    assert.equal(payload.videoEventId, "video123");
    assert.equal(payload.videoKind, "30078");
    assert.equal(payload.videoAuthorPubkey, "AUTHORPK");
    assert.equal(payload.parentCommentId, "parent-1");
    assert.equal(payload.parentCommentKind, String(COMMENT_EVENT_KIND));
    assert.equal(payload.parentCommentPubkey, "parentpk");
    assert.equal(payload.parentAuthorPubkey, "parentpk");
    assert.equal(payload.rootAuthorPubkey, "AUTHORPK");
  },
);

test("VideoModal comment section exposes aria landmarks and participates in focus trap", async (t) => {
  const { window, document, modal, playerModal, trigger, cleanup } = await setupModal();
  t.after(cleanup);

  modal.open(null, { triggerElement: trigger });
  await Promise.resolve();

  const commentsRoot = document.querySelector("[data-comments-root]");
  const commentsHeading = document.getElementById("videoModalCommentsHeading");
  assert.ok(commentsRoot, "comment root should exist when modal opens");
  assert.ok(commentsHeading, "comment heading should exist");
  assert.equal(commentsRoot.getAttribute("role"), "region");
  assert.equal(commentsRoot.getAttribute("aria-labelledby"), commentsHeading.id);
  assert.equal(modal.commentsComposer.getAttribute("aria-labelledby"), commentsHeading.id);

  const commentInput = document.querySelector("[data-comments-input]");
  assert.ok(commentInput, "comment textarea should exist");
  assert.equal(
    commentInput.getAttribute("aria-describedby"),
    "commentComposerHelp commentComposerCount",
  );

  const focusableElements = Array.from(
    playerModal.querySelectorAll(FOCUSABLE_SELECTOR),
  );
  focusableElements.forEach((element) => {
    if (element === commentInput) {
      element.removeAttribute("tabindex");
      element.disabled = false;
      return;
    }
    if (typeof element.disabled === "boolean") {
      element.disabled = true;
    }
    element.setAttribute("tabindex", "-1");
  });

  commentInput.focus();
  const tabEvent = new window.KeyboardEvent("keydown", {
    key: "Tab",
    bubbles: true,
    cancelable: true,
  });
  commentInput.dispatchEvent(tabEvent);

  assert.equal(tabEvent.defaultPrevented, true, "focus trap should intercept Tab");
  const activeAfter = document.activeElement;
  assert.ok(
    activeAfter === commentInput || activeAfter === modal.modalPanel,
    "focus trap should keep focus within the modal",
  );

  modal.close();
});
