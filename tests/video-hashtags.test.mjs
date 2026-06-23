// Hashtags polish: a video's hashtags are persisted in the 30078 content AND
// emitted as `t` tags (so bitvid's feed scoring + relay queries see them), and
// round-trip back through convertEventToVideo onto `video.hashtags` (which the
// NIP-71 mirror builder then carries as `t` tags too).

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizeVideoHashtags,
  prepareVideoPublishPayload,
  prepareVideoEditPayload,
} from "../js/nostr/videoPayloadBuilder.js";
import { convertEventToVideo } from "../js/nostr/nip71.js";

const PUBKEY = "a".repeat(64);

function publish(extra) {
  return prepareVideoPublishPayload(
    { title: "Hello", url: "https://cdn.example.com/v.mp4", ...extra },
    PUBKEY,
    { timestamp: 1000 },
  );
}

test("sanitizeVideoHashtags: normalizes, dedupes, drops the reserved 'video' tag", () => {
  assert.deepEqual(
    sanitizeVideoHashtags(["#GameStr", "gamestr", " Voxel ", "video", ""]),
    ["gamestr", "voxel"],
  );
  assert.deepEqual(sanitizeVideoHashtags("#ai, blender  cartoon"), ["ai", "blender", "cartoon"]);
  assert.deepEqual(sanitizeVideoHashtags(null), []);
});

test("publish payload persists hashtags in content AND emits matching `t` tags", async () => {
  const { event } = await publish({
    videoRootId: "root-1",
    hashtags: ["#GameStr", "voxel", "voxel"],
  });

  const content = JSON.parse(event.content);
  assert.deepEqual(content.hashtags, ["gamestr", "voxel"], "stored in content (normalized/deduped)");

  const tTags = event.tags.filter((t) => t[0] === "t").map((t) => t[1]);
  assert.ok(tTags.includes("gamestr"));
  assert.ok(tTags.includes("voxel"));
});

test("round-trip: convertEventToVideo exposes video.hashtags from content", async () => {
  const { event } = await publish({ videoRootId: "root-2", hashtags: ["nostr", "p2p"] });
  const video = convertEventToVideo(event);
  assert.equal(video.invalid, false);
  assert.deepEqual(video.hashtags.sort(), ["nostr", "p2p"]);
});

test("no hashtags → no content.hashtags", async () => {
  const { event } = await publish({ videoRootId: "root-3" });
  const content = JSON.parse(event.content);
  assert.equal(content.hashtags, undefined);
});

function edit(baseHashtags, updatedData) {
  return prepareVideoEditPayload({
    baseEvent: {
      id: "e1",
      videoRootId: "root-9",
      title: "Old",
      url: "https://cdn.example.com/v.mp4",
      hashtags: baseHashtags,
      created_at: 1000,
      tags: [],
    },
    originalEventStub: { id: "e1" },
    updatedData,
    userPubkey: PUBKEY,
    resolveEventDTag: () => "root-9",
  });
}

test("editing WITHOUT a hashtags field preserves the existing hashtags", () => {
  const { contentObject } = edit(["alpha", "beta"], { title: "New title" });
  assert.deepEqual(contentObject.hashtags, ["alpha", "beta"], "not stripped on edit");
});

test("editing WITH hashtags overrides them", () => {
  const { contentObject } = edit(["alpha"], { hashtags: ["gamma", "delta"] });
  assert.deepEqual(contentObject.hashtags, ["gamma", "delta"]);
});
