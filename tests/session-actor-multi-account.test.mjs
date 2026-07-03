// Per-account nsec key storage: several saved accounts each keep their own
// encrypted key on the device so the profile switcher can move between them.
// Before this, a single slot (bitvid:sessionActor:v1) meant only the last-saved
// key survived, so switching among saved nsec accounts silently failed.
//
// test_integrity_note:
//   change_type: ["new_tests", "spec_correction"]
//   scenarios:
//     - id: SCN-nsec-multi-account-storage
//       given: "two nsec accounts each persist their encrypted key"
//       when: "the store is read by a specific pubkey / cleared for one account"
//       then: "each account resolves its own key; clearing one keeps the other"
//   observable_outcomes:
//     - "readStoredSessionActorEntry(pubkey) returns that account's ciphertext"
//     - "clearStoredSessionActor(pubkey) removes only the named account"
//     - "the legacy v1 single slot migrates into the per-pubkey map on read"
//   determinism_controls:
//     - "in-memory localStorage polyfill; no network/clock dependence"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test, { beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  persistSessionActor,
  readStoredSessionActorEntry,
  clearStoredSessionActor,
  listStoredSessionActorPubkeys,
  SESSION_ACTOR_STORAGE_KEY,
  SESSION_ACTORS_MAP_STORAGE_KEY,
} from "../js/nostr/sessionActor.js";

const PUB_A =
  "00000000000000000000000000000000000000000000000000000000000000a1";
const PUB_B =
  "00000000000000000000000000000000000000000000000000000000000000b2";

function actor(pubkey, cipher) {
  return {
    pubkey,
    privateKeyEncrypted: cipher,
    encryption: { salt: "c2FsdA==", iv: "aXY=", iterations: 1000, hash: "SHA-256" },
    createdAt: 1700000000000,
  };
}

beforeEach(() => {
  localStorage.clear();
});

test("each saved account resolves its own encrypted key", () => {
  persistSessionActor(actor(PUB_A, "cipher-A"));
  persistSessionActor(actor(PUB_B, "cipher-B"));

  assert.equal(readStoredSessionActorEntry(PUB_A).privateKeyEncrypted, "cipher-A");
  assert.equal(readStoredSessionActorEntry(PUB_B).privateKeyEncrypted, "cipher-B");
  // Never leak plaintext through the read path.
  assert.equal(readStoredSessionActorEntry(PUB_A).privateKey, "");
});

test("lists every account that has a stored key", () => {
  persistSessionActor(actor(PUB_A, "cipher-A"));
  persistSessionActor(actor(PUB_B, "cipher-B"));
  assert.deepEqual(listStoredSessionActorPubkeys().sort(), [PUB_A, PUB_B].sort());
});

test("clearing one account keeps the others switchable", () => {
  persistSessionActor(actor(PUB_A, "cipher-A"));
  persistSessionActor(actor(PUB_B, "cipher-B"));

  clearStoredSessionActor(PUB_A);

  assert.equal(readStoredSessionActorEntry(PUB_A), null);
  assert.equal(readStoredSessionActorEntry(PUB_B).privateKeyEncrypted, "cipher-B");
});

test("no-arg read returns the last-saved account as the default", () => {
  persistSessionActor(actor(PUB_A, "cipher-A"));
  persistSessionActor(actor(PUB_B, "cipher-B"));
  assert.equal(readStoredSessionActorEntry().privateKeyEncrypted, "cipher-B");
});

// spec_correction: the previous test asserted "no-arg clear wipes every stored
// account (logout)". That encoded a bug: the no-arg clear is reached from
// per-account paths (SignerManager.logout's non-persisted-nsec cleanup, the
// blocked-key cleanup in registerPrivateKeySigner), so logging out ONE account
// silently destroyed every OTHER saved account's remembered key and broke
// switching back to them — the same bug class as the NIP-46 session-map wipe.
// Correct behavior: no-arg clears only the legacy v1 "last saved" slot; the
// per-account v2 map survives. Forgetting a specific account uses the targeted
// clearStoredSessionActor(pubkey) (tested above).
test("no-arg clear drops the legacy v1 slot but KEEPS per-account saved keys", () => {
  persistSessionActor(actor(PUB_A, "cipher-A"));
  persistSessionActor(actor(PUB_B, "cipher-B"));

  clearStoredSessionActor(); // e.g. one account's logout cleanup

  // Both accounts remain switchable — their remembered keys survive.
  assert.deepEqual(listStoredSessionActorPubkeys().sort(), [PUB_A, PUB_B].sort());
  assert.equal(readStoredSessionActorEntry(PUB_A).privateKeyEncrypted, "cipher-A");
  assert.equal(readStoredSessionActorEntry(PUB_B).privateKeyEncrypted, "cipher-B");
  // The legacy single-slot default is gone.
  assert.equal(localStorage.getItem(SESSION_ACTOR_STORAGE_KEY), null);
});

test("a legacy v1 single-slot entry migrates into the per-pubkey map", () => {
  // Simulate an install that only ever had the old single slot.
  localStorage.setItem(
    SESSION_ACTOR_STORAGE_KEY,
    JSON.stringify({
      pubkey: PUB_A,
      privateKeyEncrypted: "legacy-cipher",
      encryption: { salt: "c2FsdA==", iv: "aXY=", iterations: 1000, hash: "SHA-256" },
      createdAt: 1699999999000,
    }),
  );
  assert.equal(localStorage.getItem(SESSION_ACTORS_MAP_STORAGE_KEY), null);

  // Reading by the account's pubkey works and seeds the v2 map.
  assert.equal(readStoredSessionActorEntry(PUB_A).privateKeyEncrypted, "legacy-cipher");
  assert.deepEqual(listStoredSessionActorPubkeys(), [PUB_A]);

  // A second account can now be added alongside the migrated one.
  persistSessionActor(actor(PUB_B, "cipher-B"));
  assert.equal(readStoredSessionActorEntry(PUB_A).privateKeyEncrypted, "legacy-cipher");
  assert.equal(readStoredSessionActorEntry(PUB_B).privateKeyEncrypted, "cipher-B");
});

test("requesting an account with no stored key returns null (not a wrong one)", () => {
  persistSessionActor(actor(PUB_A, "cipher-A"));
  assert.equal(readStoredSessionActorEntry(PUB_B), null);
});
