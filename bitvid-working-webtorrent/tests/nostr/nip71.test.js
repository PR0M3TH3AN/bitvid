import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNip71MetadataTags,
  buildNip71VideoEvent,
  collectNip71PointerRequests,
  extractNip71MetadataFromTags,
  mergeNip71MetadataIntoVideo,
  populateNip71MetadataForVideos,
  processNip71Events,
  buildVideoPointerValue,
} from "../../js/nostr/nip71.js";

test("buildNip71MetadataTags normalizes structured fields", () => {
  const metadata = {
    title: "  Demo Title  ",
    publishedAt: " 1700000000 ",
    alt: " alt text ",
    imeta: [
      {
        dim: " 1920x1080 ",
        url: " https://cdn.example/thumb.jpg ",
        duration: " 29.5 ",
        bitrate: " 3000000 ",
        image: [" https://cdn.example/fallback-1.jpg ", ""],
        fallback: [" https://cdn.example/fallback-2.jpg "],
        service: [" thumb "],
      },
    ],
    textTracks: [
      {
        url: " https://cdn.example/captions.vtt ",
        type: " text/vtt ",
        language: " en ",
      },
    ],
    contentWarning: "  flashing lights  ",
    segments: [
      { start: " 00:00 ", end: " 00:30 ", title: " Intro ", thumbnail: " https://cdn.example/intro.jpg " },
    ],
    hashtags: [" video ", "nostr  ", "  "],
    participants: [{ pubkey: "A".repeat(64), relay: " wss://relay.example " }],
    references: [" https://example.com/info "],
  };

  const tags = buildNip71MetadataTags(metadata);

  assert.ok(tags.some((tag) => tag[0] === "title" && tag[1] === "Demo Title"));
  assert.ok(tags.some((tag) => tag[0] === "published_at" && tag[1] === "1700000000"));
  assert.ok(tags.some((tag) => tag[0] === "alt" && tag[1] === "alt text"));
  assert.ok(
    tags.some(
      (tag) =>
        tag[0] === "imeta" &&
        tag.includes("dim 1920x1080") &&
        tag.includes("url https://cdn.example/thumb.jpg") &&
        tag.includes("duration 29.5") &&
        tag.includes("bitrate 3000000") &&
        tag.includes("image https://cdn.example/fallback-1.jpg") &&
        tag.includes("fallback https://cdn.example/fallback-2.jpg") &&
        tag.includes("service thumb"),
    ),
  );
  assert.ok(!tags.some((tag) => tag[0] === "duration"));
  assert.ok(
    tags.some(
      (tag) =>
        tag[0] === "text-track" &&
        tag[1] === "https://cdn.example/captions.vtt" &&
        tag[2] === "text/vtt" &&
        tag[3] === "en",
    ),
  );
  assert.ok(tags.some((tag) => tag[0] === "content-warning" && tag[1] === "flashing lights"));
  assert.ok(
    tags.some(
      (tag) =>
        tag[0] === "segment" &&
        tag[1] === "00:00" &&
        tag[2] === "00:30" &&
        tag[3] === "Intro" &&
        tag[4] === "https://cdn.example/intro.jpg",
    ),
  );
  const hashtagValues = tags
    .filter((tag) => tag[0] === "t")
    .map((tag) => tag[1])
    .sort();
  assert.deepEqual(hashtagValues, ["nostr", "video"].sort());
  assert.ok(
    tags.some(
      (tag) =>
        tag[0] === "p" &&
        tag[1] === "a".repeat(64) &&
        tag[2] === "wss://relay.example",
    ),
  );
  assert.ok(tags.some((tag) => tag[0] === "r" && tag[1] === "https://example.com/info"));
});

test("collectNip71PointerRequests aggregates events and tags", () => {
  const videos = [
    {
      id: "evt-1",
      videoRootId: "root-1",
      pubkey: "PUB1",
      tags: [["d", "slug-1"]],
    },
    {
      id: "evt-2",
      videoRootId: "root-1",
      pubkey: "PUB1",
      tags: [["d", "slug-2"]],
    },
  ];

  const pointerMap = collectNip71PointerRequests(videos);
  assert.equal(pointerMap.size, 1);
  const [[pointerValue, info]] = Array.from(pointerMap.entries());
  assert.equal(pointerValue, buildVideoPointerValue("pub1", "root-1"));
  assert.deepEqual(Array.from(info.videoEventIds).sort(), ["evt-1", "evt-2"].sort());
  assert.deepEqual(Array.from(info.dTags).sort(), ["slug-1", "slug-2"].sort());
});

test("processNip71Events reconciles pointers and filters video hashtags", () => {
  const nip71Cache = new Map();
  const video = {
    id: "evt-1",
    videoRootId: "root-1",
    pubkey: "PUB1",
    tags: [
      ["d", "slug-1"],
      ["t", "video"],
    ],
  };
  const pointerMap = collectNip71PointerRequests([video]);
  const pointerValue = Array.from(pointerMap.keys())[0];

  const nip71Event = {
    id: "nip71-1",
    kind: 21,
    pubkey: "pub1",
    created_at: 1_700_000_001,
    tags: [
      ["a", pointerValue],
      ["title", " Better Title "],
      ["t", "Video"],
      ["t", "Other"],
    ],
    content: "Summary",
  };

  processNip71Events([nip71Event], { nip71Cache, pointerMap });
  mergeNip71MetadataIntoVideo(video, { nip71Cache });

  assert.ok(video.nip71, "metadata should attach to the video");
  assert.equal(video.nip71.title, "Better Title");
  assert.deepEqual(video.nip71.hashtags, ["Other"]);
  assert.deepEqual(video.nip71.t, ["Other"]);
  assert.equal(video.nip71Source?.eventId, "nip71-1");
});

test("populateNip71MetadataForVideos fetches missing records once", async () => {
  const nip71Cache = new Map();
  const video = {
    id: "evt-1",
    videoRootId: "root-1",
    pubkey: "PUB1",
    tags: [["d", "slug-1"], ["t", "video"]],
  };
  const pointerMap = collectNip71PointerRequests([video]);
  const pointerValue = Array.from(pointerMap.keys())[0];

  const nip71Event = {
    id: "nip71-1",
    kind: 21,
    pubkey: "pub1",
    created_at: 1_700_000_100,
    tags: [
      ["a", pointerValue],
      ["title", "Stream Title"],
      ["t", "Video"],
      ["t", "Stream"],
    ],
    content: "Live summary",
  };

  let fetchCalls = 0;
  const fetchMetadata = async (map, pointerValues) => {
    fetchCalls += 1;
    assert.deepEqual(pointerValues, [pointerValue]);
    assert.strictEqual(map, pointerMap);
    processNip71Events([nip71Event], { nip71Cache, pointerMap: map });
  };

  await populateNip71MetadataForVideos([video], {
    nip71Cache,
    pointerMap,
    fetchMetadata,
  });

  assert.equal(fetchCalls, 1);
  assert.equal(video.nip71?.title, "Stream Title");
  assert.deepEqual(video.nip71?.hashtags, ["Stream"]);

  const cacheEntry = nip71Cache.get("root-1");
  assert.ok(cacheEntry?.fetchedPointers.has(pointerValue));

  const pointerMapReload = collectNip71PointerRequests([video]);
  await populateNip71MetadataForVideos([video], {
    nip71Cache,
    pointerMap: pointerMapReload,
    fetchMetadata,
  });

  assert.equal(fetchCalls, 1, "cached pointer should skip subsequent fetches");
});

test("buildNip71VideoEvent composes pointer tags", () => {
  const metadata = extractNip71MetadataFromTags({
    kind: 21,
    tags: [
      ["title", "Demo"],
      ["t", "video"],
      ["t", "nostr"],
    ],
    content: "Summary",
  }).metadata;

  const event = buildNip71VideoEvent({
    metadata,
    pubkey: "PUB1",
    title: "Demo",
    pointerIdentifiers: {
      videoRootId: "root-1",
      eventId: "evt-1",
      dTag: "slug-1",
    },
  });

  assert.ok(event, "video event should be produced");
  const tags = event.tags;
  assert.ok(tags.some((tag) => tag[0] === "a" && tag[1] === buildVideoPointerValue("PUB1", "root-1")));
  assert.ok(tags.some((tag) => tag[0] === "video-root" && tag[1] === "root-1"));
  assert.ok(tags.some((tag) => tag[0] === "e" && tag[1] === "evt-1"));
  assert.ok(tags.some((tag) => tag[0] === "d" && tag[1] === "slug-1"));
});
