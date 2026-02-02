import assert from "node:assert/strict";
import test from "node:test";

import { nostrClient } from "../../js/nostrClientFacade.js";
import {
  updateWatchHistoryListWithDefaultClient as updateWatchHistoryList,
  removeWatchHistoryItemWithDefaultClient as removeWatchHistoryItem,
} from "../../js/nostrWatchHistoryFacade.js";

const originalWatchHistory = nostrClient.watchHistory;

test.afterEach(() => {
  nostrClient.watchHistory = originalWatchHistory;
});

test("updateWatchHistoryList delegates to the client's manager", () => {
  const items = [{ type: "e", value: "event" }];
  const options = { actor: "npub123" };
  const expectedResult = { ok: true };
  const calls = [];

  nostrClient.watchHistory = {
    updateList(...args) {
      calls.push(args);
      return expectedResult;
    },
  };

  const result = updateWatchHistoryList(items, options);

  assert.equal(result, expectedResult);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [items, options]);
});

test("removeWatchHistoryItem delegates to the client's manager", () => {
  const pointer = { type: "a", value: "kind:identifier" };
  const options = { reason: "cleanup" };
  const expectedResult = { ok: true };
  const calls = [];

  nostrClient.watchHistory = {
    removeItem(...args) {
      calls.push(args);
      return expectedResult;
    },
  };

  const result = removeWatchHistoryItem(pointer, options);

  assert.equal(result, expectedResult);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [pointer, options]);
});

test("watch history bindings throw when the manager is unavailable", () => {
  nostrClient.watchHistory = null;

  assert.throws(
    () => updateWatchHistoryList([], {}),
    /Watch history manager is unavailable in this build\./,
  );
  assert.throws(
    () => removeWatchHistoryItem({ type: "e", value: "abc" }),
    /Watch history manager is unavailable in this build\./,
  );
});

test("watch history bindings throw when a required method is missing", () => {
  nostrClient.watchHistory = {};

  assert.throws(
    () => updateWatchHistoryList([], {}),
    /Watch history manager is unavailable in this build\./,
  );

  nostrClient.watchHistory = { updateList: () => {} };

  assert.throws(
    () => removeWatchHistoryItem({ type: "e", value: "123" }),
    /Watch history manager is unavailable in this build\./,
  );
});
