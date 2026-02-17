import test from "node:test";
import WebTorrent from "../js/webtorrent.min.js";

test("can import WebTorrent", () => {
  if (typeof WebTorrent !== "function") {
    throw new Error("Import failed");
  }
});
