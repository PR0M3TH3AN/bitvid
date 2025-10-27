import test from "node:test";
import assert from "node:assert/strict";

import { dedupeToNewestByRoot } from "../../js/utils/videoDeduper.js";

test("dedupeToNewestByRoot replaces entries with missing timestamps", () => {
  const original = { id: "abc", created_at: undefined };
  const newer = { id: "abc", created_at: 123 };

  const [result] = dedupeToNewestByRoot([original, newer]);

  assert.equal(result, newer);
});

test("dedupeToNewestByRoot replaces entries with non-numeric timestamps", () => {
  const rootId = "root-1";
  const invalid = { id: "old", videoRootId: rootId, created_at: "not-a-number" };
  const newer = { id: "new", videoRootId: rootId, created_at: "456" };

  const [result] = dedupeToNewestByRoot([invalid, newer]);

  assert.equal(result, newer);
});
