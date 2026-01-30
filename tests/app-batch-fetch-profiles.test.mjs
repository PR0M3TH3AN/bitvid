import test from "node:test";
import assert from "node:assert/strict";
import { nostrClient } from "../js/nostrClientFacade.js";
import { batchFetchProfilesFromRelays } from "../js/utils/profileBatchFetcher.js";

const FAST_RELAY = "wss://fast.example";
const FAIL_RELAY = "wss://fail.example";
const VALID_PUBKEY = "a".repeat(64);
const CACHED_PUBKEY = "b".repeat(64);

function createProfileEvent({ pubkey, createdAt, content }) {
  return {
    id: `${pubkey}:${createdAt}`,
    pubkey,
    created_at: createdAt,
    content: JSON.stringify(content),
  };
}

test("batchFetchProfiles handles fast and failing relays", async () => {
  const cache = new Map();
  const updates = [];
  const setCalls = [];
  const authorSet = new Set([
    VALID_PUBKEY,
    CACHED_PUBKEY,
    "",
    null,
    undefined,
    "npubInvalid",
  ]);

  const getProfileCacheEntry = (pubkey) => {
    if (pubkey === CACHED_PUBKEY) {
      return { profile: { name: "Cached", picture: "cached.png" } };
    }
    return cache.get(pubkey) ?? null;
  };

  const setProfileCacheEntry = (pubkey, profile) => {
    cache.set(pubkey, { profile });
    setCalls.push({ pubkey, profile });
  };

  const updateProfileInDOM = (pubkey, profile) => {
    updates.push({ pubkey, profile });
  };

  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : [];
  const originalReadRelays = Array.isArray(nostrClient.readRelays)
    ? [...nostrClient.readRelays]
    : [];
  const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
    ? [...nostrClient.writeRelays]
    : nostrClient.writeRelays;
  const originalReadRelays = Array.isArray(nostrClient.readRelays)
    ? [...nostrClient.readRelays]
    : nostrClient.readRelays;
  const originalPool = nostrClient.pool;

  const poolListCalls = [];

  nostrClient.relays = [FAST_RELAY, FAIL_RELAY];
  nostrClient.readRelays = [FAST_RELAY, FAIL_RELAY];
  nostrClient.writeRelays = [FAST_RELAY, FAIL_RELAY];
  nostrClient.readRelays = [FAST_RELAY, FAIL_RELAY];
  nostrClient.pool = {
    list: (relays, filters) => {
      poolListCalls.push({ relays, filters });
      const relayUrl = Array.isArray(relays) ? relays[0] : undefined;
      if (relayUrl === FAST_RELAY) {
        return Promise.resolve([
          createProfileEvent({
            pubkey: VALID_PUBKEY,
            createdAt: 200,
            content: { name: "Fast", picture: "fast.png" },
          }),
          createProfileEvent({
            pubkey: VALID_PUBKEY,
            createdAt: 150,
            content: { name: "Old", picture: "old.png" },
          }),
        ]);
      }
      if (relayUrl === FAIL_RELAY) {
        return Promise.reject(new Error("relay timed out"));
      }
      return Promise.resolve([]);
    },
  };

  try {
    await batchFetchProfilesFromRelays({
      authorSet,
      getProfileCacheEntry,
      setProfileCacheEntry,
      updateProfileInDOM,
    });
  } finally {
    nostrClient.relays = originalRelays;
    nostrClient.readRelays = originalReadRelays;
    nostrClient.writeRelays = originalWriteRelays;
    nostrClient.readRelays = originalReadRelays;
    nostrClient.pool = originalPool;
  }

  assert.equal(poolListCalls.length, 2, "expected a query per relay");

  const [fastCall] = poolListCalls;
  assert.deepEqual(
    fastCall.filters[0].authors,
    [VALID_PUBKEY],
    "should query only uncached, valid pubkeys",
  );

  assert.deepEqual(
    updates[0],
    { pubkey: CACHED_PUBKEY, profile: { name: "Cached", picture: "cached.png" } },
    "cached profiles should hydrate immediately",
  );

  assert.equal(updates.length, 2, "fast relay should update immediately");
  assert.deepEqual(
    updates[1],
    { pubkey: VALID_PUBKEY, profile: { name: "Fast", picture: "fast.png" } },
    "newest relay profile should render",
  );

  assert.deepEqual(setCalls, [
    { pubkey: VALID_PUBKEY, profile: { name: "Fast", picture: "fast.png" } },
  ]);
});
