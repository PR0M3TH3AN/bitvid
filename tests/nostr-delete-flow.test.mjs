import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import { NostrClient } from "../js/nostr.js";

await (async function testDeleteFlowPublishesDeletionFlag() {
  localStorage.clear();
  const client = new NostrClient();
  client.hydrateVideoHistory = async () => {};

  const pubkey = "PUBKEY123";
  const videoRootId = "root-abc";
  const baseVideo = {
    id: "evt-original",
    pubkey,
    created_at: 1_700_000_000,
    version: 3,
    videoRootId,
    title: "Sample",
    url: "https://example.com/video.mp4",
    magnet: "",
    thumbnail: "https://example.com/thumb.jpg",
    description: "example",
    mode: "live",
    tags: [
      ["t", "video"],
      ["d", videoRootId],
    ],
  };

  client.allEvents.set(baseVideo.id, { ...baseVideo });

  const revertCalls = [];
  const revertEvents = [];
  client.revertVideo = async (event) => {
    revertCalls.push(event);
    const created_at = baseVideo.created_at + 500 + revertCalls.length;
    const revertEvent = { id: `revert-${revertCalls.length}`, created_at };
    revertEvents.push(revertEvent);
    return revertEvent;
  };

  const result = await client.deleteAllVersions(videoRootId, pubkey, {
    confirm: false,
    video: baseVideo,
  });

  assert.equal(result, true, "deleteAllVersions should resolve true on success");
  assert.equal(revertCalls.length, 1, "deleteAllVersions should call revertVideo once");

  const parsedPayload = JSON.parse(revertCalls[0].content);
  assert.equal(parsedPayload.deleted, true, "revert payload should mark deleted true");
  assert.equal(parsedPayload.videoRootId, videoRootId);

  const cached = client.allEvents.get(baseVideo.id);
  assert.equal(cached.deleted, true, "cached original video should be marked deleted");

  const activeKey = `ROOT:${videoRootId}`;
  const tombstoneValue = client.tombstones.get(activeKey);
  assert.equal(
    tombstoneValue,
    revertEvents[0].created_at,
    "deleteAllVersions should seed tombstone with revert timestamp",
  );
  client.activeMap.set(activeKey, {
    ...baseVideo,
    videoRootId,
    created_at: baseVideo.created_at,
  });

  const seenUpdates = [];
  const handlers = {};
  const fakeSub = {
    on(type, handler) {
      handlers[type] = handler;
    },
    unsub() {},
  };

  client.pool = {
    sub() {
      return fakeSub;
    },
  };

  client.subscribeVideos((videoUpdate) => {
    seenUpdates.push(videoUpdate);
  });

  const deleteEvent = {
    id: "delete-event-1",
    pubkey,
    created_at: baseVideo.created_at + 100,
    content: revertCalls[0].content,
    tags: baseVideo.tags,
  };

  handlers.event(deleteEvent);
  if (typeof handlers.eose === "function") {
    handlers.eose();
  }

  assert.equal(
    seenUpdates.length,
    0,
    "deleted events should not trigger subscription callbacks",
  );
  assert.equal(
    client.activeMap.has(activeKey),
    false,
    "deleted events should remove the active map entry",
  );

  const storedDelete = client.allEvents.get(deleteEvent.id);
  assert.equal(storedDelete.deleted, true, "stored delete event should be marked deleted");
  assert.equal(
    client.tombstones.get(activeKey),
    deleteEvent.created_at,
    "subscription delete event should update tombstone",
  );
})();

await (async function testTombstonePersistenceAcrossSaveRestore() {
  localStorage.clear();
  const client = new NostrClient();
  const videoRootId = "root-persist";
  const activeKey = `ROOT:${videoRootId}`;

  const legacyVideo = {
    id: "persist-video",
    pubkey: "PUBKEY456",
    created_at: 1_700_000_100,
    version: 3,
    videoRootId,
    title: "Persisted",
    url: "https://example.com/video.mp4",
    magnet: "",
    thumbnail: "",
    description: "",
    mode: "live",
    tags: [
      ["t", "video"],
      ["d", videoRootId],
    ],
  };

  client.allEvents.set(legacyVideo.id, { ...legacyVideo });
  client.recordTombstone(activeKey, legacyVideo.created_at + 50);
  client.saveLocalData();

  const restored = new NostrClient();
  restored.restoreLocalData();

  assert.equal(
    restored.tombstones.get(activeKey),
    legacyVideo.created_at + 50,
    "tombstone timestamp should persist across save/restore",
  );

  const restoredVideo = restored.allEvents.get(legacyVideo.id);
  assert.equal(restoredVideo.deleted, true, "restored video should remain tombstoned");
  assert.equal(
    restored.activeMap.has(activeKey),
    false,
    "restored tombstoned video should not populate activeMap",
  );
})();

await (async function testSubscribeVideosSkipsOlderThanTombstone() {
  localStorage.clear();
  const client = new NostrClient();
  client.populateNip71MetadataForVideos = async () => {};

  const seenUpdates = [];
  const handlers = {};
  const fakeSub = {
    on(type, handler) {
      handlers[type] = handler;
    },
    unsub() {},
  };

  client.pool = {
    sub() {
      return fakeSub;
    },
  };

  client.subscribeVideos((videoUpdate) => {
    seenUpdates.push(videoUpdate);
  });

  const pubkey = "PUBKEY789";
  const videoRootId = "root-sub";
  const tags = [
    ["t", "video"],
    ["d", videoRootId],
  ];

  const deleteEvent = {
    id: "delete-event-guard",
    pubkey,
    created_at: 1_700_100_000,
    content: JSON.stringify({
      version: 3,
      deleted: true,
      title: "",
      url: "",
      magnet: "",
      thumbnail: "",
      description: "",
      mode: "live",
      videoRootId,
    }),
    tags,
  };

  handlers.event(deleteEvent);
  if (typeof handlers.eose === "function") {
    handlers.eose();
  }

  const activeKey = `ROOT:${videoRootId}`;
  assert.equal(
    client.tombstones.get(activeKey),
    deleteEvent.created_at,
    "delete subscription event should seed tombstone",
  );
  assert.equal(
    client.activeMap.has(activeKey),
    false,
    "deleted subscription event should clear active map entry",
  );

  const olderEvent = {
    id: "older-event",
    pubkey,
    created_at: deleteEvent.created_at - 60,
    content: JSON.stringify({
      version: 3,
      deleted: false,
      title: "Resurfaced",
      url: "https://example.com/video.mp4",
      magnet: "",
      thumbnail: "",
      description: "",
      mode: "live",
      videoRootId,
    }),
    tags,
  };

  handlers.event(olderEvent);
  if (typeof handlers.eose === "function") {
    handlers.eose();
  }

  assert.equal(
    seenUpdates.length,
    0,
    "older events published after tombstone should not trigger callbacks",
  );

  const storedOlder = client.allEvents.get(olderEvent.id);
  assert.equal(storedOlder.deleted, true, "older event should be marked deleted by tombstone guard");
  assert.equal(
    client.activeMap.has(activeKey),
    false,
    "older event should not repopulate the active map",
  );
})();

console.log("nostr delete flow tests passed");
