// Regression (#20): the channel grid render replaces the container with the live
// fetch, so a transiently-failing relay produced a smaller set and previously-
// known videos vanished ("some of a creator's videos are missing"). The live
// fetch must be unioned with already-known events so the grid never shrinks.

import assert from "node:assert/strict";
import test from "node:test";
import { mergeChannelVideoSources } from "../js/channelProfileVideos.js";

const ev = (id, extra = {}) => ({ id, kind: 30078, ...extra });

test("union is a superset of both live and known events", () => {
  const live = [ev("a"), ev("b")];
  const known = [ev("b"), ev("c"), ev("d")];

  const merged = mergeChannelVideoSources(live, known);
  const ids = merged.map((e) => e.id).sort();

  assert.deepEqual(ids, ["a", "b", "c", "d"], "all unique ids from both sources");
});

test("a known video missing from the live fetch still appears (the bug)", () => {
  // The live fetch this load only returned one video; the other is known in
  // memory (e.g. from a prior load / the main feed). It must not disappear.
  const live = [ev("only-live")];
  const known = [ev("only-live"), ev("dropped-by-slow-relay")];

  const merged = mergeChannelVideoSources(live, known);
  const ids = merged.map((e) => e.id).sort();

  assert.deepEqual(ids, ["dropped-by-slow-relay", "only-live"]);
});

test("live wins on id collision (freshest copy)", () => {
  const live = [ev("x", { created_at: 200, source: "live" })];
  const known = [ev("x", { created_at: 100, source: "cache" })];

  const merged = mergeChannelVideoSources(live, known);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "live", "live copy must win the dedupe");
});

test("preserves id-less entries and tolerates non-array / junk input", () => {
  const live = [ev("a"), { kind: 30078 /* no id */ }, null, "junk"];
  const merged = mergeChannelVideoSources(live, undefined);
  const withId = merged.filter((e) => e && e.id === "a");
  const withoutId = merged.filter((e) => e && typeof e === "object" && !e.id);

  assert.equal(withId.length, 1);
  assert.equal(withoutId.length, 1, "id-less event kept, not dropped");
  assert.deepEqual(mergeChannelVideoSources(null, null), []);
});
