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
