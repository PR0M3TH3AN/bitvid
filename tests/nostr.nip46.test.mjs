import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
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

test("decryptNip46PayloadWithKeys handles nip44.v2 ciphertext", async () => {
  const nostrTools = await loadNostrTools();
  const { generateSecretKey, getPublicKey, nip44, utils } = nostrTools;

  const clientSecret = utils.bytesToHex(generateSecretKey());
  const remoteSecret = utils.bytesToHex(generateSecretKey());
  const remotePubkey = getPublicKey(remoteSecret);

  const serialized = JSON.stringify(PAYLOAD);
  const conversationKey =
    typeof nip44.v2.getConversationKey === "function"
      ? nip44.v2.getConversationKey(clientSecret, remotePubkey)
      : nip44.v2.utils.getConversationKey(clientSecret, remotePubkey);
  const ciphertext = nip44.v2.encrypt(serialized, conversationKey);

  const { __testExports } = await import("../js/nostr.js");
  const { decryptNip46PayloadWithKeys } = __testExports;

  const roundTrip = await decryptNip46PayloadWithKeys(
    clientSecret,
    remotePubkey,
    ciphertext,
  );

  assert.equal(roundTrip, serialized, "helper should decrypt nip44.v2 ciphertext");
});

test("decryptNip46PayloadWithKeys coerces structured handshake payloads", async () => {
  const nostrTools = await loadNostrTools();
  const { generateSecretKey, getPublicKey, nip44, utils } = nostrTools;

  const clientSecret = utils.bytesToHex(generateSecretKey());
  const remoteSecret = utils.bytesToHex(generateSecretKey());
  const remotePubkey = getPublicKey(remoteSecret);

  const serialized = JSON.stringify(PAYLOAD);
  const conversationKey =
    typeof nip44.v2.getConversationKey === "function"
      ? nip44.v2.getConversationKey(clientSecret, remotePubkey)
      : nip44.v2.utils.getConversationKey(clientSecret, remotePubkey);
  const ciphertext = nip44.v2.encrypt(serialized, conversationKey);
  const [ciphertextPart, nonce] = ciphertext.split("\n");

  const structuredPayload = {
    ciphertext: ciphertextPart,
    nonce,
  };

  const { __testExports } = await import("../js/nostr.js");
  const { decryptNip46PayloadWithKeys } = __testExports;

  const roundTrip = await decryptNip46PayloadWithKeys(
    clientSecret,
    remotePubkey,
    structuredPayload,
  );

  assert.equal(
    roundTrip,
    serialized,
    "helper should decrypt ciphertext encoded as an object with nonce",
  );

  const jsonPayload = JSON.stringify(structuredPayload);
  const jsonRoundTrip = await decryptNip46PayloadWithKeys(
    clientSecret,
    remotePubkey,
    jsonPayload,
  );

  assert.equal(
    jsonRoundTrip,
    serialized,
    "helper should also decrypt JSON-serialized handshake payloads",
  );
});

test("decryptNip46PayloadWithKeys decodes buffer-based handshake payloads", async () => {
  const nostrTools = await loadNostrTools();
  const { generateSecretKey, getPublicKey, nip44, utils } = nostrTools;

  const clientSecret = utils.bytesToHex(generateSecretKey());
  const remoteSecret = utils.bytesToHex(generateSecretKey());
  const remotePubkey = getPublicKey(remoteSecret);

  const serialized = JSON.stringify(PAYLOAD);
  const conversationKey =
    typeof nip44.v2.getConversationKey === "function"
      ? nip44.v2.getConversationKey(clientSecret, remotePubkey)
      : nip44.v2.utils.getConversationKey(clientSecret, remotePubkey);
  const ciphertext = nip44.v2.encrypt(serialized, conversationKey);
  const ciphertextBuffer = Buffer.from(ciphertext, "utf8");

  const bufferPayload = ciphertextBuffer;

  const { __testExports } = await import("../js/nostr.js");
  const { decryptNip46PayloadWithKeys } = __testExports;

  const bufferRoundTrip = await decryptNip46PayloadWithKeys(
    clientSecret,
    remotePubkey,
    bufferPayload,
  );

  assert.equal(
    bufferRoundTrip,
    serialized,
    "helper should decrypt handshake payloads that serialize buffers",
  );

  const jsonBufferPayload = JSON.stringify(bufferPayload);
  const jsonBufferRoundTrip = await decryptNip46PayloadWithKeys(
    clientSecret,
    remotePubkey,
    jsonBufferPayload,
  );

  assert.equal(
    jsonBufferRoundTrip,
    serialized,
    "helper should decrypt JSON-encoded buffer handshake payloads",
  );

  const objectBufferPayload = {
    ciphertext: ciphertextBuffer,
  };

  const objectBufferRoundTrip = await decryptNip46PayloadWithKeys(
    clientSecret,
    remotePubkey,
    objectBufferPayload,
  );

  assert.equal(
    objectBufferRoundTrip,
    serialized,
    "helper should decrypt objects containing buffer encoded ciphertext",
  );
});
