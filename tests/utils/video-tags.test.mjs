import test from "node:test";
import assert from "node:assert/strict";

import { collectVideoTags, formatTagDisplay } from "../../js/utils/videoTags.js";

test("collectVideoTags dedupes across metadata sources and respects casing", () => {
  const video = {
    nip71: {
      hashtags: ["#Tag", "Another"],
      t: ["Third"],
    },
    tags: [
      ["t", "tag"],
      ["t", "ANOTHER"],
      ["t", " #FOURTH "],
      ["x", "ignored"],
      ["t"],
    ],
  };

  const tags = collectVideoTags(video);

  assert.deepEqual(tags, ["Another", "FOURTH", "Tag", "Third"]);
});

test("collectVideoTags sorts case-insensitively and adds hashes when requested", () => {
  const video = {
    nip71: {
      hashtags: ["beta", "Alpha"],
    },
    tags: [["t", "gamma"], ["t", "alpha"]],
  };

  const tags = collectVideoTags(video, { includeHashes: true });

  assert.deepEqual(tags, ["#Alpha", "#beta", "#gamma"]);
});

test("collectVideoTags handles malformed inputs safely", () => {
  assert.deepEqual(collectVideoTags(null), []);
  assert.deepEqual(collectVideoTags(undefined), []);
  assert.deepEqual(collectVideoTags(42), []);
  assert.deepEqual(
    collectVideoTags({ nip71: { hashtags: [null, "   "] }, tags: [["t"], ["t", null]] }),
    [],
  );
});

test("formatTagDisplay normalizes leading hashes", () => {
  assert.equal(formatTagDisplay(" example"), "#example");
  assert.equal(formatTagDisplay("##Example"), "#Example");
  assert.equal(formatTagDisplay(""), "");
  assert.equal(formatTagDisplay(null), "");
});
