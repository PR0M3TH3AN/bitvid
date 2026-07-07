import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PLAYLIST_KIND,
  parsePlaylistEvent,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  reorderPlaylistItems,
  videoCoordinate,
  buildPlaylist,
  generatePlaylistId,
  playlistItemKey,
} from "../js/playlists/playlistService.js";
import { buildPlaylistEvent } from "../js/nostrEventSchemas.js";

const PUBKEY = "a".repeat(64);
const AUTHOR = "b".repeat(64);
const coord = (dtag, author = AUTHOR) => `30078:${author}:${dtag}`;

test("buildPlaylistEvent emits kind, identifier, metadata, and ordered a-refs", () => {
  const event = buildPlaylistEvent({
    pubkey: PUBKEY,
    created_at: 1000,
    dTagValue: "my-list",
    title: "My List",
    description: "cool clips",
    image: "https://img.example/x.jpg",
    videoCoordinates: [coord("v1"), coord("v2"), coord("v3")],
  });

  assert.equal(event.kind, PLAYLIST_KIND);
  assert.equal(event.tags.find((t) => t[0] === "d")?.[1], "my-list");
  assert.equal(event.tags.find((t) => t[0] === "t")?.[1], "playlist");
  assert.equal(event.tags.find((t) => t[0] === "title")?.[1], "My List");
  assert.equal(event.tags.find((t) => t[0] === "description")?.[1], "cool clips");
  assert.equal(
    event.tags.find((t) => t[0] === "image")?.[1],
    "https://img.example/x.jpg",
  );

  // Ordered a-refs, in the given order.
  const aRefs = event.tags.filter((t) => t[0] === "a").map((t) => t[1]);
  assert.deepEqual(aRefs, [coord("v1"), coord("v2"), coord("v3")]);
});

test("buildPlaylistEvent dedupes repeated video coordinates, preserving first order", () => {
  const event = buildPlaylistEvent({
    pubkey: PUBKEY,
    created_at: 1000,
    dTagValue: "d1",
    videoCoordinates: [coord("v1"), coord("v2"), coord("v1"), coord("v3")],
  });
  const aRefs = event.tags.filter((t) => t[0] === "a").map((t) => t[1]);
  assert.deepEqual(aRefs, [coord("v1"), coord("v2"), coord("v3")]);
});

test("buildPlaylistEvent requires a d-tag identifier", () => {
  assert.throws(
    () => buildPlaylistEvent({ pubkey: PUBKEY, created_at: 1, dTagValue: "  " }),
    /requires a d-tag/i,
  );
});

test("parsePlaylistEvent structures a playlist and preserves item order", () => {
  const event = buildPlaylistEvent({
    pubkey: PUBKEY,
    created_at: 4242,
    dTagValue: "list-7",
    title: "Seven",
    videoCoordinates: [coord("a"), coord("b")],
    eventRefs: ["e".repeat(64)],
  });
  event.id = "event-id-123";

  const parsed = parsePlaylistEvent(event);
  assert.equal(parsed.id, "list-7");
  assert.equal(parsed.pubkey, PUBKEY);
  assert.equal(parsed.title, "Seven");
  assert.equal(parsed.updatedAt, 4242);
  assert.equal(parsed.address, `${PLAYLIST_KIND}:${PUBKEY}:list-7`);
  assert.equal(parsed.eventId, "event-id-123");
  assert.deepEqual(parsed.items, [
    { type: "a", value: coord("a") },
    { type: "a", value: coord("b") },
    { type: "e", value: "e".repeat(64) },
  ]);
});

test("parsePlaylistEvent rejects the wrong kind and a missing d-tag", () => {
  assert.equal(
    parsePlaylistEvent({ kind: 30078, tags: [["d", "x"]] }),
    null,
    "wrong kind → null",
  );
  assert.equal(
    parsePlaylistEvent({ kind: PLAYLIST_KIND, tags: [["title", "no id"]] }),
    null,
    "missing d → null",
  );
  assert.equal(parsePlaylistEvent(null), null);
});

test("parsePlaylistEvent defaults an empty title", () => {
  const parsed = parsePlaylistEvent({
    kind: PLAYLIST_KIND,
    pubkey: PUBKEY,
    created_at: 1,
    tags: [["d", "no-title"]],
  });
  assert.equal(parsed.title, "Untitled playlist");
});

test("build → parse round-trips a full playlist (order intact)", () => {
  const items = [
    { type: "a", value: coord("v1") },
    { type: "a", value: coord("v2") },
    { type: "a", value: coord("v3") },
  ];
  const event = buildPlaylist({
    pubkey: PUBKEY,
    id: "rt",
    title: "Round Trip",
    description: "desc",
    items,
    created_at: 55,
  });
  const parsed = parsePlaylistEvent({ ...event, id: "signed-id" });
  assert.equal(parsed.title, "Round Trip");
  assert.equal(parsed.description, "desc");
  assert.deepEqual(parsed.items, items);
});

test("addVideoToPlaylist appends, dedupes, inserts by position, and is immutable", () => {
  const base = [{ type: "a", value: coord("v1") }];

  const appended = addVideoToPlaylist(base, coord("v2"));
  assert.deepEqual(appended.map((i) => i.value), [coord("v1"), coord("v2")]);
  assert.deepEqual(base.map((i) => i.value), [coord("v1")], "input not mutated");

  const deduped = addVideoToPlaylist(appended, coord("v1"));
  assert.equal(deduped.length, 2, "existing video is a no-op");

  const inserted = addVideoToPlaylist(appended, coord("v3"), { position: 1 });
  assert.deepEqual(inserted.map((i) => i.value), [
    coord("v1"),
    coord("v3"),
    coord("v2"),
  ]);

  assert.deepEqual(addVideoToPlaylist(base, "   "), base.slice(), "blank ignored");
});

test("removeVideoFromPlaylist removes by coordinate and by item, immutably", () => {
  const base = [
    { type: "a", value: coord("v1") },
    { type: "a", value: coord("v2") },
    { type: "e", value: "e".repeat(64) },
  ];

  const byCoord = removeVideoFromPlaylist(base, coord("v1"));
  assert.deepEqual(byCoord.map(playlistItemKey), [
    `a:${coord("v2")}`,
    `e:${"e".repeat(64)}`,
  ]);
  assert.equal(base.length, 3, "input not mutated");

  const byItem = removeVideoFromPlaylist(base, { type: "e", value: "e".repeat(64) });
  assert.ok(!byItem.some((i) => i.type === "e"));
});

test("reorderPlaylistItems moves items, clamps, no-ops safely, immutably", () => {
  const base = [
    { type: "a", value: coord("v1") },
    { type: "a", value: coord("v2") },
    { type: "a", value: coord("v3") },
  ];

  // Move first to last.
  const moved = reorderPlaylistItems(base, 0, 2);
  assert.deepEqual(moved.map((i) => i.value), [
    coord("v2"),
    coord("v3"),
    coord("v1"),
  ]);
  assert.deepEqual(base.map((i) => i.value), [
    coord("v1"),
    coord("v2"),
    coord("v3"),
  ], "input not mutated");

  // toIndex beyond the end clamps to last.
  const clamped = reorderPlaylistItems(base, 0, 99);
  assert.equal(clamped[clamped.length - 1].value, coord("v1"));

  // Out-of-range fromIndex → unchanged copy.
  assert.deepEqual(reorderPlaylistItems(base, 5, 0), base);
  // Same index → unchanged.
  assert.deepEqual(reorderPlaylistItems(base, 1, 1), base);
});

test("videoCoordinate derives the 30078 coordinate from a video object", () => {
  const video = {
    kind: 30078,
    pubkey: AUTHOR,
    tags: [["d", "1700000000000-abc"]],
  };
  assert.equal(videoCoordinate(video), `30078:${AUTHOR}:1700000000000-abc`);

  // A video object carrying kind 0 (bitvid's internal objects often do) still
  // yields the canonical 30078 coordinate — matches the zap-pointer contract.
  assert.equal(
    videoCoordinate({ kind: 0, pubkey: AUTHOR, tags: [["d", "x"]] }),
    `30078:${AUTHOR}:x`,
  );
});

test("generatePlaylistId produces distinct, tag-safe ids", () => {
  const a = generatePlaylistId();
  const b = generatePlaylistId();
  assert.notEqual(a, b);
  assert.match(a, /^pl-[0-9a-z]+-[0-9a-z]+$/);
});
