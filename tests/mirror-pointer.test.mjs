// Addressable pointers to a video's NIP-71 mirror — see js/nostr/mirrorPointer.js.
//
// SCN-mirror-quote: a share note embeds `nostr:naddr1…` so nostr clients render
// a native video quote card. The pointer MUST address the event that actually
// exists: a pointer to a missing or wrong-kind event renders as a broken/empty
// quote box, which is strictly worse than the plain-link fallback.

import test from "node:test";
import assert from "node:assert/strict";
import {
  NIP71_NORMAL_VIDEO_KIND,
  NIP71_SHORT_VIDEO_KIND,
  buildMirrorCoordinate,
  buildMirrorNaddr,
  resolveMirrorKind,
} from "../js/nostr/mirrorPointer.js";

const PUBKEY = "b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81";
const ROOT = "b52ab495-ac9c-4a29-a454-aff142a43691";

// Records what it was asked to encode so the tests can assert on inputs rather
// than on bech32 output.
const makeNip19 = () => {
  const calls = [];
  return {
    calls,
    naddrEncode(pointer) {
      calls.push(pointer);
      return `naddr1${pointer.kind}${pointer.identifier}`;
    },
  };
};

// --- kind resolution ------------------------------------------------------

test("observed relay kinds win over the dimension heuristic", () => {
  // Ground truth from nip71MirrorService.findMirror must beat any guess —
  // a portrait video whose mirror was published as 34235 is still 34235.
  assert.equal(
    resolveMirrorKind({ kinds: [NIP71_NORMAL_VIDEO_KIND], width: 720, height: 1280 }),
    NIP71_NORMAL_VIDEO_KIND
  );
  assert.equal(
    resolveMirrorKind({ kinds: [NIP71_SHORT_VIDEO_KIND], width: 1920, height: 1080 }),
    NIP71_SHORT_VIDEO_KIND
  );
});

test("without observed kinds it mirrors nip71Mirror.js's portrait rule", () => {
  // nip71Mirror.js:179 — `hasDims && height > width` selects the short kind.
  assert.equal(
    resolveMirrorKind({ width: 720, height: 1280 }),
    NIP71_SHORT_VIDEO_KIND
  );
  assert.equal(
    resolveMirrorKind({ width: 1280, height: 720 }),
    NIP71_NORMAL_VIDEO_KIND
  );
  // Square is not portrait.
  assert.equal(
    resolveMirrorKind({ width: 1000, height: 1000 }),
    NIP71_NORMAL_VIDEO_KIND
  );
});

test("missing or nonsensical dimensions default to the normal kind", () => {
  for (const dims of [
    {},
    { width: 0, height: 0 },
    { width: NaN, height: 10 },
    { width: "wide", height: "tall" },
    { width: -100, height: -200 },
  ]) {
    assert.equal(resolveMirrorKind(dims), NIP71_NORMAL_VIDEO_KIND);
  }
  assert.equal(resolveMirrorKind(), NIP71_NORMAL_VIDEO_KIND);
});

test("a cross-kind duplicate resolves deterministically to the normal kind", () => {
  // nip71MirrorService flags this as `duplicate`. Picking arbitrarily would
  // make the shared pointer unstable between shares of the same video.
  assert.equal(
    resolveMirrorKind({ kinds: [NIP71_SHORT_VIDEO_KIND, NIP71_NORMAL_VIDEO_KIND] }),
    NIP71_NORMAL_VIDEO_KIND
  );
});

test("unknown kinds are ignored rather than pointed at", () => {
  assert.equal(
    resolveMirrorKind({ kinds: [1, 30078], width: 720, height: 1280 }),
    NIP71_SHORT_VIDEO_KIND,
    "falls through to the heuristic instead of addressing kind 1"
  );
});

// --- coordinate -----------------------------------------------------------

test("buildMirrorCoordinate produces a kind:pubkey:d address", () => {
  assert.equal(
    buildMirrorCoordinate({ pubkey: PUBKEY, videoRootId: ROOT, kind: 34235 }),
    `34235:${PUBKEY}:${ROOT}`
  );
});

test("buildMirrorCoordinate refuses incomplete input", () => {
  assert.equal(buildMirrorCoordinate({ videoRootId: ROOT, kind: 34235 }), "");
  assert.equal(buildMirrorCoordinate({ pubkey: PUBKEY, kind: 34235 }), "");
  assert.equal(buildMirrorCoordinate({ pubkey: PUBKEY, videoRootId: ROOT }), "");
  assert.equal(buildMirrorCoordinate({ pubkey: PUBKEY, videoRootId: ROOT, kind: 0 }), "");
  assert.equal(buildMirrorCoordinate(), "");
});

// --- naddr ----------------------------------------------------------------

test("buildMirrorNaddr encodes kind, author, identifier and relay hints", () => {
  const nip19 = makeNip19();
  const naddr = buildMirrorNaddr({
    pubkey: PUBKEY,
    videoRootId: ROOT,
    kind: NIP71_NORMAL_VIDEO_KIND,
    relays: ["wss://relay.damus.io", "wss://nos.lol"],
    nip19,
  });

  assert.equal(naddr.startsWith("naddr1"), true);
  assert.deepEqual(nip19.calls[0], {
    kind: NIP71_NORMAL_VIDEO_KIND,
    pubkey: PUBKEY,
    identifier: ROOT,
    relays: ["wss://relay.damus.io", "wss://nos.lol"],
  });
});

test("relay hints are filtered to wss/ws and capped at three", () => {
  const nip19 = makeNip19();
  buildMirrorNaddr({
    pubkey: PUBKEY,
    videoRootId: ROOT,
    kind: 34235,
    relays: [
      "https://not-a-relay.example",
      "wss://a.example",
      "",
      "wss://b.example",
      "ws://c.example",
      "wss://d.example",
      null,
    ],
    nip19,
  });

  assert.deepEqual(nip19.calls[0].relays, [
    "wss://a.example",
    "wss://b.example",
    "ws://c.example",
  ]);
});

test("buildMirrorNaddr returns empty rather than a malformed pointer", () => {
  const nip19 = makeNip19();
  const base = { pubkey: PUBKEY, videoRootId: ROOT, kind: 34235, nip19 };

  assert.equal(buildMirrorNaddr({ ...base, pubkey: "" }), "");
  assert.equal(buildMirrorNaddr({ ...base, videoRootId: "" }), "");
  assert.equal(buildMirrorNaddr({ ...base, kind: 0 }), "");
  assert.equal(buildMirrorNaddr({ ...base, nip19: null }), "");
  assert.equal(buildMirrorNaddr({ ...base, nip19: {} }), "");
  assert.equal(buildMirrorNaddr(), "");
  assert.equal(nip19.calls.length, 0, "never attempted an encode");
});

test("an encoder that throws yields empty, never a broken quote", () => {
  const hostile = {
    naddrEncode() {
      throw new Error("bad pointer");
    },
  };
  assert.equal(
    buildMirrorNaddr({
      pubkey: PUBKEY,
      videoRootId: ROOT,
      kind: 34235,
      nip19: hostile,
    }),
    ""
  );
});
