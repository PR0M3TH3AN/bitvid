// Scenario (SCN-nip46-wait-handshake):
//   The nostrconnect:// (QR) login path must WAIT for the remote signer to scan
//   and acknowledge before it can know the signer's pubkey. _waitForRemoteSignerHandshake
//   subscribes to NIP-46 RPC events addressed to the client pubkey and resolves
//   with the signer's pubkey on a matching ACK (secret match), surfaces auth_url
//   challenges without resolving, and times out otherwise. (Decryption itself is
//   existing/tested code, injected here so we exercise the wait/match logic.)

import "../test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";

globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = true;
const { SignerManager } = await import("../../js/nostr/managers/SignerManager.js");

const CLIENT_PUB = "a".repeat(64);
const CLIENT_PRIV = "b".repeat(64);
const SIGNER_PUB = "c".repeat(64);

// A fake pool whose sub() exposes the captured event handler so the test can
// simulate the remote signer publishing an acknowledgement.
function makeManagerWithPool() {
  const captured = { handler: null, unsubbed: false, filters: null };
  const pool = {
    sub(relays, filters) {
      captured.filters = filters;
      return {
        on(ev, cb) {
          if (ev === "event") captured.handler = cb;
        },
        unsub() {
          captured.unsubbed = true;
        },
      };
    },
  };
  const client = { relays: ["wss://relay.one"], ensurePool: async () => pool };
  const mgr = new SignerManager(client);
  return { mgr, captured };
}

const fireEvent = (captured, content) =>
  captured.handler({ kind: 24133, pubkey: SIGNER_PUB, content, id: "evt1" });

test("resolves with the signer pubkey when the ACK matches the secret", async () => {
  const { mgr, captured } = makeManagerWithPool();
  const secret = "handshake-secret-xyz";
  // Inject the decryptor: pretend the event decrypts to a matching ACK.
  mgr._decryptHandshakePayload = async () => ({
    plaintext: JSON.stringify({ id: "1", result: secret }),
    remotePubkey: SIGNER_PUB,
    algorithm: "nip44",
  });

  const promise = mgr._waitForRemoteSignerHandshake({
    clientPrivateKey: CLIENT_PRIV,
    clientPublicKey: CLIENT_PUB,
    relays: ["wss://relay.one"],
    secret,
    timeoutMs: 5000,
  });

  await new Promise((r) => setTimeout(r, 5)); // let the subscription register
  assert.ok(captured.handler, "subscribed and registered an event handler");
  assert.deepEqual(captured.filters, [{ kinds: [24133], "#p": [CLIENT_PUB] }]);
  fireEvent(captured, "ciphertext");

  const result = await promise;
  assert.equal(result.remotePubkey, SIGNER_PUB);
  assert.equal(captured.unsubbed, true, "unsubscribes after resolving");
});

test("ignores a non-matching secret and eventually times out", async () => {
  const { mgr, captured } = makeManagerWithPool();
  mgr._decryptHandshakePayload = async () => ({
    plaintext: JSON.stringify({ result: "WRONG-secret" }),
    remotePubkey: SIGNER_PUB,
  });
  const promise = mgr._waitForRemoteSignerHandshake({
    clientPrivateKey: CLIENT_PRIV,
    clientPublicKey: CLIENT_PUB,
    relays: ["wss://relay.one"],
    secret: "the-real-secret",
    timeoutMs: 80,
  });
  await new Promise((r) => setTimeout(r, 5));
  fireEvent(captured, "ciphertext"); // wrong secret => ignored
  await assert.rejects(promise, (e) => e.code === "nip46-handshake-timeout");
});

test("surfaces an auth_url challenge without resolving", async () => {
  const { mgr, captured } = makeManagerWithPool();
  let authUrl = "";
  mgr._decryptHandshakePayload = async () => ({
    plaintext: JSON.stringify({ result: "auth_url", error: "https://signer.example/approve" }),
    remotePubkey: SIGNER_PUB,
  });
  const promise = mgr._waitForRemoteSignerHandshake({
    clientPrivateKey: CLIENT_PRIV,
    clientPublicKey: CLIENT_PUB,
    relays: ["wss://relay.one"],
    secret: "s",
    timeoutMs: 80,
    onAuthUrl: (url) => {
      authUrl = url;
    },
  });
  await new Promise((r) => setTimeout(r, 5));
  fireEvent(captured, "ciphertext");
  await assert.rejects(promise, (e) => e.code === "nip46-handshake-timeout");
  assert.equal(authUrl, "https://signer.example/approve", "auth_url surfaced to the UI");
});
