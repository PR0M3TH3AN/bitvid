
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { VideoEventBuffer } from "../../js/nostr/videoEventBuffer.js";

class MockClient {
  constructor() {
    this.rawEvents = new Map();
    this.allEvents = new Map();
    this.activeMap = new Map();
    this.dirtyEventIds = new Set();
    this.tombstones = new Map();
    this.saveLocalDataCalls = [];
    this.populateNip71MetadataCalls = [];
  }

  getActiveKey(video) {
    return video.videoRootId || video.id;
  }

  recordTombstone(key, timestamp) {
    this.tombstones.set(key, timestamp);
  }

  applyTombstoneGuard(video) {
     const key = this.getActiveKey(video);
     const ts = this.tombstones.get(key);
     if (ts && video.created_at <= ts) {
         video.deleted = true;
     }
  }

  mergeNip71MetadataIntoVideo(video) {}
  applyRootCreatedAt(video) {}

  async populateNip71MetadataForVideos(videos) {
    this.populateNip71MetadataCalls.push(videos);
    return Promise.resolve();
  }

  saveLocalData(reason) {
    this.saveLocalDataCalls.push(reason);
  }
}

const validEvent = {
  id: "id1",
  pubkey: "pubkey1",
  created_at: 1000,
  kind: 30078,
  tags: [["t", "video"]],
  content: JSON.stringify({
    title: "Test Video",
    url: "https://example.com/video.mp4",
    magnet: "magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=video",
    thumbnail: "https://example.com/thumb.jpg",
    videoRootId: "root1"
  })
};

const newerEvent = {
  ...validEvent,
  id: "id2",
  created_at: 2000
};

const deletedEvent = {
  ...validEvent,
  id: "id3",
  created_at: 3000,
  content: JSON.stringify({
    deleted: true,
    videoRootId: "root1",
    url: "https://example.com/video.mp4",
    title: "Deleted Video"
  })
};

// Virtualize the off-thread signature verifier: treat every seeded test event as
// valid (the seeds are synthetic and unsigned). This isolates the buffer's
// batching/commit logic from real schnorr verification while preserving the
// "only valid ids are committed" contract.
const passthroughVerify = async (events) => new Set(events.map((e) => e.id));
const newBuffer = (client, onVideo = () => {}) =>
  new VideoEventBuffer(client, onVideo, { verifyEvents: passthroughVerify });

test('VideoEventBuffer', async (t) => {
  await t.test('Push and Flush', async () => {
    const client = new MockClient();
    let onVideoCalls = [];
    const onVideo = (videos) => onVideoCalls.push(videos);
    const buffer = newBuffer(client, onVideo);

    buffer.push(validEvent);
    assert.equal(buffer.buffer.length, 1);
    assert.notEqual(buffer.flushTimerId, null);

    // Force flush (now async: verification happens off-thread before commit)
    await buffer.scheduleFlush(true);
    assert.equal(buffer.buffer.length, 0);
    assert.equal(client.allEvents.size, 1);
    assert.equal(client.activeMap.size, 1);
    assert.equal(onVideoCalls.length, 1);

    // videoRootId is "root1", so key is "root1" (based on MockClient.getActiveKey)
    assert.ok(client.activeMap.has("root1"));
    assert.equal(client.activeMap.get("root1").id, validEvent.id);
  });

  await t.test('Latest Wins', async () => {
    const client = new MockClient();
    let onVideoCalls = [];
    const onVideo = (videos) => onVideoCalls.push(videos);
    const buffer = newBuffer(client, onVideo);

    // Setup: activeMap has older event
    client.activeMap.set("root1", { ...validEvent, created_at: 1000, videoRootId: "root1" });

    buffer.push(newerEvent);
    await buffer.scheduleFlush(true); // Force flush

    // Should update because newerEvent.created_at (2000) > 1000
    assert.equal(client.activeMap.get("root1").id, newerEvent.id);
    assert.equal(client.activeMap.get("root1").created_at, 2000);
  });

  await t.test('Tombstone Handling', async () => {
      const client = new MockClient();
      const buffer = newBuffer(client);

      // Process deleted event
      buffer.push(deletedEvent);
      await buffer.scheduleFlush(true);

      // Should verify tombstone recorded
      assert.ok(client.tombstones.has("root1"));
      assert.equal(client.tombstones.get("root1"), deletedEvent.created_at);

      // Should NOT be in activeMap
      assert.ok(!client.activeMap.has("root1"));

      // Now try pushing an older event
      buffer.push(newerEvent); // created_at 2000 < 3000
      await buffer.scheduleFlush(true);

      // Should be guarded by tombstone
      assert.ok(!client.activeMap.has("root1"));
  });

  await t.test('Cleanup', async () => {
    const client = new MockClient();
    const buffer = newBuffer(client);

    buffer.push(validEvent);
    assert.notEqual(buffer.flushTimerId, null);

    await buffer.cleanup();
    assert.equal(buffer.flushTimerId, null);
    assert.equal(buffer.buffer.length, 0); // Should have flushed
    assert.equal(client.allEvents.size, 1);
  });

  await t.test('Visibility Gating', async () => {
    // Mock document
    const originalDocument = global.document;
    let visibilityHandler = null;
    try {
      global.document = {
        hidden: true,
        addEventListener: (type, handler) => {
          if (type === 'visibilitychange') visibilityHandler = handler;
        },
        removeEventListener: () => {}
      };

      const client = new MockClient();
      let onVideoCalls = [];
      const onVideo = (videos) => onVideoCalls.push(videos);
      const buffer = newBuffer(client, onVideo);

      // Push event while hidden
      buffer.push(validEvent);
      await buffer.scheduleFlush(true);

      // Should NOT have called onVideo yet
      assert.equal(onVideoCalls.length, 0);
      // Should have buffered pending videos
      assert.equal(buffer.pendingVideos.length, 1);

      // Simulate visibility change
      global.document.hidden = false;
      assert.ok(visibilityHandler, "Listener attached");
      visibilityHandler();

      // Should flush now
      assert.equal(onVideoCalls.length, 1);
      assert.equal(buffer.pendingVideos.length, 0);
    } finally {
      // Cleanup mock
      global.document = originalDocument;
    }
  });
});
