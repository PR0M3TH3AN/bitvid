// Regression test documenting why replaceable-list fetches must not be gated by
// a persisted per-relay lastSeen, and why admin lists pass `since: 0`.
//
// Replaceable events (NIP-51/NIP-33 lists: mute 10000, lists 30000/30002,
// hashtag prefs 30015, admin lists) have exactly ONE current version. The
// incremental optimization stores lastSeen = current created_at, then queries
// `since = lastSeen + 1` on the next load. For a replaceable event whose
// created_at never advances, that filter perpetually excludes the current
// event, so the fetch returns nothing even though the list exists. Callers that
// lack a durable content cache then see an empty list.
//
// Scenario (SCN-replaceable-since-gate):
//   Given a relay holding one replaceable list event at created_at = T, and a
//     persisted lastSeen = T,
//   When the list is fetched relying on the persisted lastSeen,
//     Then the current event is hidden (returns empty) — the latent bug.
//   When the list is fetched with an explicit since: 0 (full fetch),
//     Then the current event is returned — the fix used by admin lists.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RelayBatchFetcher } from "../../js/nostr/relayBatchFetcher.js";

const PUBKEY = "a".repeat(64);
const RELAY = "wss://r1.example.com";
const T = 1000;

// One current replaceable list event living on the relay at created_at = T.
const currentEvent = {
  id: "current-list-event",
  kind: 30000,
  pubkey: PUBKEY,
  created_at: T,
  tags: [["d", "admin:editors"]],
  content: "",
};

function makeFetcher() {
  const client = {
    relays: [RELAY],
    readRelays: [],
    getHealthyRelays: (list) => list,
    ensurePool: async () => ({ list: async () => [] }),
    // Persisted lastSeen says we already saw the current version at time T.
    getSyncLastSeen: () => T,
    updateSyncLastSeen: () => {},
    markRelayUnreachable: () => {},
  };

  // Behavioral relay clone: returns the current replaceable event only when the
  // query is not gated past T (i.e. since is absent or <= T).
  const fetchFn = async (_relayUrl, filter) => {
    const since = filter?.since;
    if (since === undefined || since <= T) {
      return [currentEvent];
    }
    return [];
  };

  return { fetcher: new RelayBatchFetcher(client), fetchFn };
}

describe("fetchListIncrementally + replaceable events", () => {
  it("relying on persisted lastSeen hides the current replaceable event (documents the bug)", async () => {
    const { fetcher, fetchFn } = makeFetcher();
    const events = await fetcher.fetchListIncrementally({
      kind: 30000,
      pubkey: PUBKEY,
      dTag: "admin:editors",
      relayUrls: [RELAY],
      fetchFn,
      // no `since` => uses persisted lastSeen = T => filter.since = T + 1
    });
    assert.equal(
      events.length,
      0,
      "persisted lastSeen gates since=T+1, hiding the current event",
    );
  });

  it("since: 0 forces a full fetch and returns the current event (the admin-list fix)", async () => {
    const { fetcher, fetchFn } = makeFetcher();
    const events = await fetcher.fetchListIncrementally({
      kind: 30000,
      pubkey: PUBKEY,
      dTag: "admin:editors",
      relayUrls: [RELAY],
      fetchFn,
      since: 0,
    });
    assert.equal(events.length, 1, "full fetch must return the current event");
    assert.equal(events[0].id, currentEvent.id);
  });
});
