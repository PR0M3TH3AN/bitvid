import assert from "node:assert/strict";
import test from "node:test";

import { buildNip71VideoEvent } from "../js/nostr.js";

test("buildNip71VideoEvent assembles rich metadata", () => {
  const metadata = {
    kind: 21,
    summary: "Custom summary",
    publishedAt: "1700000000",
    alt: "Alt text for accessibility",
    duration: 123,
    contentWarning: "Flashing lights",
    imeta: [
      {
        dim: "1920x1080",
        url: "https://cdn.example/video-1080.mp4",
        x: "abc123",
        m: "video/mp4",
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
      { pubkey: "a".repeat(64), relay: "wss://relay.example" },
      { pubkey: "b".repeat(64) },
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
  assert.deepEqual(tags.get("duration"), ["duration", "123"]);
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
    "image https://cdn.example/video-1080.jpg",
    "image https://backup.example/video-1080.jpg",
    "fallback https://fallback.example/video-1080.mp4",
    "service nip96",
  ]);
  assert.deepEqual(imetaTags[1], [
    "imeta",
    "url https://cdn.example/video-hls.m3u8",
    "m application/x-mpegURL",
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
    ["p", "b".repeat(64)],
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
