import test, { mock } from "node:test";
import assert from "node:assert/strict";

import "../test-helpers/setup-localstorage.mjs";
import {
  withMockedNostrTools,
  createModerationAppHarness,
} from "../helpers/moderation-test-helpers.mjs";
import { userBlocks } from "../../js/userBlocks.js";

const REPORTER_HEX = "b".repeat(64);
const MUTER_HEX = "c".repeat(64);

function buildModerationState() {
  return {
    blockAutoplay: true,
    blurThumbnail: true,
    reportType: "nudity",
    trustedCount: 2,
    trustedReporters: [{ pubkey: REPORTER_HEX, latest: 1_700_000_000 }],
    trustedMuted: true,
    trustedMuters: [MUTER_HEX],
    trustedMuteCount: 1,
  };
}

test("handleModerationOverride decorates stored and current videos then refreshes UI", async (t) => {
  withMockedNostrTools(t);

  const hadNavigator = typeof globalThis.navigator !== "undefined";
  if (!hadNavigator) {
    globalThis.navigator = { userAgent: "node-test" };
    t.after(() => {
      delete globalThis.navigator;
    });
  }

  const app = await createModerationAppHarness();
  const originalDecorate = app.decorateVideoModeration;
  const decoratedTargets = [];
  app.decorateVideoModeration = function decorateSpy(video) {
    decoratedTargets.push(video);
    return originalDecorate.call(this, video);
  };

  const videoId = "a".repeat(64);
  const incomingVideo = { id: videoId, moderation: buildModerationState() };
  const storedVideo = { id: videoId, moderation: buildModerationState() };
  const currentVideo = { id: videoId, moderation: buildModerationState() };

  app.videosMap.set(videoId, storedVideo);
  app.currentVideo = currentVideo;

  let refreshCount = 0;
  const card = {
    refreshModerationUi() {
      refreshCount += 1;
    },
  };

  const result = app.handleModerationOverride({ video: incomingVideo, card });

  assert.equal(result, true);
  assert.equal(refreshCount, 1);
  assert.deepEqual(decoratedTargets, [storedVideo, currentVideo]);

  assert.equal(storedVideo.moderation.viewerOverride?.showAnyway, true);
  assert.equal(storedVideo.moderation.blockAutoplay, false);
  assert.equal(storedVideo.moderation.blurThumbnail, false);
  assert.equal(currentVideo.moderation.viewerOverride?.showAnyway, true);
  assert.equal(currentVideo.moderation.blockAutoplay, false);
  assert.equal(currentVideo.moderation.blurThumbnail, false);
});

test("handleModerationOverride resumes deferred playback", async (t) => {
  withMockedNostrTools(t);

  const app = await createModerationAppHarness();
  const videoId = "d".repeat(64);

  const storedVideo = { id: videoId, moderation: buildModerationState() };
  const incomingVideo = { id: videoId, moderation: buildModerationState() };
  const currentVideo = { id: videoId, moderation: buildModerationState() };

  app.videosMap.set(videoId, storedVideo);
  app.currentVideo = currentVideo;

  const playbackCalls = [];
  app.playVideoWithFallback = (options) => {
    playbackCalls.push(options);
    return Promise.resolve({ source: "hosted" });
  };

  app.pendingModeratedPlayback = {
    url: "https://example.com/video.mp4",
    magnet: "",
    triggerProvided: false,
    videoId,
  };

  const result = app.handleModerationOverride({ video: incomingVideo });

  assert.equal(result, true);
  assert.equal(app.pendingModeratedPlayback, null);
  assert.equal(playbackCalls.length, 1);
  assert.deepEqual(playbackCalls[0], {
    url: "https://example.com/video.mp4",
    magnet: "",
  });
});

test("handleModerationBlock requests a block, clears overrides, and refreshes hidden state", async (t) => {
  withMockedNostrTools(t);

  const app = await createModerationAppHarness();
  app.getActiveModerationThresholds = () => ({
    autoplayBlockThreshold: Number.POSITIVE_INFINITY,
    blurThreshold: Number.POSITIVE_INFINITY,
    trustedMuteHideThreshold: 1,
    trustedSpamHideThreshold: Number.POSITIVE_INFINITY,
  });
  app.pubkey = "f".repeat(64);
  app.isUserLoggedIn = () => true;
  app.showStatus = mock.fn(() => {});
  app.showError = mock.fn(() => {});
  app.onVideosShouldRefresh = mock.fn(async () => {});

  const viewerHex = app.normalizeHexPubkey(app.pubkey);
  const authorHex = "9".repeat(64);

  const videoId = "b".repeat(64);
  const incomingVideo = {
    id: videoId,
    pubkey: authorHex,
    moderation: {
      trustedMuted: true,
      trustedMuteCount: 1,
      trustedMuters: [MUTER_HEX],
      trustedCount: 0,
      reportType: "nudity",
    },
  };

  const storedVideo = {
    id: videoId,
    pubkey: authorHex,
    moderation: {
      trustedMuted: true,
      trustedMuteCount: 1,
      trustedMuters: [MUTER_HEX],
      trustedCount: 0,
      reportType: "nudity",
    },
  };

  const currentVideo = {
    id: videoId,
    pubkey: authorHex,
    moderation: {
      trustedMuted: true,
      trustedMuteCount: 1,
      trustedMuters: [MUTER_HEX],
      trustedCount: 0,
      reportType: "nudity",
    },
  };

  app.videosMap.set(videoId, storedVideo);
  app.currentVideo = currentVideo;

  app.decorateVideoModeration(incomingVideo);
  app.decorateVideoModeration(storedVideo);
  app.decorateVideoModeration(currentVideo);

  let refreshCount = 0;
  const card = {
    refreshModerationUi() {
      refreshCount += 1;
    },
  };

  const originalEnsureLoaded = userBlocks.ensureLoaded;
  const originalAddBlock = userBlocks.addBlock;
  const originalIsBlocked = userBlocks.isBlocked;

  const ensureLoadedMock = mock.fn(async () => {});
  let blockedState = false;
  const addBlockMock = mock.fn(async () => {
    blockedState = true;
    return { ok: true };
  });
  const isBlockedMock = mock.fn(() => blockedState);

  userBlocks.ensureLoaded = ensureLoadedMock;
  userBlocks.addBlock = addBlockMock;
  userBlocks.isBlocked = isBlockedMock;

  t.after(() => {
    userBlocks.ensureLoaded = originalEnsureLoaded;
    userBlocks.addBlock = originalAddBlock;
    userBlocks.isBlocked = originalIsBlocked;
  });

  await app.handleModerationOverride({ video: incomingVideo, card });

  assert.equal(storedVideo.moderation.viewerOverride?.showAnyway, true);
  assert.equal(currentVideo.moderation.viewerOverride?.showAnyway, true);

  refreshCount = 0;

  const result = await app.handleModerationBlock({ video: incomingVideo, card });

  assert.equal(result, true);
  assert.ok(addBlockMock.mock.calls.length >= 1);
  assert.deepEqual(addBlockMock.mock.calls[0]?.arguments, [authorHex, viewerHex]);
  assert.equal(ensureLoadedMock.mock.calls.length, 1);
  assert.deepEqual(ensureLoadedMock.mock.calls[0]?.arguments, [viewerHex]);
  assert.ok(isBlockedMock.mock.calls.length >= 1);
  assert.equal(refreshCount, 1);
  assert.equal(
    app.onVideosShouldRefresh.mock.calls[0]?.arguments?.[0]?.reason,
    "user-block-update",
  );
  assert.equal(
    app.showStatus.mock.calls[0]?.arguments?.[0],
    "Creator blocked. Their videos will disappear from your feed.",
  );

  assert.equal(incomingVideo.moderation.viewerOverride, undefined);
  assert.equal(storedVideo.moderation.viewerOverride, undefined);
  assert.equal(currentVideo.moderation.viewerOverride, undefined);
  assert.equal(incomingVideo.moderation.hidden, true);
  assert.equal(storedVideo.moderation.hidden, true);
  assert.equal(currentVideo.moderation.hidden, true);
});

test("handleModerationBlock returns false when viewer is logged out", async (t) => {
  withMockedNostrTools(t);

  const app = await createModerationAppHarness();
  app.pubkey = "f".repeat(64);
  app.isUserLoggedIn = () => false;
  app.showStatus = mock.fn(() => {});
  app.showError = mock.fn(() => {});

  const originalEnsureLoaded = userBlocks.ensureLoaded;
  const originalAddBlock = userBlocks.addBlock;
  const originalIsBlocked = userBlocks.isBlocked;

  const ensureLoadedMock = mock.fn(async () => {});
  const addBlockMock = mock.fn(async () => ({ ok: true }));
  const isBlockedMock = mock.fn(() => false);

  userBlocks.ensureLoaded = ensureLoadedMock;
  userBlocks.addBlock = addBlockMock;
  userBlocks.isBlocked = isBlockedMock;

  t.after(() => {
    userBlocks.ensureLoaded = originalEnsureLoaded;
    userBlocks.addBlock = originalAddBlock;
    userBlocks.isBlocked = originalIsBlocked;
  });

  const video = {
    id: "c".repeat(64),
    pubkey: "d".repeat(64),
    moderation: { trustedMuted: true },
  };

  const result = await app.handleModerationBlock({ video });

  assert.equal(result, false);
  assert.equal(addBlockMock.mock.calls.length, 0);
  assert.equal(ensureLoadedMock.mock.calls.length, 0);
  assert.equal(isBlockedMock.mock.calls.length, 0);
  assert.equal(
    app.showStatus.mock.calls[0]?.arguments?.[0],
    "Log in to block accounts.",
  );
});
