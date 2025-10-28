import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

const nwcModule = await import("../js/payments/nwcClient.js");
const { __TESTING__, resetWalletClient } = nwcModule;
const { buildPayInvoiceParams, ensureActiveState, parseNwcUri, getActiveState } = __TESTING__;

await (async () => {
  const params = buildPayInvoiceParams({
    invoice: "bolt11-invoice",
    amountSats: 123,
    zapRequest: "zap-request-json",
    lnurl: " https://pay.example/lnurlp/test ",
  });

  assert.equal(params.invoice, "bolt11-invoice");
  assert.equal(params.amount, 123_000);
  assert.equal(params.zap_request, "zap-request-json");
  assert.equal(params.lnurl, "https://pay.example/lnurlp/test");
})();

await (async () => {
  const params = buildPayInvoiceParams({
    invoice: "bolt11-invoice",
    amountSats: 0,
    zapRequest: null,
  });

  assert.equal(params.invoice, "bolt11-invoice");
  assert.ok(!("amount" in params));
  assert.ok(!("zap_request" in params));
})();

await (async () => {
  const params = buildPayInvoiceParams({
    invoice: "bolt11-invoice",
    amountSats: 42.7,
  });

  assert.equal(params.amount, 43_000);
})();

await (async () => {
  resetWalletClient();

  window.NostrTools = {
    getPublicKey() {
      return "c".repeat(64);
    },
    nip44: {
      v2: {
        async encrypt(plaintext, key) {
          return `nip44:${key}:${plaintext}`;
        },
        async decrypt(ciphertext, key) {
          return `nip44:${key}:${ciphertext}`;
        },
        utils: {
          getConversationKey(secretBytes, pubkey) {
            return `key-${pubkey}-${secretBytes.length}`;
          },
        },
      },
    },
    nip04: {
      async encrypt() {
        return "nip04";
      },
      async decrypt() {
        return "nip04";
      },
    },
  };

  const walletPubkey = "b".repeat(64);
  const secretKey = "a".repeat(64);
  const relays = ["wss://relay.one.example", "wss://relay.two.example"];
  const lud16 = "user@example.com";
  const uri =
    `nostr+walletconnect://${walletPubkey}` +
    `?relay=${encodeURIComponent(relays[0])}` +
    `&relay=${encodeURIComponent(relays[1])}` +
    `&secret=${secretKey}` +
    `&lud16=${encodeURIComponent(lud16)}`;

  const context = ensureActiveState({ nwcUri: uri });

  assert.deepEqual(context.relayUrls, relays);
  assert.equal(context.relayUrl, relays[0]);
  assert.equal(context.uri.split("?")[0], `nostr+walletconnect://${walletPubkey}`);

  const state = getActiveState();
  assert.ok(state?.settings?.nwcUri);

  const reparsed = parseNwcUri(state.settings.nwcUri);
  assert.deepEqual(reparsed.relays, relays);
  assert.equal(reparsed.secretKey, secretKey);
  assert.equal(reparsed.queryParams.lud16, lud16);

  context.infoEvent = {
    kind: 13194,
    tags: [["encryption", "nip44_v2"]],
  };

  const encryption = await __TESTING__.ensureEncryptionForContext(context);
  assert.equal(encryption.scheme, "nip44_v2");
  const encrypted = await encryption.encrypt("payload");
  assert.match(encrypted, /^nip44:key-b{64}-/);

  resetWalletClient();
})();

await (async () => {
  resetWalletClient();

  window.NostrTools = {
    getPublicKey() {
      return "c".repeat(64);
    },
    nip44: {
      v2: {
        async encrypt(plaintext, key) {
          return `nip44:${key}:${plaintext}`;
        },
        async decrypt(ciphertext, key) {
          return `nip44:${key}:${ciphertext}`;
        },
        utils: {
          getConversationKey(secretBytes, pubkey) {
            return `key-${pubkey}-${secretBytes.length}`;
          },
        },
      },
    },
    nip04: {
      async encrypt() {
        return "nip04";
      },
      async decrypt() {
        return "nip04";
      },
    },
  };

  const walletPubkey = "b".repeat(64);
  const secretKey = "a".repeat(64);
  const relays = ["wss://relay.one.example"];
  const uri =
    `nostr+walletconnect://${walletPubkey}` +
    `?relay=${encodeURIComponent(relays[0])}` +
    `&secret=${secretKey}`;

  const context = ensureActiveState({ nwcUri: uri });
  context.infoEvent = { kind: 13194, tags: [] };

  const encryption = await __TESTING__.ensureEncryptionForContext(context);
  assert.equal(encryption.scheme, "nip04");

  resetWalletClient();
})();

await (async () => {
  resetWalletClient();

  window.NostrTools = {
    getPublicKey() {
      return "c".repeat(64);
    },
    nip44: {
      v2: {
        async encrypt(plaintext, key) {
          return `nip44:${key}:${plaintext}`;
        },
        async decrypt(ciphertext, key) {
          return `nip44:${key}:${ciphertext}`;
        },
        utils: {
          getConversationKey(secretBytes, pubkey) {
            return `key-${pubkey}-${secretBytes.length}`;
          },
        },
      },
    },
    nip04: {
      async encrypt() {
        return "nip04";
      },
      async decrypt() {
        return "nip04";
      },
    },
  };

  const walletPubkey = "b".repeat(64);
  const secretKey = "a".repeat(64);
  const relays = ["wss://relay.one.example"];
  const uri =
    `nostr+walletconnect://${walletPubkey}` +
    `?relay=${encodeURIComponent(relays[0])}` +
    `&secret=${secretKey}`;

  const context = ensureActiveState({ nwcUri: uri });
  context.infoEvent = {
    kind: 13194,
    tags: [["encryption", "nip04"]],
  };

  const encryption = await __TESTING__.ensureEncryptionForContext(context);
  assert.equal(encryption.scheme, "nip04");

  resetWalletClient();
})();

await (async () => {
  resetWalletClient();

  window.NostrTools = {
    getPublicKey() {
      return "c".repeat(64);
    },
    nip04: {
      async encrypt() {
        return "nip04";
      },
      async decrypt() {
        return "nip04";
      },
    },
  };

  const walletPubkey = "b".repeat(64);
  const secretKey = "a".repeat(64);
  const relays = ["wss://relay.one.example"];
  const uri =
    `nostr+walletconnect://${walletPubkey}` +
    `?relay=${encodeURIComponent(relays[0])}` +
    `&secret=${secretKey}`;

  const context = ensureActiveState({ nwcUri: uri });
  context.infoEvent = {
    kind: 13194,
    tags: [["encryption", "nip44_v2"]],
  };

  await assert.rejects(
    () => __TESTING__.ensureEncryptionForContext(context),
    (error) => {
      assert.match(
        error?.message || "",
        /Wallet advertises unsupported encryption schemes: nip44_v2\./
      );
      return true;
    }
  );

  resetWalletClient();
})();

await (async () => {
  resetWalletClient();

  window.NostrTools = {
    getPublicKey() {
      return "c".repeat(64);
    },
    nip44: {
      v2: {
        async encrypt(plaintext, key) {
          return `nip44:${key}:${plaintext}`;
        },
        async decrypt(ciphertext, key) {
          return `nip44:${key}:${ciphertext}`;
        },
        utils: {
          getConversationKey(secretBytes, pubkey) {
            return `key-${pubkey}-${secretBytes.length}`;
          },
        },
      },
    },
    nip04: {
      async encrypt() {
        return "nip04";
      },
      async decrypt() {
        return "nip04";
      },
    },
  };

  const walletPubkey = "b".repeat(64);
  const secretKey = "a".repeat(64);
  const relays = ["wss://relay.one.example"];
  const uri =
    `nostr+walletconnect://${walletPubkey}` +
    `?relay=${encodeURIComponent(relays[0])}` +
    `&secret=${secretKey}`;

  const context = ensureActiveState({ nwcUri: uri });
  context.infoEvent = {
    kind: 13194,
    tags: [["encryption", "nip44_v2 nip04"]],
  };
  context.encryptionState.unsupported.add("nip44_v2");

  const encryption = await __TESTING__.ensureEncryptionForContext(context);
  assert.equal(encryption.scheme, "nip04");

  resetWalletClient();
})();

process.exit(0);
