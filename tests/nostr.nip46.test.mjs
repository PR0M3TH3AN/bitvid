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

  const { plaintext, algorithm } = await decryptNip46PayloadWithKeys(
    clientSecret,
    remotePubkey,
    ciphertext,
  );

  assert.equal(plaintext, serialized, "helper should decrypt nip44.v2 ciphertext");
  assert.equal(
    algorithm,
    "nip44.v2",
    "helper should report nip44.v2 as the active algorithm",
  );
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

  const { plaintext: structuredPlaintext, algorithm } =
    await decryptNip46PayloadWithKeys(
      clientSecret,
      remotePubkey,
      structuredPayload,
    );

  assert.equal(
    structuredPlaintext,
    serialized,
    "helper should decrypt ciphertext encoded as an object with nonce",
  );
  assert.equal(
    algorithm,
    "nip44.v2",
    "structured payload should report nip44.v2 algorithm",
  );

  const jsonPayload = JSON.stringify(structuredPayload);
  const { plaintext: jsonPlaintext, algorithm: jsonAlgorithm } =
    await decryptNip46PayloadWithKeys(
      clientSecret,
      remotePubkey,
      jsonPayload,
    );

  assert.equal(
    jsonPlaintext,
    serialized,
    "helper should also decrypt JSON-serialized handshake payloads",
  );
  assert.equal(
    jsonAlgorithm,
    "nip44.v2",
    "JSON payload should report nip44.v2 algorithm",
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

  const { plaintext: bufferPlaintext, algorithm } =
    await decryptNip46PayloadWithKeys(
      clientSecret,
      remotePubkey,
      bufferPayload,
    );

  assert.equal(
    bufferPlaintext,
    serialized,
    "helper should decrypt handshake payloads that serialize buffers",
  );
  assert.equal(
    algorithm,
    "nip44.v2",
    "buffer payload should report nip44.v2 algorithm",
  );

  const jsonBufferPayload = JSON.stringify(bufferPayload);
  const { plaintext: jsonBufferPlaintext, algorithm: jsonBufferAlgorithm } =
    await decryptNip46PayloadWithKeys(
      clientSecret,
      remotePubkey,
      jsonBufferPayload,
    );

  assert.equal(
    jsonBufferPlaintext,
    serialized,
    "helper should decrypt JSON-encoded buffer handshake payloads",
  );
  assert.equal(
    jsonBufferAlgorithm,
    "nip44.v2",
    "JSON buffer payload should report nip44.v2 algorithm",
  );

  const objectBufferPayload = {
    ciphertext: ciphertextBuffer,
  };

  const { plaintext: objectBufferPlaintext, algorithm: objectBufferAlgorithm } =
    await decryptNip46PayloadWithKeys(
      clientSecret,
      remotePubkey,
      objectBufferPayload,
    );

  assert.equal(
    objectBufferPlaintext,
    serialized,
    "helper should decrypt objects containing buffer encoded ciphertext",
  );
  assert.equal(
    objectBufferAlgorithm,
    "nip44.v2",
    "object buffer payload should report nip44.v2 algorithm",
  );
});

test("decryptNip46PayloadWithKeys supports nip04-style ciphertext wrappers", async () => {
  const nostrTools = await loadNostrTools();
  const { generateSecretKey, getPublicKey, nip04, utils } = nostrTools;

  const clientSecret = utils.bytesToHex(generateSecretKey());
  const remoteSecret = utils.bytesToHex(generateSecretKey());
  const remotePubkey = getPublicKey(remoteSecret);

  const serialized = JSON.stringify(PAYLOAD);
  const ciphertext = await nip04.encrypt(clientSecret, remotePubkey, serialized);
  const [ciphertextPart, iv] = ciphertext.split("?iv=");

  const structuredPayload = {
    ciphertext: ciphertextPart,
    iv,
  };

  const patchedTools = {
    ...nostrTools,
    nip44: undefined,
  };

  const { __testExports } = await import("../js/nostr.js");
  const { createNip46Cipher, normalizeNip46CiphertextPayload } = __testExports;

  const candidates = normalizeNip46CiphertextPayload(structuredPayload);

  assert.ok(
    candidates.includes(`${ciphertextPart}?iv=${iv}`),
    "normalizer should include nip04-style ciphertext",
  );

  const cipher = createNip46Cipher(patchedTools, clientSecret, remotePubkey);
  assert.equal(
    cipher.algorithm,
    "nip04",
    "nip04-only toolchain should resolve the nip04 algorithm",
  );
  const { decrypt } = cipher;
  let decrypted = "";
  for (const candidate of candidates) {
    try {
      decrypted = decrypt(candidate);
      if (decrypted) {
        break;
      }
    } catch (error) {
      // continue trying other candidates
    }
  }

  assert.equal(
    decrypted,
    serialized,
    "nip04 decrypt should succeed for structured payload candidates",
  );
});
