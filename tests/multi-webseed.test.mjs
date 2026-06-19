// A video may legitimately declare more than one web seed (e.g. the primary CDN
// plus an independent backup origin) so the WebTorrent swarm can pull pieces
// from either when one is overloaded. Multiple `ws=` params are the standard
// BEP19 carrier and playback already attaches every one of them, so the
// authoring/normalization layer must preserve the full set — never collapse it
// to a single seed.

import test from "node:test";
import assert from "node:assert/strict";

import { extractAllWebSeeds } from "../js/magnetShared.js";
import { normalizeVideoNotePayload } from "../js/services/videoNotePayload.js";

const BTIH = "a".repeat(40);
const MAGNET = `magnet:?xt=urn:btih:${BTIH}`;
const SEED_A = "https://cdn-a.example.com/video.mp4";
const SEED_B = "https://cdn-b.example.com/video.mp4";

test("extractAllWebSeeds returns every ws= in order, deduped", () => {
  const magnet = `${MAGNET}&ws=${encodeURIComponent(SEED_A)}&ws=${encodeURIComponent(
    SEED_B,
  )}&ws=${encodeURIComponent(SEED_A)}`;
  assert.deepEqual(extractAllWebSeeds(magnet), [SEED_A, SEED_B]);
});

test("extractAllWebSeeds returns [] when there are no web seeds", () => {
  assert.deepEqual(extractAllWebSeeds(MAGNET), []);
  assert.deepEqual(extractAllWebSeeds(""), []);
  assert.deepEqual(extractAllWebSeeds(null), []);
});

test("an array of web seeds all survive into the published magnet", () => {
  const { payload, errors } = normalizeVideoNotePayload({
    title: "Multi seed",
    magnet: MAGNET,
    ws: [SEED_A, SEED_B],
  });

  assert.deepEqual(errors, []);
  const seeds = extractAllWebSeeds(payload.legacyFormData.magnet);
  assert.ok(seeds.includes(SEED_A), "first webseed must be carried in the magnet");
  assert.ok(seeds.includes(SEED_B), "second webseed must be carried in the magnet");
});

test("a newline/comma-delimited ws field is split into multiple seeds", () => {
  const { payload } = normalizeVideoNotePayload({
    title: "Multi seed text",
    magnet: MAGNET,
    ws: `${SEED_A}\n${SEED_B}`,
  });

  const seeds = extractAllWebSeeds(payload.legacyFormData.magnet);
  assert.ok(seeds.includes(SEED_A));
  assert.ok(seeds.includes(SEED_B));
});

test("the hosted CDN url is added as a webseed alongside the explicit ones", () => {
  const cdn = "https://cdn.example.com/video.mp4";
  const { payload } = normalizeVideoNotePayload({
    title: "Cdn plus seed",
    url: cdn,
    magnet: MAGNET,
    ws: SEED_A,
  });

  const seeds = extractAllWebSeeds(payload.legacyFormData.magnet);
  assert.ok(seeds.includes(SEED_A), "explicit webseed preserved");
  assert.ok(seeds.includes(cdn), "hosted url also attached as a webseed");
});

test("a single webseed string still works (back-compat)", () => {
  const { payload } = normalizeVideoNotePayload({
    title: "Single seed",
    magnet: MAGNET,
    ws: SEED_A,
  });

  const seeds = extractAllWebSeeds(payload.legacyFormData.magnet);
  assert.deepEqual(seeds, [SEED_A]);
  // The single content `ws` field still reflects the primary seed.
  assert.equal(payload.legacyFormData.ws, SEED_A);
});

test("duplicate webseeds are not written twice", () => {
  const { payload } = normalizeVideoNotePayload({
    title: "Dupe seed",
    magnet: MAGNET,
    ws: [SEED_A, SEED_A, " " + SEED_A + " "],
  });

  const seeds = extractAllWebSeeds(payload.legacyFormData.magnet);
  assert.equal(
    seeds.filter((s) => s === SEED_A).length,
    1,
    "the same webseed must appear at most once",
  );
});
