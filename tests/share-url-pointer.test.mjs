// SCN-share-pointer-hints
//
// A shared bitvid link carries the video as an `nevent` in `?v=`. It used to be
// encoded as a BARE id -- no author, no relay hints -- so a viewer whose relay
// set didn't happen to carry that event could not resolve it and landed on the
// home feed. That is the "the shared link just opens bitvid.network" report:
// the reported video was on nos.lol but NOT on damus, snort or primal, three of
// bitvid's four defaults.

import test from "node:test";
import assert from "node:assert/strict";
import { createPlaybackCoordinator } from "../js/app/playbackCoordinator.js";

const EVENT_ID = "a759836ece8f5b16ee20fc9f5872ccb7a04208758a3c473f3b3ed219e3adcfd1";
const AUTHOR = "da19b5d291e06ed09ba545bc5366408dc82ba8c9e9f97d32ea8ea60f1f6cbfaa";

// Capture what gets encoded rather than asserting on bech32 output.
function makeHarness({ videos = [], relays = [], writeRelays } = {}) {
  const encoded = [];
  globalThis.window = {
    NostrTools: {
      nip19: {
        neventEncode(pointer) {
          encoded.push(pointer);
          return `nevent1${pointer.id.slice(0, 8)}`;
        },
      },
    },
  };

  const nostrClient = { relays };
  if (writeRelays !== undefined) {
    nostrClient.writeRelays = writeRelays;
  }

  const coordinator = createPlaybackCoordinator({
    devLogger: { warn() {}, error() {}, log() {} },
    userLogger: { warn() {}, error() {}, info() {} },
    nostrClient,
    BITVID_WEBSITE_URL: "https://bitvid.network/",
  });

  const app = {
    ...coordinator,
    videosMap: new Map(videos.map((v) => [v.id, v])),
    getShareUrlBase: () => "https://bitvid.network",
  };

  return { app, encoded };
}

test("the pointer carries the video author", () => {
  const { app, encoded } = makeHarness({
    videos: [{ id: EVENT_ID, pubkey: AUTHOR }],
    relays: ["wss://relay.damus.io"],
  });

  app.buildShareUrlFromEventId(EVENT_ID);
  assert.equal(encoded[0].author, AUTHOR);
});

test("the pointer carries relay hints", () => {
  const { app, encoded } = makeHarness({
    videos: [{ id: EVENT_ID, pubkey: AUTHOR }],
    writeRelays: ["wss://nos.lol", "wss://relay.damus.io"],
  });

  app.buildShareUrlFromEventId(EVENT_ID);
  assert.deepEqual(encoded[0].relays, ["wss://nos.lol", "wss://relay.damus.io"]);
});

test("write relays win over the general relay list", () => {
  const { app, encoded } = makeHarness({
    videos: [{ id: EVENT_ID, pubkey: AUTHOR }],
    relays: ["wss://read-only.example"],
    writeRelays: ["wss://nos.lol"],
  });

  app.buildShareUrlFromEventId(EVENT_ID);
  assert.deepEqual(encoded[0].relays, ["wss://nos.lol"]);
});

test("relay hints are capped, deduped and scheme-filtered", () => {
  // Hints inflate every shared URL, and a whole relay list in a note body is
  // both unwieldy and more disclosure than the link needs.
  const { app, encoded } = makeHarness({
    videos: [{ id: EVENT_ID, pubkey: AUTHOR }],
    writeRelays: [
      "https://not-a-relay.example",
      "wss://a.example",
      "  wss://a.example  ",
      "wss://b.example",
      "ws://c.example",
      "wss://d.example",
      "",
      null,
    ],
  });

  app.buildShareUrlFromEventId(EVENT_ID);
  assert.deepEqual(encoded[0].relays, [
    "wss://a.example",
    "wss://b.example",
    "ws://c.example",
  ]);
});

test("an unknown video still yields a usable pointer", () => {
  // Sharing from a surface that has not cached the video must not break; the
  // bare id is the old behavior and remains the floor.
  const { app, encoded } = makeHarness({ writeRelays: ["wss://nos.lol"] });

  const url = app.buildShareUrlFromEventId(EVENT_ID);
  assert.equal(encoded[0].id, EVENT_ID);
  assert.equal("author" in encoded[0], false);
  assert.match(url, /^https:\/\/bitvid\.network\/\?v=/);
});

test("a malformed author is omitted rather than embedded", () => {
  for (const pubkey of ["", "not-hex", "abc123", null, undefined, 42]) {
    const { app, encoded } = makeHarness({
      videos: [{ id: EVENT_ID, pubkey }],
      writeRelays: ["wss://nos.lol"],
    });
    app.buildShareUrlFromEventId(EVENT_ID);
    assert.equal(
      "author" in encoded[0],
      false,
      `must not embed author ${JSON.stringify(pubkey)}`
    );
  }
});

test("no relays configured omits the hint rather than sending an empty array", () => {
  const { app, encoded } = makeHarness({
    videos: [{ id: EVENT_ID, pubkey: AUTHOR }],
    relays: [],
  });
  app.buildShareUrlFromEventId(EVENT_ID);
  assert.equal("relays" in encoded[0], false);
});

test("the share URL has a path separator before the query", () => {
  // `https://bitvid.network?v=...` is legal but reads as a typo in a note and
  // trips some link parsers on where the URL ends.
  const { app } = makeHarness({
    videos: [{ id: EVENT_ID, pubkey: AUTHOR }],
    relays: ["wss://nos.lol"],
  });

  const url = app.buildShareUrlFromEventId(EVENT_ID);
  assert.match(url, /^https:\/\/bitvid\.network\/\?v=nevent1/);
  assert.equal(url.includes("network?v="), false);
});

test("an empty event id yields no URL", () => {
  const { app } = makeHarness({ relays: ["wss://nos.lol"] });
  assert.equal(app.buildShareUrlFromEventId(""), "");
  assert.equal(app.buildShareUrlFromEventId(null), "");
});
