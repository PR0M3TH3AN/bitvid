// Item #4 (view-count accuracy): a view event's `d` tag must be DETERMINISTIC and
// window-bucketed so kind-30079 view events are parameterized-replaceable —
// relays then collapse a viewer's repeat views in the same window into one event,
// making both the NIP-45 COUNT and a list() accurate and scalable. The old
// entropy+timestamp tag made every view unique and inflated counts.

import test from "node:test";
import assert from "node:assert/strict";

import { buildViewEvent } from "../js/nostrEventSchemas.js";
import { __testExports } from "../js/nostr/viewEvents.js";
import { VIEW_COUNT_DEDUPE_WINDOW_SECONDS } from "../js/config.js";

const { generateViewEventDedupeTag } = __testExports;

const VIEWER = "f".repeat(64);
const OTHER = "0".repeat(64);
const VIDEO = { type: "e", value: "video-abc" };
const VIDEO2 = { type: "e", value: "video-xyz" };
const W = VIEW_COUNT_DEDUPE_WINDOW_SECONDS;
// A timestamp comfortably inside one window bucket, and another in the same one.
const T0 = 100 * W + 10;
const T0_SAME = 100 * W + (W - 1); // same bucket as T0
const T_NEXT = 101 * W + 5; // next bucket

test("same viewer + video within one window → identical d-tag (replaceable)", () => {
  const a = generateViewEventDedupeTag(VIEWER, VIDEO, T0);
  const b = generateViewEventDedupeTag(VIEWER, VIDEO, T0_SAME);
  assert.equal(a, b, "repeat views in the same window must dedupe to one event");
});

test("d-tag has no entropy: stable across calls", () => {
  const a = generateViewEventDedupeTag(VIEWER, VIDEO, T0);
  const b = generateViewEventDedupeTag(VIEWER, VIDEO, T0);
  assert.equal(a, b);
});

test("next window → different d-tag (counts as a new view)", () => {
  const a = generateViewEventDedupeTag(VIEWER, VIDEO, T0);
  const c = generateViewEventDedupeTag(VIEWER, VIDEO, T_NEXT);
  assert.notEqual(a, c);
});

test("different viewer or different video → different d-tag", () => {
  const base = generateViewEventDedupeTag(VIEWER, VIDEO, T0);
  assert.notEqual(base, generateViewEventDedupeTag(OTHER, VIDEO, T0));
  assert.notEqual(base, generateViewEventDedupeTag(VIEWER, VIDEO2, T0));
});

test("buildViewEvent does NOT invent a random d-tag when none is supplied", () => {
  const event = buildViewEvent({
    pubkey: VIEWER,
    created_at: T0,
    pointerValue: VIDEO.value,
    pointerTag: ["e", VIDEO.value],
  });
  const dTags = event.tags.filter((t) => Array.isArray(t) && t[0] === "d");
  assert.equal(dTags.length, 0, "no d tag should be auto-generated (no entropy)");
});

test("buildViewEvent uses the exact deterministic d-tag it is given", () => {
  const dedupeTag = generateViewEventDedupeTag(VIEWER, VIDEO, T0);
  const event = buildViewEvent({
    pubkey: VIEWER,
    created_at: T0,
    pointerValue: VIDEO.value,
    pointerTag: ["e", VIDEO.value],
    dedupeTag,
  });
  assert.ok(
    event.tags.some((t) => Array.isArray(t) && t[0] === "d" && t[1] === dedupeTag),
    "the supplied deterministic d-tag must be on the event",
  );
});
