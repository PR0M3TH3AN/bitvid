import assert from "node:assert/strict";
import test from "node:test";

import { buildVideoPostEvent } from "../js/nostrEventSchemas.js";
import { buildNip71MetadataTags, NostrClient } from "../js/nostr.js";

test("30078 events carry nip71 metadata tags and hydrate fallback metadata", () => {
  const metadataInput = {
    hashtags: ["  nostr  ", "bitvid  "],
    participants: [
      { pubkey: "a".repeat(64), relay: " wss://relay.example " },
    ],
    segments: [
      { start: " 00:00 ", end: " 00:10 ", title: " Intro " },
    ],
    references: [" https://example.com/info "],
  };

  const additionalTags = buildNip71MetadataTags(metadataInput);

  const event = buildVideoPostEvent({
    pubkey: "f".repeat(64),
    created_at: 1_700_000_000,
    dTagValue: "demo-d-tag",
    content: {
      version: 3,
      title: "Demo Title",
      url: "https://cdn.example/video.mp4",
      magnet: "",
      thumbnail: "",
      description: "",
      mode: "live",
      videoRootId: "root-123",
      deleted: false,
      isPrivate: false,
      isNsfw: false,
      isForKids: true,
      enableComments: true,
    },
    additionalTags,
  });

  const parsedContent = JSON.parse(event.content);
  assert.equal(parsedContent.isNsfw, false);
  assert.equal(parsedContent.isForKids, true);

  const hashtagValues = event.tags
    .filter((tag) => tag[0] === "t")
    .map((tag) => tag[1])
    .filter((value) => value && value.toLowerCase() !== "video");
  assert.deepEqual(hashtagValues, ["nostr", "bitvid"]);

  const participantTag = event.tags.find((tag) => tag[0] === "p");
  assert.deepEqual(participantTag, [
    "p",
    "a".repeat(64),
    "wss://relay.example",
  ]);

  const segmentTag = event.tags.find((tag) => tag[0] === "segment");
  assert.deepEqual(segmentTag, ["segment", "00:00", "00:10", "Intro"]);

  const referenceTag = event.tags.find((tag) => tag[0] === "r");
  assert.deepEqual(referenceTag, ["r", "https://example.com/info"]);

  const client = new NostrClient();
  const video = {
    id: "event-123",
    videoRootId: parsedContent.videoRootId,
    tags: event.tags,
    content: event.content,
    kind: event.kind,
    created_at: event.created_at,
  };

  client.mergeNip71MetadataIntoVideo(video);

  assert.ok(video.nip71, "fallback merge should populate nip71 metadata");
  assert.deepEqual(video.nip71.hashtags, ["nostr", "bitvid"]);
  assert.deepEqual(video.nip71.participants, [
    { pubkey: "a".repeat(64), relay: "wss://relay.example" },
  ]);
  assert.deepEqual(video.nip71.segments, [
    { start: "00:00", end: "00:10", title: "Intro" },
  ]);
  assert.deepEqual(video.nip71.references, ["https://example.com/info"]);
  assert.equal(video.nip71Source?.eventId, "event-123");
});
