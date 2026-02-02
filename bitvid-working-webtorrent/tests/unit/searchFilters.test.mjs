import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseFilterQuery,
  serializeFiltersToQuery,
} from "../../js/search/searchFilters.js";
import { buildVideoSearchFilterMatcher } from "../../js/search/searchFilterMatchers.js";

test("parseFilterQuery collects filters and text tokens", () => {
  const parsed = parseFilterQuery(
    "author:abc123 tag:#news duration:<=5m has:magnet nsfw:false hello world",
  );

  assert.deepEqual(parsed.filters.authorPubkeys, ["abc123"]);
  assert.deepEqual(parsed.filters.tags, ["news"]);
  assert.equal(parsed.filters.duration.maxSeconds, 300);
  assert.equal(parsed.filters.hasMagnet, true);
  assert.equal(parsed.filters.nsfw, "false");
  assert.equal(parsed.text, "hello world");
  assert.equal(parsed.errors.length, 0);
});

test("serializeFiltersToQuery emits filter tokens in order", () => {
  const serialized = serializeFiltersToQuery({
    authorPubkeys: ["npub123"],
    tags: ["clips"],
    kind: 30078,
    relay: "wss://relay.example",
    dateRange: { after: null, before: null },
    duration: { minSeconds: 60, maxSeconds: 120 },
    hasMagnet: true,
    hasUrl: true,
    nsfw: "false",
  });

  assert.equal(
    serialized,
    "author:npub123 tag:clips kind:30078 relay:wss://relay.example duration:>=1m duration:<=2m has:magnet has:url nsfw:false",
  );
});

test("video search filter matcher enforces tags, duration, and nsfw when allowed", () => {
  const matcher = buildVideoSearchFilterMatcher(
    {
      tags: ["cats"],
      duration: { minSeconds: 60, maxSeconds: 180 },
      hasMagnet: true,
      nsfw: "only",
    },
    { allowNsfw: true },
  );

  const videos = [
    {
      id: "a",
      tags: [["t", "cats"]],
      nip71: { duration: 120 },
      magnet: "magnet:?xt=urn:btih:abc",
      isNsfw: true,
    },
    {
      id: "b",
      tags: [["t", "cats"]],
      nip71: { duration: 240 },
      magnet: "magnet:?xt=urn:btih:def",
      isNsfw: true,
    },
    {
      id: "c",
      tags: [["t", "dogs"]],
      nip71: { duration: 120 },
      magnet: "magnet:?xt=urn:btih:ghi",
      isNsfw: true,
    },
    {
      id: "d",
      tags: [["t", "cats"]],
      nip71: { duration: 120 },
      magnet: "magnet:?xt=urn:btih:jkl",
      isNsfw: false,
    },
    {
      id: "e",
      tags: [["t", "cats"]],
      nip71: { duration: 120 },
      url: "https://cdn.example/video.mp4",
      isNsfw: true,
    },
  ];

  const matches = videos.filter(matcher);

  assert.deepEqual(
    matches.map((video) => video.id),
    ["a"],
  );
});

test("video search filter matcher blocks nsfw when disallowed and requires url", () => {
  const matcher = buildVideoSearchFilterMatcher(
    { hasUrl: true, nsfw: "true" },
    { allowNsfw: false },
  );

  const videos = [
    { id: "a", url: "https://cdn.example/a.mp4", isNsfw: true },
    { id: "b", url: "https://cdn.example/b.mp4", isNsfw: false },
  ];

  const matches = videos.filter(matcher);

  assert.deepEqual(
    matches.map((video) => video.id),
    ["b"],
  );
});
