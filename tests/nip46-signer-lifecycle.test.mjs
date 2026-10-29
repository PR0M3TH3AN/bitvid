// SignerManager lifecycle scoping for NIP-46 multi-account (pre-launch TODO #33).
//
// The 2026-06-25 audit blamed "logout logs out everyone" on the single shared
// nip46Client being torn down by any scoped logout. Since then the layers under
// it were fixed piecemeal (per-account v2 session map, scoped clears, targeted
// restore) — but nothing pinned the MANAGER-level contract, so any of those
// fixes could regress silently. These tests exercise the real SignerManager
// against the real signer registry and real (polyfilled) storage.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-nip46-logout-scope
//       given: "account A active with a live remote-signer client; A and B both have stored sessions; B has a registered signer"
//       when: "SignerManager.logout() logs out A"
//       then: "A's live client is destroyed exactly once; BOTH stored sessions survive; B's registry signer survives"
//     - id: SCN-nip46-restore-failure-scope
//       given: "stored sessions for A and B"
//       when: "a targeted restore of A fails (locked session / missing session)"
//       then: "the failure is typed and NO stored session is deleted"
//   observable_outcomes:
//     - "fake client's destroy() call count"
//     - "readStoredNip46Session(pubkey) after the operation"
//     - "resolveActiveSigner(pubkey) for the OTHER account"
//   determinism_controls:
//     - "in-memory localStorage polyfill; fake in-process client object; no network"
//   anti_cheat_rationale:
//     prevents: ["over-mocking internal logic", "hard-coded return value"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test, { beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { SignerManager } from "../js/nostr/managers/SignerManager.js";
import {
  writeStoredNip46SessionSync,
  readStoredNip46Session,
} from "../js/nostr/nip46Client.js";
import {
  registerSigner,
  setActiveSigner,
  clearActiveSigner,
  resolveActiveSigner,
} from "../js/nostrClientRegistry.js";

const USER_A =
  "00000000000000000000000000000000000000000000000000000000000000a1";
const USER_B =
  "00000000000000000000000000000000000000000000000000000000000000b2";

function storedSession(userPubkey, remotePubkey) {
  return {
    version: 1,
    clientPublicKey:
      "3333333333333333333333333333333333333333333333333333333333333333",
    remotePubkey,
    relays: ["wss://relay.example"],
    encryption: "nip44.v2",
    userPubkey,
    lastConnectedAt: 1700000000000,
    // Sessions at rest carry encrypted secrets; restoring without the
    // passphrase must fail typed, not fall through to a broken connect.
    encryptedSecrets: "cipher",
    keyEncryption: {
      salt: "c2FsdA==",
      iv: "aXY=",
      iterations: 1000,
      hash: "SHA-256",
    },
  };
}

function makeManager() {
  // SignerManager only needs the app client for pool access on connect paths;
  // the scoping contracts under test never reach the network.
  return new SignerManager({
    relays: ["wss://relay.example"],
    ensurePool: async () => {
      throw new Error("network must not be touched by these tests");
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  clearActiveSigner();
});

test("logging out the active NIP-46 account keeps every other account intact", () => {
  writeStoredNip46SessionSync(storedSession(USER_A, "1".repeat(64)));
  writeStoredNip46SessionSync(storedSession(USER_B, "2".repeat(64)));

  // B is a signed-in account in the registry (e.g. logged in earlier this
  // session); A is the ACTIVE account with the live remote-signer client.
  const signerB = { pubkey: USER_B, signEvent: async (e) => e };
  registerSigner(USER_B, signerB);

  let destroyCalls = 0;
  const liveClient = {
    remotePubkey: "1".repeat(64),
    userPubkey: USER_A,
    destroy() {
      destroyCalls += 1;
    },
  };

  const manager = makeManager();
  manager.pubkey = USER_A;
  manager.nip46Client = liveClient;

  manager.logout();

  // The departing account's LIVE connection is torn down exactly once…
  assert.equal(destroyCalls, 1);
  assert.equal(manager.nip46Client, null);
  assert.equal(manager.pubkey, null);

  // …but its stored session survives (logout keeps sessions reconnectable —
  // that is what makes "switch back later" possible)…
  const storedA = readStoredNip46Session(USER_A);
  assert.ok(storedA, "A's stored session must survive A's own logout");
  assert.equal(storedA.remotePubkey, "1".repeat(64));

  // …and account B is completely untouched: stored session AND registry signer.
  const storedB = readStoredNip46Session(USER_B);
  assert.ok(storedB, "B's stored session must survive A's logout");
  assert.equal(storedB.remotePubkey, "2".repeat(64));
  assert.equal(
    resolveActiveSigner(USER_B),
    signerB,
    "B's registered signer must survive A's logout"
  );
});

test("logout is safe when no remote client is live (nsec/nip07 active)", () => {
  writeStoredNip46SessionSync(storedSession(USER_B, "2".repeat(64)));

  const manager = makeManager();
  manager.pubkey = USER_A; // active via some non-NIP-46 method

  assert.doesNotThrow(() => manager.logout());
  assert.ok(
    readStoredNip46Session(USER_B),
    "an unrelated account's NIP-46 session must survive a non-NIP-46 logout"
  );
});

test("a failed targeted restore deletes nothing", async () => {
  writeStoredNip46SessionSync(storedSession(USER_A, "1".repeat(64)));
  writeStoredNip46SessionSync(storedSession(USER_B, "2".repeat(64)));

  const manager = makeManager();

  // A's session is passphrase-locked and none was provided: typed failure.
  await assert.rejects(
    manager.useStoredRemoteSigner({ pubkey: USER_A, silent: true }),
    (error) => error?.code === "passphrase-required"
  );

  assert.ok(readStoredNip46Session(USER_A), "A's session survives its own failed restore");
  assert.ok(readStoredNip46Session(USER_B), "B's session survives A's failed restore");
});

test("restoring an account with no stored session fails typed and touches nothing", async () => {
  writeStoredNip46SessionSync(storedSession(USER_B, "2".repeat(64)));

  const manager = makeManager();

  await assert.rejects(
    manager.useStoredRemoteSigner({ pubkey: USER_A, silent: true }),
    (error) => error?.code === "no-stored-session"
  );

  assert.ok(
    readStoredNip46Session(USER_B),
    "an unrelated stored session must survive a missing-session restore attempt"
  );
});

test("disconnectRemoteSigner({keepStored:true}) never clears stored sessions", async () => {
  writeStoredNip46SessionSync(storedSession(USER_A, "1".repeat(64)));

  const manager = makeManager();
  manager.nip46Client = { destroy() {} };

  await manager.disconnectRemoteSigner({ keepStored: true });

  assert.ok(readStoredNip46Session(USER_A));
});

test("disconnectRemoteSigner() without keepStored clears only the last-connected default", async () => {
  // The no-arg clear historically wiped the whole v2 map — "after switching
  // away you could no longer switch back". Pin the scoped behavior: the v1
  // default slot goes, the per-account map survives.
  writeStoredNip46SessionSync(storedSession(USER_A, "1".repeat(64)));
  writeStoredNip46SessionSync(storedSession(USER_B, "2".repeat(64)));

  const manager = makeManager();
  manager.nip46Client = { destroy() {} };

  await manager.disconnectRemoteSigner();

  assert.ok(
    readStoredNip46Session(USER_A),
    "per-account session A must survive a bare disconnect"
  );
  assert.ok(
    readStoredNip46Session(USER_B),
    "per-account session B must survive a bare disconnect"
  );
});
