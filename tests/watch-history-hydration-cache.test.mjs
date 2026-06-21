// A freshly-watched video is already in nostrClient.allEvents (you just played
// it). The watch-history feed stores an "a" (address) pointer for it and must
// resolve the title/thumbnail from that local cache WITHOUT a relay round-trip.
//
// Bug: allEvents holds *converted* video objects (convertEventToVideo), which
// carry tags/pubkey but NO `kind` field. resolveEventAddress did Number(kind) →
// NaN → returned "" for every cached video, so the address cache-scan never
// matched. Every video pointer fell through to a relay fetch, and when that came
// up empty the card rendered "Untitled video" / "Unknown".
//
// Correct behavior: the cache-scan resolves an "a" pointer to the cached video
// using the video kind by default, so freshly-watched videos show their real
// metadata immediately — even when relays return nothing.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createWatchHistoryHydrationStage } from "../js/feedEngine/watchHistoryFeed.js";
import { nostrClient } from "../js/nostrClientFacade.js";

const PUBKEY = "c".repeat(64);
const DTAG = "my-video-root-id";
const ADDRESS = `30078:${PUBKEY}:${DTAG}`;

// Mirrors convertEventToVideo output: tags + pubkey, but NO `kind`.
function cachedVideoWithoutKind() {
  return {
    id: "e".repeat(64),
    pubkey: PUBKEY,
    title: "My Real Video Title",
    thumbnail: "https://example.com/thumb.jpg",
    tags: [["d", DTAG]],
    created_at: 1750000000,
    invalid: false,
  };
}

test("an 'a'-pointer resolves from the local cache (no relay needed) for a converted video lacking `kind`", async () => {
  const prevAllEvents = nostrClient.allEvents;
  const prevPool = nostrClient.pool;
  const prevRead = nostrClient.readRelays;

  nostrClient.allEvents = new Map([
    [cachedVideoWithoutKind().id, cachedVideoWithoutKind()],
  ]);
  // Relays return nothing — so a pass can ONLY come from the cache scan.
  let relayHits = 0;
  nostrClient.pool = {
    list: async () => {
      relayHits += 1;
      return [];
    },
  };
  nostrClient.readRelays = ["wss://relay.example"];

  try {
    const stage = createWatchHistoryHydrationStage();
    const items = [
      {
        pointer: { type: "a", value: ADDRESS },
        pointerKey: `a:${ADDRESS}`,
        watchedAt: 1750000001,
        video: null,
        metadata: {},
      },
    ];

    const result = await stage(items, {});

    assert.equal(result.length, 1);
    assert.ok(
      result[0].video,
      "freshly-watched video must resolve from the local cache",
    );
    assert.equal(
      result[0].video.title,
      "My Real Video Title",
      "resolved video must carry the real title (not Unknown)",
    );
    assert.equal(
      relayHits,
      0,
      "cache hit must avoid a relay round-trip entirely",
    );
  } finally {
    nostrClient.allEvents = prevAllEvents;
    nostrClient.pool = prevPool;
    nostrClient.readRelays = prevRead;
  }
});
