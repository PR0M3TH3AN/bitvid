import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNip71VideoEvent,
  extractNip71MetadataFromTags,
} from "../js/nostr.js";

const participantNpub = "npub1bitvidparticipantfixture";
const participantHexFromNpub = "c".repeat(64);

const hadWindow = typeof globalThis.window !== "undefined";
const windowRef = hadWindow ? globalThis.window : {};
if (!hadWindow) {
  globalThis.window = windowRef;
}
const hadNostrTools = typeof windowRef.NostrTools !== "undefined";
const nostrToolsRef = hadNostrTools ? windowRef.NostrTools : {};
if (!hadNostrTools) {
  windowRef.NostrTools = nostrToolsRef;
}
const previousNip19 = nostrToolsRef.nip19;
nostrToolsRef.nip19 = {
  ...previousNip19,
  decode: (value) => {
    if (value === participantNpub) {
      return { type: "npub", data: participantHexFromNpub };
    }
    if (typeof previousNip19?.decode === "function") {
      return previousNip19.decode(value);
    }
    throw new Error("Unsupported npub fixture");
  },
};

test.after(() => {
  if (previousNip19) {
    nostrToolsRef.nip19 = previousNip19;
  } else {
    delete nostrToolsRef.nip19;
  }
  if (!hadNostrTools) {
    delete windowRef.NostrTools;
  }
  if (!hadWindow) {
    delete globalThis.window;
  }
});

test("buildNip71VideoEvent assembles rich metadata", () => {
  const metadata = {
    kind: 21,
    summary: "Custom summary",
    publishedAt: "1700000000",
    alt: "Alt text for accessibility",
    duration: 123.456,
    contentWarning: "Flashing lights",
    imeta: [
      {
        dim: "1920x1080",
        url: "https://cdn.example/video-1080.mp4",
        x: "abc123",
        m: "video/mp4",
        duration: 123.456,
        bitrate: 4500000,
        image: [
          "https://cdn.example/video-1080.jpg",
          "https://backup.example/video-1080.jpg",
        ],
        fallback: ["https://fallback.example/video-1080.mp4"],
        service: ["nip96"],
      },
      {
        url: "https://cdn.example/video-hls.m3u8",
        m: "application/x-mpegURL",
        duration: "45.789",
        bitrate: "2200000",
      },
    ],
    textTracks: [
      {
        url: "https://cdn.example/captions-en.vtt",
        type: "captions",
        language: "en",
      },
      {
        url: "https://cdn.example/captions-es.vtt",
        language: "es",
      },
    ],
    segments: [
      { start: "00:00:00", end: "00:01:00", title: "Intro" },
      { start: 120, title: "Middle" },
    ],
    hashtags: ["bitvid", "nostr"],
    participants: [
      { pubkey: "A".repeat(64), relay: "wss://relay.example" },
      { pubkey: `  ${participantNpub}  ` },
    ],
    references: [
      "https://example.com/info",
      "https://example.com/docs",
    ],
  };

  const event = buildNip71VideoEvent({
    metadata,
    pubkey: "f".repeat(64),
    title: "Test Video",
    summaryFallback: "Fallback summary",
    createdAt: 42,
  });

  assert.ok(event, "builder should return an event");
  assert.equal(event.kind, 21, "kind should honor metadata");
  assert.equal(event.pubkey, "f".repeat(64));
  assert.equal(event.created_at, 42);
  assert.equal(event.content, "Custom summary");

  const tags = new Map(event.tags.map((tag) => [tag[0], tag]));
  assert.deepEqual(tags.get("title"), ["title", "Test Video"]);
  assert.deepEqual(tags.get("published_at"), ["published_at", "1700000000"]);
  assert.deepEqual(tags.get("alt"), ["alt", "Alt text for accessibility"]);
  assert.ok(!tags.has("duration"), "duration should no longer be emitted as a top-level tag");
  assert.deepEqual(tags.get("content-warning"), [
    "content-warning",
    "Flashing lights",
  ]);

  const imetaTags = event.tags.filter((tag) => tag[0] === "imeta");
  assert.equal(imetaTags.length, 2, "should include both imeta variants");
  assert.deepEqual(imetaTags[0], [
    "imeta",
    "dim 1920x1080",
    "url https://cdn.example/video-1080.mp4",
    "x abc123",
    "m video/mp4",
    "duration 123.456",
    "bitrate 4500000",
    "image https://cdn.example/video-1080.jpg",
    "image https://backup.example/video-1080.jpg",
    "fallback https://fallback.example/video-1080.mp4",
    "service nip96",
  ]);
  assert.deepEqual(imetaTags[1], [
    "imeta",
    "url https://cdn.example/video-hls.m3u8",
    "m application/x-mpegURL",
    "duration 45.789",
    "bitrate 2200000",
  ]);

  const textTrackTags = event.tags.filter((tag) => tag[0] === "text-track");
  assert.deepEqual(textTrackTags, [
    [
      "text-track",
      "https://cdn.example/captions-en.vtt",
      "captions",
      "en",
    ],
    ["text-track", "https://cdn.example/captions-es.vtt", "", "es"],
  ]);

  const segmentTags = event.tags.filter((tag) => tag[0] === "segment");
  assert.deepEqual(segmentTags, [
    ["segment", "00:00:00", "00:01:00", "Intro"],
    ["segment", "120", "", "Middle"],
  ]);

  const hashtagTags = event.tags.filter((tag) => tag[0] === "t");
  assert.deepEqual(hashtagTags, [
    ["t", "bitvid"],
    ["t", "nostr"],
  ]);

  const participantTags = event.tags.filter((tag) => tag[0] === "p");
  assert.deepEqual(participantTags, [
    ["p", "a".repeat(64), "wss://relay.example"],
    ["p", participantHexFromNpub],
  ]);

  const referenceTags = event.tags.filter((tag) => tag[0] === "r");
  assert.deepEqual(referenceTags, [
    ["r", "https://example.com/info"],
    ["r", "https://example.com/docs"],
  ]);
});

test("buildNip71VideoEvent falls back to summary and selects kind", () => {
  const metadata = {
    kind: "22",
    publishedAt: "2024-01-01T12:00:00Z",
    imeta: [{ url: "https://cdn.example/video.mp4" }],
  };

  const event = buildNip71VideoEvent({
    metadata,
    pubkey: "c".repeat(64),
    title: "Fallback Title",
    summaryFallback: "Fallback description",
    createdAt: 100,
  });

  assert.ok(event, "builder should create minimal event");
  assert.equal(event.kind, 22, "string kind should coerce to number");
  const expectedPublished = String(Math.floor(Date.parse("2024-01-01T12:00:00Z") / 1000));
  assert.deepEqual(event.tags.find((tag) => tag[0] === "published_at"), [
    "published_at",
    expectedPublished,
  ]);
  assert.equal(
    event.content,
    "Fallback description",
    "should use fallback summary when metadata summary missing"
  );
});

test("buildNip71VideoEvent attaches pointer tags", () => {
  const metadata = {
    kind: 21,
    summary: "Pointer test",
    imeta: [{ url: "https://cdn.example/clip.mp4" }],
  };

  const pubkey = "f".repeat(64);
  const pointerIdentifiers = {
    videoRootId: "root-123",
    eventId: "event-456",
    dTag: "pointer-d-tag",
  };

  const event = buildNip71VideoEvent({
    metadata,
    pubkey,
    title: "Pointer Demo",
    pointerIdentifiers,
  });

  assert.ok(event, "event should be built with pointer tags");
  const pointerTags = event.tags.filter((tag) =>
    ["a", "video-root", "e", "d"].includes(tag[0])
  );
  assert.deepEqual(pointerTags, [
    ["a", `30078:${pubkey}:${pointerIdentifiers.videoRootId}`],
    ["video-root", pointerIdentifiers.videoRootId],
    ["e", pointerIdentifiers.eventId],
    ["d", pointerIdentifiers.dTag],
  ]);
});

test("extractNip71MetadataFromTags parses metadata and pointers", () => {
  const event = {
    id: "nip71-event",
    kind: 22,
    created_at: 123,
    content: "Summary text",
    tags: [
      ["title", "Metadata Title"],
      ["published_at", "1700000100"],
      ["alt", "alt text"],
      ["content-warning", "Bright lights"],
      [
        "imeta",
        "url https://cdn.example/video.mp4",
        "m video/mp4",
        "duration 321.125",
        "bitrate 2500000",
      ],
      ["text-track", "https://cdn.example/captions.vtt", "captions", "en"],
      ["segment", "00:00", "00:10", "Intro", "https://cdn.example/thumb.jpg"],
      ["t", "nostr"],
      ["p", "c".repeat(64), "wss://relay.example"],
      ["r", "https://example.com/info"],
      ["a", "30078:deadbeef:root-123"],
      ["video-root", "root-123"],
      ["e", "event-456"],
      ["d", "d-pointer"],
    ],
  };

  const parsed = extractNip71MetadataFromTags(event);
  assert.ok(parsed, "parser should produce a result");
  assert.deepEqual(parsed.metadata.title, "Metadata Title");
  assert.deepEqual(parsed.metadata.summary, "Summary text");
  assert.equal(parsed.metadata.duration, 321.125);
  assert.equal(parsed.metadata.alt, "alt text");
  assert.equal(parsed.metadata.contentWarning, "Bright lights");
  assert.deepEqual(parsed.metadata.hashtags, ["nostr"]);
  assert.deepEqual(parsed.metadata.references, ["https://example.com/info"]);
  assert.equal(parsed.metadata.textTracks.length, 1);
  assert.equal(parsed.metadata.imeta.length, 1);
  assert.equal(parsed.metadata.imeta[0].duration, 321.125);
  assert.equal(parsed.metadata.imeta[0].bitrate, 2500000);
  assert(parsed.pointers.videoRootIds.has("root-123"));
  assert(parsed.pointers.videoEventIds.has("event-456"));
  assert(parsed.pointers.dTags.has("d-pointer"));
  assert(parsed.pointers.pointerValues.has("30078:deadbeef:root-123"));
});
