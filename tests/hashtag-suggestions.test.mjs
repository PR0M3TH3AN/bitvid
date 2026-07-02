// Upload-modal hashtag suggestions (TODO #45): rank a user's own past hashtags by
// how many of their videos use each, for one-tap reuse chips.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-hashtag-suggestions-rank
//       given: "a user's video objects with nip71.hashtags / nip71.t / raw t tags"
//       when: "rankHashtagsByFrequency runs"
//       then: "tags are normalized, deduped per video, ranked by video-count then name"
//   observable_outcomes:
//     - "count = number of videos using the tag (once per video)"
//     - "case/#-prefix normalized and merged"
//     - "bitvid's fixed t=video marker excluded from raw tags (but a real 'video' hashtag counts)"
//     - "ties broken alphabetically; limit respected; empty input -> []"
//   determinism_controls:
//     - "pure function; explicit inputs"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  rankHashtagsByFrequency,
  extractVideoHashtags,
} from "../js/utils/hashtagSuggestions.js";

test("counts videos-per-tag, normalizing case and the # prefix", () => {
  const ranked = rankHashtagsByFrequency([
    { nip71: { hashtags: ["Nostr", "Bitcoin"] } },
    { nip71: { hashtags: ["nostr", "#bitcoin"] } },
    { nip71: { hashtags: ["NOSTR"] } },
  ]);
  assert.deepEqual(ranked, [
    { tag: "nostr", count: 3 },
    { tag: "bitcoin", count: 2 },
  ]);
});

test("a tag repeated within ONE video counts once for that video", () => {
  const ranked = rankHashtagsByFrequency([
    { nip71: { hashtags: ["nostr", "nostr", "#Nostr"] } },
  ]);
  assert.deepEqual(ranked, [{ tag: "nostr", count: 1 }]);
});

test("falls back to raw event t tags and excludes the fixed 'video' marker", () => {
  assert.deepEqual(
    extractVideoHashtags({
      tags: [
        ["t", "video"],
        ["t", "bitcoin"],
        ["d", "abc"],
        ["t", ""],
      ],
    }),
    ["bitcoin"],
  );
  // But a genuine nip71 "video" hashtag is NOT stripped (only the raw marker is).
  const ranked = rankHashtagsByFrequency([{ nip71: { hashtags: ["video"] } }]);
  assert.deepEqual(ranked, [{ tag: "video", count: 1 }]);
});

test("ties break alphabetically and limit is respected", () => {
  const ranked = rankHashtagsByFrequency(
    [
      { nip71: { hashtags: ["zebra", "apple", "mango"] } },
      { nip71: { hashtags: ["zebra", "apple"] } },
      { nip71: { hashtags: ["apple"] } },
    ],
    { limit: 2 },
  );
  // apple:3, zebra:2, mango:1 -> top 2
  assert.deepEqual(ranked, [
    { tag: "apple", count: 3 },
    { tag: "zebra", count: 2 },
  ]);
});

test("empty / malformed input yields an empty list", () => {
  assert.deepEqual(rankHashtagsByFrequency([]), []);
  assert.deepEqual(rankHashtagsByFrequency(null), []);
  assert.deepEqual(rankHashtagsByFrequency([{}, { nip71: {} }, { tags: "nope" }]), []);
});
