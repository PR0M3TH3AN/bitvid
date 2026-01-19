import test from "node:test";
import assert from "node:assert/strict";

import { createTagPreferenceFilterStage } from "../../js/feedEngine/stages.js";

test("tag preference stage filters by interests and excludes disinterests", async () => {
  const stage = createTagPreferenceFilterStage();

  const items = [
    {
      video: {
        id: "keep",
        pubkey: "a".repeat(64),
        tags: [["t", "Cats"]],
      },
      metadata: {},
    },
    {
      video: {
        id: "exclude-disinterest",
        pubkey: "b".repeat(64),
        tags: [["t", "Dogs"]],
      },
      metadata: {},
    },
    {
      video: {
        id: "exclude-no-interest",
        pubkey: "c".repeat(64),
        tags: [["t", "Birds"]],
      },
      metadata: {},
    },
    {
      video: {
        id: "exclude-mixed",
        pubkey: "d".repeat(64),
        tags: [["t", "Cats"], ["t", "Dogs"]],
      },
      metadata: {},
    },
  ];

  const result = await stage(items, {
    runtime: {
      tagPreferences: {
        interests: ["cats"],
        disinterests: ["dogs"],
      },
    },
    addWhy() {},
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].video.id, "keep");
  assert.deepEqual(result[0].metadata.matchedInterests, ["cats"]);
});

test("tag preference stage accepts interests from nip71 hashtags", async () => {
  const stage = createTagPreferenceFilterStage();

  const items = [
    {
      video: {
        id: "nip71",
        pubkey: "e".repeat(64),
        nip71: { hashtags: ["Space"] },
      },
      metadata: {},
    },
  ];

  const result = await stage(items, {
    runtime: {
      tagPreferences: {
        interests: ["space"],
        disinterests: [],
      },
    },
    addWhy() {},
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].video.id, "nip71");
  assert.deepEqual(result[0].metadata.matchedInterests, ["space"]);
});
