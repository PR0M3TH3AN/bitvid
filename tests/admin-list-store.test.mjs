// Run with: node tests/admin-list-store.test.mjs

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (!globalThis.window.NostrTools) {
  globalThis.window.NostrTools = {};
}

const mockNip19 = {
  decode(value) {
    if (typeof value !== "string") {
      throw new Error("invalid input");
    }
    if (value.trim().toLowerCase().startsWith("npub")) {
      return { type: "npub", data: "mock" };
    }
    throw new Error("unsupported value");
  },
  npubEncode(hex) {
    if (typeof hex !== "string") {
      throw new Error("invalid hex");
    }
    const trimmed = hex.trim();
    if (!trimmed) {
      throw new Error("empty hex");
    }
    return `npub1${trimmed}`;
  },
};

globalThis.window.NostrTools.nip19 = mockNip19;

const { __adminListStoreTestHooks } = await import("../js/adminListStore.js");

const { extractNpubsFromEvent, normalizeParticipantTagValue } =
  __adminListStoreTestHooks;

const sampleHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const sampleNpub = "npub1existingparticipant";

const event = {
  tags: [
    ["p", sampleHex],
    ["p", sampleNpub],
    ["p", "  npub1existingparticipant  "],
    ["p", ""],
    ["e", "irrelevant"],
  ],
};

const normalized = extractNpubsFromEvent(event);
assert.deepEqual(
  normalized,
  [
    mockNip19.npubEncode(sampleHex),
    sampleNpub,
  ],
  "should return unique npubs from hex and npub participant tags"
);

mockNip19.decode = () => {
  throw new Error("decode unavailable");
};

assert.equal(
  normalizeParticipantTagValue(sampleNpub),
  sampleNpub,
  "should fall back to the raw npub when decode fails"
);

mockNip19.decode = undefined;
mockNip19.npubEncode = undefined;

globalThis.window.NostrTools.nip19 = mockNip19;

const fallbackHex = "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";

assert.equal(
  normalizeParticipantTagValue(fallbackHex),
  fallbackHex,
  "should preserve hex when nip19 helpers are unavailable"
);

console.log("admin-list-store tests passed");
