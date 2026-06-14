// Scenario (SCN-blocks-reload-on-change-only):
//   Given the app reloads the feed when the block list loads,
//   When "blocks-loaded" fires repeatedly with an UNCHANGED block set,
//   Then the feed is reloaded only on the FIRST (changed) signal — not on every
//     no-op refetch. An unconditional reload re-fetches the lists, which re-emit
//     "blocks-loaded", forming a self-sustaining loop (KNOWN_BUGS #2).
//   And a genuine block-set change triggers exactly one more reload.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthSessionCoordinator } from "../../js/app/authSessionCoordinator.js";

function makeCoordinator(getBlockedPubkeys) {
  const noop = () => {};
  const logger = { warn: noop, info: noop, log: noop, error: noop, debug: noop };
  const coord = createAuthSessionCoordinator({
    devLogger: logger,
    userLogger: logger,
    nostrClient: {},
    accessControl: {},
    userBlocks: { getBlockedPubkeys },
    subscriptions: {},
    hashtagPreferences: {},
    storageService: {},
    relayManager: {},
    torrentClient: {},
    getHashViewName: noop,
    setHashView: noop,
    DEFAULT_NIP07_PERMISSION_METHODS: [],
    RELAY_UI_BATCH_DELAY_MS: 0,
    sanitizeRelayList: (x) => x,
    buildDmRelayListEvent: noop,
    publishEventToRelays: noop,
    assertAnyRelayAccepted: noop,
    queueSignEvent: noop,
    bootstrapTrustedSeeds: noop,
    getModerationSettings: () => ({}),
    getActiveProfilePubkey: () => null,
  });
  coord.profileController = null;
  return coord;
}

test("handleBlocksLoaded reloads the feed only when the block set changes", () => {
  let blocked = [];
  const coord = makeCoordinator(() => blocked);
  let reloads = 0;
  coord.onVideosShouldRefresh = async () => {
    reloads += 1;
  };

  // First signal (initial set) => one reload.
  coord.handleBlocksLoaded({ blocksLoaded: true });
  assert.equal(reloads, 1, "first blocks-loaded reloads once");

  // Same set, repeated => no further reloads (this is the loop guard).
  coord.handleBlocksLoaded({ blocksLoaded: true });
  coord.handleBlocksLoaded({ blocksLoaded: true });
  assert.equal(reloads, 1, "unchanged block set must not reload");

  // Genuine change => exactly one more reload.
  blocked = ["a".repeat(64), "b".repeat(64)];
  coord.handleBlocksLoaded({ blocksLoaded: true });
  assert.equal(reloads, 2, "a changed block set reloads once");

  // Order-independent: same members, different order => unchanged.
  blocked = ["b".repeat(64), "a".repeat(64)];
  coord.handleBlocksLoaded({ blocksLoaded: true });
  assert.equal(reloads, 2, "reordered-but-equal set must not reload");

  // Non-blocks-loaded details are ignored.
  coord.handleBlocksLoaded({ blocksLoaded: false });
  assert.equal(reloads, 2, "ignored when blocksLoaded !== true");
});
