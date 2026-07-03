// Cold-load "first impression" fix: the post-login feed gate can open as soon as
// blocks/subscriptions/hashtags hold valid per-pubkey CACHES (warm boot), instead
// of waiting for the full relay sync + decryption. These test the probe + waiter
// that implement the early release.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-feed-list-cache-gate
//       given: "list services with/without valid per-pubkey caches"
//       when: "createListCacheProbe / waitForListCaches run"
//       then: "probe is true only when ALL THREE caches match the active pubkey; the waiter resolves 'cache' early or null at timeout"
//   observable_outcomes:
//     - "all three caches valid + matching pubkey -> probe true"
//     - "any cache missing / stale pubkey / not loaded -> probe false"
//     - "waiter resolves 'cache' once the probe flips true (caches hydrating late)"
//     - "waiter resolves null at timeout when caches never hydrate (cold boot)"
//   determinism_controls:
//     - "plain state objects; short real timers (interval 5ms, timeout 40ms)"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  createListCacheProbe,
  waitForListCaches,
} from "../js/app/feedListCacheGate.js";

const PUB = "A".repeat(64); // exercise normalization (upper → lower)

function services({ blocks = true, subs = true, tags = true, pubkey = PUB } = {}) {
  return {
    userBlocks: { loaded: blocks, activePubkey: pubkey },
    subscriptions: { loaded: subs, currentUserPubkey: pubkey },
    hashtagPreferences: { loaded: tags, activePubkey: pubkey },
  };
}

const normalize = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");

test("probe is true only when ALL three caches are loaded for the active pubkey", () => {
  const ok = createListCacheProbe({
    ...services(),
    normalizeHexPubkey: normalize,
    activePubkey: PUB.toLowerCase(),
  });
  assert.equal(ok(), true);

  for (const partial of [
    services({ blocks: false }),
    services({ subs: false }),
    services({ tags: false }),
    services({ pubkey: "b".repeat(64) }), // caches belong to another account
  ]) {
    const probe = createListCacheProbe({
      ...partial,
      normalizeHexPubkey: normalize,
      activePubkey: PUB.toLowerCase(),
    });
    assert.equal(probe(), false);
  }
});

test("probe is false with no active pubkey or missing services", () => {
  assert.equal(
    createListCacheProbe({ ...services(), normalizeHexPubkey: normalize, activePubkey: "" })(),
    false,
  );
  assert.equal(
    createListCacheProbe({ normalizeHexPubkey: normalize, activePubkey: PUB })(),
    false,
  );
});

test("waiter resolves 'cache' once caches hydrate (late flip)", async () => {
  const state = { ready: false };
  setTimeout(() => {
    state.ready = true;
  }, 15);
  const result = await waitForListCaches(() => state.ready, {
    timeoutMs: 500,
    intervalMs: 5,
  });
  assert.equal(result, "cache");
});

test("waiter resolves null at timeout when caches never hydrate (cold boot)", async () => {
  const result = await waitForListCaches(() => false, {
    timeoutMs: 40,
    intervalMs: 5,
  });
  assert.equal(result, null);
});

test("a throwing probe is treated as not-ready (never breaks the gate)", async () => {
  const result = await waitForListCaches(
    () => {
      throw new Error("boom");
    },
    { timeoutMs: 30, intervalMs: 5 },
  );
  assert.equal(result, null);
});
