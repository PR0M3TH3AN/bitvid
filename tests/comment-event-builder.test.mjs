import test from "node:test";
import assert from "node:assert/strict";

import { buildCommentEvent } from "../js/nostrEventSchemas.js";

test("buildCommentEvent produces required tags for top-level comments", () => {
  const event = buildCommentEvent({
    pubkey: "commenter",
    created_at: 1700000200,
    videoEventId: "video-event-id",
    videoEventRelay: "wss://relay.example",
    videoDefinitionAddress: "30078:deadbeefcafebabe:clip-1",
    threadParticipantPubkey: "deadbeefcafebabe",
    content: "Great \ud800video!",
  });

  assert.equal(event.kind, 1);

  const eventTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "e");
  assert.deepEqual(eventTags, [["e", "video-event-id", "wss://relay.example"]]);

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

  assert.equal(event.kind, 1);

  const eventTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "e");
  assert.deepEqual(eventTags, [
    ["e", "video-event-id"],
    ["e", "parent-comment-id"],
  ]);

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

  assert.equal(event.kind, 1);
  assert.deepStrictEqual(event.tags, [
    ["e", "event123", "wss://comments.main"],
    ["a", "30078:deadbeefcafebabe:clip-2", "wss://video.def"],
    ["e", "root-comment", "wss://parent"],
    ["p", "cafecafe", "wss://profile"],
    ["client", "bitvid"],
    ["p", "cafecafe", "wss://override"],
  ]);
  assert.equal(event.content, " Appreciated! ");
});
