// #47 "Most Zapped": per-video zap totals aggregated from kind-9735 receipts.
// Covers the amount extraction (bolt11 first, zap-request amount fallback),
// the batched store (request → scheduled fetch → totals; receipt dedupe;
// zero-receipt answers cached; change signal), and the feed sorter that ranks
// by the injected zap total.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-zap-total-aggregation
//       given: "a fake relay pool returning scripted 9735 receipts for requested #a/#e pointers"
//       when: "pointers are requested and the batch flushes"
//       then: "totals sum per pointer, duplicate receipt ids never double-count, empty answers cache as 0, listeners fire"
//     - id: SCN-most-zapped-sorter
//       given: "feed items with differing zap totals / authors / mute states"
//       when: "createMostZappedSorter runs"
//       then: "sats desc, recency tie-break, trusted-muted sink last"
//   observable_outcomes:
//     - "getSnapshot/request return the summed sats"
//     - "sorted order of feed items"
//   determinism_controls:
//     - "injected now/schedule; manual flush(); no timers or sockets"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import { strict as assert } from "node:assert";
import {
  createZapTotalsStore,
  extractReceiptAmountSats,
  pointerKey,
  ZAP_RECEIPT_KIND,
} from "../js/zapTotals.js";
import { createMostZappedSorter } from "../js/feedEngine/sorters.js";

const A1 = "30078:aaaa:video-1";
const A2 = "30078:bbbb:video-2";

const receipt = (id, tags) => ({ id, kind: ZAP_RECEIPT_KIND, tags });

test("amount extraction: bolt11 first, zap-request amount fallback, garbage → 0", () => {
  const tools = {
    nip57: { getSatoshisAmountFromBolt11: (b) => (b === "lnbc210n1..." ? 21 : NaN) },
  };
  assert.equal(
    extractReceiptAmountSats(receipt("r1", [["bolt11", "lnbc210n1..."]]), tools),
    21,
  );
  // bolt11 unparseable → embedded zap request amount (msats → sats)
  const description = JSON.stringify({ tags: [["amount", "50000"]] });
  assert.equal(
    extractReceiptAmountSats(
      receipt("r2", [["bolt11", "garbage"], ["description", description]]),
      tools,
    ),
    50,
  );
  assert.equal(extractReceiptAmountSats(receipt("r3", []), tools), 0);
  assert.equal(
    extractReceiptAmountSats(receipt("r4", [["description", "not json"]]), tools),
    0,
  );
});

test("pointerKey accepts BOTH app shapes and rejects unusable pointers", () => {
  // Tag-style ARRAY — what deriveVideoPointerInfo/resolveVideoPointer actually
  // produce (regression: the object-only version silently zeroed every card
  // badge and the Most Zapped ranking).
  assert.equal(pointerKey(["a", A1]), `a:${A1}`);
  assert.equal(pointerKey(["e", "evt1", "wss://relay.example"]), "e:evt1");
  assert.equal(pointerKey(["x", "nope"]), "");
  // Object form.
  assert.equal(pointerKey({ type: "a", value: A1 }), `a:${A1}`);
  assert.equal(pointerKey({ type: "e", value: "evt1" }), "e:evt1");
  assert.equal(pointerKey({ type: "x", value: "nope" }), "");
  assert.equal(pointerKey(null), "");
});

function makeStore({ receipts = [], now = () => 1000 } = {}) {
  const listCalls = [];
  const scheduled = [];
  const store = createZapTotalsStore({
    now,
    getTools: () => ({ nip57: { getSatoshisAmountFromBolt11: () => NaN } }),
    getClient: () => ({
      relays: ["wss://relay.example"],
      getSubscriptionManager: () => ({
        list: async ({ relays, filters }) => {
          listCalls.push({ relays, filters });
          return receipts;
        },
      }),
    }),
    schedule: (fn) => {
      scheduled.push(fn);
      return 1;
    },
  });
  return { store, listCalls, scheduled };
}

const amountTag = (msats) => [
  "description",
  JSON.stringify({ tags: [["amount", String(msats)]] }),
];

test("batched fetch sums receipts per pointer and dedupes by receipt id", async () => {
  const { store, listCalls } = makeStore({
    receipts: [
      receipt("r1", [["a", A1], amountTag(21000)]),
      receipt("r2", [["a", A1], amountTag(100000)]),
      receipt("r3", [["a", A2], amountTag(5000)]),
      receipt("r3", [["a", A2], amountTag(5000)]), // duplicate id — ignored
    ],
  });

  assert.equal(store.request({ type: "a", value: A1 }), 0, "cold cache reads 0");
  store.request({ type: "a", value: A2 });
  await store.flush();

  assert.equal(store.getSnapshot({ type: "a", value: A1 }), 121);
  assert.equal(store.getSnapshot({ type: "a", value: A2 }), 5);
  assert.equal(listCalls.length, 1, "one batched fetch for both pointers");
  assert.equal(
    listCalls[0].filters[0]["#a"].length,
    2,
    "both pointers in one #a filter",
  );
});

test("zero-receipt answers are cached (no immediate refetch) and listeners fire", async () => {
  let t = 1000;
  const { store, listCalls, scheduled } = makeStore({ receipts: [], now: () => t });
  let changes = 0;
  store.onChange(() => {
    changes += 1;
  });

  store.request({ type: "e", value: "evt1" });
  await store.flush();
  assert.equal(changes, 1, "an answered batch notifies even when empty");
  assert.equal(store.getSnapshot({ type: "e", value: "evt1" }), 0);

  const schedulesBefore = scheduled.length;
  store.request({ type: "e", value: "evt1" });
  assert.equal(scheduled.length, schedulesBefore, "fresh zero answer is not refetched");
  assert.equal(listCalls.length, 1);

  // After the TTL, the same pointer refetches.
  t += 10 * 60 * 1000;
  store.request({ type: "e", value: "evt1" });
  assert.equal(scheduled.length, schedulesBefore + 1, "stale entry schedules again");
});

test("most-zapped sorter: sats desc, recency tie-break, muted sinks", () => {
  const item = (id, author, sats, createdAt, muted = false) => ({
    video: { id, pubkey: author, created_at: createdAt },
    metadata: muted ? { moderation: { trustedMuted: true } } : {},
    sats,
  });
  const items = [
    item("low", "a1", 5, 300),
    item("high", "a2", 500, 100),
    item("tie-new", "a3", 50, 200),
    item("tie-old", "a4", 50, 100),
    item("muted-whale", "a5", 9999, 400, true),
  ];
  const sorter = createMostZappedSorter();
  const sorted = sorter(items, { runtime: { getZapTotal: (video) => items.find((i) => i.video === video)?.sats || 0 } });
  assert.deepEqual(
    sorted.map((entry) => entry.video.id),
    ["high", "tie-new", "tie-old", "low", "muted-whale"],
    "sats desc, newer wins ties, trusted-muted last regardless of sats",
  );
});
