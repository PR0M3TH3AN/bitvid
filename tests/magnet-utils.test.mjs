import assert from "node:assert/strict";
import {
  DEFAULT_WSS_TRACKERS,
  normalizeAndAugmentMagnet,
} from "../js/magnetUtils.js";

function getParamValues(magnet, key) {
  const parsed = new URL(magnet);
  return parsed.searchParams.getAll(key);
}

(function testBareInfoHashNormalization() {
  const infoHash = "0123456789abcdef0123456789abcdef01234567";
  const result = normalizeAndAugmentMagnet(infoHash);
  assert.ok(result.didChange, "Bare info hash should mark didChange true");
  const xtValues = getParamValues(result.magnet, "xt");
  assert.deepEqual(xtValues, [`urn:btih:${infoHash}`]);
  const trackerValues = getParamValues(result.magnet, "tr");
  for (const tracker of DEFAULT_WSS_TRACKERS) {
    assert.ok(
      trackerValues.includes(tracker),
      `Expected tracker ${tracker} to be appended`
    );
  }
})();

(function testEncodedXtDecoding() {
  const infoHash = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const encodedMagnet = `magnet:?xt=urn%3Abtih%3A${infoHash}&dn=Example`;
  const result = normalizeAndAugmentMagnet(encodedMagnet);
  const xtValues = getParamValues(result.magnet, "xt");
  assert.deepEqual(xtValues, [`urn:btih:${infoHash}`]);
})();

(function testDuplicateTrackerFiltering() {
  const infoHash = "fedcba9876543210fedcba9876543210fedcba98";
  const baseMagnet =
    `magnet:?xt=urn:btih:${infoHash}` +
    "&tr=wss://tracker.openwebtorrent.com" +
    "&tr=WsS://tracker.openwebtorrent.com/" +
    "&tr=https://not-allowed.example";
  const result = normalizeAndAugmentMagnet(baseMagnet, {
    extraTrackers: [
      "wss://tracker.fastcast.nz",
      "http://tracker.invalid",
      "wss://tracker.openwebtorrent.com",
    ],
  });
  const trackers = getParamValues(result.magnet, "tr");
  const openwebCount = trackers.filter(
    (value) => value === "wss://tracker.openwebtorrent.com"
  ).length;
  assert.equal(openwebCount, 1, "Duplicate WSS tracker should be collapsed");
  assert.ok(
    trackers.includes("wss://tracker.fastcast.nz"),
    "Expected extra WSS tracker to be preserved"
  );
  assert.ok(
    !trackers.includes("http://tracker.invalid"),
    "Non-WSS tracker candidates should be ignored"
  );
})();

(function testWebSeedHandlingWithLogging() {
  const infoHash = "0123456789abcdef0123456789abcdef01234567";
  const messages = [];
  const result = normalizeAndAugmentMagnet(`magnet:?xt=urn:btih:${infoHash}`, {
    webSeed: [
      "https://cdn.example.com/video.mp4",
      "http://cdn.example.com/legacy.mp4",
      "https://cdn.example.com/video.mp4",
    ],
    logger: (msg) => messages.push(msg),
    appProtocol: "https:",
  });
  const seeds = getParamValues(result.magnet, "ws");
  assert.deepEqual(seeds, ["https://cdn.example.com/video.mp4"]);
  assert.equal(messages.length, 1, "HTTP seed should have been skipped with a log");
  assert.ok(
    messages[0].includes("Skipping insecure web seed"),
    "Expected skip message for HTTP seed"
  );
})();

(function testHttpWebSeedAllowedOnHttpOrigin() {
  const infoHash = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const result = normalizeAndAugmentMagnet(`magnet:?xt=urn:btih:${infoHash}`, {
    webSeed: "http://cdn.example.com/video.mp4",
    appProtocol: "http:",
  });
  const seeds = getParamValues(result.magnet, "ws");
  assert.deepEqual(seeds, ["http://cdn.example.com/video.mp4"]);
})();

console.log("magnet-utils tests passed");
