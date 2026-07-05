import test from "node:test";
import assert from "node:assert";
import {
  encryptSessionPrivateKey,
  decryptSessionPrivateKey,
  persistSessionActor,
  readStoredSessionActorEntry,
  clearStoredSessionActor,
  SESSION_ACTOR_STORAGE_KEY,
  __testExports
} from "../../js/nostr/sessionActor.js";

const { generateRandomBytes, isSubtleCryptoAvailable } = __testExports;

// Ensure localStorage is mocked
import "../../tests/test-helpers/setup-localstorage.mjs";

test("js/nostr/sessionActor.js", async (t) => {
  if (!isSubtleCryptoAvailable()) {
    t.skip("WebCrypto not available in this environment");
    return;
  }

  t.beforeEach(async () => {
    localStorage.clear();
    await clearStoredSessionActor();
  });

  await t.test("Encryption and Decryption Roundtrip", async () => {
    const privateKey = "nsec1testkey..."; // In reality this would be hex or bech32, but for encryption it is just a string payload
    const passphrase = "secure-password";

    const encrypted = await encryptSessionPrivateKey(privateKey, passphrase);

    assert.ok(encrypted.ciphertext);
    assert.ok(encrypted.salt);
    assert.ok(encrypted.iv);
    assert.strictEqual(encrypted.algorithm, "AES-GCM");

    const payload = {
      privateKeyEncrypted: encrypted.ciphertext,
      encryption: encrypted,
    };

    const decrypted = await decryptSessionPrivateKey(payload, passphrase);
    assert.strictEqual(decrypted, privateKey);
  });

  await t.test("Decryption fails with wrong passphrase", async () => {
    const privateKey = "secret";
    const passphrase = "correct";
    const wrongPassphrase = "wrong";

    const encrypted = await encryptSessionPrivateKey(privateKey, passphrase);
    const payload = {
      privateKeyEncrypted: encrypted.ciphertext,
      encryption: encrypted,
    };

    await assert.rejects(
      async () => {
        await decryptSessionPrivateKey(payload, wrongPassphrase);
      },
      (err) => err.code === "decrypt-failed" || err.message.includes("decrypt-failed")
    );
  });

  await t.test("Persistence and Retrieval", async () => {
    const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
    const privateKey = "my-secret-key";
    const passphrase = "my-password";

    const encrypted = await encryptSessionPrivateKey(privateKey, passphrase);

    const actor = {
      pubkey,
      privateKeyEncrypted: encrypted.ciphertext,
      encryption: encrypted,
      createdAt: Date.now(),
    };

    persistSessionActor(actor);

    // Verify localStorage
    const storedRaw = localStorage.getItem(SESSION_ACTOR_STORAGE_KEY);
    assert.ok(storedRaw);

    const stored = readStoredSessionActorEntry();
    assert.ok(stored);
    assert.strictEqual(stored.pubkey, pubkey);
    assert.strictEqual(stored.privateKeyEncrypted, encrypted.ciphertext);

    // Verify we can decrypt what we retrieved
    const decrypted = await decryptSessionPrivateKey(stored, passphrase);
    assert.strictEqual(decrypted, privateKey);
  });

  // spec_correction: no-arg clearStoredSessionActor() used to wipe the WHOLE
  // per-account map — the data-loss bug where logging out of one account
  // silently destroyed every other saved account's remembered nsec key. The
  // deliberate fix (2026-07-02, same class as the NIP-46 session-map wipe)
  // made no-arg clear ONLY the legacy v1 "last saved" slot; forgetting a
  // specific account is clearStoredSessionActor(pubkey). This test encoded the
  // dangerous pre-fix behavior; it now asserts the fixed semantics, including
  // the multi-account survival property the fix exists for.
  //
  // test_integrity_note:
  //   change_type: ["spec_correction"]
  //   scenarios:
  //     - id: SCN-session-actor-targeted-clear
  //       given: "two accounts with persisted encrypted keys"
  //       when: "no-arg clear runs (logout-ish) and then a targeted clear"
  //       then: "no-arg leaves BOTH accounts retrievable by pubkey; targeted clear removes exactly one"
  //   observable_outcomes:
  //     - "clearStoredSessionActor() never deletes other accounts' keys"
  //     - "clearStoredSessionActor(pubkey) removes that account's entry"
  //   determinism_controls:
  //     - "in-memory localStorage; fixed pubkeys"
  //   anti_cheat_rationale:
  //     prevents: ["snapshot rubber-stamping"]
  //   relaxation:
  //     did_relax_any_assertion: false
  //     if_true_explain_spec_basis: "replaced with the fixed (stronger, multi-account) semantics"
  await t.test("Clear semantics: targeted forget, no-arg never nukes other accounts", async () => {
    const pubkeyA = "0000000000000000000000000000000000000000000000000000000000000001";
    const pubkeyB = "0000000000000000000000000000000000000000000000000000000000000002";
    const encryption = {
      salt: "fake-salt",
      iv: "fake-iv",
      iterations: 1000,
      hash: "SHA-256",
      algorithm: "AES-GCM",
      version: 1
    };
    persistSessionActor({ pubkey: pubkeyA, privateKeyEncrypted: "cipher-a", encryption, createdAt: Date.now() });
    persistSessionActor({ pubkey: pubkeyB, privateKeyEncrypted: "cipher-b", encryption, createdAt: Date.now() });

    // No-arg clear (the logout-path call) drops only the "last saved" default…
    clearStoredSessionActor();
    assert.strictEqual(localStorage.getItem(SESSION_ACTOR_STORAGE_KEY), null);
    // …while BOTH accounts' keys survive and stay switchable.
    assert.ok(readStoredSessionActorEntry(pubkeyA), "account A must survive a no-arg clear");
    assert.ok(readStoredSessionActorEntry(pubkeyB), "account B must survive a no-arg clear");

    // Targeted clear forgets exactly that account.
    clearStoredSessionActor(pubkeyA);
    assert.strictEqual(readStoredSessionActorEntry(pubkeyA), null, "targeted clear removes the account");
    assert.ok(readStoredSessionActorEntry(pubkeyB), "the other account is untouched");

    clearStoredSessionActor(pubkeyB);
    assert.strictEqual(readStoredSessionActorEntry(pubkeyB), null);
    assert.strictEqual(readStoredSessionActorEntry(), null, "nothing left after every account is forgotten");
  });
});
