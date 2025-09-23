import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import { parseVideoEventPayload } from "../js/videoEventUtils.js";
import { convertEventToVideo } from "../js/nostr.js";
import { deriveTorrentPlaybackConfig } from "../js/playbackUtils.js";

const LEGACY_INFO_HASH = "0123456789abcdef0123456789abcdef01234567";

(function testParseDetectsBareInfoHashInJson() {
  const event = {
    id: "evt-json",
    content: JSON.stringify({
      version: 1,
      title: "Legacy note",
      magnet: LEGACY_INFO_HASH,
    }),
    tags: [],
  };

  const parsed = parseVideoEventPayload(event);
  assert.equal(parsed.magnet, "", "Bare info hash should not be treated as a magnet URI");
  assert.equal(parsed.infoHash, LEGACY_INFO_HASH);
})();

(function testParseDetectsInfoHashInRawContentAndTags() {
  const event = {
    id: "evt-tag",
    content: JSON.stringify({ title: "tag-sourced" }),
    tags: [["magnet", LEGACY_INFO_HASH]],
  };

  const parsed = parseVideoEventPayload(event);
  assert.equal(parsed.infoHash, LEGACY_INFO_HASH);
})();

(function testParseDetectsInfoHashInRawString() {
  const event = {
    id: "evt-raw",
    content: `legacy magnet ${LEGACY_INFO_HASH} broken json`,
    tags: [],
  };

  const parsed = parseVideoEventPayload(event);
  assert.equal(parsed.infoHash, LEGACY_INFO_HASH);
})();

(function testConvertTreatsInfoHashAsPlayable() {
  const event = {
    id: "evt-convert",
    pubkey: "pk",
    created_at: 1,
    tags: [],
    content: JSON.stringify({
      version: 1,
      title: "Legacy conversion",
      magnet: LEGACY_INFO_HASH,
    }),
  };

  const video = convertEventToVideo(event);
  assert.equal(video.invalid, false, "Legacy info hash events should not be dropped");
  assert.equal(video.magnet, LEGACY_INFO_HASH);
  assert.equal(video.infoHash, LEGACY_INFO_HASH);
  assert.equal(video.rawMagnet, "");
})();

(function testLegacyEventWithoutTitleStillLoads() {
  const event = {
    id: "evt-no-title",
    pubkey: "pk2",
    created_at: 2,
    tags: [],
    content: JSON.stringify({
      version: 1,
      magnet: `magnet:?xt=urn:btih:${LEGACY_INFO_HASH}`,
    }),
  };

  const video = convertEventToVideo(event);
  assert.equal(video.invalid, false, "Legacy events without title should fallback");
  assert.ok(video.title && video.title.length > 0, "Fallback title should be provided");
})();

(function testPlaybackConfigNormalizesInfoHash() {
  const result = deriveTorrentPlaybackConfig({
    magnet: "",
    infoHash: LEGACY_INFO_HASH,
    url: "",
  });

  assert.ok(result.magnet.startsWith("magnet:?"));
  const xtValues = new URL(result.magnet).searchParams.getAll("xt");
  assert.deepEqual(xtValues, [`urn:btih:${LEGACY_INFO_HASH}`]);
  assert.equal(result.usedInfoHash, true);
  assert.equal(result.fallbackMagnet, "");
  assert.equal(result.provided, true);
})();

(function testPlaybackConfigDecodesEncodedMagnet() {
  const rawMagnet =
    `magnet:?xt=urn:btih:${LEGACY_INFO_HASH}&dn=Legacy+Example`;
  const encodedMagnet = encodeURIComponent(rawMagnet);
  const result = deriveTorrentPlaybackConfig({
    magnet: encodedMagnet,
    infoHash: "",
    url: "",
  });

  assert.ok(result.magnet.startsWith("magnet:?"));
  const parsed = new URL(result.magnet);
  assert.equal(
    parsed.searchParams.get("xt"),
    `urn:btih:${LEGACY_INFO_HASH}`,
    "Expected encoded magnet to be normalized"
  );
  assert.equal(result.provided, true);
  assert.equal(result.usedInfoHash, false);
})();

console.log("legacy infohash tests passed");
