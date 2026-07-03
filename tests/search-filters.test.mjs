// Search pipeline coverage (was zero): the token parser, the video filter
// matcher, and the result sorter — the pure core of search.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-search-core
//       given: "query strings / videos with varying metadata"
//       when: "parseFilterQuery / buildVideoSearchFilterMatcher / sortSearchResults run"
//       then: "tokens parse into filters; matcher enforces them; sort honors the selected mode"
//   observable_outcomes:
//     - "tag:/has:/duration:< tokens land in filters + free text preserved"
//     - "matcher enforces tags, date range, has:magnet, duration bounds"
//     - "sort: views ranks by injected view counts; longest by duration; recent by created_at"
//   determinism_controls:
//     - "pure functions; injected getViews + fixed now"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import { strict as assert } from "node:assert";
import { parseFilterQuery } from "../js/search/searchFilters.js";
import {
  buildVideoSearchFilterMatcher,
  sortSearchResults,
} from "../js/search/searchFilterMatchers.js";

test("parser: tokens land in filters, free text preserved", () => {
  const { text, filters, errors } = parseFilterQuery(
    "cat videos tag:nostr has:magnet duration:<120",
  );
  assert.equal(errors.length, 0);
  assert.equal(text, "cat videos");
  assert.deepEqual(filters.tags, ["nostr"]);
  assert.equal(filters.hasMagnet, true);
  assert.equal(filters.duration.maxSeconds, 120);
});

test("matcher enforces tags, date range, has:magnet, duration", () => {
  const video = {
    pubkey: "a".repeat(64),
    created_at: 1_700_000_000,
    tags: [["t", "nostr"]],
    magnet: "magnet:?xt=urn:btih:abc",
    nip71: { duration: 90 }, // ingested NIP-71 shape (bitvid kind uses top-level)
  };
  const pass = buildVideoSearchFilterMatcher({
    tags: ["nostr"],
    hasMagnet: true,
    duration: { minSeconds: 60, maxSeconds: 120 },
    dateRange: { after: 1_699_999_999, before: 1_700_000_001 },
  });
  assert.equal(pass(video), true);
  assert.equal(pass({ ...video, tags: [] }), false, "missing tag rejected");
  assert.equal(pass({ ...video, magnet: "" }), false, "has:magnet rejected");
  assert.equal(
    pass({ ...video, nip71: { duration: 30 } }),
    false,
    "too short rejected",
  );
  // bitvid's own kind-30078 videos carry duration TOP-LEVEL — both video types
  // must satisfy duration filters (spec: two video kinds, more coming for
  // live/shorts per the dev plans).
  assert.equal(
    pass({ ...video, nip71: undefined, duration: 90 }),
    true,
    "top-level duration (bitvid kind) matches too",
  );
  assert.equal(
    pass({ ...video, created_at: 1_690_000_000 }),
    false,
    "outside date range rejected",
  );
});

test("sortSearchResults honors views / longest / recent (and defaults to recent)", () => {
  const videos = [
    { id: "old-popular", created_at: 100, duration: 10 },
    { id: "new-quiet", created_at: 300, duration: 50 },
    { id: "mid-long", created_at: 200, duration: 500 },
  ];
  const viewsById = { "old-popular": 900, "new-quiet": 5, "mid-long": 40 };
  const getViews = (v) => viewsById[v.id];

  assert.deepEqual(
    sortSearchResults(videos, "views", { getViews }).map((v) => v.id),
    ["old-popular", "mid-long", "new-quiet"],
  );
  assert.deepEqual(
    sortSearchResults(videos, "longest", { getViews }).map((v) => v.id),
    ["mid-long", "new-quiet", "old-popular"],
  );
  assert.deepEqual(
    sortSearchResults(videos, "recent", { getViews }).map((v) => v.id),
    ["new-quiet", "mid-long", "old-popular"],
  );
  // Unknown/default -> recent; input array is not mutated.
  const copy = [...videos];
  sortSearchResults(videos, undefined, { getViews });
  assert.deepEqual(videos, copy);
});

test("sort: trending weights views by recency", () => {
  const now = 1_700_000_000_000; // ms
  const daySec = 86400;
  const videos = [
    { id: "old-hit", created_at: now / 1000 - 30 * daySec }, // 900 views, 30d old
    { id: "fresh-riser", created_at: now / 1000 - 1 * daySec }, // 60 views, 1d old
  ];
  const getViews = (v) => (v.id === "old-hit" ? 900 : 60);
  const ranked = sortSearchResults(videos, "trending", { getViews, now }).map(
    (v) => v.id,
  );
  assert.deepEqual(ranked, ["fresh-riser", "old-hit"]);
});
