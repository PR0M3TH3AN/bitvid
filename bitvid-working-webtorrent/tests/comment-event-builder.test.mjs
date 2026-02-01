import test from "node:test";
import assert from "node:assert/strict";

const SANITIZED_SAMPLE_HEX = "deadbeef".repeat(8);
const SANITIZED_SAMPLE_NPUB = "npub1commentadditionaltagfixture000000000000000000000";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (!globalThis.window.NostrTools) {
  globalThis.window.NostrTools = {};
}

const existingNip19 =
  typeof globalThis.window.NostrTools.nip19 === "object"
    ? globalThis.window.NostrTools.nip19
    : {};

if (typeof existingNip19.decode !== "function") {
  globalThis.window.NostrTools.nip19 = {
    ...existingNip19,
    decode: (value) => ({ type: "npub", data: SANITIZED_SAMPLE_HEX }),
  };
}

const {
  buildCommentEvent,
  getNostrEventSchema,
  NOTE_TYPES,
} = await import("../js/nostrEventSchemas.js");

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
    ["E", "video-event-id"],
    ["K", "30078"],
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
    ["E", "video-event-id"],
    ["E", "parent-comment-id", "parent-author"],
    ["K", String(VIDEO_COMMENT_KIND)],
    ["P", "parent-author"],
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
    ["E", "event123", "wss://comments.main"],
    ["E", "root-comment", "wss://parent", "cafecafe"],
    ["K", String(VIDEO_COMMENT_KIND)],
    ["P", "cafecafe", "wss://profile"],
    ["client", "bitvid"],
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
    ["E", "legacy-event", "wss://legacy.example"],
    ["K", "1063"],
    ["P", "legacy-pubkey"],
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
    ["E", "parent-comment", "wss://parent", "parent-only"],
    ["K", "1111"],
    ["P", "parent-only", "wss://parent-author"],
  ]);
});

test("buildCommentEvent sanitizes additional tags before signing", () => {
  const event = buildCommentEvent({
    pubkey: "sanitizer",
    created_at: 1700000600,
    videoEventId: "sanitized-event",
    threadParticipantPubkey: "cafecafe",
    additionalTags: [
      ["p", null],
      ["p", SANITIZED_SAMPLE_NPUB],
      ["client", { foo: "bar" }],
      ["client", "bitvid"],
    ],
    content: "sanitize",
  });

  const clientTags = event.tags.filter(
    (tag) => Array.isArray(tag) && tag[0] === "client",
  );
  assert.deepStrictEqual(clientTags, [["client", "bitvid"]]);

  const normalizedAdditionalPubkeys = event.tags.filter(
    (tag) => Array.isArray(tag) && tag[0] === "p" && tag[1] === SANITIZED_SAMPLE_HEX,
  );
  assert.equal(
    normalizedAdditionalPubkeys.length,
    1,
    "sanitized npub additional tag should normalize to hex",
  );

  assert.ok(
    !event.tags.some(
      (tag) =>
        Array.isArray(tag) &&
        tag[0] === "client" &&
        typeof tag[1] === "string" &&
        tag[1].includes("[object Object]"),
    ),
    "invalid object values should be removed instead of stringified",
  );
});
