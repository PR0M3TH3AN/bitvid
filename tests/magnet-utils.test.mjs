import assert from "node:assert/strict";
import test from "node:test";

import { WSS_TRACKERS } from "../js/constants.js";
import {
  normalizeAndAugmentMagnet as normalizeMagnetObject,
  safeDecodeMagnet,
} from "../js/magnetUtils.js";
import {
  extractMagnetHints,
  normalizeAndAugmentMagnet as normalizeMagnetString,
} from "../js/magnet.js";

function getParamValues(magnet, key) {
  const parsed = new URL(magnet);
  return parsed.searchParams.getAll(key);
}

function assertDefaultTrackersPresent(magnet) {
  const trackers = getParamValues(magnet, "tr");
  for (const tracker of WSS_TRACKERS) {
    assert.ok(
      trackers.includes(tracker),
      `Expected default tracker ${tracker} to be present`
    );
  }
}

test("safeDecodeMagnet handles encoded values", () => {
  const rawMagnet =
    "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Example";
  const encodedMagnet = encodeURIComponent(rawMagnet);
  assert.equal(
    safeDecodeMagnet(encodedMagnet),
    rawMagnet,
    "Percent-encoded magnets should be decoded"
  );
});

test("safeDecodeMagnet leaves plain strings untouched", () => {
  const rawMagnet =
    "magnet:?xt=urn:btih:abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  assert.equal(
    safeDecodeMagnet(rawMagnet),
    rawMagnet,
    "Plain magnet strings should pass through"
  );
});

test("bare hashes normalize consistently across helpers", () => {
  const infoHash = "0123456789abcdef0123456789abcdef01234567";
  const objectResult = normalizeMagnetObject(infoHash);
  const stringResult = normalizeMagnetString(infoHash);

  assert.ok(objectResult.didChange, "Bare hashes should mark didChange true");
  assert.equal(
    stringResult,
    objectResult.magnet,
    "String helper should match object helper output"
  );

  const xtValues = getParamValues(stringResult, "xt");
  assert.deepEqual(xtValues, [`urn:btih:${infoHash}`]);
  assertDefaultTrackersPresent(stringResult);
});

test("legacy %3A payloads decode across helpers", () => {
  const infoHash = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const encoded = `magnet:?xt=urn%3Abtih%3A${infoHash}&dn=Example`;
  const objectResult = normalizeMagnetObject(encoded);
  const stringResult = normalizeMagnetString(encoded);

  assert.equal(
    stringResult,
    objectResult.magnet,
    "Helpers should agree on encoded xt payload normalization"
  );

  const xtValues = getParamValues(stringResult, "xt");
  assert.deepEqual(xtValues, [`urn:btih:${infoHash}`]);
});

test("duplicate trackers and hints stay in sync", () => {
  const infoHash = "fedcba9876543210fedcba9876543210fedcba98";
  const baseMagnet =
    `magnet:?xt=urn:btih:${infoHash}` +
    "&tr=wss://tracker.openwebtorrent.com" +
    "&tr=WsS://tracker.openwebtorrent.com/";

  const objectResult = normalizeMagnetObject(baseMagnet, {
    extraTrackers: [
      "wss://tracker.fastcast.nz",
      "http://tracker.invalid",
      "wss://tracker.openwebtorrent.com",
    ],
    xs: "https://cdn.example.com/video.torrent",
    webSeed: "https://cdn.example.com/files/",
  });

  const stringResult = normalizeMagnetString(baseMagnet, {
    ws: "https://cdn.example.com/files/", // ensure string helper adds hint
    xs: "https://cdn.example.com/video.torrent",
  });

  assert.equal(
    stringResult,
    objectResult.magnet,
    "Helpers should emit identical magnets after augmentation"
  );

  const trackers = getParamValues(stringResult, "tr");
  const openwebCount = trackers.filter(
    (value) => value === "wss://tracker.openwebtorrent.com"
  ).length;
  assert.equal(openwebCount, 1, "Duplicate trackers should be deduped when appended");
  assert.ok(
    trackers.includes("wss://tracker.fastcast.nz"),
    "Extra WSS tracker should be retained"
  );
  assert.ok(
    !trackers.includes("http://tracker.invalid"),
    "HTTP tracker candidates should be ignored"
  );

  const webSeeds = getParamValues(stringResult, "ws");
  assert.deepEqual(webSeeds, ["https://cdn.example.com/files/"]);

  const xsValues = getParamValues(stringResult, "xs");
  assert.deepEqual(xsValues, ["https://cdn.example.com/video.torrent"]);
});

test("object helper enforces HTTPS web seeds when on HTTPS", () => {
  const infoHash = "0123456789abcdef0123456789abcdef01234567";
  const messages = [];
  const result = normalizeMagnetObject(`magnet:?xt=urn:btih:${infoHash}`, {
    webSeed: [
      "https://cdn.example.com/video.mp4",
      "http://cdn.example.com/legacy.mp4",
    ],
    logger: (msg) => messages.push(msg),
    appProtocol: "https:",
  });

  const seeds = getParamValues(result.magnet, "ws");
  assert.deepEqual(seeds, ["https://cdn.example.com/video.mp4"]);
  assert.equal(messages.length, 1, "HTTP web seeds should trigger a log message");
  assert.ok(
    messages[0].includes("Skipping insecure web seed"),
    "Expected skip log for HTTP seed"
  );
});

test("object helper allows HTTP seeds on HTTP origins", () => {
  const infoHash = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const result = normalizeMagnetObject(`magnet:?xt=urn:btih:${infoHash}`, {
    webSeed: "http://cdn.example.com/video.mp4",
    appProtocol: "http:",
  });

  const seeds = getParamValues(result.magnet, "ws");
  assert.deepEqual(seeds, ["http://cdn.example.com/video.mp4"]);
});

test("extractMagnetHints returns first ws/xs pair", () => {
  const magnet =
    "magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01" +
    "&ws=https://cdn.example.com/base/" +
    "&ws=https://cdn.example.com/duplicate/" +
    "&xs=https://cdn.example.com/video.torrent";

  const hints = extractMagnetHints(magnet);
  assert.deepEqual(hints, {
    ws: "https://cdn.example.com/base/",
    xs: "https://cdn.example.com/video.torrent",
  });
});

test("string helper skips insecure ws hints on HTTPS origins", () => {
  const infoHash = "0123456789abcdef0123456789abcdef01234567";
  const normalized = normalizeMagnetString(`magnet:?xt=urn:btih:${infoHash}`, {
    ws: "http://cdn.example.com/video-base/",
  });
  const parsed = new URL(normalized);
  assert.equal(parsed.searchParams.getAll("ws").length, 0);
});

test("object helper reports didChange when output differs", () => {
  const infoHash = "abcdef0123456789abcdef0123456789abcdef01";
  const result = normalizeMagnetObject(`magnet:?xt=urn:btih:${infoHash}`, {
    webSeed: "https://cdn.example.com/video.mp4",
  });
  assert.ok(result.didChange, "Augmenting with web seeds should mark didChange");
});

test("helpers trim fragments from non-magnet values", () => {
  const url = "https://example.com/video.mp4#fragment";
  const objectResult = normalizeMagnetObject(url);
  const stringResult = normalizeMagnetString(url);
  assert.equal(objectResult.magnet, "https://example.com/video.mp4");
  assert.equal(stringResult, "https://example.com/video.mp4");
  assert.ok(
    objectResult.didChange,
    "Dropping the fragment should be reflected in didChange"
  );
});
