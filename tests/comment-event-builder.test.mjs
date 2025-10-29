import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCommentEvent,
  getNostrEventSchema,
  NOTE_TYPES,
} from "../js/nostrEventSchemas.js";

const VIDEO_COMMENT_KIND =
  getNostrEventSchema(NOTE_TYPES.VIDEO_COMMENT)?.kind ?? 1111;

test("buildCommentEvent references the video definition when available", () => {
  const event = buildCommentEvent({
    pubkey: "commenter",
    created_at: 1700000200,
    videoEventId: "video-event-id",
    videoEventRelay: "wss://relay.example",
    videoDefinitionAddress: "30078:deadbeefcafebabe:clip-1",
    threadParticipantPubkey: "deadbeefcafebabe",
    content: "Great \ud800video!",
  });

  assert.equal(event.kind, VIDEO_COMMENT_KIND);

  const addressTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "a");
  assert.deepEqual(addressTags, [["a", "30078:deadbeefcafebabe:clip-1"]]);

  const participantTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "p");
  assert.deepEqual(participantTags, [["p", "deadbeefcafebabe"]]);

  assert.equal(event.content, "Great video!");
});

test("buildCommentEvent includes parent pointers for threaded replies", () => {
  const event = buildCommentEvent({
    pubkey: "commenter",
    created_at: 1700000201,
    videoEventId: "video-event-id",
    videoDefinitionAddress: "30078:deadbeefcafebabe:clip-1",
    parentCommentId: "parent-comment-id",
    threadParticipantPubkey: "parent-author",
    content: "Replying now",
  });

  assert.equal(event.kind, VIDEO_COMMENT_KIND);

  const eventTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "e");
  assert.deepEqual(eventTags, [["e", "parent-comment-id"]]);

  const addressTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "a");
  assert.deepEqual(addressTags, [["a", "30078:deadbeefcafebabe:clip-1"]]);

  const participantTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "p");
  assert.deepEqual(participantTags, [["p", "parent-author"]]);
});

test("buildCommentEvent normalizes optional relays and preserves additional tags", () => {
  const event = buildCommentEvent({
    pubkey: "author",
    created_at: 1700000300,
    videoEventId: "event123",
    videoEventRelay: "wss://comments.main",
    videoDefinitionAddress: "30078:deadbeefcafebabe:clip-2",
    videoDefinitionRelay: "wss://video.def",
    parentCommentId: "root-comment",
    parentCommentRelay: "wss://parent",
    threadParticipantPubkey: "cafecafe",
    threadParticipantRelay: "wss://profile",
    additionalTags: [["client", "bitvid"], ["p", "cafecafe", "wss://override"]],
    content: " Appreciated! \ud800",
  });

  assert.equal(event.kind, VIDEO_COMMENT_KIND);
  assert.deepStrictEqual(event.tags, [
    ["a", "30078:deadbeefcafebabe:clip-2", "wss://video.def"],
    ["e", "root-comment", "wss://parent"],
    ["p", "cafecafe", "wss://profile"],
    ["client", "bitvid"],
    ["p", "cafecafe", "wss://override"],
  ]);
  assert.equal(event.content, " Appreciated! ");
});

test("buildCommentEvent falls back to the video event when no definition address is provided", () => {
  const event = buildCommentEvent({
    pubkey: "commenter",
    created_at: 1700000400,
    videoEventId: "legacy-event", 
    videoEventRelay: "wss://legacy.example", 
    threadParticipantPubkey: "legacy-pubkey",
    content: "Legacy thread support",
  });

  assert.equal(event.kind, VIDEO_COMMENT_KIND);

  const eventTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "e");
  assert.deepEqual(eventTags, [["e", "legacy-event", "wss://legacy.example"]]);

  const participantTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "p");
  assert.deepEqual(participantTags, [["p", "legacy-pubkey"]]);
});
