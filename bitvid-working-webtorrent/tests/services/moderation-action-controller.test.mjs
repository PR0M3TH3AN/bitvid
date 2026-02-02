import test from "node:test";
import assert from "node:assert/strict";
import ModerationActionController from "../../js/services/moderationActionController.js";

test("ModerationActionController: handles moderation override", async () => {
  const overrides = [];
  const events = [];

  const mockServices = {
    setModerationOverride: (descriptor, opts) => overrides.push({ descriptor, opts }),
    clearModerationOverride: () => {},
    userBlocks: {},
  };

  const mockSelectors = {
    getVideoById: (id) => ({ id, moderation: { hidden: true } }),
    getCurrentVideo: () => ({ id: "video1", moderation: { hidden: true } }),
  };

  const mockUi = {
    refreshCardModerationUi: () => {},
    dispatchModerationEvent: (name, detail) => events.push({ name, detail }),
  };

  const mockActions = {
    decorateVideoModeration: (video) => { video.decorated = true; },
    resumePlayback: () => {},
  };

  const mockAuth = {
    normalizePubkey: (k) => k,
  };

  const controller = new ModerationActionController({
    services: mockServices,
    selectors: mockSelectors,
    ui: mockUi,
    actions: mockActions,
    auth: mockAuth,
  });

  const video = { id: "video1", pubkey: "author1" };
  const result = controller.handleOverride({ video });

  assert.equal(result, true);
  assert.equal(overrides.length, 1);
  assert.equal(overrides[0].descriptor.eventId, "video1");
  assert.equal(overrides[0].descriptor.authorPubkey, "author1");

  assert.equal(events.length, 1);
  assert.equal(events[0].name, "video:moderation-override");
  assert.equal(events[0].detail.video.id, "video1");
});

test("ModerationActionController: blocks user and updates state", async () => {
  const blocks = [];
  const events = [];
  const errors = [];

  const mockServices = {
    userBlocks: {
      ensureLoaded: async () => {},
      isBlocked: () => false,
      addBlock: async (target, viewer) => {
        blocks.push({ target, viewer });
        return { already: false };
      },
    },
    clearModerationOverride: () => {},
  };

  const mockAuth = {
    isLoggedIn: () => true,
    getViewerPubkey: () => "viewer1",
    normalizePubkey: (k) => k,
  };

  const mockUi = {
    refreshCardModerationUi: () => {},
    dispatchModerationEvent: (name, detail) => events.push({ name, detail }),
  };

  const mockActions = {
    showStatus: () => {},
    showError: (msg) => errors.push(msg),
    refreshVideos: async () => {},
    decorateVideoModeration: () => {},
  };

  const controller = new ModerationActionController({
    services: mockServices,
    auth: mockAuth,
    ui: mockUi,
    actions: mockActions,
  });

  const video = { id: "video1", pubkey: "spammer" };
  const result = await controller.handleBlock({ video });

  assert.equal(result, true);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].target, "spammer");
  assert.equal(blocks[0].viewer, "viewer1");

  // Should trigger block and hide events
  assert.ok(events.find(e => e.name === "video:moderation-block"));
  assert.ok(events.find(e => e.name === "video:moderation-hide"));
  assert.equal(errors.length, 0);
});

test("ModerationActionController: prevents blocking self", async () => {
  const errors = [];

  const mockAuth = {
    isLoggedIn: () => true,
    getViewerPubkey: () => "me",
    normalizePubkey: (k) => k,
  };

  const mockServices = {
    userBlocks: { ensureLoaded: async () => {} },
  };

  const mockActions = {
    showError: (msg) => errors.push(msg),
  };

  const controller = new ModerationActionController({
    services: mockServices,
    auth: mockAuth,
    actions: mockActions,
  });

  const video = { id: "video1", pubkey: "me" };
  const result = await controller.handleBlock({ video });

  assert.equal(result, false);
  assert.ok(errors[0].includes("cannot block yourself"));
});

test("ModerationActionController: requires login to block", async () => {
  const statuses = [];

  const mockAuth = {
    isLoggedIn: () => false,
  };

  const mockServices = {
    userBlocks: {},
  };

  const mockActions = {
    showStatus: (msg) => statuses.push(msg),
  };

  const controller = new ModerationActionController({
    services: mockServices,
    auth: mockAuth,
    actions: mockActions,
  });

  const video = { id: "video1", pubkey: "someone" };
  const result = await controller.handleBlock({ video });

  assert.equal(result, false);
  assert.ok(statuses[0].includes("Log in"));
});

test("ModerationActionController: handles hide action", async () => {
  const events = [];

  const mockServices = {
    clearModerationOverride: () => {},
  };

  const mockSelectors = {
    getVideoById: (id) => ({ id }),
    getCurrentVideo: () => null,
  };

  const mockUi = {
    refreshCardModerationUi: () => {},
    dispatchModerationEvent: (name, detail) => events.push({ name, detail }),
  };

  const mockActions = {
    decorateVideoModeration: () => {},
  };

  const controller = new ModerationActionController({
    services: mockServices,
    selectors: mockSelectors,
    ui: mockUi,
    actions: mockActions,
  });

  const video = { id: "video1" };
  const result = controller.handleHide({ video });

  assert.equal(result, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, "video:moderation-hide");
});
