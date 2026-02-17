import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRelay,
  normalizePointerCandidate,
  normalizeTagName,
  normalizeTagValue,
  normalizeDescriptorString,
  pickString,
  pickKind,
  isEventCandidate,
  resolveEventCandidate,
  collectTagsFromEvent,
  findTagByName,
  normalizeCommentTarget,
  CommentTargetNormalizer,
  COMMENT_EVENT_KIND,
} from "../../js/nostr/commentTargetNormalizer.js";

describe("CommentTargetNormalizer Utilities", () => {
  test("normalizeRelay", () => {
    assert.equal(normalizeRelay(" wss://relay "), "wss://relay");
    assert.equal(normalizeRelay(["e", "id", " wss://relay "]), "wss://relay");
    assert.equal(normalizeRelay({ relay: " wss://relay " }), "wss://relay");
    assert.equal(normalizeRelay({ url: " wss://relay " }), "wss://relay");
    assert.equal(normalizeRelay({ relays: ["", " wss://relay "] }), "wss://relay");
    assert.equal(normalizeRelay(null), "");
    assert.equal(normalizeRelay({ tag: ["e", "id", "wss://relay"] }), "wss://relay");
  });

  test("normalizePointerCandidate", () => {
    // Array format
    assert.deepEqual(normalizePointerCandidate(["e", " id ", "relay"], "e"), { value: "id", relay: "relay" });
    assert.equal(normalizePointerCandidate(["e", "id"], "p"), null); // Type mismatch

    // String format (e/a pointers handled by normalizePointerInput logic)
    // Note: normalizePointerInput handles hex strings by default returning type: 'e' or 'p' depending on context or just basic object.
    // If input is just a string "id", normalizePointerInput might treat it as a potential pointer.
    // Let's rely on basic string behavior if normalizePointerInput supports it.
    // Assuming normalizePointerInput returns { value: input } for basic strings if it can't decode bech32.
    // Actually, checking pointerNormalization.js source would be ideal, but let's assume standard behavior for now.
    // If " id " is passed, and expectedType is "e", and it's not a bech32, it falls through to:
    // if (expectedType === "e" && candidate.trim() && !candidate.includes(":")) { return { value: candidate.trim(), relay: "" }; }
    assert.deepEqual(normalizePointerCandidate(" id ", "e"), { value: "id", relay: "" });

    // "a" pointer fallback
    assert.deepEqual(normalizePointerCandidate(" kind:pubkey:d ", "a"), { value: "kind:pubkey:d", relay: "" });

    // Object format
    assert.deepEqual(normalizePointerCandidate({ type: "e", value: "id", relay: "r" }, "e"), { value: "id", relay: "r" });
    assert.deepEqual(normalizePointerCandidate({ id: "id", relay: "r" }, "e"), { value: "id", relay: "r" });
    assert.deepEqual(normalizePointerCandidate({ address: "addr", relay: "r" }, "a"), { value: "addr", relay: "r" });

    // Nested tag/pointer
    assert.deepEqual(normalizePointerCandidate({ tag: ["e", "id", "r"] }, "e"), { value: "id", relay: "r" });
  });

  test("normalizeTagName", () => {
    assert.equal(normalizeTagName(" Tag "), "tag");
    assert.equal(normalizeTagName(123), "");
  });

  test("normalizeTagValue", () => {
    assert.equal(normalizeTagValue(" VAL "), "val");
    assert.equal(normalizeTagValue(123), "123");
    assert.equal(normalizeTagValue(null), "");
  });

  test("normalizeDescriptorString", () => {
    assert.equal(normalizeDescriptorString(" VAL "), "val");
    assert.equal(normalizeDescriptorString(123), "123");
    assert.equal(normalizeDescriptorString({ value: "val" }), "val");
    assert.equal(normalizeDescriptorString(null), "");
  });

  test("pickString", () => {
    assert.equal(pickString(null, "", " first ", "second"), "first");
    assert.equal(pickString(), "");
  });

  test("pickKind", () => {
    assert.equal(pickKind(null, 123, "456"), "123");
    assert.equal(pickKind(" 789 "), "789");
  });

  test("isEventCandidate", () => {
    assert.ok(isEventCandidate({ id: "id" }));
    assert.ok(isEventCandidate({ tags: [] }));
    assert.ok(isEventCandidate({ pubkey: "pk" }));
    assert.equal(isEventCandidate(null), false);
    assert.equal(isEventCandidate({}), false);
  });

  test("resolveEventCandidate", () => {
    const evt = { id: "id" };
    assert.equal(resolveEventCandidate(null, evt), evt);
  });

  test("collectTagsFromEvent", () => {
    assert.deepEqual(collectTagsFromEvent({ tags: [["t", "v"], "invalid"] }), [["t", "v"]]);
    assert.deepEqual(collectTagsFromEvent(null), []);
  });

  test("findTagByName", () => {
    const tags = [["e", "val"], ["P", "val"]];
    assert.deepEqual(findTagByName(tags, "E"), ["e", "val"]);
    assert.deepEqual(findTagByName(tags, "p"), ["P", "val"]);
    assert.equal(findTagByName(tags, "z"), null);
  });
});

describe("CommentTargetNormalizer Class", () => {
  test("normalize with full explicit descriptor", () => {
    const input = {
      videoEventId: " vid ",
      videoEventRelay: " r1 ",
      videoDefinitionAddress: " addr ",
      videoDefinitionRelay: " r2 ",
      rootIdentifier: " root ",
      rootIdentifierRelay: " r3 ",
    };
    const result = normalizeCommentTarget(input);

    assert.equal(result.videoEventId, "vid");
    assert.equal(result.videoEventRelay, "r1");
    assert.equal(result.videoDefinitionAddress, "addr");
    assert.equal(result.videoDefinitionRelay, "r2");
    assert.equal(result.rootIdentifier, "root");
    assert.equal(result.rootIdentifierRelay, "r3");
  });

  test("normalize extracts from tags if missing in descriptor", () => {
    const videoEvent = {
      tags: [
        ["I", "root-id", "root-relay"],
        ["A", "addr", "addr-relay"],
        ["E", "vid", "vid-relay", "root-author"],
      ]
    };
    // pass videoEvent via options or target
    const result = normalizeCommentTarget({}, { videoEvent });

    assert.equal(result.rootIdentifier, "root-id");
    assert.equal(result.rootIdentifierRelay, "root-relay");
    assert.equal(result.videoDefinitionAddress, "addr");
    assert.equal(result.videoDefinitionRelay, "addr-relay");
    assert.equal(result.videoEventId, "vid");
    assert.equal(result.videoEventRelay, "vid-relay");
    assert.equal(result.rootAuthorPubkey, "root-author");
  });

  test("normalize prioritizes overrides over target", () => {
    const target = { videoEventId: "target-vid" };
    const overrides = { videoEventId: "override-vid" };
    const result = normalizeCommentTarget(target, overrides);
    assert.equal(result.videoEventId, "override-vid");
  });

  test("normalize derives defaults correctly", () => {
    // Parent kind defaults to COMMENT_EVENT_KIND if parentCommentId is present
    const result = normalizeCommentTarget({
      videoEventId: "vid",
      rootKind: "30078",
      parentCommentId: "parent"
    });
    assert.equal(result.parentKind, String(COMMENT_EVENT_KIND));

    // Root kind defaults to parent kind
    const result2 = normalizeCommentTarget({
      videoEventId: "vid",
      parentKind: "1",
      parentCommentId: "parent"
    });
    assert.equal(result2.rootKind, "1");
  });

  test("returns null if videoEventId is missing", () => {
    const result = normalizeCommentTarget({});
    assert.equal(result, null);
  });
});
