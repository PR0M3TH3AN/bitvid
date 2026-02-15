import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { renderChannelVideosFromList } from "../js/channelProfile.js";

test("can import channelProfile", () => {
  assert.equal(typeof renderChannelVideosFromList, "function", "Import failed");
});
