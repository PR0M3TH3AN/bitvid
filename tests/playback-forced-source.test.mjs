// Unit test for the forced-source deep-link normalizer.
//
// SCN-forced-source-deep-link:
//   Given a `?playback=` deep-link value (or a caller hint),
//   When normalized,
//   Then it maps to the canonical 'url' | 'torrent' the playback pipeline
//     understands (accepting the friendly aliases shown in the UI toggle),
//   And anything unset/unrecognized yields null so normal source selection runs
//     (a bad value must NEVER silently coerce to a real source).

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeForcedSource } from "../js/app/playbackCoordinator.js";

test("maps torrent aliases to 'torrent'", () => {
  for (const v of ["torrent", "p2p", "P2P", "WebTorrent", "magnet", "  torrent  "]) {
    assert.equal(normalizeForcedSource(v), "torrent", `"${v}" -> torrent`);
  }
});

test("maps CDN/url aliases to 'url'", () => {
  for (const v of ["url", "cdn", "CDN", "hosted", "http", "https", " URL "]) {
    assert.equal(normalizeForcedSource(v), "url", `"${v}" -> url`);
  }
});

test("returns null for unset / unrecognized / non-string values", () => {
  for (const v of ["", "bogus", "torrnt", "0", null, undefined, 42, {}, []]) {
    assert.equal(
      normalizeForcedSource(v),
      null,
      `${JSON.stringify(v)} must not coerce to a real source`,
    );
  }
});
