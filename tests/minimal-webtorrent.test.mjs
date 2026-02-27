import test from "node:test";
import assert from "node:assert";
import WebTorrent from "../js/webtorrent.min.js";

test("can import WebTorrent", () => {
  assert.strictEqual(typeof WebTorrent, "function", "WebTorrent should be a function");
});
