// probeVideoMetadata resolves a video's dimensions/duration from a hidden element,
// or null on error/timeout. Uses an injected fake element so it's deterministic.

import assert from "node:assert/strict";
import test from "node:test";
import { probeVideoMetadata } from "../js/utils/videoProbe.js";

// Minimal fake <video>: fires the named event on the next tick when src is set.
function fakeVideo({ fire = "loadedmetadata", videoWidth = 0, videoHeight = 0, duration = 0 } = {}) {
  const handlers = {};
  return {
    videoWidth,
    videoHeight,
    duration,
    addEventListener(name, h) {
      handlers[name] = h;
    },
    removeAttribute() {},
    load() {},
    set src(_v) {
      setTimeout(() => handlers[fire]?.(), 0);
    },
  };
}

test("resolves width/height/duration from loadedmetadata", async () => {
  const result = await probeVideoMetadata("blob:abc", {
    createVideoEl: () => fakeVideo({ videoWidth: 1080, videoHeight: 1920, duration: 12.3 }),
  });
  assert.deepEqual(result, { width: 1080, height: 1920, duration: 12.3 });
});

test("a portrait probe yields height > width (drives short selection)", async () => {
  const r = await probeVideoMetadata("blob:abc", {
    createVideoEl: () => fakeVideo({ videoWidth: 720, videoHeight: 1280 }),
  });
  assert.ok(r.height > r.width);
  assert.equal(r.duration, 0, "missing duration normalizes to 0");
});

test("resolves null on a media error", async () => {
  const r = await probeVideoMetadata("blob:bad", {
    createVideoEl: () => fakeVideo({ fire: "error" }),
  });
  assert.equal(r, null);
});

test("resolves null for an empty source and times out gracefully", async () => {
  assert.equal(await probeVideoMetadata("", { createVideoEl: () => fakeVideo() }), null);
  // never fires any event -> timeout path
  const neverFires = {
    addEventListener() {},
    removeAttribute() {},
    load() {},
    set src(_v) {},
  };
  const r = await probeVideoMetadata("blob:x", { createVideoEl: () => neverFires, timeoutMs: 20 });
  assert.equal(r, null);
});
