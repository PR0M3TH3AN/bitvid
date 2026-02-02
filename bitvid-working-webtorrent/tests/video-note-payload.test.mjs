import test from "node:test";
import assert from "node:assert/strict";

import {
  getVideoNoteErrorMessage,
  normalizeVideoNotePayload,
  VIDEO_NOTE_ERROR_CODES,
} from "../js/services/videoNotePayload.js";

test("normalizes minimal payload with hosted URL", () => {
  const { payload, errors } = normalizeVideoNotePayload({
    title: "  Example Title  ",
    url: " https://cdn.example.com/video.mp4 ",
  });

  assert.deepEqual(errors, []);
  assert.ok(payload, "Expected payload result");
  assert.equal(payload.legacyFormData.version, 3);
  assert.equal(payload.legacyFormData.title, "Example Title");
  assert.equal(
    payload.legacyFormData.url,
    "https://cdn.example.com/video.mp4",
  );
  assert.equal(payload.legacyFormData.magnet, "");
  assert.equal(payload.legacyFormData.ws, "");
  assert.equal(payload.legacyFormData.xs, "");
  assert.equal(payload.legacyFormData.mode, "live");
  assert.equal(payload.legacyFormData.enableComments, true);
  assert.equal(payload.legacyFormData.isNsfw, false);
  assert.equal(payload.legacyFormData.isForKids, false);
});

test("normalizes mode and boolean flags", () => {
  const { payload, errors } = normalizeVideoNotePayload({
    title: "Flag Demo",
    url: "https://videos.example.com/watch.mp4",
    mode: "DEV",
    enableComments: false,
    isNsfw: true,
    isForKids: true,
    isPrivate: true,
  });

  assert.deepEqual(errors, []);
  assert.equal(payload.legacyFormData.mode, "dev");
  assert.equal(payload.legacyFormData.enableComments, false);
  assert.equal(payload.legacyFormData.isNsfw, true);
  assert.equal(payload.legacyFormData.isForKids, false);
  assert.equal(payload.legacyFormData.isPrivate, true);
});

test("augments magnets with ws/xs hints", () => {
  const { payload, errors } = normalizeVideoNotePayload({
    title: "Magnet Upload",
    magnet: "magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01",
    ws: "https://cdn.example.com/video.mp4",
    xs: "https://cdn.example.com/video.torrent",
  });

  assert.deepEqual(errors, []);
  const { magnet, ws, xs } = payload.legacyFormData;
  assert.ok(magnet.startsWith("magnet:?xt=urn:btih:"));
  assert.ok(
    magnet.includes("ws=https%3A%2F%2Fcdn.example.com%2Fvideo.mp4") ||
      magnet.includes("ws=https://cdn.example.com/video.mp4"),
    "Normalized magnet should include ws hint",
  );
  assert.ok(
    magnet.includes("xs=https://cdn.example.com/video.torrent") ||
      magnet.includes("xs=https%3A%2F%2Fcdn.example.com%2Fvideo.torrent"),
    "Normalized magnet should include xs hint",
  );
  assert.equal(ws, "https://cdn.example.com/video.mp4");
  assert.equal(xs, "https://cdn.example.com/video.torrent");
});

test("normalizes nip71 metadata collections", () => {
  const { payload, errors } = normalizeVideoNotePayload({
    title: "NIP-71 Rich Metadata",
    nip71: {
      imeta: [
        {
          url: " https://cdn.example.com/hls/playlist.m3u8 ",
          duration: " 120.5 ",
          bitrate: " 2100000 ",
          service: [" wss://relay.example.com "],
        },
      ],
      segments: [
        {
          start: " 00:30 ",
          end: 90000,
          title: "  Intro  ",
          thumbnail: " https://cdn.example.com/thumb.jpg ",
        },
        {
          start: "bad",
          end: null,
          title: "",
        },
      ],
      textTracks: [
        { url: " https://cdn.example.com/captions.vtt ", type: " text/vtt ", language: " en " },
        null,
      ],
      participants: [
        { pubkey: " npub123 ", relay: " wss://relay.example.com " },
        {},
      ],
      hashtags: ["  bitvid  ", ""],
      references: ["  nostr:note1abc  "],
      duration: "900",
      publishedAt: "2023-01-01T00:00:00Z",
      summary: "  Summary copy  ",
    },
  });

  assert.deepEqual(errors, []);
  const nip71 = payload.nip71;
  assert.ok(nip71, "Expected nip71 payload");
  assert.equal(nip71.summary, "Summary copy");
  assert.equal(nip71.duration, 900);
  assert.equal(nip71.publishedAt, 1672531200);
  assert.deepEqual(nip71.hashtags, ["bitvid"]);
  assert.deepEqual(nip71.references, ["nostr:note1abc"]);
  assert.equal(nip71.segments.length, 2);
  assert.deepEqual(nip71.segments[0], {
    start: "00:30",
    end: 90000,
    title: "Intro",
    thumbnail: "https://cdn.example.com/thumb.jpg",
  });
  assert.deepEqual(nip71.segments[1], { start: "bad" });
  assert.deepEqual(nip71.textTracks, [
    {
      url: "https://cdn.example.com/captions.vtt",
      type: "text/vtt",
      language: "en",
    },
  ]);
  assert.deepEqual(nip71.participants, [
    {
      pubkey: "npub123",
      relay: "wss://relay.example.com",
    },
  ]);
  assert.equal(nip71.imeta[0].url, "https://cdn.example.com/hls/playlist.m3u8");
  assert.deepEqual(nip71.imeta[0].service, ["wss://relay.example.com"]);
  assert.equal(nip71.imeta[0].duration, 120.5);
  assert.equal(nip71.imeta[0].bitrate, 2100000);
});

test("derives legacy duration fallback from imeta variants", () => {
  const { payload, errors } = normalizeVideoNotePayload({
    title: "Duration Fallback",
    nip71: {
      imeta: [
        { url: "https://cdn.example.com/a.mp4", duration: 12.5 },
        { url: "https://cdn.example.com/b.mp4", duration: "45.75" },
      ],
    },
  });

  assert.deepEqual(errors, []);
  assert.ok(payload.nip71, "Expected nip71 payload");
  assert.equal(payload.nip71.duration, 45.75);
  assert.equal(payload.nip71.imeta[0].duration, 12.5);
  assert.equal(payload.nip71.imeta[1].duration, 45.75);
});

test("reports validation errors for missing fields", () => {
  const { errors } = normalizeVideoNotePayload({
    title: "   ",
    url: "",
  });

  assert.deepEqual(errors, [
    VIDEO_NOTE_ERROR_CODES.MISSING_TITLE,
    VIDEO_NOTE_ERROR_CODES.MISSING_SOURCE,
  ]);
  assert.equal(
    getVideoNoteErrorMessage(errors[0]),
    "Title is required.",
  );
});

test("rejects insecure hosted URLs", () => {
  const { errors } = normalizeVideoNotePayload({
    title: "Sample",
    url: "http://example.com/video.mp4",
  });

  assert.deepEqual(errors, [VIDEO_NOTE_ERROR_CODES.INVALID_URL_PROTOCOL]);
});

test("allows publishing with only imeta variants", () => {
  const { payload, errors } = normalizeVideoNotePayload({
    title: "Imeta Only",
    nip71: {
      imeta: [
        {
          url: "https://cdn.example.com/video.m3u8",
          image: ["https://cdn.example.com/poster.jpg"],
        },
      ],
    },
  });

  assert.deepEqual(errors, []);
  assert.ok(payload.nip71);
  assert.equal(payload.legacyFormData.url, "");
});
