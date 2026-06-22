// Dimension capture: width/height/duration are persisted in the 30078 content,
// survive edits, parse back onto the video, and drive the NIP-71 mirror's
// normal(34235)-vs-short(34236) selection + imeta dim. (Foundation for a future
// "shorts" vertical feed, which filters on height > width.)

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareVideoPublishPayload,
  prepareVideoEditPayload,
  normalizeVideoDimension,
} from "../js/nostr/videoPayloadBuilder.js";
import { convertEventToVideo } from "../js/nostr/nip71.js";
import {
  buildNip71MirrorEvent,
  NIP71_NORMAL_VIDEO_KIND,
  NIP71_SHORT_VIDEO_KIND,
} from "../js/nostr/nip71Mirror.js";

const PUBKEY = "a".repeat(64);

function publish(extra) {
  return prepareVideoPublishPayload(
    { title: "Hi", url: "https://cdn.example.com/v.mp4", ...extra },
    PUBKEY,
    { timestamp: 1000 },
  );
}

test("normalizeVideoDimension: positive int or 0", () => {
  assert.equal(normalizeVideoDimension(1920), 1920);
  assert.equal(normalizeVideoDimension("1080"), 1080);
  assert.equal(normalizeVideoDimension(0), 0);
  assert.equal(normalizeVideoDimension(-5), 0);
  assert.equal(normalizeVideoDimension("abc"), 0);
});

test("publish persists width/height/duration in content; parser exposes them", async () => {
  const { event } = await publish({
    videoRootId: "root-1",
    width: 1080,
    height: 1920,
    duration: 42.5,
  });
  const content = JSON.parse(event.content);
  assert.equal(content.width, 1080);
  assert.equal(content.height, 1920);
  assert.equal(content.duration, 42.5);

  const video = convertEventToVideo(event);
  assert.equal(video.width, 1080);
  assert.equal(video.height, 1920);
  assert.equal(video.duration, 42.5);
});

test("a portrait (height>width) video mirrors as 34236 short with imeta dim", async () => {
  const { event } = await publish({ videoRootId: "root-2", width: 1080, height: 1920 });
  const video = convertEventToVideo(event);
  const res = buildNip71MirrorEvent({ ...video, pubkey: PUBKEY });
  assert.equal(res.event.kind, NIP71_SHORT_VIDEO_KIND, "portrait => 34236");
  const imeta = res.event.tags.find((t) => t[0] === "imeta");
  assert.ok(imeta.some((e) => e === "dim 1080x1920"), "carries imeta dim");
});

test("a landscape video mirrors as 34235 normal", async () => {
  const { event } = await publish({ videoRootId: "root-3", width: 1920, height: 1080 });
  const video = convertEventToVideo(event);
  const res = buildNip71MirrorEvent({ ...video, pubkey: PUBKEY });
  assert.equal(res.event.kind, NIP71_NORMAL_VIDEO_KIND, "landscape => 34235");
});

test("editing preserves dimensions when the field is omitted", () => {
  const { contentObject } = prepareVideoEditPayload({
    baseEvent: {
      id: "e1",
      videoRootId: "root-9",
      title: "Old",
      url: "https://cdn.example.com/v.mp4",
      width: 1280,
      height: 720,
      duration: 30,
      created_at: 1000,
      tags: [],
    },
    originalEventStub: { id: "e1" },
    updatedData: { title: "New" },
    userPubkey: PUBKEY,
    resolveEventDTag: () => "root-9",
  });
  assert.equal(contentObject.width, 1280);
  assert.equal(contentObject.height, 720);
  assert.equal(contentObject.duration, 30);
});
