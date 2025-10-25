import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  renderChannelVideosFromList,
  applyChannelVisualBlur,
  __setChannelProfileTestState,
  __ensureChannelModerationEventsForTests,
} from "../../js/channelProfile.js";
import { nostrClient } from "../../js/nostrClientFacade.js";
import moderationService from "../../js/services/moderationService.js";
import { withMockedNostrTools, createModerationAppHarness } from "../helpers/moderation-test-helpers.mjs";

function setupDom(t) {
  const dom = new JSDOM(
    "<!DOCTYPE html><html><body>" +
      '<div id="channelBanner"></div>' +
      '<img id="channelAvatar" />' +
      '<div id="channelVideoList"></div>' +
      "</body></html>",
    { url: "https://example.invalid/channel" },
  );

  const { window } = dom;
  const { document } = window;

  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    Node: globalThis.Node,
    navigator: globalThis.navigator,
    location: globalThis.location,
    MutationObserver: globalThis.MutationObserver,
    IntersectionObserver: globalThis.IntersectionObserver,
  };

  globalThis.window = window;
  globalThis.document = document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.Node = window.Node;
  globalThis.navigator = window.navigator;
  globalThis.location = window.location;
  globalThis.MutationObserver = window.MutationObserver;
  globalThis.IntersectionObserver =
    window.IntersectionObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };

  t.after(() => {
    Object.entries(previousGlobals).forEach(([key, value]) => {
      if (typeof value === "undefined") {
        delete globalThis[key];
      } else {
        globalThis[key] = value;
      }
    });
  });

  return { document, window };
}

function createVideoFixture(overrides = {}) {
  return {
    id: overrides.id || "v".repeat(64),
    title: overrides.title || "Fixture Video",
    pubkey: overrides.pubkey || "a".repeat(64),
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    url: overrides.url || "https://example.invalid/video.mp4",
    moderation: overrides.moderation || {},
    ...overrides,
  };
}

test("renderChannelVideosFromList decorates videos before storing", async (t) => {
  const { document } = setupDom(t);
  withMockedNostrTools(t);

  nostrClient.allEvents = new Map();
  nostrClient.rawEvents = new Set();

  const app = await createModerationAppHarness();
  app.loadedThumbnails = new Map();
  app.videosMap = new Map();
  app.buildShareUrlFromEventId = (id) => `https://example.invalid/watch/${id}`;
  app.formatTimeAgo = () => "just now";
  app.ensureGlobalMoreMenuHandlers = () => {};
  app.closeAllMoreMenus = () => {};
  app.normalizeHexPubkey = (value) =>
    typeof value === "string" ? value.trim().toLowerCase() : "";
  app.hasOlderVersion = () => false;
  app.deriveVideoPointerInfo = () => null;
  app.persistWatchHistoryMetadataForVideo = () => {};
  app.canCurrentUserManageBlacklist = () => false;
  app.isMagnetUriSupported = () => false;
  app.mountVideoListView = () => {};
  app.mediaLoader = { observe() {} };
  app.attachMoreMenuHandlers = () => {};

  const originalDecorate = app.decorateVideoModeration;
  let decoratedCount = 0;
  app.decorateVideoModeration = function decorated(video) {
    decoratedCount += 1;
    if (!video.moderation || typeof video.moderation !== "object") {
      video.moderation = {};
    }
    video.moderation.decoratedByTest = true;
    return originalDecorate.call(this, video);
  };

  const container = document.getElementById("channelVideoList");
  const video = createVideoFixture();

  const rendered = renderChannelVideosFromList({
    videos: [video],
    container,
    app,
    loadToken: 0,
  });

  assert.equal(rendered, true);
  assert.equal(decoratedCount, 1);
  const stored = app.videosMap.get(video.id);
  assert.ok(stored, "decorated video stored in videosMap");
  assert.equal(stored.moderation.decoratedByTest, true);
});

test("applyChannelVisualBlur blurs banner and avatar when viewer mutes author", async (t) => {
  const { document } = setupDom(t);
  withMockedNostrTools(t);

  const bannerEl = document.getElementById("channelBanner");
  const avatarEl = document.getElementById("channelAvatar");
  const pubkey = "b".repeat(64);

  const originalMute = moderationService.isAuthorMutedByViewer;
  moderationService.isAuthorMutedByViewer = () => true;
  t.after(() => {
    moderationService.isAuthorMutedByViewer = originalMute;
  });

  applyChannelVisualBlur({
    bannerEl,
    avatarEl,
    pubkey,
    app: { videosMap: new Map() },
  });

  assert.equal(bannerEl.dataset.visualState, "blurred");
  assert.equal(avatarEl.dataset.visualState, "blurred");
});

test("moderation override clears channel blur via event wiring", async (t) => {
  const { document } = setupDom(t);
  withMockedNostrTools(t);

  nostrClient.allEvents = new Map();
  nostrClient.rawEvents = new Set();

  const app = await createModerationAppHarness();
  app.loadedThumbnails = new Map();
  app.videosMap = new Map();
  app.buildShareUrlFromEventId = (id) => `https://example.invalid/watch/${id}`;
  app.formatTimeAgo = () => "just now";
  app.ensureGlobalMoreMenuHandlers = () => {};
  app.closeAllMoreMenus = () => {};
  app.normalizeHexPubkey = (value) =>
    typeof value === "string" ? value.trim().toLowerCase() : "";
  app.hasOlderVersion = () => false;
  app.deriveVideoPointerInfo = () => null;
  app.persistWatchHistoryMetadataForVideo = () => {};
  app.canCurrentUserManageBlacklist = () => false;
  app.isMagnetUriSupported = () => false;
  app.mountVideoListView = () => {};
  app.mediaLoader = { observe() {} };
  app.attachMoreMenuHandlers = () => {};
  app.getActiveModerationThresholds = () => ({
    blurThreshold: 1,
    autoplayBlockThreshold: 1,
    trustedMuteHideThreshold: 1,
    trustedSpamHideThreshold: Number.POSITIVE_INFINITY,
  });

  const channelPubkey = "c".repeat(64);
  __setChannelProfileTestState({ pubkey: channelPubkey });
  __ensureChannelModerationEventsForTests();

  const container = document.getElementById("channelVideoList");
  const moderationState = {
    trustedCount: 2,
    summary: {
      types: { nudity: { trusted: 2 } },
    },
  };
  const video = createVideoFixture({ pubkey: channelPubkey, moderation: moderationState });

  renderChannelVideosFromList({
    videos: [video],
    container,
    app,
    loadToken: 0,
  });

  const bannerEl = document.getElementById("channelBanner");
  const avatarEl = document.getElementById("channelAvatar");
  assert.equal(bannerEl.dataset.visualState, "blurred");
  assert.equal(avatarEl.dataset.visualState, "blurred");

  const cardStub = { refreshModerationUi() {} };
  app.handleModerationOverride({ video, card: cardStub });

  assert.equal(bannerEl.dataset.visualState, undefined);
  assert.equal(avatarEl.dataset.visualState, undefined);
});
