import test from "node:test";
import assert from "node:assert/strict";
import {
  getVideoRootIdentifier,
  applyRootTimestampToVideosMap,
  syncActiveVideoRootTimestamp,
} from "../../js/utils/videoTimestamps.js";

test("getVideoRootIdentifier", async (t) => {
  await t.test("returns empty string for invalid inputs", () => {
    assert.equal(getVideoRootIdentifier(null), "");
    assert.equal(getVideoRootIdentifier(undefined), "");
    assert.equal(getVideoRootIdentifier(123), "");
    assert.equal(getVideoRootIdentifier("string"), "");
    assert.equal(getVideoRootIdentifier({}), "");
  });

  await t.test("returns videoRootId when present", () => {
    const video = { videoRootId: "root-123", id: "id-456" };
    assert.equal(getVideoRootIdentifier(video), "root-123");
  });

  await t.test("returns id when videoRootId is missing", () => {
    const video = { id: "id-456" };
    assert.equal(getVideoRootIdentifier(video), "id-456");
  });

  await t.test("returns id when videoRootId is not a string", () => {
    const video = { videoRootId: 123, id: "id-456" };
    assert.equal(getVideoRootIdentifier(video), "id-456");
  });
});

test("applyRootTimestampToVideosMap", async (t) => {
  await t.test("returns early if videosMap is not a Map", () => {
    // Should not throw
    applyRootTimestampToVideosMap({ videosMap: {}, video: { id: "1" }, timestamp: 100 });
  });

  await t.test("updates rootCreatedAt for matching video ID", () => {
    const map = new Map();
    const videoObj = { id: "1", rootCreatedAt: 0 };
    map.set("1", videoObj);

    applyRootTimestampToVideosMap({
      videosMap: map,
      video: { id: "1" },
      timestamp: 100,
    });

    assert.equal(videoObj.rootCreatedAt, 100);
  });

  await t.test("updates rootCreatedAt for other videos with same rootId", () => {
    const map = new Map();
    const video1 = { id: "1", videoRootId: "root-A", rootCreatedAt: 0 };
    const video2 = { id: "2", videoRootId: "root-A", rootCreatedAt: 0 };
    const video3 = { id: "3", videoRootId: "root-B", rootCreatedAt: 0 };

    map.set("1", video1);
    map.set("2", video2);
    map.set("3", video3);

    // video argument here acts as the trigger source
    // In the implementation:
    // 1. existing = map.get(video.id) -> updated
    // 2. Loop over map -> if storedRootId === rootId -> updated

    // Let's say we update for video 1, with rootId="root-A"
    applyRootTimestampToVideosMap({
      videosMap: map,
      video: { id: "1" },
      rootId: "root-A",
      timestamp: 200,
    });

    assert.equal(video1.rootCreatedAt, 200);
    assert.equal(video2.rootCreatedAt, 200); // Shares root-A
    assert.equal(video3.rootCreatedAt, 0);   // Different root
  });

  await t.test("skips invalid stored objects in map", () => {
    const map = new Map();
    map.set("1", null);
    map.set("2", "string");

    // Should not throw
    applyRootTimestampToVideosMap({
      videosMap: map,
      video: { id: "99" }, // not in map
      rootId: "root-A",
      timestamp: 300,
    });
  });
});

test("syncActiveVideoRootTimestamp", async (t) => {
  await t.test("returns false for invalid timestamp", () => {
    const res = syncActiveVideoRootTimestamp({
      activeVideo: {},
      timestamp: null,
    });
    assert.equal(res, false);
  });

  await t.test("returns false for invalid activeVideo", () => {
    const res = syncActiveVideoRootTimestamp({
      activeVideo: null,
      timestamp: 100,
    });
    assert.equal(res, false);
  });

  await t.test("returns false if activeVideo has no root identifier", () => {
    const res = syncActiveVideoRootTimestamp({
      activeVideo: { foo: "bar" }, // no id or videoRootId
      timestamp: 100,
    });
    assert.equal(res, false);
  });

  await t.test("returns false if rootId mismatch", () => {
    const video = { id: "vid-1" }; // rootId will be "vid-1"
    const res = syncActiveVideoRootTimestamp({
      activeVideo: video,
      rootId: "other-root",
      timestamp: 100,
    });
    assert.equal(res, false);
  });

  await t.test("returns false if timestamp already matches", () => {
    const video = { id: "vid-1", rootCreatedAt: 100 };
    const res = syncActiveVideoRootTimestamp({
      activeVideo: video,
      timestamp: 100.5, // floors to 100
    });
    assert.equal(res, false);
  });

  await t.test("updates activeVideo and displayTags", () => {
    const video = {
      id: "vid-1",
      tags: [["t", "tag1"]],
      displayTags: [],
      rootCreatedAt: 0
    };

    const res = syncActiveVideoRootTimestamp({
      activeVideo: video,
      timestamp: 123.456,
    });

    assert.equal(res, true);
    assert.equal(video.rootCreatedAt, 123);
    // collectVideoTags should have run
    assert.ok(Array.isArray(video.displayTags));
    assert.ok(video.displayTags.includes("tag1"));
  });

  await t.test("calls videoModal.updateMetadata if provided", () => {
    const video = { id: "vid-1", created_at: 500 };
    let called = false;

    const buildPayload = ({ postedAt, editedAt }) => {
      return { postedAt, editedAt };
    };

    const videoModal = {
      updateMetadata: ({ timestamps, tags }) => {
        called = true;
        assert.equal(timestamps.postedAt, 1000);
        assert.equal(timestamps.editedAt, 500);
        assert.ok(tags);
      }
    };

    syncActiveVideoRootTimestamp({
      activeVideo: video,
      timestamp: 1000,
      buildModalTimestampPayload: buildPayload,
      videoModal: videoModal,
    });

    assert.equal(called, true);
  });
});
