import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { NostrClient } from "../js/nostr/client.js";
import { NostrService } from "../js/services/nostrService.js";
import { VideoEventBuffer } from "../js/nostr/videoEventBuffer.js";

test("delete flow publishes the deletion flag and surfaces relay failures", async () => {
  localStorage.clear();
  const client = new NostrClient();
  client.videoEventVerifier = async (events) => new Set(events.map((e) => e.id));
  client.hydrateVideoHistory = async () => {};

  const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
  const videoRootId = "root-abc";
  const baseVideoId = "0000000000000000000000000000000000000000000000000000000000000002";
  const baseVideo = {
    id: baseVideoId,
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
    getPublicKey: async () => pubkey,
  };

  client.signerManager.setActiveSigner({
    type: "extension",
    pubkey,
    signEvent: window.nostr.signEvent,
  });

  client.ensureExtensionPermissions = async () => ({ ok: true });
  // Deletes publish to the WRITE set via getDeletePublishRelays() (the afb6200b
  // relay-scope fix), NOT client.relays. writeRelays defaults to the bundled
  // relays, so the fail-relay must be configured here or the injected failure is
  // never exercised and the "surface relay failures" assertions silently pass.
  client.relays = ["wss://relay.ok", "wss://relay.fail"];
  client.writeRelays = ["wss://relay.ok", "wss://relay.fail"];
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
    // Use valid hex ID for revert event to ensure e-tag logic works
    const revertEventId = "000000000000000000000000000000000000000000000000000000000000000" + (3 + revertCalls.length);
    const revertEvent = {
      id: revertEventId,
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

  // Live-stream guard. subscribeVideos routes relay events through a
  // VideoEventBuffer (via the SubscriptionManager); we drive that real buffer
  // directly here. A deletion event arriving on the stream must clear the active
  // map entry and advance the tombstone, and must never surface as a *live*
  // video. (Note: under the current architecture a deletion DOES surface to the
  // callback marked deleted:true so the UI can remove the card — the obsolete
  // pre-buffer expectation of "no callback at all" was incorrect.)
  const seenUpdates = [];
  const buffer = new VideoEventBuffer(
    client,
    (videos) => {
      if (Array.isArray(videos)) {
        seenUpdates.push(...videos);
      }
    },
    { verifyEvents: client.videoEventVerifier },
  );

  const deleteEvent = {
    id: "delete-event-1",
    kind: 30078,
    pubkey,
    created_at: revertEvents[0].created_at + 100,
    content: revertCalls[0].content,
    tags: baseVideo.tags,
  };

  buffer.push(deleteEvent);
  await buffer.scheduleFlush(true);

  assert.equal(
    seenUpdates.filter((video) => video.id === deleteEvent.id && !video.deleted)
      .length,
    0,
    "a deletion event must not surface as a live (non-deleted) video",
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
});

test("tombstone persists across save/restore", async () => {
  localStorage.clear();
  const client = new NostrClient();
  client.videoEventVerifier = async (events) => new Set(events.map((e) => e.id));
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
  await client.saveLocalData("test", { immediate: true });

  const restored = new NostrClient();
  restored.videoEventVerifier = async (events) => new Set(events.map((e) => e.id));
  await restored.restoreLocalData();

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
});

test("buffered feed guards events older than a tombstone (no resurrection)", async () => {
  // subscribeVideos streams relay events through a VideoEventBuffer; we drive the
  // real buffer + real NostrClient here (the buffer's own unit test mocks the
  // client's tombstone guard, so this is the integration-level check). A delete
  // event seeds the tombstone; an OLDER non-deleted event arriving afterward must
  // be guarded (marked deleted, kept out of activeMap) so it can never resurrect
  // the video as live.
  localStorage.clear();
  const client = new NostrClient();
  client.videoEventVerifier = async (events) => new Set(events.map((e) => e.id));
  client.populateNip71MetadataForVideos = async () => {};

  const seenUpdates = [];
  const buffer = new VideoEventBuffer(
    client,
    (videos) => {
      if (Array.isArray(videos)) {
        seenUpdates.push(...videos);
      }
    },
    { verifyEvents: client.videoEventVerifier },
  );

  const pubkey = "PUBKEY789";
  const videoRootId = "root-sub";
  const tags = [
    ["t", "video"],
    ["d", videoRootId],
  ];

  const deleteEvent = {
    id: "delete-event-guard",
    kind: 30078,
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

  buffer.push(deleteEvent);
  await buffer.scheduleFlush(true);

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
    kind: 30078,
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

  buffer.push(olderEvent);
  await buffer.scheduleFlush(true);

  assert.equal(
    seenUpdates.filter((video) => video.id === olderEvent.id && !video.deleted)
      .length,
    0,
    "a tombstone-guarded older event must not surface as a live video",
  );

  const storedOlder = client.allEvents.get(olderEvent.id);
  assert.equal(storedOlder.deleted, true, "older event should be marked deleted by tombstone guard");
  assert.equal(
    client.activeMap.has(activeKey),
    false,
    "older event should not repopulate the active map",
  );
});

test("nostrService bubbles delete + revert relay failures", async () => {
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
});
