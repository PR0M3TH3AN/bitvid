import test from "node:test";
import assert from "node:assert/strict";

import { buildReactionEvent } from "../js/nostrEventSchemas.js";

test("buildReactionEvent includes pointer and author tags when pubkey provided", () => {
  const event = buildReactionEvent({
    pubkey: "viewer",
    created_at: 1700000000,
    pointerValue: "event-id",
    pointerTag: ["e", "event-id", "wss://relay.example"],
    targetPointer: { type: "e", value: "event-id", relay: "wss://relay.example" },
    targetAuthorPubkey: "author-pubkey",
    content: "+",
  });

  const pointerTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "e");
  assert.deepEqual(pointerTags, [["e", "event-id", "wss://relay.example"]]);

  const authorTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "p");
  assert.deepEqual(authorTags, [["p", "author-pubkey", "wss://relay.example"]]);
});

test(
  "buildReactionEvent merges address and event pointers for addressable targets",
  () => {
    const event = buildReactionEvent({
      pubkey: "viewer",
      created_at: 1700000001,
      pointerValue: "30078:deadbeefcafebabe:clip-1",
      pointerTag: ["a", "30078:deadbeefcafebabe:clip-1"],
      pointerTags: [
        ["a", "30078:deadbeefcafebabe:clip-1", "wss://relay.example"],
        ["e", "event-id"],
        ["e", "event-id", "wss://event.relay"],
      ],
      targetPointer: {
        type: "a",
        value: "30078:deadbeefcafebabe:clip-1",
        relay: "wss://relay.example",
      },
      content: "+",
    });

    const addressTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "a");
    assert.deepEqual(addressTags, [[
      "a",
      "30078:deadbeefcafebabe:clip-1",
      "wss://relay.example",
    ]]);

    const eventTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "e");
    assert.deepEqual(eventTags, [["e", "event-id", "wss://event.relay"]]);

    const authorTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "p");
    assert.deepEqual(authorTags, [["p", "deadbeefcafebabe", "wss://relay.example"]]);
  }
);
