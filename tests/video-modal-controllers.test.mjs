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


// Channel-profile link in the player modal (TODO #53): clicking the creator
// avatar/name must navigate to the creator's channel. It dispatched
// "navigate:profile", which had NO listener (ModalManager listens for
// "creator:navigate"), so the click did nothing — same class as the old
// action:embed bug. Now it dispatches "creator:navigate" with the pubkey.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-video-modal-creator-nav
//       given: "a video modal with an active video"
//       when: "handleCreatorNavigation runs (creator avatar/name click)"
//       then: "it dispatches creator:navigate with the pubkey, not the dead navigate:profile"
//   observable_outcomes:
//     - "creator:navigate fires with { pubkey }"
//     - "the old dead navigate:profile event never fires"
//   determinism_controls:
//     - "JSDOM modal via setupModal; synchronous dispatch"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "asserting the broken event name"]
//   relaxation:
//     did_relax_any_assertion: false

test("creator link dispatches creator:navigate with the pubkey (not the dead navigate:profile)", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);

  modal.activeVideo = { pubkey: "a".repeat(64) };

  let creatorNavigate = null;
  let deadEventFired = false;
  modal.addEventListener("creator:navigate", (event) => {
    creatorNavigate = event.detail;
  });
  modal.addEventListener("navigate:profile", () => {
    deadEventFired = true;
  });

  modal.handleCreatorNavigation();

  assert.ok(creatorNavigate, "creator:navigate should fire (ModalManager listens for it)");
  assert.equal(creatorNavigate.pubkey, "a".repeat(64));
  assert.equal(deadEventFired, false, "the old listener-less navigate:profile must not be used");
});

test("creator navigation is a no-op without an active video pubkey", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);

  modal.activeVideo = { pubkey: "" };
  let fired = false;
  modal.addEventListener("creator:navigate", () => {
    fired = true;
  });
  modal.handleCreatorNavigation();
  assert.equal(fired, false, "no pubkey → no navigation event");
});

// Like/dislike in the player modal (TODO #54): clicking a reaction button must
// dispatch "video:reaction" (→ app.handleVideoReaction → reactionController). The
// old handleReactionClick called this.reactionsController.handleReaction (a method
// that doesn't exist on the video-modal reactions controller) with the raw DOM
// event, so nothing was published.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-video-modal-reaction-dispatch
//       given: "a video modal with an active video"
//       when: "handleReactionClick runs for a like/dislike button or a bare +/-"
//       then: "it dispatches video:reaction with the derived reaction; unrelated targets do nothing"
//   observable_outcomes:
//     - "bare '+'/'-' → video:reaction with that reaction"
//     - "a click whose currentTarget is the like button → reaction '+'"
//     - "a null/unrelated target → no dispatch"
//   determinism_controls:
//     - "JSDOM modal via setupModal; synchronous dispatch"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "asserting the broken call path"]
//   relaxation:
//     did_relax_any_assertion: false

test("like/dislike dispatches video:reaction with the derived reaction", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);

  modal.activeVideo = { pubkey: "a".repeat(64) };
  const events = [];
  modal.addEventListener("video:reaction", (event) => events.push(event.detail));

  modal.handleReactionClick("+");
  modal.handleReactionClick("-");

  assert.equal(events.length, 2, "both reactions dispatched");
  assert.equal(events[0].reaction, "+");
  assert.equal(events[1].reaction, "-");
  assert.equal(events[0].video, modal.activeVideo, "carries the active video");

  // And via a real button click (currentTarget = the bound like button).
  if (modal.reactionButtons?.["+"]) {
    modal.handleReactionClick({ currentTarget: modal.reactionButtons["+"] });
    assert.equal(events[2]?.reaction, "+", "derived '+' from the like button element");
  }
});

test("reaction click with no matching button does not dispatch", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);

  let fired = false;
  modal.addEventListener("video:reaction", () => {
    fired = true;
  });
  modal.handleReactionClick({ currentTarget: null });
  modal.handleReactionClick({});
  assert.equal(fired, false, "no reaction event for an unrelated/empty target");
});

// Share popover (reported: "Copy URL / Copy Magnet / Copy CDN don't work"). The
// share menu buttons only set data-action (like the ⋯ menu), but unlike the ⋯
// menu nothing wired their clicks, so they were dead. handleShareMenuAction now
// routes each to the event videoModalController already handles.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-video-modal-share-menu-routing
//       given: "a video modal with an active video"
//       when: "handleShareMenuAction runs for a share-menu action"
//       then: "it dispatches the matching video:* event; forced-source actions do not re-route"
//   determinism_controls:
//     - "JSDOM modal via setupModal; synchronous dispatch"
//   relaxation:
//     did_relax_any_assertion: false

test("share menu Copy Magnet routes to video:copy-magnet", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);
  modal.activeVideo = { id: "e".repeat(64), url: "https://x/v.mp4", magnet: "" };
  const events = [];
  modal.addEventListener("video:copy-magnet", (e) => events.push(e.detail));
  modal.handleShareMenuAction("copy-magnet");
  assert.equal(events.length, 1, "Copy Magnet dispatches video:copy-magnet");
  assert.equal(events[0].video.id, "e".repeat(64));
});

test("share menu Copy CDN routes to video:copy-cdn", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);
  modal.activeVideo = { id: "e".repeat(64), url: "https://x/v.mp4" };
  const events = [];
  modal.addEventListener("video:copy-cdn", (e) => events.push(e.detail));
  modal.handleShareMenuAction("copy-cdn");
  assert.equal(events.length, 1, "Copy CDN dispatches video:copy-cdn");
  assert.equal(events[0].video.url, "https://x/v.mp4");
});

test("share menu Copy URL routes to video:copy-url", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);
  modal.activeVideo = { id: "e".repeat(64) };
  const events = [];
  modal.addEventListener("video:copy-url", (e) => events.push(e.detail));
  modal.handleShareMenuAction("share");
  assert.equal(events.length, 1, "Copy URL dispatches video:copy-url");
  assert.equal(typeof events[0].url, "string");
});

test("share menu Share on Nostr routes to video:share-nostr", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);
  modal.activeVideo = { id: "e".repeat(64) };
  const events = [];
  modal.addEventListener("video:share-nostr", (e) => events.push(e.detail));
  modal.handleShareMenuAction("share-nostr");
  assert.equal(events.length, 1, "Share on Nostr dispatches video:share-nostr");
});

test("share menu forced-source actions do not re-route through handleShareMenuAction", async (t) => {
  const { modal, cleanup } = await setupModal();
  t.after(cleanup);
  modal.activeVideo = { id: "e".repeat(64) };
  let fired = false;
  ["video:copy-magnet", "video:copy-cdn", "video:copy-url", "video:share-nostr"].forEach(
    (name) => modal.addEventListener(name, () => { fired = true; })
  );
  modal.handleShareMenuAction("copy-cdn-url");
  modal.handleShareMenuAction("copy-webtorrent-url");
  assert.equal(fired, false, "forced-source links self-wire; not routed here");
});
