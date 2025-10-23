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

test("buildReactionEvent derives author pubkey from address pointer", () => {
  const event = buildReactionEvent({
    pubkey: "viewer",
    created_at: 1700000001,
    pointerValue: "30078:deadbeefcafebabe:clip-1",
    pointerTag: ["a", "30078:deadbeefcafebabe:clip-1"],
    targetPointer: { type: "a", value: "30078:deadbeefcafebabe:clip-1" },
    content: "+",
  });

  const addressTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "a");
  assert.deepEqual(addressTags, [["a", "30078:deadbeefcafebabe:clip-1"]]);

  const authorTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "p");
  assert.deepEqual(authorTags, [["p", "deadbeefcafebabe"]]);
});
