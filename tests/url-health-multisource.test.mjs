// Multi-source URL liveness: probe candidate mirrors in order — healthy as soon
// as one plays, offline only if all fail (so a dead primary host doesn't hide a
// video that has a working mirror).

import assert from "node:assert/strict";
import test from "node:test";
import UrlHealthController from "../js/ui/urlHealthController.js";

function controllerWith(outcomesByUrl) {
  const ctrl = new UrlHealthController({ logger: { warn() {} } });
  const probed = [];
  ctrl.probeUrl = async (url) => {
    probed.push(url);
    return { outcome: outcomesByUrl[url] || "error" };
  };
  return { ctrl, probed };
}

test("returns ok on the first playable source and stops probing further", async () => {
  const { ctrl, probed } = controllerWith({
    "https://dead/v.mp4": "error",
    "https://live/v.mp4": "ok",
    "https://other/v.mp4": "ok",
  });
  const res = await ctrl.probeUrlList([
    "https://dead/v.mp4",
    "https://live/v.mp4",
    "https://other/v.mp4",
  ]);
  assert.equal(res.outcome, "ok");
  assert.equal(res.url, "https://live/v.mp4");
  assert.deepEqual(probed, ["https://dead/v.mp4", "https://live/v.mp4"], "stops at first ok");
});

test("offline only when every source fails", async () => {
  const { ctrl } = controllerWith({
    "https://a/v.mp4": "error",
    "https://b/v.mp4": "error",
  });
  const res = await ctrl.probeUrlList(["https://a/v.mp4", "https://b/v.mp4"]);
  assert.equal(res.outcome, "offline");
});

test("reports timeout if none played but at least one timed out", async () => {
  const { ctrl } = controllerWith({
    "https://a/v.mp4": "error",
    "https://b/v.mp4": "timeout",
  });
  const res = await ctrl.probeUrlList(["https://a/v.mp4", "https://b/v.mp4"]);
  assert.equal(res.outcome, "timeout");
});

test("empty / invalid list returns error", async () => {
  const { ctrl } = controllerWith({});
  assert.equal((await ctrl.probeUrlList([])).outcome, "error");
  assert.equal((await ctrl.probeUrlList(["", "   "])).outcome, "error");
});
