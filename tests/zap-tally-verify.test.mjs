// Foundation for the bitvid-native zap tally (docs/zap-tally-plan.md §3):
// the payer-signed, preimage-verified stand-in for a NIP-57 receipt. These
// cover the security core — a tally is only counted if the invoice was really
// paid (sha256(preimage)===payment_hash) AND that payment was bound to this
// zap request (description_hash===sha256(zapRequest), the replay guard) — plus
// the bolt11 field decode and the event builder's tag shape.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-zap-tally-verify
//       given: "a tally event with a bolt11/preimage/zap-request, valid or tampered"
//       when: "verifyBitvidZapTally / verifyPaymentPreimage / extractBolt11Fields run"
//       then: "valid → ok+sats+pointers from the embedded request; bad preimage or mismatched description hash (replay) → rejected; amount is bolt11-derived not tag-claimed"
//   observable_outcomes:
//     - "verifyPaymentPreimage true only when sha256(preimage)===payment_hash"
//     - "extractBolt11Fields round-trips a bech32-encoded p/h field to hex"
//     - "verifyBitvidZapTally ok/sats/pointerTags per tamper case"
//     - "buildZapTallyEvent emits d(payment_hash)/p/e/a/amount/bolt11/preimage/description"
//   determinism_controls:
//     - "sha256 via node:crypto; bech32 vector constructed in-test; no network"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import { createHash, randomBytes } from "node:crypto";
import { bech32, bytesToHex } from "../vendor/crypto-helpers.bundle.min.js";
import {
  extractBolt11Fields,
  verifyPaymentPreimage,
  verifyBitvidZapTally,
} from "../js/payments/zapReceiptValidator.js";
import { buildZapTallyEvent, ZAP_TALLY_KIND } from "../js/nostrEventSchemas.js";

const sha256hex = (input) =>
  createHash("sha256")
    .update(typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input))
    .digest("hex");

// --- verifyPaymentPreimage ---------------------------------------------------

test("verifyPaymentPreimage: true only when sha256(preimage)===payment_hash", () => {
  const preimage = randomBytes(32);
  const preimageHex = preimage.toString("hex");
  const paymentHash = sha256hex(preimage);

  assert.equal(verifyPaymentPreimage(preimageHex, paymentHash), true);
  assert.equal(verifyPaymentPreimage(preimageHex, "0".repeat(64)), false, "wrong hash");
  assert.equal(verifyPaymentPreimage("ab", paymentHash), false, "preimage not 32 bytes");
  assert.equal(verifyPaymentPreimage(preimageHex, "not-hex"), false);
  assert.equal(verifyPaymentPreimage("", paymentHash), false);
});

// --- extractBolt11Fields (bech32 round-trip, no external vector) --------------

// bech32 charset positions are the bolt11 tagged-field type codes: p=1, h=23.
const lenWords = (n) => [n >> 5, n & 31];

function makeBolt11({ paymentHash, descriptionHash }) {
  const pWords = bech32.toWords(paymentHash); // 32 bytes -> 52 words
  const hWords = bech32.toWords(descriptionHash);
  const words = [
    0, 0, 0, 0, 0, 0, 0, // 35-bit timestamp
    1, ...lenWords(pWords.length), ...pWords, // 'p' payment_hash
    23, ...lenWords(hWords.length), ...hWords, // 'h' description_hash
    ...new Array(104).fill(0), // 520-bit signature placeholder
  ];
  return bech32.encode("lnbc", words, 2000);
}

test("extractBolt11Fields decodes payment_hash + description_hash from a bolt11", () => {
  const paymentHash = new Uint8Array(32).fill(0xab);
  const descriptionHash = new Uint8Array(32).fill(0xcd);
  const invoice = makeBolt11({ paymentHash, descriptionHash });

  const fields = extractBolt11Fields(invoice);
  assert.equal(fields.paymentHash, bytesToHex(paymentHash));
  assert.equal(fields.descriptionHash, bytesToHex(descriptionHash));

  assert.deepEqual(extractBolt11Fields(""), { paymentHash: null, descriptionHash: null });
  assert.deepEqual(extractBolt11Fields("not-an-invoice"), {
    paymentHash: null,
    descriptionHash: null,
  });
});

// --- verifyBitvidZapTally (decision logic; fields injected) -------------------

const PUB = "a".repeat(64);
const CREATOR = "b".repeat(64);
const EVENT_ID = "e".repeat(64);
const COORD = `30078:${CREATOR}:vid-1`;

function makeTally({ preimageHex, zapRequestJson, bolt11 = "lnbcTEST" }) {
  return buildZapTallyEvent({
    pubkey: PUB,
    created_at: 1000,
    paymentHash: sha256hex(Buffer.from(preimageHex, "hex")),
    recipientPubkey: CREATOR,
    eventId: EVENT_ID,
    coordinate: COORD,
    amountMsats: 2100000,
    bolt11,
    preimage: preimageHex,
    zapRequestJson,
  });
}

function zapRequestJson({ amount = 2100000 } = {}) {
  return JSON.stringify({
    kind: 9734,
    pubkey: PUB,
    tags: [
      ["p", CREATOR],
      ["e", EVENT_ID],
      ["a", COORD],
      ["amount", String(amount)],
    ],
    content: "",
  });
}

test("verifyBitvidZapTally: valid tally → ok, bolt11-derived sats, request pointers", () => {
  const preimageHex = randomBytes(32).toString("hex");
  const reqJson = zapRequestJson();
  const event = makeTally({ preimageHex, zapRequestJson: reqJson });

  const inject = {
    getSats: () => 2100, // authoritative amount from the bolt11 (2100 sats)
    extractFields: () => ({
      paymentHash: sha256hex(Buffer.from(preimageHex, "hex")),
      descriptionHash: sha256hex(reqJson),
    }),
  };
  const result = verifyBitvidZapTally(event, inject);
  assert.equal(result.ok, true);
  assert.equal(result.sats, 2100, "sats from bolt11, not the amount tag");
  assert.ok(result.paymentHash);
  // Pointers come from the embedded (hash-bound) zap request.
  const kinds = result.pointerTags.map((t) => t[0]).sort();
  assert.deepEqual(kinds, ["a", "e", "p"]);
});

test("verifyBitvidZapTally: bad preimage → rejected", () => {
  const preimageHex = randomBytes(32).toString("hex");
  const reqJson = zapRequestJson();
  const event = makeTally({ preimageHex, zapRequestJson: reqJson });
  const result = verifyBitvidZapTally(event, {
    getSats: () => 2100,
    extractFields: () => ({
      paymentHash: "f".repeat(64), // does NOT match sha256(preimage)
      descriptionHash: sha256hex(reqJson),
    }),
  });
  assert.equal(result.ok, false);
});

test("verifyBitvidZapTally: mismatched description hash (replay) → rejected", () => {
  const preimageHex = randomBytes(32).toString("hex");
  const reqJson = zapRequestJson();
  const event = makeTally({ preimageHex, zapRequestJson: reqJson });
  // A leaked preimage retargeted to a DIFFERENT request: description_hash no
  // longer matches the embedded zap request → binding check fails.
  const result = verifyBitvidZapTally(event, {
    getSats: () => 2100,
    extractFields: () => ({
      paymentHash: sha256hex(Buffer.from(preimageHex, "hex")),
      descriptionHash: sha256hex(zapRequestJson({ amount: 999999 })), // different request
    }),
  });
  assert.equal(result.ok, false, "cannot reuse a preimage for another zap request");
});

test("verifyBitvidZapTally: zero/undecodable sats → rejected; missing proof → rejected", () => {
  const preimageHex = randomBytes(32).toString("hex");
  const reqJson = zapRequestJson();
  const event = makeTally({ preimageHex, zapRequestJson: reqJson });
  assert.equal(
    verifyBitvidZapTally(event, {
      getSats: () => 0,
      extractFields: () => ({
        paymentHash: sha256hex(Buffer.from(preimageHex, "hex")),
        descriptionHash: sha256hex(reqJson),
      }),
    }).ok,
    false,
  );
  assert.equal(verifyBitvidZapTally({ tags: [] }).ok, false, "no bolt11/preimage");
  assert.equal(verifyBitvidZapTally(null).ok, false);
});

// --- buildZapTallyEvent ------------------------------------------------------

test("buildZapTallyEvent: addressable by payment_hash + carries the proof tags", () => {
  const event = buildZapTallyEvent({
    pubkey: PUB,
    created_at: 1000,
    paymentHash: "ab".repeat(32),
    recipientPubkey: CREATOR,
    eventId: EVENT_ID,
    coordinate: COORD,
    amountMsats: 2100000,
    bolt11: "lnbc21u1...",
    preimage: "cd".repeat(32),
    zapRequestJson: zapRequestJson(),
  });
  assert.equal(event.kind, ZAP_TALLY_KIND);
  const tag = (name) => event.tags.find((t) => t[0] === name);
  assert.deepEqual(tag("d"), ["d", "ab".repeat(32)], "d = payment_hash (addressable idempotency)");
  assert.deepEqual(tag("p"), ["p", CREATOR]);
  assert.deepEqual(tag("e"), ["e", EVENT_ID]);
  assert.deepEqual(tag("a"), ["a", COORD]);
  assert.equal(tag("bolt11")[1], "lnbc21u1...");
  assert.equal(tag("preimage")[1], "cd".repeat(32));
  assert.ok(tag("description"), "embeds the zap request");
  assert.deepEqual(tag("client"), ["client", "bitvid"]);
});

// End-to-end with the REAL verifier + a REAL amount-bearing bolt11: proves the
// pieces compose (no injected extractFields/getSats). The invoice encodes an
// amount (lnbc21u = 2100 sats), a payment_hash = sha256(preimage), and a
// description_hash = sha256(zap request); the real nip57 amount parser reads it.
test("verifyBitvidZapTally: accepts a fully valid tally end to end (real decode + amount)", async () => {
  const { nip57 } = await import("nostr-tools");
  const preimage = randomBytes(32);
  const preimageHex = preimage.toString("hex");
  const paymentHashBytes = createHash("sha256").update(preimage).digest();
  const reqJson = zapRequestJson();
  const descHashBytes = createHash("sha256").update(Buffer.from(reqJson, "utf8")).digest();

  const pWords = bech32.toWords(new Uint8Array(paymentHashBytes));
  const hWords = bech32.toWords(new Uint8Array(descHashBytes));
  const words = [
    0, 0, 0, 0, 0, 0, 0,
    1, ...lenWords(pWords.length), ...pWords, // 'p' payment_hash
    23, ...lenWords(hWords.length), ...hWords, // 'h' description_hash
    ...new Array(104).fill(0),
  ];
  const bolt11 = bech32.encode("lnbc21u", words, 2000); // 21 micro-BTC = 2100 sats

  const event = buildZapTallyEvent({
    pubkey: PUB,
    created_at: 1000,
    paymentHash: paymentHashBytes.toString("hex"),
    recipientPubkey: CREATOR,
    eventId: EVENT_ID,
    coordinate: COORD,
    amountMsats: 2100000,
    bolt11,
    preimage: preimageHex,
    zapRequestJson: reqJson,
  });

  const result = verifyBitvidZapTally(event, {
    getSats: nip57.getSatoshisAmountFromBolt11, // real parser, no injection of fields
  });
  assert.equal(result.ok, true, "real verifier accepts a genuinely valid tally");
  assert.equal(result.sats, 2100, "amount parsed from the real bolt11 hrp");
  assert.equal(result.paymentHash, paymentHashBytes.toString("hex"));
});

test("buildZapTallyEvent: profile-only zap has p but no a/e", () => {
  const event = buildZapTallyEvent({
    pubkey: PUB,
    created_at: 1000,
    paymentHash: "ab".repeat(32),
    recipientPubkey: CREATOR,
    amountMsats: 1000,
    bolt11: "lnbc10n1...",
    preimage: "cd".repeat(32),
    zapRequestJson: JSON.stringify({ kind: 9734, tags: [["p", CREATOR]] }),
  });
  assert.ok(event.tags.find((t) => t[0] === "p"));
  assert.equal(event.tags.find((t) => t[0] === "e"), undefined);
  assert.equal(event.tags.find((t) => t[0] === "a"), undefined);
});
