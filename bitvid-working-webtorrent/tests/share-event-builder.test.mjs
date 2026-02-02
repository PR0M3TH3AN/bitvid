import test from "node:test";
import assert from "node:assert/strict";

const SAMPLE_HEX = "deadbeef".repeat(8);
const SAMPLE_NPUB = "npub1shareeventfixture000000000000000000000";

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
    decode: () => ({ type: "npub", data: SAMPLE_HEX }),
  };
}

const { buildShareEvent } = await import("../js/nostrEventSchemas.js");

test("buildShareEvent preserves share content", () => {
  const event = buildShareEvent({
    pubkey: "share-author",
    created_at: 1700000800,
    content: "Check this out!",
    video: { id: "a".repeat(64), pubkey: "b".repeat(64) },
  });

  assert.equal(event.content, "Check this out!");
});

test("buildShareEvent normalizes hex identifiers for e and p tags", () => {
  const event = buildShareEvent({
    pubkey: "share-author",
    created_at: 1700000801,
    content: "Normalize IDs",
    video: {
      id: "ABCDEF".repeat(10) + "ABCD",
      pubkey: SAMPLE_NPUB,
    },
  });

  const eventTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "e");
  const authorTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "p");

  assert.deepEqual(eventTags, [["e", "abcdef".repeat(10) + "abcd", "", "mention"]]);
  assert.deepEqual(authorTags, [["p", SAMPLE_HEX, "", "mention"]]);
});

test("buildShareEvent includes sanitized relay hints", () => {
  const event = buildShareEvent({
    pubkey: "share-author",
    created_at: 1700000802,
    content: "Relay hints",
    video: { id: "c".repeat(64), pubkey: "d".repeat(64) },
    relays: [
      "  wss://relay.one  ",
      { url: " wss://relay.two ", mode: "READ" },
      ["r", "wss://relay.one", "write"],
      { relay: "wss://relay.three", write: true, read: false },
      ["wss://relay.four", "write"],
    ],
  });

  const relayTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "r");

  assert.deepEqual(relayTags, [
    ["r", "wss://relay.one"],
    ["r", "wss://relay.two", "read"],
    ["r", "wss://relay.one", "write"],
    ["r", "wss://relay.three", "write"],
    ["r", "wss://relay.four", "write"],
  ]);
});

test("buildShareEvent tolerates missing optional fields", () => {
  const event = buildShareEvent({
    pubkey: "share-author",
    created_at: 1700000803,
  });

  assert.equal(event.kind, 1);
  assert.equal(event.content, "");
  assert.deepEqual(event.tags, []);
});
