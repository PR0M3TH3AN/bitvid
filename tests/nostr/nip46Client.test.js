import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

const loadNostrTools = async () => {
  const nostrTools = await import("nostr-tools");
  globalThis.nostrToolsReady = Promise.resolve(nostrTools);
  return nostrTools;
};

const loadNip46Module = () => import("../../js/nostr/nip46Client.js");

const buildSignEventStub = () => (event) => ({
  ...event,
  id: "stub-id",
  sig: "stub-signature",
});

test("Nip46RpcClient encrypts payloads with nip44 conversation keys", async () => {
  const nostrTools = await loadNostrTools();
  const { generateSecretKey, getPublicKey, nip44, utils } = nostrTools;
  const {
    Nip46RpcClient,
  } = await loadNip46Module();

  const clientSecret = utils.bytesToHex(generateSecretKey());
  const remoteSecret = utils.bytesToHex(generateSecretKey());
  const clientPublicKey = getPublicKey(utils.hexToBytes(clientSecret));
  const remotePubkey = getPublicKey(utils.hexToBytes(remoteSecret));

  const rpcClient = new Nip46RpcClient({
    nostrClient: { relays: [] },
    clientPrivateKey: clientSecret,
    clientPublicKey,
    remotePubkey,
    signEvent: buildSignEventStub(),
  });

  const serialized = JSON.stringify({ message: "hello", count: 42 });
  const ciphertext = await rpcClient.encryptPayload({ message: "hello", count: 42 });

  assert.equal(typeof ciphertext, "string", "ciphertext should be encoded as a string");

  const conversationKey =
    typeof nip44.v2.getConversationKey === "function"
      ? nip44.v2.getConversationKey(utils.hexToBytes(clientSecret), remotePubkey)
      : nip44.v2.utils.getConversationKey(utils.hexToBytes(clientSecret), remotePubkey);
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
  const { decryptNip46PayloadWithKeys } = await loadNip46Module();

  const clientSecret = utils.bytesToHex(generateSecretKey());
  const remoteSecret = utils.bytesToHex(generateSecretKey());
  const remotePubkey = getPublicKey(utils.hexToBytes(remoteSecret));

  const serialized = JSON.stringify({ message: "hello", count: 42 });
  const conversationKey =
    typeof nip44.v2.getConversationKey === "function"
      ? nip44.v2.getConversationKey(utils.hexToBytes(clientSecret), remotePubkey)
      : nip44.v2.utils.getConversationKey(utils.hexToBytes(clientSecret), remotePubkey);
  const ciphertext = nip44.v2.encrypt(serialized, conversationKey);

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
  const {
    decryptNip46PayloadWithKeys,
    normalizeNip46CiphertextPayload,
  } = await loadNip46Module();

  const clientSecret = utils.bytesToHex(generateSecretKey());
  const remoteSecret = utils.bytesToHex(generateSecretKey());
  const remotePubkey = getPublicKey(utils.hexToBytes(remoteSecret));

  const serialized = JSON.stringify({ message: "hello", count: 42 });
  const conversationKey =
    typeof nip44.v2.getConversationKey === "function"
      ? nip44.v2.getConversationKey(utils.hexToBytes(clientSecret), remotePubkey)
      : nip44.v2.utils.getConversationKey(utils.hexToBytes(clientSecret), remotePubkey);
  const ciphertext = nip44.v2.encrypt(serialized, conversationKey);
  const [ciphertextPart, nonce] = ciphertext.split("\n");

  const structuredPayload = {
    ciphertext: ciphertextPart,
    nonce,
  };

  const normalized = normalizeNip46CiphertextPayload(structuredPayload);
  assert.ok(
    normalized.includes(ciphertext),
    "normalizer should include the raw ciphertext from structured payloads",
  );

  const { plaintext: structuredPlaintext, algorithm } =
    await decryptNip46PayloadWithKeys(
      clientSecret,
      remotePubkey,
      structuredPayload,
    );

  assert.equal(
    structuredPlaintext,
    serialized,
    "helper should decrypt ciphertext encoded with newline nonce",
  );
  assert.equal(
    algorithm,
    "nip44.v2",
    "structured payload should report nip44.v2 algorithm",
  );
});

test("decryptNip46PayloadWithKeys decodes buffer-based handshake payloads", async () => {
  const nostrTools = await loadNostrTools();
  const { generateSecretKey, getPublicKey, nip44, utils } = nostrTools;
  const {
    decryptNip46PayloadWithKeys,
    normalizeNip46CiphertextPayload,
  } = await loadNip46Module();

  const clientSecret = utils.bytesToHex(generateSecretKey());
  const remoteSecret = utils.bytesToHex(generateSecretKey());
  const remotePubkey = getPublicKey(utils.hexToBytes(remoteSecret));

  const serialized = JSON.stringify({ message: "hello", count: 42 });
  const conversationKey =
    typeof nip44.v2.getConversationKey === "function"
      ? nip44.v2.getConversationKey(utils.hexToBytes(clientSecret), remotePubkey)
      : nip44.v2.utils.getConversationKey(utils.hexToBytes(clientSecret), remotePubkey);
  const ciphertext = nip44.v2.encrypt(serialized, conversationKey);
  const [ciphertextPart, nonce] = ciphertext.split("\n");
  const ciphertextBuffer = Buffer.from(ciphertext, "utf8");

  const normalized = normalizeNip46CiphertextPayload(ciphertextBuffer);
  assert.ok(
    normalized.includes(ciphertext),
    "normalizer should extract the raw ciphertext from buffers",
  );

  const { plaintext: bufferPlaintext, algorithm } =
    await decryptNip46PayloadWithKeys(
      clientSecret,
      remotePubkey,
      ciphertextBuffer,
    );

  assert.equal(
    bufferPlaintext,
    serialized,
    "helper should decrypt ciphertext derived from buffers",
  );
  assert.equal(
    algorithm,
    "nip44.v2",
    "buffer payload should report nip44.v2 algorithm",
  );
});

test("decryptNip46PayloadWithKeys supports nip04-style ciphertext wrappers", async () => {
  const nostrTools = await loadNostrTools();
  const { generateSecretKey, getPublicKey, nip04, utils } = nostrTools;
  const { createNip46Cipher, normalizeNip46CiphertextPayload } = await loadNip46Module();

  const clientSecret = utils.bytesToHex(generateSecretKey());
  const remoteSecret = utils.bytesToHex(generateSecretKey());
  const remotePubkey = getPublicKey(utils.hexToBytes(remoteSecret));

  const serialized = JSON.stringify({ message: "hello", count: 42 });
  const ciphertext = await nip04.encrypt(utils.hexToBytes(clientSecret), remotePubkey, serialized);
  const [ciphertextPart, iv] = ciphertext.split("?iv=");

  const structuredPayload = {
    ciphertext: ciphertextPart,
    iv,
  };

  const patchedTools = {
    ...(await import("nostr-tools")),
    nip44: undefined,
  };

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

test("parseNip46ConnectionString handles remote signer key hints", async () => {
  const nostrTools = await loadNostrTools();
  const { generateSecretKey, getPublicKey, nip19, utils } = nostrTools;
  const { parseNip46ConnectionString } = await loadNip46Module();

  const signerSecret = utils.bytesToHex(generateSecretKey());
  const userSecret = utils.bytesToHex(generateSecretKey());

  const signerPubkey = getPublicKey(utils.hexToBytes(signerSecret)).toLowerCase();
  const userPubkey = getPublicKey(utils.hexToBytes(userSecret)).toLowerCase();

  const signerNpub = nip19.npubEncode(signerPubkey);
  const userNpub = nip19.npubEncode(userPubkey);

  const uri =
    `bunker://${userNpub}?remote-signer-key=${encodeURIComponent(signerNpub)}` +
    `&relay=${encodeURIComponent("wss://relay.example.com")}`;

  const parsed = parseNip46ConnectionString(uri);

  assert.ok(parsed, "parser should return a payload");
  assert.equal(
    parsed.remotePubkey,
    signerPubkey,
    "remote signer pubkey should come from the remote-signer-key parameter",
  );
  assert.equal(
    parsed.userPubkeyHint,
    userPubkey,
    "user pubkey hint should reflect the bunker URI hostname",
  );
  assert.deepEqual(
    parsed.relays,
    ["wss://relay.example.com"],
    "relay parameters should be decoded",
  );
});

test(
  "attemptDecryptNip46HandshakePayload falls back to expected remote signer key",
  async () => {
    const nostrTools = await loadNostrTools();
    const { generateSecretKey, getPublicKey, nip44, utils } = nostrTools;
    const { attemptDecryptNip46HandshakePayload } = await loadNip46Module();

    const clientSecret = utils.bytesToHex(generateSecretKey());
    const remoteSignerSecret = utils.bytesToHex(generateSecretKey());
    const userSecret = utils.bytesToHex(generateSecretKey());

    const remoteSignerPubkey = getPublicKey(utils.hexToBytes(remoteSignerSecret)).toLowerCase();
    const userPubkey = getPublicKey(utils.hexToBytes(userSecret)).toLowerCase();

    const conversationKey =
      typeof nip44.v2.getConversationKey === "function"
        ? nip44.v2.getConversationKey(utils.hexToBytes(clientSecret), remoteSignerPubkey)
        : nip44.v2.utils.getConversationKey(utils.hexToBytes(clientSecret), remoteSignerPubkey);

    const payload = JSON.stringify({ id: "ack", result: "ok" });
    const ciphertext = nip44.v2.encrypt(payload, conversationKey);

    const result = await attemptDecryptNip46HandshakePayload({
      clientPrivateKey: clientSecret,
      candidateRemotePubkeys: [userPubkey, remoteSignerPubkey],
      ciphertext,
    });

    assert.equal(
      result.remotePubkey,
      remoteSignerPubkey,
      "helper should return the remote signer key that successfully decrypted the payload",
    );
    assert.equal(
      result.plaintext,
      payload,
      "helper should yield the handshake plaintext",
    );
  },
);

test(
  "attemptDecryptNip46HandshakePayload handles array-encoded nip04 payloads",
  async () => {
    const nostrTools = await loadNostrTools();
    const { generateSecretKey, getPublicKey, nip04, utils } = nostrTools;
    const { attemptDecryptNip46HandshakePayload } = await loadNip46Module();

    const clientSecret = utils.bytesToHex(generateSecretKey());
    const clientPubkey = getPublicKey(utils.hexToBytes(clientSecret)).toLowerCase();
    const remoteSecret = utils.bytesToHex(generateSecretKey());
    const remotePubkey = getPublicKey(utils.hexToBytes(remoteSecret)).toLowerCase();

    const payload = JSON.stringify({ id: "ack", result: "ack" });
    const ciphertext = nip04.encrypt(utils.hexToBytes(remoteSecret), clientPubkey, payload);
    const [ciphertextPart, ivPart] = ciphertext.split("?iv=");

    assert.ok(ivPart, "nip04 encryption should emit an iv segment");

    const encodedPayload = `${ciphertextPart}?iv=${ivPart}`;

    const result = await attemptDecryptNip46HandshakePayload({
      clientPrivateKey: clientSecret,
      candidateRemotePubkeys: [remotePubkey],
      ciphertext: encodedPayload,
    });

    assert.equal(
      result.remotePubkey,
      remotePubkey,
      "helper should resolve the remote signer key for array payloads",
    );
    assert.equal(
      result.plaintext,
      payload,
      "helper should decrypt nip04 payloads serialized as arrays",
    );
    assert.equal(
      result.algorithm,
      "nip04",
      "helper should report the nip04 algorithm for nip04 ciphertext",
    );
  },
);

test("Nip46RpcClient sendRpc publishes events and resolves responses", async () => {
  const { Nip46RpcClient, NIP46_RPC_KIND } = await loadNip46Module();

  const remotePubkey = "b".repeat(64);
  const clientPrivateKey = "a".repeat(64);
  const clientPublicKey = "c".repeat(64);

  let eventListener = null;
  const pool = {
    sub(relays, filters) {
      return {
        on(type, handler) {
          if (type === "event") {
            eventListener = handler;
          }
        },
        unsub() {},
      };
    },
  };

  const publishCalls = [];
  const client = new Nip46RpcClient({
    nostrClient: {
      relays: ["wss://relay.example.com"],
      pool,
      async ensurePool() {
        return pool;
      },
    },
    clientPrivateKey,
    clientPublicKey,
    remotePubkey,
    relays: ["wss://relay.example.com"],
    signEvent: (event) => ({ ...event, id: "evt", sig: "sig" }),
    publishEventToRelays: async (unusedPool, relays, event) => {
      publishCalls.push({ relays, event });
      return relays.map((relay) => ({ relay, ok: true }));
    },
    assertAnyRelayAccepted: () => {},
  });

  client.ensureCipher = async () => ({
    encrypt: (payload) => (typeof payload === "string" ? payload : JSON.stringify(payload)),
    decrypt: (ciphertext) => ciphertext,
  });

  const rpcPromise = client.sendRpc("ping", []);

  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(publishCalls.length > 0, "sendRpc should publish an event");
  assert.ok(eventListener, "sendRpc should register an event listener");

  const [{ event }] = publishCalls;
  const requestPayload = JSON.parse(event.content);

  eventListener({
    kind: NIP46_RPC_KIND,
    pubkey: remotePubkey,
    tags: [["p", clientPublicKey]],
    content: JSON.stringify({ id: requestPayload.id, result: "pong" }),
  });

  const result = await rpcPromise;
  assert.equal(result, "pong", "RPC result should resolve from response event");
});
