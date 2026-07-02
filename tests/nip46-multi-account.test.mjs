// Per-account NIP-46 remote-signer session storage: several saved NIP-46
// accounts each keep their own reconnectable session so the profile switcher
// can move between them. Before this, a single slot (bitvid:nip46:session:v1)
// meant only the last-connected session survived, so switching among saved
// NIP-46 accounts silently reconnected the wrong one (or failed).
//
// test_integrity_note:
//   change_type: ["new_tests", "spec_correction"]
//   scenarios:
//     - id: SCN-nip46-multi-account-storage
//       given: "two NIP-46 accounts each persist a stored session"
//       when: "the store is read by user pubkey / cleared for one account"
//       then: "each account resolves its own session; clearing one keeps the other"
//   observable_outcomes:
//     - "readStoredNip46Session(pubkey) returns that account's remotePubkey/relays"
//     - "clearStoredNip46Session(pubkey) removes only the named account"
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
  writeStoredNip46SessionSync,
  readStoredNip46Session,
  clearStoredNip46Session,
  listStoredNip46SessionPubkeys,
} from "../js/nostr/nip46Client.js";

const USER_A =
  "00000000000000000000000000000000000000000000000000000000000000a1";
const USER_B =
  "00000000000000000000000000000000000000000000000000000000000000b2";
const REMOTE_A =
  "1111111111111111111111111111111111111111111111111111111111111111";
const REMOTE_B =
  "2222222222222222222222222222222222222222222222222222222222222222";
const NIP46_SESSION_STORAGE_KEY = "bitvid:nip46:session:v1";
const NIP46_SESSIONS_MAP_STORAGE_KEY = "bitvid:nip46:sessions:v2";

function session(userPubkey, remotePubkey, relay) {
  return {
    version: 1,
    clientPublicKey:
      "3333333333333333333333333333333333333333333333333333333333333333",
    remotePubkey,
    relays: [relay],
    encryption: "nip44.v2",
    userPubkey,
    lastConnectedAt: 1700000000000,
    encryptedSecrets: "cipher",
    keyEncryption: { salt: "c2FsdA==", iv: "aXY=", iterations: 1000, hash: "SHA-256" },
  };
}

beforeEach(() => {
  localStorage.clear();
});

test("each saved account resolves its own session", () => {
  writeStoredNip46SessionSync(session(USER_A, REMOTE_A, "wss://a.example"));
  writeStoredNip46SessionSync(session(USER_B, REMOTE_B, "wss://b.example"));

  assert.equal(readStoredNip46Session(USER_A).remotePubkey, REMOTE_A);
  assert.equal(readStoredNip46Session(USER_B).remotePubkey, REMOTE_B);
  assert.deepEqual(readStoredNip46Session(USER_A).relays, ["wss://a.example"]);
});

test("lists every account that has a stored session", () => {
  writeStoredNip46SessionSync(session(USER_A, REMOTE_A, "wss://a.example"));
  writeStoredNip46SessionSync(session(USER_B, REMOTE_B, "wss://b.example"));
  assert.deepEqual(listStoredNip46SessionPubkeys().sort(), [USER_A, USER_B].sort());
});

test("clearing one account keeps the others reconnectable", () => {
  writeStoredNip46SessionSync(session(USER_A, REMOTE_A, "wss://a.example"));
  writeStoredNip46SessionSync(session(USER_B, REMOTE_B, "wss://b.example"));

  clearStoredNip46Session(USER_A);

  assert.equal(readStoredNip46Session(USER_A), null);
  assert.equal(readStoredNip46Session(USER_B).remotePubkey, REMOTE_B);
});

test("no-arg read returns the last-connected account as the default", () => {
  writeStoredNip46SessionSync(session(USER_A, REMOTE_A, "wss://a.example"));
  writeStoredNip46SessionSync(session(USER_B, REMOTE_B, "wss://b.example"));
  assert.equal(readStoredNip46Session().remotePubkey, REMOTE_B);
});

// spec_correction: the previous test asserted "no-arg clear wipes every stored
// session (logout)". That encoded a bug: the no-arg clear is invoked from
// connection-teardown / connect-error paths (disconnectRemoteSigner, handshake
// failures) — NOT only an explicit logout. Wiping the whole per-account map there
// deleted EVERY saved account's session, so switching away from a NIP-46 account
// (e.g. to an nsec account) then made switching back fail with "No remote signer
// session is stored on this device." Correct behavior: no-arg clear drops only the
// legacy v1 "last-connected" default; per-account v2 sessions survive. Forgetting a
// specific account uses the targeted clearStoredNip46Session(pubkey) (tested above).
test("no-arg clear drops the legacy v1 default but KEEPS per-account v2 sessions", () => {
  writeStoredNip46SessionSync(session(USER_A, REMOTE_A, "wss://a.example"));
  writeStoredNip46SessionSync(session(USER_B, REMOTE_B, "wss://b.example"));

  clearStoredNip46Session(); // e.g. tearing down the live connection on a switch

  // Both accounts remain reconnectable — switching back to either still works.
  assert.deepEqual(
    listStoredNip46SessionPubkeys().sort(),
    [USER_A, USER_B].sort(),
  );
  assert.equal(readStoredNip46Session(USER_A).remotePubkey, REMOTE_A);
  assert.equal(readStoredNip46Session(USER_B).remotePubkey, REMOTE_B);
  // The legacy single-slot default is gone (no ambiguous "last connected").
  assert.equal(localStorage.getItem(NIP46_SESSION_STORAGE_KEY), null);
});

test("a legacy v1 single-slot session migrates into the per-pubkey map", () => {
  // Simulate an install that only ever had the old single slot.
  localStorage.setItem(
    NIP46_SESSION_STORAGE_KEY,
    JSON.stringify(session(USER_A, REMOTE_A, "wss://a.example")),
  );
  assert.equal(localStorage.getItem(NIP46_SESSIONS_MAP_STORAGE_KEY), null);

  assert.equal(readStoredNip46Session(USER_A).remotePubkey, REMOTE_A);
  assert.deepEqual(listStoredNip46SessionPubkeys(), [USER_A]);

  // A second account can now be added alongside the migrated one.
  writeStoredNip46SessionSync(session(USER_B, REMOTE_B, "wss://b.example"));
  assert.equal(readStoredNip46Session(USER_A).remotePubkey, REMOTE_A);
  assert.equal(readStoredNip46Session(USER_B).remotePubkey, REMOTE_B);
});

test("requesting an account with no stored session returns null (not a wrong one)", () => {
  writeStoredNip46SessionSync(session(USER_A, REMOTE_A, "wss://a.example"));
  assert.equal(readStoredNip46Session(USER_B), null);
});
