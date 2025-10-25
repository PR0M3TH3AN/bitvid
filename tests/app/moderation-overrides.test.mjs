import test from "node:test";
import assert from "node:assert/strict";

import "../test-helpers/setup-localstorage.mjs";
import {
  withMockedNostrTools,
  createModerationAppHarness,
} from "../helpers/moderation-test-helpers.mjs";

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

test("handleModerationHide clears overrides and re-applies hidden state", async (t) => {
  withMockedNostrTools(t);

  const app = await createModerationAppHarness();
  app.getActiveModerationThresholds = () => ({
    autoplayBlockThreshold: Number.POSITIVE_INFINITY,
    blurThreshold: Number.POSITIVE_INFINITY,
    trustedMuteHideThreshold: 1,
    trustedSpamHideThreshold: Number.POSITIVE_INFINITY,
  });

  const videoId = "b".repeat(64);
  const incomingVideo = {
    id: videoId,
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

  const card = {
    refreshModerationUi() {
      /* noop */
    },
  };

  app.handleModerationOverride({ video: incomingVideo, card });

  assert.equal(storedVideo.moderation.viewerOverride?.showAnyway, true);
  assert.equal(currentVideo.moderation.viewerOverride?.showAnyway, true);

  const result = app.handleModerationHide({ video: incomingVideo, card });

  assert.equal(result, true);
  assert.equal(incomingVideo.moderation.viewerOverride, undefined);
  assert.equal(storedVideo.moderation.viewerOverride, undefined);
  assert.equal(currentVideo.moderation.viewerOverride, undefined);
  assert.equal(incomingVideo.moderation.hidden, true);
  assert.equal(storedVideo.moderation.hidden, true);
  assert.equal(currentVideo.moderation.hidden, true);
});
