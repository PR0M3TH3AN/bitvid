import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import { NostrClient } from "../js/nostr/client.js";
import { NostrService } from "../js/services/nostrService.js";

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

  const signedEvents = [];
  window.nostr = {
    signEvent: async (event) => {
      signedEvents.push(event);
      return { ...event, id: `signed-${signedEvents.length}` };
    },
  };

  client.ensureExtensionPermissions = async () => ({ ok: true });
  client.relays = ["wss://relay.ok", "wss://relay.fail"];
  client.rawEvents.set(baseVideo.id, {
    id: baseVideo.id,
    kind: 30078,
    pubkey,
    tags: baseVideo.tags,
  });

  client.pool = {
    publish([url], event) {
      const shouldFail = event.kind === 5 && url.includes("fail");
      return {
        on(type, handler) {
          if (type === "ok") {
            if (!shouldFail) {
              handler();
            }
            return true;
          }
          if (type === "failed") {
            if (shouldFail) {
              handler(new Error(`reject-${url}`));
            }
            return true;
          }
          return false;
        },
      };
    },
  };

  const revertCalls = [];
  const revertEvents = [];
  client.revertVideo = async (event) => {
    revertCalls.push(event);
    const created_at = baseVideo.created_at + 500 + revertCalls.length;
    const revertEvent = {
      id: `revert-${revertCalls.length}`,
      kind: 30078,
      pubkey,
      created_at,
      tags: baseVideo.tags,
    };
    revertEvents.push(revertEvent);
    return {
      event: revertEvent,
      publishResults: client.relays.map((url) => ({ url, success: true })),
      summary: {
        accepted: client.relays.map((url) => ({ url, success: true })),
        failed: [],
      },
    };
  };

  const result = await client.deleteAllVersions(videoRootId, pubkey, {
    confirm: false,
    video: baseVideo,
  });

  assert.equal(
    Array.isArray(result.deletes),
    true,
    "deleteAllVersions should return delete summaries",
  );
  assert.equal(revertCalls.length, 1, "deleteAllVersions should call revertVideo once");

  const deleteSummary = result.deletes[0];
  assert.equal(
    deleteSummary.summary.failed.length,
    1,
    "deleteAllVersions should surface relay failures for delete events",
  );
  assert.equal(
    deleteSummary.summary.failed[0].url,
    "wss://relay.fail",
    "delete summary should identify the failing relay",
  );
  assert.equal(
    deleteSummary.identifiers.events.includes(baseVideo.id),
    true,
    "delete summary should include the original event id",
  );
  assert.equal(
    deleteSummary.identifiers.events.includes(revertEvents[0].id),
    true,
    "delete summary should include the revert event id",
  );
  assert.equal(
    deleteSummary.identifiers.addresses.includes(
      `30078:${pubkey}:${videoRootId}`,
    ),
    true,
    "delete summary should include the address pointer for the root",
  );

  const deleteRequest = signedEvents.find((event) => event.kind === 5);
  assert(deleteRequest, "deleteAllVersions should sign a kind 5 delete event");
  const eTags = deleteRequest.tags
    .filter((tag) => Array.isArray(tag) && tag[0] === "e")
    .map(([, value]) => value);
  assert.equal(
    eTags.includes(baseVideo.id),
    true,
    "delete event should include original event id as an e-tag",
  );
  assert.equal(
    eTags.includes(revertEvents[0].id),
    true,
    "delete event should include revert event id as an e-tag",
  );
  const aTags = deleteRequest.tags
    .filter((tag) => Array.isArray(tag) && tag[0] === "a")
    .map(([, value]) => value);
  assert.equal(
    aTags.includes(`30078:${pubkey}:${videoRootId}`),
    true,
    "delete event should include the address pointer as an a-tag",
  );

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
    created_at: revertEvents[0].created_at + 100,
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
  delete window.nostr;
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
      title: "Deleted",
      url: "https://example.com/video.mp4",
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

await (async function testNostrServiceBubblesDeleteFailures() {
  const service = new NostrService();
  const pubkey = "PUBKEY123";
  const videoRootId = "root-service";
  const sampleVideo = { id: "evt-service", pubkey, videoRootId };

  const revertFailure = {
    url: "wss://relay.fail",
    error: new Error("revert failed"),
    success: false,
  };
  const deleteFailure = {
    url: "wss://relay.fail",
    error: new Error("delete failed"),
    success: false,
  };

  const summary = {
    reverts: [
      {
        targetId: sampleVideo.id,
        event: { id: "revert-event" },
        publishResults: [
          { url: "wss://relay.ok", success: true },
          revertFailure,
        ],
        summary: {
          accepted: [{ url: "wss://relay.ok", success: true }],
          failed: [revertFailure],
        },
      },
    ],
    deletes: [
      {
        event: { id: "delete-event" },
        identifiers: {
          events: [sampleVideo.id],
          addresses: ["30078:pubkey:root-service"],
        },
        publishResults: [
          { url: "wss://relay.ok", success: true },
          deleteFailure,
        ],
        summary: {
          accepted: [{ url: "wss://relay.ok", success: true }],
          failed: [deleteFailure],
        },
      },
    ],
  };

  service.nostrClient = {
    deleteAllVersions: async () => summary,
  };

  const emitted = [];
  service.on("videos:deleted", (detail) => emitted.push(detail));

  const detail = await service.handleFullDeleteVideo({
    videoRootId,
    video: sampleVideo,
    pubkey,
    confirm: false,
  });

  assert.equal(emitted.length, 1, "service should emit videos:deleted event");
  assert.equal(
    emitted[0].result,
    summary,
    "emitted detail should include the delete summary",
  );
  assert.equal(
    detail.deleteFailures.length,
    1,
    "service should surface delete relay failures",
  );
  assert.equal(
    detail.revertFailures.length,
    1,
    "service should surface revert relay failures",
  );
  assert.equal(
    detail.deleteFailures[0].failed[0].url,
    "wss://relay.fail",
    "delete failures should include the failing relay url",
  );
})();

console.log("nostr delete flow tests passed");
