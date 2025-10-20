import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import { NostrClient } from "../js/nostr.js";

await (async function testDeleteFlowPublishesDeletionFlag() {
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
  client.revertVideo = async (event) => {
    revertCalls.push(event);
    return { id: `revert-${revertCalls.length}` };
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
})();

console.log("nostr delete flow tests passed");
