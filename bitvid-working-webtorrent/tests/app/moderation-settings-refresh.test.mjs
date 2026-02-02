import test, { mock } from "node:test";
import assert from "node:assert/strict";

import "../test-helpers/setup-localstorage.mjs";
import {
  withMockedNostrTools,
  createModerationAppHarness,
} from "../helpers/moderation-test-helpers.mjs";

const VIDEO_HEX = "1".repeat(64);
const SECOND_VIDEO_HEX = "2".repeat(64);
const CURRENT_VIDEO_HEX = "3".repeat(64);

function buildModerationState() {
  return {
    trustedMuted: false,
    trustedMuteCount: 0,
    trustedCount: 0,
    reportType: "nudity",
  };
}

test("handleModerationSettingsChange refreshes feeds with updated thresholds", async (t) => {
  withMockedNostrTools(t);

  const app = await createModerationAppHarness();
  app.decorateVideoModeration = mock.fn(() => {});

  const storedVideo = { id: VIDEO_HEX, moderation: buildModerationState() };
  const listVideo = { id: SECOND_VIDEO_HEX, moderation: buildModerationState() };
  const currentVideo = { id: CURRENT_VIDEO_HEX, moderation: buildModerationState() };

  app.videosMap.set(storedVideo.id, storedVideo);
  app.videoListView = {
    videoCardInstances: [
      {
        video: listVideo,
        refreshModerationUi: mock.fn(() => {}),
      },
    ],
    currentVideos: [listVideo],
  };
  app.currentVideo = currentVideo;

  const refreshMock = mock.fn(async () => {});
  app.onVideosShouldRefresh = refreshMock;

  const pendingSettings = {
    blurThreshold: 7,
    autoplayBlockThreshold: 6,
    trustedMuteHideThreshold: 9,
    trustedSpamHideThreshold: 11,
  };

  const expectedSettings = app.normalizeModerationSettings(pendingSettings);
  const result = await app.handleModerationSettingsChange({ settings: pendingSettings });

  assert.deepEqual(result, expectedSettings);
  assert.deepEqual(app.moderationSettings, expectedSettings);

  assert.equal(refreshMock.mock.calls.length, 1);
  assert.equal(
    refreshMock.mock.calls[0]?.arguments?.[0]?.reason,
    "moderation-settings-change",
  );

  assert.ok(app.decorateVideoModeration.mock.calls.length >= 3);
});
