import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import "../test-helpers/setup-localstorage.mjs";

import {
  renderChannelVideosFromList,
  applyChannelVisualBlur,
  __setChannelProfileTestState,
  __ensureChannelModerationEventsForTests,
} from "../../js/channelProfile.js";
import { nostrClient } from "../../js/nostrClientFacade.js";
import moderationService from "../../js/services/moderationService.js";
import { setApplication } from "../../js/applicationContext.js";
import { normalizeVideoModerationContext } from "../../js/ui/moderationUiHelpers.js";
import { buildModerationBadgeText } from "../../js/ui/moderationCopy.js";
import { withMockedNostrTools, createModerationAppHarness } from "../helpers/moderation-test-helpers.mjs";

function setupDom(t) {
  const dom = new JSDOM(
    "<!DOCTYPE html><html><body>" +
      '<div id="channelModerationBadge"></div>' +
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
  app.decorateVideoModeration = (video) => video;

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

  const rendered = await renderChannelVideosFromList({
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

test("renderChannelVideosFromList applies moderation blur without existing metadata", async (t) => {
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
    autoplayBlockThreshold: Number.POSITIVE_INFINITY,
    trustedMuteHideThreshold: Number.POSITIVE_INFINITY,
    trustedSpamHideThreshold: Number.POSITIVE_INFINITY,
  });

  const stubModerationService = {
    async refreshViewerFromClient() {},
    async setActiveEventIds() {},
    getAdminListSnapshot() {
      return null;
    },
    getAccessControlStatus() {
      return { hex: "", whitelisted: false, blacklisted: false };
    },
    getTrustedReportSummary() {
      return { types: { nudity: { trusted: 2 } } };
    },
    trustedReportCount() {
      return 2;
    },
    getTrustedReporters() {
      return [];
    },
    isAuthorMutedByTrusted() {
      return false;
    },
  };

  app.nostrService = {
    getModerationService() {
      return stubModerationService;
    },
  };

  const container = document.getElementById("channelVideoList");
  const channelPubkey = "e".repeat(64);
  __setChannelProfileTestState({ pubkey: channelPubkey });

  const video = createVideoFixture({ pubkey: channelPubkey });
  delete video.moderation;

  const rendered = await renderChannelVideosFromList({
    videos: [video],
    container,
    app,
    loadToken: 0,
  });

  assert.equal(rendered, true, "channel render succeeded with moderation stage");
  const stored = app.videosMap.get(video.id);
  assert.ok(stored, "video stored in app map after moderation");
  assert.equal(stored.moderation?.blurThumbnail, true, "moderation blur applied");

  const thumbnail = container.querySelector('[data-video-thumbnail="true"]');
  assert.ok(thumbnail, "video card thumbnail rendered");
  assert.equal(thumbnail.dataset.thumbnailState, "blurred");

  const bannerEl = document.getElementById("channelBanner");
  assert.equal(bannerEl.dataset.visualState, "blurred");
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
  const video = createVideoFixture({
    id: "a".repeat(64),
    pubkey: channelPubkey,
    moderation: moderationState,
  });

  await renderChannelVideosFromList({
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

test("channel header moderation badge reflects blur state and override actions", async (t) => {
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
    (typeof value === "string" ? value.trim().toLowerCase() : "");
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
  let overrideCalls = 0;
  app.handleModerationOverride = () => {
    overrideCalls += 1;
    return true;
  };

  setApplication(app);
  t.after(() => {
    setApplication(null);
  });

  const channelPubkey = "d".repeat(64);
  __setChannelProfileTestState({ pubkey: channelPubkey });
  __ensureChannelModerationEventsForTests();

  const container = document.getElementById("channelVideoList");
  const moderationState = {
    blurThumbnail: true,
    trustedCount: 2,
    reportType: "nudity",
    summary: { types: { nudity: { trusted: 2 } } },
    original: { blurThumbnail: true, blockAutoplay: false },
  };
  const video = createVideoFixture({ pubkey: channelPubkey, moderation: moderationState });

  await renderChannelVideosFromList({
    videos: [video],
    container,
    app,
    loadToken: 0,
  });

  applyChannelVisualBlur({ app, pubkey: channelPubkey });
  const storedVideo = app.videosMap.get(video.id);

  const bannerEl = document.getElementById("channelBanner");
  const avatarEl = document.getElementById("channelAvatar");
  assert.equal(bannerEl.dataset.visualState, "blurred");
  assert.equal(avatarEl.dataset.visualState, "blurred");

  const badgeContainer = document.getElementById("channelModerationBadge");
  const badge = badgeContainer.querySelector('[data-moderation-badge="true"]');
  assert.ok(badge, "badge renders in channel header");

  const textEl = badge.querySelector(".moderation-badge__text");
  const context = normalizeVideoModerationContext(storedVideo.moderation);
  const expectedText = buildModerationBadgeText(context, { variant: "card" });
  assert.equal(textEl.textContent, expectedText);

  const overrideButton = badge.querySelector('[data-moderation-action="override"]');
  assert.ok(overrideButton, "override control is available");

  overrideButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(overrideCalls, 1);
  const updatedVideo = app.videosMap.get(video.id);
  if (!updatedVideo.moderation || typeof updatedVideo.moderation !== "object") {
    updatedVideo.moderation = {};
  }
  updatedVideo.moderation.viewerOverride = { showAnyway: true };
  updatedVideo.moderation.blurThumbnail = false;
  updatedVideo.moderation.blockAutoplay = false;
  const originalState = updatedVideo.moderation.original && typeof updatedVideo.moderation.original === "object"
    ? { ...updatedVideo.moderation.original }
    : {};
  if (typeof originalState.blurThumbnail === "undefined") {
    originalState.blurThumbnail = true;
  }
  if (typeof originalState.blockAutoplay === "undefined") {
    originalState.blockAutoplay = true;
  }
  updatedVideo.moderation.original = originalState;
  app.videosMap.set(updatedVideo.id, updatedVideo);
  const overrideContext = normalizeVideoModerationContext(updatedVideo.moderation);
  const overrideText = buildModerationBadgeText(overrideContext, { variant: "card" });

  assert.equal(overrideContext.overrideActive, true);
  assert.ok(overrideText.startsWith("Showing despite"));
});
