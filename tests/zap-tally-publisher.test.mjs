// Publishing side of the bitvid zap tally (docs/zap-tally-plan.md §5.4-5.5):
// each settled zap share becomes one payer-signed tally, built from its own
// invoice/preimage/zap-request. Best-effort — a publish failure must not throw.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-zap-tally-publish
//       given: "settled zap shares (with/without a decodable bolt11 or preimage) and an injected publisher"
//       when: "buildTallyFromShare / publishZapTallies run"
//       then: "a verifiable tally is built + published per settleable share; unpublishable shares are skipped; a publish throw is swallowed; disabled → nothing published"
//   observable_outcomes:
//     - "built event kind/tags (d=payment_hash, p/e/a, bolt11, preimage, description)"
//     - "published count; publish() called once per settleable share"
//   determinism_controls:
//     - "in-test bech32 bolt11 vector; injected publish(); no network"
//   anti_cheat_rationale:
//     prevents: ["over-mocking internal logic", "hard-coded return value"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import { bech32 } from "../vendor/crypto-helpers.bundle.min.js";
import {
  buildTallyFromShare,
  publishZapTallies,
} from "../js/payments/zapTallyPublisher.js";
import { ZAP_TALLY_KIND } from "../js/nostrEventSchemas.js";

const PUB = "a".repeat(64);
const CREATOR = "b".repeat(64);
const EVENT_ID = "e".repeat(64);
const COORD = `30078:${CREATOR}:vid-1`;

// Minimal valid bolt11 carrying a known payment_hash (bech32 'p' field = code 1).
const lenWords = (n) => [n >> 5, n & 31];
function makeBolt11(paymentHashBytes) {
  const pWords = bech32.toWords(paymentHashBytes);
  const words = [
    0, 0, 0, 0, 0, 0, 0,
    1, ...lenWords(pWords.length), ...pWords,
    ...new Array(104).fill(0),
  ];
  return bech32.encode("lnbc", words, 2000);
}
const BOLT11 = makeBolt11(new Uint8Array(32).fill(0x11));

const zapRequestJson = JSON.stringify({
  kind: 9734,
  pubkey: PUB,
  tags: [
    ["p", CREATOR],
    ["e", EVENT_ID],
    ["a", COORD],
    ["amount", "2100000"],
  ],
  content: "",
});

const goodShare = {
  recipientType: "creator",
  amountSats: 2100,
  bolt11: BOLT11,
  preimage: "cd".repeat(32),
  zapRequest: zapRequestJson,
};

test("buildTallyFromShare: builds an addressable, proof-carrying tally", () => {
  const event = buildTallyFromShare({ share: goodShare, pubkey: PUB, now: () => 1000 });
  assert.ok(event);
  assert.equal(event.kind, ZAP_TALLY_KIND);
  const tag = (n) => event.tags.find((t) => t[0] === n);
  assert.equal(tag("d")[1], "11".repeat(32), "d = payment_hash from the bolt11");
  assert.deepEqual(tag("p"), ["p", CREATOR]);
  assert.deepEqual(tag("e"), ["e", EVENT_ID]);
  assert.deepEqual(tag("a"), ["a", COORD]);
  assert.equal(tag("bolt11")[1], BOLT11);
  assert.equal(tag("preimage")[1], "cd".repeat(32));
  assert.ok(tag("description"), "embeds the zap request");
});

test("buildTallyFromShare: skips shares that can't be made verifiable", () => {
  assert.equal(buildTallyFromShare({ share: { ...goodShare, preimage: "" }, pubkey: PUB }), null);
  assert.equal(buildTallyFromShare({ share: { ...goodShare, bolt11: "not-bolt11" }, pubkey: PUB }), null, "undecodable bolt11 → no payment_hash");
  assert.equal(buildTallyFromShare({ share: { ...goodShare, zapRequest: "" }, pubkey: PUB }), null);
  assert.equal(buildTallyFromShare({ share: goodShare, pubkey: "" }), null);
});

test("publishZapTallies: one publish per settleable share; unpublishable skipped", async () => {
  const published = [];
  const result = await publishZapTallies({
    shares: [goodShare, { ...goodShare, preimage: "" }, { ...goodShare, amountSats: 42 }],
    pubkey: PUB,
    enabled: true,
    publish: async (event) => {
      published.push(event);
    },
  });
  assert.equal(result.published, 2, "two settleable shares published, the no-preimage one skipped");
  assert.equal(published.length, 2);
  assert.ok(published.every((e) => e.kind === ZAP_TALLY_KIND));
});

test("publishZapTallies: a publish failure is swallowed (payment already settled)", async () => {
  const result = await publishZapTallies({
    shares: [goodShare],
    pubkey: PUB,
    enabled: true,
    publish: async () => {
      throw new Error("relay down");
    },
  });
  assert.equal(result.published, 0, "no throw; count reflects the failure");
});

test("publishZapTallies: disabled → nothing published", async () => {
  let calls = 0;
  const result = await publishZapTallies({
    shares: [goodShare],
    pubkey: PUB,
    enabled: false,
    publish: async () => {
      calls += 1;
    },
  });
  assert.equal(result.published, 0);
  assert.equal(calls, 0);
});
