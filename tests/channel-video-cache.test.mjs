// Per-channel persisted cache: instant cold-load paint of a profile wall.
// Round-trips last-seen videos via localStorage, strips heavy tags, and bounds
// both per-channel count and number of cached channels.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCachedChannelVideos,
  saveCachedChannelVideos,
} from "../js/channelProfileVideos.js";

const PK = "a".repeat(64);

test("round-trips videos for a channel, stripping raw tags", () => {
  localStorage.clear();
  saveCachedChannelVideos(PK, [
    { id: "v1", title: "One", pubkey: PK, created_at: 1, url: "https://e/1.mp4", tags: [["e", "x"]] },
  ]);
  const out = loadCachedChannelVideos(PK);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "v1");
  assert.equal(out[0].url, "https://e/1.mp4");
  assert.equal(out[0].tags, undefined, "heavy tags array not persisted");
});

test("scoped per pubkey", () => {
  localStorage.clear();
  saveCachedChannelVideos(PK, [{ id: "v1", title: "x", pubkey: PK, created_at: 1 }]);
  assert.equal(loadCachedChannelVideos("b".repeat(64)).length, 0);
});

test("caps videos per channel (60)", () => {
  localStorage.clear();
  const many = Array.from({ length: 100 }, (_, i) => ({
    id: `v${i}`,
    title: `t${i}`,
    pubkey: PK,
    created_at: i,
  }));
  saveCachedChannelVideos(PK, many);
  assert.equal(loadCachedChannelVideos(PK).length, 60);
});

test("evicts the least-recently-saved channel past the cap (20)", () => {
  localStorage.clear();
  for (let i = 0; i < 22; i += 1) {
    const pk = i.toString(16).padStart(64, "0");
    saveCachedChannelVideos(pk, [{ id: `v${i}`, title: "t", pubkey: pk, created_at: i }]);
  }
  // The two oldest channels (0,1) should have been evicted; the newest remains.
  const oldest = "0".padStart(64, "0");
  const newest = (21).toString(16).padStart(64, "0");
  assert.equal(loadCachedChannelVideos(oldest).length, 0, "oldest evicted");
  assert.equal(loadCachedChannelVideos(newest).length, 1, "newest kept");
});

test("missing / empty inputs are safe no-ops", () => {
  localStorage.clear();
  saveCachedChannelVideos("", [{ id: "v" }]); // no pubkey
  saveCachedChannelVideos(PK, null); // bad videos
  assert.deepEqual(loadCachedChannelVideos(PK), []);
  assert.deepEqual(loadCachedChannelVideos(""), []);
});
