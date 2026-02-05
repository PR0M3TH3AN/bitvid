import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (typeof globalThis.localStorage === "undefined") {
  const storage = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(String(key), String(value));
    },
    removeItem(key) {
      storage.delete(String(key));
    },
    clear() {
      storage.clear();
    },
  };
}

if (typeof window.localStorage === "undefined") {
  window.localStorage = globalThis.localStorage;
}

const nostrToolsStub = {
  getEventHash(event) {
    const base = JSON.stringify(event);
    let hash = 0;
    for (let i = 0; i < base.length; i += 1) {
      hash = (hash * 33 + base.charCodeAt(i)) % 0xffffffff;
    }
    return hash.toString(16).padStart(8, "0");
  },
  signEvent(event, secret) {
    return `sig-${(secret || "").slice(0, 8)}-${event.kind}`;
  },
  nip19: {
    decode(value) {
      if (typeof value === "string" && value.startsWith("npub")) {
        return { type: "npub", data: "f".repeat(64) };
      }
      return null;
    },
  },
  SimplePool: class {
    async list() {
      return [];
    }
    sub() {
      return { on() {}, unsub() {} };
    }
    async get() {
      return null;
    }
    async ensureRelay() {
      return { close() {}, url: "" };
    }
  },
};

window.NostrTools = nostrToolsStub;
globalThis.NostrTools = nostrToolsStub;

globalThis.fetch = async () => {
  throw new Error("Unexpected fetch call during zap-requests tests.");
};

const {
  buildZapRequestPayload,
  signZapRequest,
  __TESTING__,
} = await import("../js/payments/zapRequests.js");

const { normalizeRelayList, resolveLnurlTag } = __TESTING__;

const { encodeLnurlBech32 } = await import("../js/payments/lnurl.js");

// ---------------------------------------------------------------------------
// normalizeRelayList
// ---------------------------------------------------------------------------

(function testNormalizeRelayListDeduplicates() {
  const result = normalizeRelayList([
    "wss://relay.one",
    "wss://relay.two",
    "wss://relay.one",
    "wss://relay.two",
  ]);
  assert.deepEqual(result, ["wss://relay.one", "wss://relay.two"]);
})();

(function testNormalizeRelayListFiltersNonStrings() {
  const result = normalizeRelayList(["wss://relay.one", 123, null, undefined, "", "wss://relay.two"]);
  assert.deepEqual(result, ["wss://relay.one", "wss://relay.two"]);
})();

(function testNormalizeRelayListTrimsWhitespace() {
  const result = normalizeRelayList(["  wss://relay.one  ", "wss://relay.two "]);
  assert.deepEqual(result, ["wss://relay.one", "wss://relay.two"]);
})();

(function testNormalizeRelayListEmptyInput() {
  assert.deepEqual(normalizeRelayList([]), []);
  assert.deepEqual(normalizeRelayList(null), []);
  assert.deepEqual(normalizeRelayList(undefined), []);
  assert.deepEqual(normalizeRelayList("not-array"), []);
})();

// ---------------------------------------------------------------------------
// resolveLnurlTag
// ---------------------------------------------------------------------------

(function testResolveLnurlTagWithBech32Address() {
  const lnurlAddress = encodeLnurlBech32("https://example.com/callback");
  const resolved = { address: lnurlAddress, url: "https://example.com/callback" };
  const tag = resolveLnurlTag(resolved);
  assert.equal(tag, lnurlAddress.toLowerCase());
})();

(function testResolveLnurlTagWithUrlAddress() {
  const resolved = { address: "alice@example.com", url: "https://example.com/.well-known/lnurlp/alice" };
  const tag = resolveLnurlTag(resolved);
  assert(tag.startsWith("lnurl"), "should encode URL to bech32 lnurl");
})();

(function testResolveLnurlTagWithNoAddress() {
  const tag = resolveLnurlTag({ url: "" });
  assert.equal(tag, "");
})();

(function testResolveLnurlTagWithNull() {
  const tag = resolveLnurlTag(null);
  assert.equal(tag, "");
})();

// ---------------------------------------------------------------------------
// buildZapRequestPayload
// ---------------------------------------------------------------------------

(function testBuildZapRequestPayloadMinimal() {
  const event = buildZapRequestPayload({
    senderPubkey: "a".repeat(64),
    recipientPubkey: "b".repeat(64),
    amountSats: 100,
  });

  assert.equal(event.kind, 9734);
  assert.equal(event.pubkey, "a".repeat(64));
  assert(event.created_at > 0, "should have a timestamp");

  const pTag = event.tags.find((t) => t[0] === "p");
  assert(pTag, "should have a p tag");
  assert.equal(pTag[1], "b".repeat(64));

  const amountTag = event.tags.find((t) => t[0] === "amount");
  assert(amountTag, "should have an amount tag");
  assert.equal(amountTag[1], "100000");
})();

(function testBuildZapRequestPayloadAllParams() {
  const event = buildZapRequestPayload({
    senderPubkey: "a".repeat(64),
    recipientPubkey: "b".repeat(64),
    relays: ["wss://relay.one", "wss://relay.two"],
    amountSats: 500,
    comment: "Test zap",
    lnurl: "lnurl1test",
    eventId: "c".repeat(64),
    coordinate: "30078:bbbb:pointer",
    createdAt: 1700000000,
    additionalTags: [["custom", "value"]],
  });

  assert.equal(event.kind, 9734);
  assert.equal(event.pubkey, "a".repeat(64));
  assert.equal(event.created_at, 1700000000);
  assert.equal(event.content, "Test zap");

  const relaysTag = event.tags.find((t) => t[0] === "relays");
  assert(relaysTag, "should have relays tag");
  assert(relaysTag.includes("wss://relay.one"));
  assert(relaysTag.includes("wss://relay.two"));

  const eTag = event.tags.find((t) => t[0] === "e");
  assert(eTag, "should have an e tag for eventId");
  assert.equal(eTag[1], "c".repeat(64));

  const aTag = event.tags.find((t) => t[0] === "a");
  assert(aTag, "should have an a tag for coordinate");
  assert.equal(aTag[1], "30078:bbbb:pointer");

  const lnurlTag = event.tags.find((t) => t[0] === "lnurl");
  assert(lnurlTag, "should have lnurl tag");
  assert.equal(lnurlTag[1], "lnurl1test");

  const customTag = event.tags.find((t) => t[0] === "custom");
  assert(customTag, "should include additionalTags");
  assert.equal(customTag[1], "value");
})();

(function testBuildZapRequestPayloadCreatedAtDefault() {
  const before = Math.floor(Date.now() / 1000);
  const event = buildZapRequestPayload({
    senderPubkey: "a".repeat(64),
    recipientPubkey: "b".repeat(64),
    amountSats: 10,
  });
  const after = Math.floor(Date.now() / 1000);
  assert(event.created_at >= before && event.created_at <= after);
})();

(function testBuildZapRequestPayloadCustomCreatedAt() {
  const event = buildZapRequestPayload({
    senderPubkey: "a".repeat(64),
    recipientPubkey: "b".repeat(64),
    amountSats: 10,
    createdAt: 1234567890,
  });
  assert.equal(event.created_at, 1234567890);
})();

// ---------------------------------------------------------------------------
// signZapRequest
// ---------------------------------------------------------------------------

async function testSignZapRequestRequiresSigner() {
  const event = buildZapRequestPayload({
    senderPubkey: "a".repeat(64),
    recipientPubkey: "b".repeat(64),
    amountSats: 10,
  });

  await assert.rejects(
    () => signZapRequest(event, null),
    /signer is required/i
  );

  await assert.rejects(
    () => signZapRequest(event, {}),
    /signer is required/i
  );

  await assert.rejects(
    () => signZapRequest(event, { signEvent: "not-a-function" }),
    /signer is required/i
  );
}

async function testSignZapRequestCallsSigner() {
  const event = buildZapRequestPayload({
    senderPubkey: "a".repeat(64),
    recipientPubkey: "b".repeat(64),
    amountSats: 10,
  });

  let signedWith = null;
  const signer = {
    signEvent(eventToSign) {
      signedWith = eventToSign;
      return { ...eventToSign, sig: "test-signature" };
    },
  };

  const signed = await signZapRequest(event, signer);
  assert(signedWith, "signer should have been called");
  assert.equal(signed.sig, "test-signature");
}

// ---------------------------------------------------------------------------
// Run async tests
// ---------------------------------------------------------------------------

await testSignZapRequestRequiresSigner();
await testSignZapRequestCallsSigner();

console.log("zap-requests tests passed");
