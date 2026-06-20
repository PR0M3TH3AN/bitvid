// The "My Videos" tab shows ONE row per video reflecting its current state.
// collapseUserVideos must: keep only the owner's videos, dedup to the latest
// version per addressable identity (root id / d-tag), preserve a deleted latest
// state, drop invalid notes, and sort newest-first. A management view that
// showed stale/older versions (or another user's videos) would be misleading
// and dangerous (wrong delete targets).

import assert from "node:assert/strict";
import test from "node:test";
import { collapseUserVideos } from "../js/ui/profileModal/myVideosData.js";

const ME = "a".repeat(64);
const OTHER = "b".repeat(64);

const v = (over) => ({
  id: Math.random().toString(36).slice(2),
  pubkey: ME,
  videoRootId: "root-1",
  title: "T",
  url: "https://cdn/x.mp4",
  created_at: 1000,
  deleted: false,
  ...over,
});

test("keeps only the owner's videos", () => {
  const out = collapseUserVideos(
    [v({ videoRootId: "mine" }), v({ pubkey: OTHER, videoRootId: "theirs" })],
    ME,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].videoRootId, "mine");
});

test("dedups to the latest version per video root", () => {
  const out = collapseUserVideos(
    [
      v({ videoRootId: "r", created_at: 100, title: "old" }),
      v({ videoRootId: "r", created_at: 300, title: "new" }),
      v({ videoRootId: "r", created_at: 200, title: "mid" }),
    ],
    ME,
  );
  assert.equal(out.length, 1, "one row per video");
  assert.equal(out[0].title, "new", "keeps the latest version");
});

test("a video whose latest version is deleted shows as deleted", () => {
  const out = collapseUserVideos(
    [
      v({ videoRootId: "r", created_at: 100, deleted: false, url: "https://cdn/x.mp4" }),
      v({ videoRootId: "r", created_at: 500, deleted: true, url: "" }),
    ],
    ME,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].deleted, true, "the tombstone is the current state");
});

test("an older deletion does not override a newer live version (re-published)", () => {
  const out = collapseUserVideos(
    [
      v({ videoRootId: "r", created_at: 100, deleted: true, url: "" }),
      v({ videoRootId: "r", created_at: 900, deleted: false, url: "https://cdn/new.mp4" }),
    ],
    ME,
  );
  assert.equal(out[0].deleted, false, "the newer live version wins");
  assert.equal(out[0].url, "https://cdn/new.mp4");
});

test("drops invalid notes and sorts newest-first across videos", () => {
  const out = collapseUserVideos(
    [
      v({ videoRootId: "a", created_at: 100 }),
      v({ videoRootId: "b", created_at: 300 }),
      { pubkey: ME, invalid: true, videoRootId: "c", created_at: 999 },
    ],
    ME,
  );
  assert.deepEqual(
    out.map((x) => x.videoRootId),
    ["b", "a"],
    "newest first, invalid dropped",
  );
});

test("empty pubkey returns nothing (never leak all videos)", () => {
  assert.deepEqual(collapseUserVideos([v({})], ""), []);
});
