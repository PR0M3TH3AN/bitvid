// #5 multi-source fail-over: the PlaybackSession builds an ordered, de-duped list
// of hosted sources (primary URL first, then the video's imeta mirrors) that the
// execution flow tries in turn before dropping to WebTorrent. This verifies the
// candidate-list construction (deterministic). The full async fail-over flow is
// exercised by the playbackService_order suite in CI (the async/mock-timers
// playback harness doesn't run in this sandbox).

import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaybackService } from "../../js/services/playbackService.js";

const makeSession = ({ url, sources, magnet = "" }) => {
  const service = new PlaybackService({
    logger: () => {},
    urlFirstEnabled: true,
    isValidMagnetUri: () => true,
  });
  return service.createSession({ url, sources, magnet });
};

test("primary URL leads, then the imeta mirrors, de-duped", () => {
  const session = makeSession({
    url: "https://primary.example/v.mp4",
    sources: [
      { url: "https://mirror-a.example/v.mp4" },
      { url: "https://mirror-b.example/v.mp4" },
    ],
  });
  assert.deepEqual(session.hostedSourceCandidates, [
    "https://primary.example/v.mp4",
    "https://mirror-a.example/v.mp4",
    "https://mirror-b.example/v.mp4",
  ]);
});

test("de-dupes the primary when it also appears in sources (case-insensitive)", () => {
  const session = makeSession({
    url: "https://primary.example/v.mp4",
    sources: [
      { url: "https://PRIMARY.example/v.mp4" },
      { url: "https://mirror.example/v.mp4" },
      { url: "https://mirror.example/v.mp4" },
    ],
  });
  assert.deepEqual(session.hostedSourceCandidates, [
    "https://primary.example/v.mp4",
    "https://mirror.example/v.mp4",
  ]);
});

test("accepts plain-string sources too", () => {
  const session = makeSession({
    url: "https://primary.example/v.mp4",
    sources: ["https://mirror.example/v.mp4"],
  });
  assert.deepEqual(session.hostedSourceCandidates, [
    "https://primary.example/v.mp4",
    "https://mirror.example/v.mp4",
  ]);
});

test("no sources → just the primary (single-source behavior unchanged)", () => {
  const session = makeSession({ url: "https://only.example/v.mp4" });
  assert.deepEqual(session.hostedSourceCandidates, ["https://only.example/v.mp4"]);
});

test("torrent-only video (no URL) → empty hosted candidates", () => {
  const session = makeSession({ url: "", sources: [], magnet: "magnet:?xt=urn:btih:abc" });
  assert.deepEqual(session.hostedSourceCandidates, []);
});

test("ignores junk source entries (null, missing url, blanks)", () => {
  const session = makeSession({
    url: "https://primary.example/v.mp4",
    sources: [null, {}, { url: "   " }, { url: "https://good.example/v.mp4" }, "  "],
  });
  assert.deepEqual(session.hostedSourceCandidates, [
    "https://primary.example/v.mp4",
    "https://good.example/v.mp4",
  ]);
});
