// The account-switch / reload signer gate (app.ensureEncryptionCapableSigner)
// decides whether a signing/encryption action can proceed, must fail, or should
// prompt the user to re-unlock a persisted nsec key. decideSignerEnsure is the
// pure branching behind it (TODO #51/#54/#56/#57).
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-signer-ensure-decision
//       given: "current signer capabilities + whether a locked nsec key exists"
//       when: "decideSignerEnsure runs"
//       then: "ok when capable, prompt when recoverable, fail with a precise reason otherwise"
//   observable_outcomes:
//     - "capable encrypt signer -> {action:ok}"
//     - "no signer + no pubkey -> fail:no-signer"
//     - "incapable + no stored key -> fail:no-stored-key"
//     - "incapable + stored key for a DIFFERENT pubkey -> fail:pubkey-mismatch"
//     - "incapable + matching locked key -> prompt"
//     - "need:sign only requires signEvent (nip44/nip04 not required)"
//   determinism_controls:
//     - "pure function; explicit inputs; injected normalizePubkey"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  decideSignerEnsure,
  isSignerCapable,
} from "../js/nostr/ensureSignerDecision.js";

const PUB = "a".repeat(64);
const OTHER = "b".repeat(64);
const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");

test("capable encrypt-signer proceeds", () => {
  const d = decideSignerEnsure({
    capabilities: { sign: true, nip44: true, nip04: false },
    need: "encrypt",
    normalizedPubkey: PUB,
    storedKeyMeta: { hasEncryptedKey: true, pubkey: PUB },
    normalizePubkey: norm,
  });
  assert.deepEqual(d, { action: "ok" });
});

test("nip04-only signer is still encrypt-capable", () => {
  assert.equal(isSignerCapable({ sign: true, nip04: true }, "encrypt"), true);
});

test("a sign-only signer is NOT encrypt-capable but IS sign-capable", () => {
  const caps = { sign: true, nip44: false, nip04: false };
  assert.equal(isSignerCapable(caps, "encrypt"), false);
  assert.equal(isSignerCapable(caps, "sign"), true);
  // need:sign proceeds even without any encryption method
  assert.deepEqual(
    decideSignerEnsure({
      capabilities: caps,
      need: "sign",
      normalizedPubkey: PUB,
      storedKeyMeta: { hasEncryptedKey: true, pubkey: PUB },
      normalizePubkey: norm,
    }),
    { action: "ok" },
  );
});

test("no signer and no pubkey -> fail:no-signer", () => {
  const d = decideSignerEnsure({
    capabilities: { sign: false },
    need: "encrypt",
    normalizedPubkey: "",
    storedKeyMeta: null,
    normalizePubkey: norm,
  });
  assert.deepEqual(d, { action: "fail", reason: "no-signer" });
});

test("incapable but no stored nsec key -> fail:no-stored-key (caller surfaces its own error)", () => {
  const d = decideSignerEnsure({
    capabilities: { sign: false },
    need: "encrypt",
    normalizedPubkey: PUB,
    storedKeyMeta: null,
    normalizePubkey: norm,
  });
  assert.deepEqual(d, { action: "fail", reason: "no-stored-key" });
});

test("stored key belongs to a DIFFERENT account -> fail:pubkey-mismatch (never unlock the wrong key)", () => {
  const d = decideSignerEnsure({
    capabilities: { sign: false },
    need: "encrypt",
    normalizedPubkey: PUB,
    storedKeyMeta: { hasEncryptedKey: true, pubkey: OTHER },
    normalizePubkey: norm,
  });
  assert.deepEqual(d, { action: "fail", reason: "pubkey-mismatch" });
});

test("incapable + matching locked nsec key -> prompt to re-unlock", () => {
  const d = decideSignerEnsure({
    capabilities: { sign: true, nip44: false, nip04: false },
    need: "encrypt",
    normalizedPubkey: PUB,
    storedKeyMeta: { hasEncryptedKey: true, pubkey: PUB },
    normalizePubkey: norm,
  });
  assert.deepEqual(d, { action: "prompt" });
});

test("stored key with no pubkey field still prompts (metadata may omit it)", () => {
  const d = decideSignerEnsure({
    capabilities: { sign: false },
    need: "encrypt",
    normalizedPubkey: PUB,
    storedKeyMeta: { hasEncryptedKey: true },
    normalizePubkey: norm,
  });
  assert.deepEqual(d, { action: "prompt" });
});

test("hasEncryptedKey must be strictly true (a falsey/omitted flag never prompts)", () => {
  const d = decideSignerEnsure({
    capabilities: { sign: false },
    need: "encrypt",
    normalizedPubkey: PUB,
    storedKeyMeta: { hasEncryptedKey: "yes", pubkey: PUB },
    normalizePubkey: norm,
  });
  assert.deepEqual(d, { action: "fail", reason: "no-stored-key" });
});
