import assert from "node:assert/strict";
import test from "node:test";

import { WSS_TRACKERS } from "../js/constants.js";
import {
  normalizeAndAugmentMagnet as normalizeMagnetObject,
  safeDecodeMagnet,
} from "../js/magnetUtils.js";
import { extractMagnetHints } from "../js/magnetShared.js";

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

test("bare hashes normalize consistently", () => {
  const infoHash = "0123456789abcdef0123456789abcdef01234567";
  const objectResult = normalizeMagnetObject(infoHash);

  assert.ok(objectResult.didChange, "Bare hashes should mark didChange true");

  const xtValues = getParamValues(objectResult.magnet, "xt");
  assert.deepEqual(xtValues, [`urn:btih:${infoHash}`]);
  assertDefaultTrackersPresent(objectResult.magnet);
});

test("legacy %3A payloads decode", () => {
  const infoHash = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const encoded = `magnet:?xt=urn%3Abtih%3A${infoHash}&dn=Example`;
  const objectResult = normalizeMagnetObject(encoded);

  const xtValues = getParamValues(objectResult.magnet, "xt");
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
      "http://tracker.invalid",
      "wss://tracker.openwebtorrent.com",
    ],
    xs: "https://cdn.example.com/video.torrent",
    webSeed: "https://cdn.example.com/files/",
  });

  const trackers = getParamValues(objectResult.magnet, "tr");
  const openwebCount = trackers.filter(
    (value) => value === "wss://tracker.openwebtorrent.com"
  ).length;
  assert.equal(openwebCount, 1, "Duplicate trackers should be deduped when appended");
  assert.ok(
    !trackers.includes("http://tracker.invalid"),
    "HTTP tracker candidates should be ignored"
  );

  const webSeeds = getParamValues(objectResult.magnet, "ws");
  assert.deepEqual(webSeeds, ["https://cdn.example.com/files/"]);

  const xsValues = getParamValues(objectResult.magnet, "xs");
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
  assert.equal(objectResult.magnet, "https://example.com/video.mp4");
  assert.ok(
    objectResult.didChange,
    "Dropping the fragment should be reflected in didChange"
  );
});

test("normalizeAndAugmentMagnet filters out known broken trackers", () => {
  const infoHash = "abcdef0123456789abcdef0123456789abcdef01";
  const brokenTrackers = [
    "wss://tracker.dler.org/announce",
    "wss://tracker.ghostchu-services.top/announce"
  ];

  const rawMagnet =
    `magnet:?xt=urn:btih:${infoHash}` +
    `&tr=${brokenTrackers[0]}` +
    `&tr=${brokenTrackers[1]}`;

  const result = normalizeMagnetObject(rawMagnet);

  const trackers = getParamValues(result.magnet, "tr");
  for (const broken of brokenTrackers) {
    assert.ok(
      !trackers.includes(broken),
      `Expected broken tracker ${broken} to be removed`
    );
  }

  assertDefaultTrackersPresent(result.magnet);
});
