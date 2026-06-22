// Phase 2 reconciliation: diff the user's notes against their bucket contents.
// Must (a) flag a live note whose hosted file is gone as MISSING, (b) flag bucket
// objects no live note references as ORPHANS — crucially including a deleted
// video's leftover file (the "deleted on Nostr, still in the bucket" case) — and
// (c) NEVER flag a file an active note still uses (incl. its .torrent/thumbnail).

import assert from "node:assert/strict";
import test from "node:test";
import { reconcileStorage } from "../js/ui/profileModal/myVideosReconcile.js";

const BASE = "https://cdn.example.com";
const key = (k) => `${BASE}/${k}`;

test("a deleted video's leftover file is reported as an orphan", () => {
  const { orphanKeys, missing } = reconcileStorage({
    // tombstone scrubbed the URL, so the note references nothing
    videos: [{ deleted: true, url: "", magnet: "" }],
    bucketKeys: ["u/npub1/abc/video.mp4", "u/npub1/abc/video.torrent"],
    publicBaseUrl: BASE,
  });
  assert.deepEqual(orphanKeys.sort(), [
    "u/npub1/abc/video.mp4",
    "u/npub1/abc/video.torrent",
  ]);
  assert.equal(missing.length, 0);
});

test("a file an active note still uses (and its siblings) is never an orphan", () => {
  const { orphanKeys } = reconcileStorage({
    videos: [
      {
        url: key("u/npub1/abc/video.mp4"),
        thumbnail: key("u/npub1/abc/thumb.jpg"),
      },
    ],
    bucketKeys: [
      "u/npub1/abc/video.mp4",
      "u/npub1/abc/video.torrent",
      "u/npub1/abc/thumb.jpg",
    ],
    publicBaseUrl: BASE,
  });
  assert.deepEqual(orphanKeys, [], "the whole referenced bundle is protected");
});

test("an active note whose hosted file is gone is reported as missing", () => {
  const { missing } = reconcileStorage({
    videos: [{ id: "v1", url: key("u/npub1/abc/video.mp4") }],
    bucketKeys: ["u/npub1/other/thing.mp4"],
    publicBaseUrl: BASE,
  });
  assert.equal(missing.length, 1);
  assert.equal(missing[0].video.id, "v1");
  assert.equal(missing[0].key, "u/npub1/abc/video.mp4");
});

test("a missing sibling .torrent does NOT mark the row missing (primary present)", () => {
  const { missing } = reconcileStorage({
    videos: [{ id: "v1", url: key("u/npub1/abc/video.mp4") }],
    bucketKeys: ["u/npub1/abc/video.mp4"], // present, but no .torrent
    publicBaseUrl: BASE,
  });
  assert.equal(missing.length, 0, "only a missing primary video file counts");
});

test("external-URL videos never produce missing or referenced keys", () => {
  const { missing, orphanKeys } = reconcileStorage({
    videos: [{ id: "v1", url: "https://third-party.example/v.mp4" }],
    bucketKeys: ["u/npub1/abc/video.mp4"],
    publicBaseUrl: BASE,
  });
  assert.equal(missing.length, 0, "can't be missing — not hosted by us");
  assert.deepEqual(
    orphanKeys,
    ["u/npub1/abc/video.mp4"],
    "the unrelated bucket file is still an orphan",
  );
});

test("mixed library: one healthy, one missing, one orphan from a delete", () => {
  const { missing, orphanKeys } = reconcileStorage({
    videos: [
      { id: "ok", url: key("u/n/ok/v.mp4") },
      { id: "gone", url: key("u/n/gone/v.mp4") },
      { id: "del", deleted: true, url: "" },
    ],
    bucketKeys: ["u/n/ok/v.mp4", "u/n/del/v.mp4"],
    publicBaseUrl: BASE,
  });
  assert.deepEqual(missing.map((m) => m.video.id), ["gone"]);
  assert.deepEqual(orphanKeys, ["u/n/del/v.mp4"]);
});
