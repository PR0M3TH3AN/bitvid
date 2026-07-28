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

// SCN-share-imeta
// Given a share note whose body ends with the raw thumbnail URL, when the
// video has an http(s) thumbnail, then a NIP-92 `imeta` entry must describe it
// — many clients only render such a URL inline when imeta backs it, otherwise
// the viewer sees a bare link instead of a preview image.

const imetaOf = (event) => event.tags.find((tag) => tag[0] === "imeta") || null;

test("buildShareEvent emits a NIP-92 imeta entry for the thumbnail", () => {
  const event = buildShareEvent({
    pubkey: "share-author",
    created_at: 1700000804,
    video: {
      id: "a".repeat(64),
      pubkey: "b".repeat(64),
      title: "Why I'm (sort of) not worried about AI",
      thumbnail: "https://cdn.example/thumb.jpg",
    },
  });

  assert.deepEqual(imetaOf(event), [
    "imeta",
    "url https://cdn.example/thumb.jpg",
    "m image/jpeg",
    "alt Why I'm (sort of) not worried about AI",
  ]);
});

test("buildShareEvent infers the image type per extension, query strings included", () => {
  const typeFor = (thumbnail) => {
    const event = buildShareEvent({
      pubkey: "share-author",
      created_at: 1700000805,
      video: { id: "a".repeat(64), thumbnail },
    });
    return (imetaOf(event) || []).find((entry) => entry.startsWith("m ")) || "";
  };

  assert.equal(typeFor("https://cdn.example/a.png"), "m image/png");
  assert.equal(typeFor("https://cdn.example/a.WEBP"), "m image/webp");
  assert.equal(typeFor("https://cdn.example/a.jpeg?sig=abc&exp=1"), "m image/jpeg");
  assert.equal(typeFor("https://cdn.example/a.avif#x"), "m image/avif");
});

test("buildShareEvent omits the media type when the extension is unknown", () => {
  // A wrong `m` is worse than a missing one: clients use it to decide whether
  // to render inline at all. Blossom-style extensionless URLs hit this path.
  const event = buildShareEvent({
    pubkey: "share-author",
    created_at: 1700000806,
    video: {
      id: "a".repeat(64),
      title: "Untitled",
      thumbnail: "https://blossom.example/0101591966f5764e57abb79f8e0305d7",
    },
  });

  assert.deepEqual(imetaOf(event), [
    "imeta",
    "url https://blossom.example/0101591966f5764e57abb79f8e0305d7",
    "alt Untitled",
  ]);
});

test("buildShareEvent skips imeta for non-http thumbnails", () => {
  for (const thumbnail of [
    "",
    "   ",
    "assets/jpg/fallback.jpg",
    "data:image/png;base64,iVBORw0KGgo=",
    "javascript:alert(1)",
    null,
    undefined,
  ]) {
    const event = buildShareEvent({
      pubkey: "share-author",
      created_at: 1700000807,
      video: { id: "a".repeat(64), thumbnail },
    });
    assert.equal(
      imetaOf(event),
      null,
      `expected no imeta for thumbnail ${JSON.stringify(thumbnail)}`
    );
  }
});

test("buildShareEvent collapses newlines in imeta alt text", () => {
  // imeta entries are space-delimited "key value" strings; a raw newline in the
  // title would corrupt the tag for parsers reading it back.
  const event = buildShareEvent({
    pubkey: "share-author",
    created_at: 1700000808,
    video: {
      id: "a".repeat(64),
      title: "Line one\nline two\t  spaced",
      thumbnail: "https://cdn.example/t.png",
    },
  });

  const alt = imetaOf(event).find((entry) => entry.startsWith("alt "));
  assert.equal(alt, "alt Line one line two spaced");
  assert.equal(/[\n\r\t]/.test(alt), false);
});

// SCN-share-quote
// When a NIP-71 mirror exists, the note body quotes it via `nostr:naddr1…`
// instead of carrying a bare thumbnail URL. The imeta tag must then be dropped
// — the quote card already renders the thumbnail, and emitting both showed the
// same image twice — while an `a` tag links the note to the quoted coordinate.

const MIRROR_COORD = `34235:${"b".repeat(64)}:root-abc`;

test("buildShareEvent adds an `a` tag for the quoted mirror", () => {
  const event = buildShareEvent({
    pubkey: "share-author",
    created_at: 1700000809,
    video: {
      id: "a".repeat(64),
      pubkey: "b".repeat(64),
      title: "Quoted video",
      thumbnail: "https://cdn.example/thumb.jpg",
      mirrorNaddr: "naddr1qqxnzd3exuerjvfhx",
      mirrorCoordinate: MIRROR_COORD,
    },
  });

  const aTag = event.tags.find((tag) => tag[0] === "a");
  assert.deepEqual(aTag, ["a", MIRROR_COORD, "", "mention"]);
});

test("buildShareEvent drops the imeta when the note quotes a mirror", () => {
  const event = buildShareEvent({
    pubkey: "share-author",
    created_at: 1700000810,
    video: {
      id: "a".repeat(64),
      title: "Quoted video",
      thumbnail: "https://cdn.example/thumb.jpg",
      mirrorNaddr: "naddr1qqxnzd3exuerjvfhx",
      mirrorCoordinate: MIRROR_COORD,
    },
  });

  assert.equal(
    event.tags.some((tag) => tag[0] === "imeta"),
    false,
    "quote card renders the thumbnail; a second imeta duplicates it"
  );
});

test("buildShareEvent keeps the imeta when there is no mirror to quote", () => {
  const event = buildShareEvent({
    pubkey: "share-author",
    created_at: 1700000811,
    video: {
      id: "a".repeat(64),
      title: "Unmirrored video",
      thumbnail: "https://cdn.example/thumb.jpg",
    },
  });

  assert.equal(event.tags.some((tag) => tag[0] === "imeta"), true);
  assert.equal(event.tags.some((tag) => tag[0] === "a"), false);
});

test("buildShareEvent ignores a malformed mirror coordinate", () => {
  for (const coordinate of [
    "not-a-coordinate",
    "34235:notahexpubkey:root",
    ":::",
    "",
  ]) {
    const event = buildShareEvent({
      pubkey: "share-author",
      created_at: 1700000812,
      video: {
        id: "a".repeat(64),
        title: "T",
        mirrorCoordinate: coordinate,
      },
    });
    assert.equal(
      event.tags.some((tag) => tag[0] === "a"),
      false,
      `must not emit an a tag for ${JSON.stringify(coordinate)}`
    );
  }
});
