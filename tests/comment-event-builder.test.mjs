import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCommentEvent,
  getNostrEventSchema,
  NOTE_TYPES,
} from "../js/nostrEventSchemas.js";

const VIDEO_COMMENT_KIND =
  getNostrEventSchema(NOTE_TYPES.VIDEO_COMMENT)?.kind ?? 1111;

test("buildCommentEvent emits NIP-22 root metadata while keeping legacy fallbacks", () => {
  const event = buildCommentEvent({
    pubkey: "commenter",
    created_at: 1700000200,
    videoEventId: "video-event-id",
    videoDefinitionAddress: "30078:deadbeefcafebabe:clip-1",
    threadParticipantPubkey: "deadbeefcafebabe",
    content: "Great \ud800video!",
  });

  assert.equal(event.kind, VIDEO_COMMENT_KIND);
  assert.deepStrictEqual(event.tags, [
    ["A", "30078:deadbeefcafebabe:clip-1"],
    ["K", "30078"],
    ["P", "deadbeefcafebabe"],
    ["e", "video-event-id"],
    ["a", "30078:deadbeefcafebabe:clip-1"],
    ["k", "30078"],
    ["p", "deadbeefcafebabe"],
  ]);
  assert.equal(event.content, "Great video!");
});

test("buildCommentEvent includes parent pointers, kinds, and authors for replies", () => {
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
  assert.deepStrictEqual(event.tags, [
    ["A", "30078:deadbeefcafebabe:clip-1"],
    ["K", "30078"],
    ["P", "deadbeefcafebabe"],
    ["e", "video-event-id"],
    ["a", "30078:deadbeefcafebabe:clip-1"],
    ["e", "parent-comment-id", "parent-author"],
    ["k", String(VIDEO_COMMENT_KIND)],
    ["p", "parent-author"],
  ]);
});

test("buildCommentEvent normalizes relays and preserves explicit overrides", () => {
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
    ["A", "30078:deadbeefcafebabe:clip-2", "wss://video.def"],
    ["K", "30078"],
    ["P", "deadbeefcafebabe", "wss://video.def"],
    ["e", "event123", "wss://comments.main"],
    ["a", "30078:deadbeefcafebabe:clip-2", "wss://video.def"],
    ["e", "root-comment", "wss://parent", "cafecafe"],
    ["k", String(VIDEO_COMMENT_KIND)],
    ["p", "cafecafe", "wss://profile"],
    ["client", "bitvid"],
    ["p", "cafecafe", "wss://override"],
  ]);
  assert.equal(event.content, " Appreciated! ");
});

test("buildCommentEvent falls back to event pointers when no address is supplied", () => {
  const event = buildCommentEvent({
    pubkey: "commenter",
    created_at: 1700000400,
    videoEventId: "legacy-event",
    videoEventRelay: "wss://legacy.example",
    threadParticipantPubkey: "legacy-pubkey",
    rootKind: "1063",
    rootAuthorPubkey: "legacy-author",
    content: "Legacy thread support",
  });

  assert.equal(event.kind, VIDEO_COMMENT_KIND);
  assert.deepStrictEqual(event.tags, [
    ["E", "legacy-event", "wss://legacy.example", "legacy-author"],
    ["K", "1063"],
    ["P", "legacy-author"],
    ["e", "legacy-event", "wss://legacy.example"],
    ["k", "1063"],
    ["p", "legacy-pubkey"],
  ]);
});

test("buildCommentEvent accepts partial metadata for parent overrides", () => {
  const event = buildCommentEvent({
    pubkey: "reply-author",
    created_at: 1700000500,
    videoEventId: "file-event",
    rootKind: "1063",
    parentCommentId: "parent-comment",
    parentCommentRelay: "wss://parent",
    parentKind: "1111",
    parentAuthorPubkey: "parent-only",
    parentAuthorRelay: "wss://parent-author",
    content: "Reply with sparse data",
  });

  assert.equal(event.kind, VIDEO_COMMENT_KIND);
  assert.deepStrictEqual(event.tags, [
    ["E", "file-event"],
    ["K", "1063"],
    ["e", "file-event"],
    ["e", "parent-comment", "wss://parent", "parent-only"],
    ["k", "1111"],
    ["p", "parent-only", "wss://parent-author"],
  ]);
});
