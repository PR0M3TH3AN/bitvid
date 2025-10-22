import assert from "node:assert/strict";
import test from "node:test";

const PAYLOAD = { message: "hello", count: 42 };

const loadNostrTools = async () => {
  const nostrTools = await import("nostr-tools");
  globalThis.nostrToolsReady = Promise.resolve(nostrTools);
  return nostrTools;
};

test("Nip46RpcClient encrypts payloads with nip44 conversation keys", async () => {
  const nostrTools = await loadNostrTools();
  const { generateSecretKey, getPublicKey, nip44, utils } = nostrTools;

  const clientSecret = utils.bytesToHex(generateSecretKey());
  const remoteSecret = utils.bytesToHex(generateSecretKey());
  const clientPublicKey = getPublicKey(clientSecret);
  const remotePubkey = getPublicKey(remoteSecret);

  const { Nip46RpcClient } = await import("../js/nostr.js");

  const rpcClient = new Nip46RpcClient({
    nostrClient: { relays: [] },
    clientPrivateKey: clientSecret,
    clientPublicKey,
    remotePubkey,
  });

  const serialized = JSON.stringify(PAYLOAD);
  const ciphertext = await rpcClient.encryptPayload(PAYLOAD);

  assert.equal(typeof ciphertext, "string", "ciphertext should be encoded as a string");

  const conversationKey =
    typeof nip44.v2.getConversationKey === "function"
      ? nip44.v2.getConversationKey(clientSecret, remotePubkey)
      : nip44.v2.utils.getConversationKey(clientSecret, remotePubkey);
  const decryptedWithTools = nip44.v2.decrypt(ciphertext, conversationKey);
  assert.equal(
    decryptedWithTools,
    serialized,
    "nip44 decrypt should recover the serialized payload",
  );

  const roundTrip = await rpcClient.decryptPayload(ciphertext);
  assert.equal(roundTrip, serialized, "client should decrypt its own ciphertext");

  const externalCiphertext = nip44.v2.encrypt(serialized, conversationKey);
  const externalRoundTrip = await rpcClient.decryptPayload(externalCiphertext);
  assert.equal(
    externalRoundTrip,
    serialized,
    "client should decrypt ciphertext produced by nostr-tools",
  );
});
