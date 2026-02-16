import test from "node:test";
import assert from "node:assert/strict";

import {
  getVideoRootIdentifier,
  applyRootTimestampToVideosMap,
  syncActiveVideoRootTimestamp,
} from "../../js/utils/videoTimestamps.js";

test("getVideoRootIdentifier returns videoRootId if present", () => {
  const video = { videoRootId: "root-123", id: "event-456" };
  assert.equal(getVideoRootIdentifier(video), "root-123");
});

test("getVideoRootIdentifier returns id if videoRootId is missing", () => {
  const video = { id: "event-456" };
  assert.equal(getVideoRootIdentifier(video), "event-456");
});

test("getVideoRootIdentifier returns empty string if no identifier is found", () => {
  assert.equal(getVideoRootIdentifier({}), "");
  assert.equal(getVideoRootIdentifier(null), "");
  assert.equal(getVideoRootIdentifier(undefined), "");
  assert.equal(getVideoRootIdentifier(42), "");
});

test("applyRootTimestampToVideosMap updates videos with same root ID", () => {
  const video1 = { id: "v1", videoRootId: "root1" };
  const video2 = { id: "v2", videoRootId: "root1" };
  const video3 = { id: "v3", videoRootId: "root2" };

  const videosMap = new Map([
    ["v1", video1],
    ["v2", video2],
    ["v3", video3],
  ]);

  applyRootTimestampToVideosMap({
    videosMap,
    video: video1,
    rootId: "root1",
    timestamp: 1000,
  });

  assert.equal(video1.rootCreatedAt, 1000);
  assert.equal(video2.rootCreatedAt, 1000);
  assert.equal(video3.rootCreatedAt, undefined);
});

test("applyRootTimestampToVideosMap skips updates if rootId is empty", () => {
  const video1 = { id: "v1", videoRootId: "root1" };
  const video2 = { id: "v2", videoRootId: "root1" };
  const videosMap = new Map([
    ["v1", video1],
    ["v2", video2],
  ]);

  applyRootTimestampToVideosMap({
    videosMap,
    video: video1,
    rootId: "",
    timestamp: 1000,
  });

  assert.equal(video1.rootCreatedAt, 1000); // Updated because of video.id match
  assert.equal(video2.rootCreatedAt, undefined); // Skipped because rootId is empty
});

test("applyRootTimestampToVideosMap handles non-object values in map", () => {
  const video1 = { id: "v1", videoRootId: "root1" };
  const videosMap = new Map([
    ["v1", video1],
    ["v2", null],
    ["v3", "not an object"],
  ]);

  applyRootTimestampToVideosMap({
    videosMap,
    video: video1,
    rootId: "root1",
    timestamp: 1000,
  });

  assert.equal(video1.rootCreatedAt, 1000);
});

test("applyRootTimestampToVideosMap handles missing videosMap safely", () => {
  // Should not throw
  applyRootTimestampToVideosMap({
    videosMap: null,
    video: { id: "v1" },
    rootId: "root1",
    timestamp: 1000,
  });
});

test("syncActiveVideoRootTimestamp updates active video state with lastEditedAt", () => {
  const activeVideo = {
    id: "v1",
    videoRootId: "root1",
    created_at: 500,
    lastEditedAt: 600.5,
  };

  let updateCalled = false;
  const videoModal = {
    updateMetadata: ({ timestamps, tags }) => {
      updateCalled = true;
      assert.equal(timestamps.postedAt, 2000);
      assert.equal(timestamps.editedAt, 600); // Floor of 600.5
    },
  };

  const buildModalTimestampPayload = ({ postedAt, editedAt }) => ({
    postedAt,
    editedAt,
  });

  const result = syncActiveVideoRootTimestamp({
    activeVideo,
    rootId: "root1",
    timestamp: 2000.7,
    buildModalTimestampPayload,
    videoModal,
  });

  assert.strictEqual(result, true);
  assert.equal(activeVideo.rootCreatedAt, 2000);
  assert.ok(Array.isArray(activeVideo.displayTags));
  assert.strictEqual(updateCalled, true);
});

test("syncActiveVideoRootTimestamp fallback to created_at if lastEditedAt missing", () => {
  const activeVideo = {
    id: "v1",
    videoRootId: "root1",
    created_at: 500.9,
  };

  let updateCalled = false;
  const videoModal = {
    updateMetadata: ({ timestamps }) => {
      updateCalled = true;
      assert.equal(timestamps.editedAt, 500);
    },
  };

  syncActiveVideoRootTimestamp({
    activeVideo,
    timestamp: 2000,
    buildModalTimestampPayload: (p) => p,
    videoModal,
  });

  assert.strictEqual(updateCalled, true);
});

test("syncActiveVideoRootTimestamp handles missing timestamps in activeVideo", () => {
  const activeVideo = {
    id: "v1",
    videoRootId: "root1",
  };

  let updateCalled = false;
  const videoModal = {
    updateMetadata: ({ timestamps }) => {
      updateCalled = true;
      assert.strictEqual(timestamps.editedAt, null);
    },
  };

  syncActiveVideoRootTimestamp({
    activeVideo,
    timestamp: 2000,
    buildModalTimestampPayload: (p) => p,
    videoModal,
  });

  assert.strictEqual(updateCalled, true);
});

test("syncActiveVideoRootTimestamp handles missing videoModal or payload builder", () => {
  const activeVideo = {
    id: "v1",
    videoRootId: "root1",
  };

  // Should not throw
  const result = syncActiveVideoRootTimestamp({
    activeVideo,
    timestamp: 2000,
  });

  assert.strictEqual(result, true);
  assert.equal(activeVideo.rootCreatedAt, 2000);
});

test("syncActiveVideoRootTimestamp returns false for invalid conditions", () => {
  const activeVideo = { id: "v1", videoRootId: "root1" };

  // Invalid timestamp
  assert.strictEqual(
    syncActiveVideoRootTimestamp({ activeVideo, timestamp: "invalid" }),
    false,
  );
  assert.strictEqual(
    syncActiveVideoRootTimestamp({ activeVideo, timestamp: NaN }),
    false,
  );

  // Missing activeVideo
  assert.strictEqual(
    syncActiveVideoRootTimestamp({ activeVideo: null, timestamp: 1000 }),
    false,
  );

  // ID mismatch
  assert.strictEqual(
    syncActiveVideoRootTimestamp({
      activeVideo,
      rootId: "different-root",
      timestamp: 1000,
    }),
    false,
  );

  // Missing root identifier in activeVideo
  assert.strictEqual(
    syncActiveVideoRootTimestamp({ activeVideo: {}, timestamp: 1000 }),
    false,
  );

  // Redundant update
  activeVideo.rootCreatedAt = 1000;
  assert.strictEqual(
    syncActiveVideoRootTimestamp({ activeVideo, timestamp: 1000 }),
    false,
  );
});
