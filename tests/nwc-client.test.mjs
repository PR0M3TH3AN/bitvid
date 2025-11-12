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

await (async () => {
  resetWalletClient();

  const originalWebSocket = globalThis.WebSocket;
  const RESPONSE_KIND = 23195;

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this._listeners = new Map();
      this._responseSubscriptionId = null;
      setTimeout(() => {
        this.readyState = FakeWebSocket.OPEN;
        this._emit("open");
      }, 0);
    }

    addEventListener(type, handler) {
      if (!this._listeners.has(type)) {
        this._listeners.set(type, new Set());
      }
      this._listeners.get(type).add(handler);
    }

    removeEventListener(type, handler) {
      const listeners = this._listeners.get(type);
      if (listeners) {
        listeners.delete(handler);
      }
    }

    send(payload) {
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch (error) {
        return;
      }

      const [type] = parsed;
      if (type === "REQ") {
        const subscription = parsed[1];
        const filters = parsed[2];
        if (filters?.kinds && filters.kinds.includes(RESPONSE_KIND)) {
          this._responseSubscriptionId = subscription;
        }
        return;
      }

      if (type === "EVENT") {
        const event = parsed[1];
        const state = __TESTING__.getActiveState();
        const context = state?.context || null;
        const encryption = context?.encryption || null;
        if (!context || !encryption || !this._responseSubscriptionId) {
          return;
        }

        Promise.resolve()
          .then(() => encryption.decrypt(event.content))
          .then((plaintext) => {
            const requestPayload = JSON.parse(plaintext);
            const responsePayload = {
              id: requestPayload.id,
              result_type: "pay_invoice",
              result: { preimage: "test-preimage" },
            };
            return encryption.encrypt(JSON.stringify(responsePayload));
          })
          .then((ciphertext) => {
            if (!ciphertext) {
              return;
            }
            const tools = window.NostrTools || {};
            const responseEvent = {
              pubkey: context.walletPubkey,
              kind: RESPONSE_KIND,
              content: ciphertext,
              tags: [
                ["p", context.clientPubkey],
                ["e", event.id],
              ],
              created_at: Math.floor(Date.now() / 1000),
            };
            if (typeof tools.getEventHash === "function") {
              responseEvent.id = tools.getEventHash(responseEvent);
            } else {
              responseEvent.id = `resp-${Date.now()}`;
            }
            if (typeof tools.signEvent === "function") {
              responseEvent.sig = tools.signEvent(responseEvent, context.secretKey);
            }
            const message = JSON.stringify([
              "EVENT",
              this._responseSubscriptionId,
              responseEvent,
            ]);
            setTimeout(() => {
              this._emit("message", { data: message });
            }, 0);
          })
          .catch(() => {});
      }
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED;
      this._emit("close", {});
    }

    _emit(type, event = {}) {
      const listeners = this._listeners.get(type);
      if (!listeners) {
        return;
      }
      for (const handler of Array.from(listeners)) {
        try {
          handler(event);
        } catch (error) {
          // ignore
        }
      }
    }
  }

  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSED = 3;

  globalThis.WebSocket = FakeWebSocket;

  let eventCounter = 0;
  const encode = (value) => Buffer.from(value, "utf8").toString("base64");
  const decode = (value) => Buffer.from(value, "base64").toString("utf8");

  window.NostrTools = {
    getPublicKey() {
      return "c".repeat(64);
    },
    getEventHash(event) {
      eventCounter += 1;
      return `event-${eventCounter}`;
    },
    signEvent(event) {
      return `sig-${event.id || "unknown"}`;
    },
    nip04: {
      async encrypt(secretKey, pubkey, plaintext) {
        return `nip04:${encode(plaintext)}`;
      },
      async decrypt(secretKey, pubkey, ciphertext) {
        const payload =
          typeof ciphertext === "string" && ciphertext.startsWith("nip04:")
            ? ciphertext.slice("nip04:".length)
            : ciphertext;
        return decode(payload);
      },
    },
    nip44: {
      v2: {
        async encrypt(plaintext, key) {
          return `nip44:${key}:${encode(plaintext)}`;
        },
        async decrypt(ciphertext, key) {
          if (typeof ciphertext !== "string") {
            return "";
          }
          const parts = ciphertext.split(":");
          const encoded = parts.slice(2).join(":");
          return decode(encoded);
        },
        utils: {
          getConversationKey(secretBytes, pubkey) {
            return `key-${pubkey}-${secretBytes.length}`;
          },
        },
      },
    },
  };

  const walletPubkey = "b".repeat(64);
  const secretKey = "a".repeat(64);
  const relay = "wss://relay.budget.example";
  const budget = 1000n;
  const uri =
    `nostr+walletconnect://${walletPubkey}` +
    `?relay=${encodeURIComponent(relay)}` +
    `&secret=${secretKey}` +
    `&budget=${budget.toString()}`;

  const context = ensureActiveState({ nwcUri: uri });
  context.infoEvent = { kind: 13194, tags: [["encryption", "nip04"]] };

  try {
    const first = await nwcModule.sendPayment("lnbc1budgettest", {
      settings: { nwcUri: uri },
      amountSats: 1,
    });

    assert.ok(first);
    assert.ok(context.budgetTracker);
    assert.equal(context.budgetTracker.totalMsats, budget);
    assert.equal(context.budgetTracker.spentMsats, 1000n);

    await assert.rejects(
      () =>
        nwcModule.sendPayment("lnbc1budgettest", {
          settings: { nwcUri: uri },
          amountSats: 1,
        }),
      (error) => {
        assert.equal(error.code, "NWC_BUDGET_EXHAUSTED");
        assert.match(error.message || "", /Budget exceeded/i);
        return true;
      }
    );
    assert.equal(context.budgetTracker.exhausted, true);

    const higherBudget = 5000n;
    const upgradedUri =
      `nostr+walletconnect://${walletPubkey}` +
      `?relay=${encodeURIComponent(relay)}` +
      `&secret=${secretKey}` +
      `&budget=${higherBudget.toString()}`;

    const nextContext = ensureActiveState({ nwcUri: upgradedUri });
    nextContext.infoEvent = { kind: 13194, tags: [["encryption", "nip04"]] };

    assert.ok(nextContext.budgetTracker);
    assert.equal(nextContext.budgetTracker.totalMsats, higherBudget);
    assert.equal(nextContext.budgetTracker.spentMsats, 0n);
    assert.equal(nextContext.budgetTracker.exhausted, false);
  } finally {
    if (originalWebSocket) {
      globalThis.WebSocket = originalWebSocket;
    } else {
      delete globalThis.WebSocket;
    }
    resetWalletClient();
  }
})();

process.exit(0);
