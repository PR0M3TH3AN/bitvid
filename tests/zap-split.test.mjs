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
      if (typeof value !== "string") {
        throw new Error("Invalid nip19 input");
      }
      if (value.startsWith("npub")) {
        return { type: "npub", data: "f".repeat(64) };
      }
      return null;
    },
  },
};

window.NostrTools = nostrToolsStub;
globalThis.NostrTools = nostrToolsStub;

globalThis.fetch = async () => {
  throw new Error("Unexpected fetch call during zap split tests.");
};

const { splitAndZap } = await import("../js/payments/zapSplit.js");

function createDeps({
  commentAllowed = 120,
  platformAddress = "platform@example.com",
  minSendable = 1000,
  maxSendable = 2_000_000,
  allowsNostr = true,
} = {}) {
  let ensureWalletCalls = 0;
  const sendCalls = [];

  return {
    deps: {
      lnurl: {
        resolveLightningAddress(address) {
          return {
            type: address.includes("platform") ? "platform" : "creator",
            url: `https://lnurl.test/${address}`,
            address,
          };
        },
        async fetchPayServiceData(url) {
          const isPlatform = url.includes("platform");
          return {
            callback: `${url}/callback`,
            minSendable,
            maxSendable,
            commentAllowed,
            allowsNostr,
            nostrPubkey: isPlatform ? "b".repeat(64) : "a".repeat(64),
            raw: {},
          };
        },
        validateInvoiceAmount(metadata, amount) {
          if (amount * 1000 < metadata.minSendable) {
            throw new Error("below-minimum");
          }
          if (amount * 1000 > metadata.maxSendable) {
            throw new Error("above-maximum");
          }
          return { amountMsats: amount * 1000 };
        },
        async requestInvoice(metadata, { amountMsats, comment, zapRequest }) {
          return {
            invoice: `bolt11-${metadata.callback}-${amountMsats}-${comment}-${Boolean(
              zapRequest
            )}`,
            raw: {},
          };
        },
      },
      wallet: {
        async ensureWallet() {
          ensureWalletCalls += 1;
          return {
            clientPubkey: "c".repeat(64),
            secretKey: "1".repeat(64),
          };
        },
        async sendPayment(invoice, { amountSats, zapRequest }) {
          sendCalls.push({ invoice, amountSats, zapRequest });
          return {
            invoice,
            amountSats,
            zapRequest,
          };
        },
      },
      platformAddress: {
        async getPlatformLightningAddress() {
          return platformAddress;
        },
      },
    },
    getEnsureWalletCalls() {
      return ensureWalletCalls;
    },
    getSendCalls() {
      return sendCalls;
    },
  };
}

async function testSplitMath() {
  globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = 10;
  const { deps, getSendCalls, getEnsureWalletCalls } = createDeps();

  const videoEvent = {
    id: "event-id",
    pubkey: "c".repeat(64),
    lightningAddress: "creator@example.com",
    tags: [["d", "pointer"]],
    kind: 30078,
  };

  const result = await splitAndZap(
    { videoEvent, amountSats: 1000, comment: "Great video!" },
    deps
  );

  assert.equal(result.totalAmount, 1000);
  assert.equal(result.creatorShare, 900);
  assert.equal(result.platformShare, 100);
  assert.equal(result.receipts.length, 2);
  assert.equal(getEnsureWalletCalls(), 1);

  const sendCalls = getSendCalls();
  assert.equal(sendCalls.length, 2, "should send two payments");
  assert.equal(sendCalls[0].amountSats, 900);
  assert.equal(sendCalls[1].amountSats, 100);

  const creatorReceipt = result.receipts[0];
  assert.equal(creatorReceipt.recipientType, "creator");
  assert(creatorReceipt.zapRequest, "creator zap request should be present");
  const parsedZap = JSON.parse(creatorReceipt.zapRequest);
  assert.equal(parsedZap.kind, 9734);
  assert(parsedZap.tags.some((tag) => tag[0] === "amount" && tag[1] === "900000"));

  delete globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
}

async function testStringFeeOverride() {
  const videoEvent = {
    id: "event-id",
    pubkey: "c".repeat(64),
    lightningAddress: "creator@example.com",
    tags: [["d", "pointer"]],
    kind: 30078,
  };

  globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = "70/30";
  const seventyThirty = createDeps();
  const ratioResult = await splitAndZap(
    { videoEvent, amountSats: 1000, comment: "Great video!" },
    seventyThirty.deps
  );

  assert.equal(ratioResult.creatorShare, 700);
  assert.equal(ratioResult.platformShare, 300);
  const ratioSendCalls = seventyThirty.getSendCalls();
  assert.equal(ratioSendCalls.length, 2, "should send two payments for ratio");
  assert.equal(ratioSendCalls[0].amountSats, 700);
  assert.equal(ratioSendCalls[1].amountSats, 300);

  globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = "30%";
  const percentOverride = createDeps();
  const percentResult = await splitAndZap(
    { videoEvent, amountSats: 200, comment: "Another zap" },
    percentOverride.deps
  );

  assert.equal(percentResult.creatorShare, 140);
  assert.equal(percentResult.platformShare, 60);

  delete globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
}

async function testLnurlBounds() {
  globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = 0;
  const depsWrapper = createDeps({ minSendable: 5_000 });

  const videoEvent = {
    id: "event-id",
    pubkey: "c".repeat(64),
    lightningAddress: "creator@example.com",
    kind: 30078,
    tags: [],
  };

  await assert.rejects(
    () => splitAndZap({ videoEvent, amountSats: 4 }, depsWrapper.deps),
    /below-minimum/
  );

  delete globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
}

async function testMissingAddress() {
  globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = 15;
  const depsWrapper = createDeps({ platformAddress: null });

  const noCreatorEvent = {
    id: "event-id",
    pubkey: "c".repeat(64),
    lightningAddress: "",
    kind: 30078,
    tags: [],
  };

  await assert.rejects(
    () => splitAndZap({ videoEvent: noCreatorEvent, amountSats: 100 }, depsWrapper.deps),
    /Lightning address/
  );

  const creatorEvent = {
    id: "event-id",
    pubkey: "c".repeat(64),
    lightningAddress: "creator@example.com",
    kind: 30078,
    tags: [],
  };

  await assert.rejects(
    () => splitAndZap({ videoEvent: creatorEvent, amountSats: 100 }, depsWrapper.deps),
    /Platform Lightning address is unavailable/
  );

  delete globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
}

async function testWalletFailure() {
  const deps = {
    lnurl: createDeps().deps.lnurl,
    wallet: {
      async ensureWallet() {
        throw new Error("wallet offline");
      },
      async sendPayment() {
        throw new Error("should not call sendPayment");
      },
    },
    platformAddress: createDeps().deps.platformAddress,
  };

  const videoEvent = {
    id: "event-id",
    pubkey: "c".repeat(64),
    lightningAddress: "creator@example.com",
    kind: 30078,
    tags: [],
  };

  await assert.rejects(
    () => splitAndZap({ videoEvent, amountSats: 100 }, deps),
    /wallet offline/
  );
}

await testSplitMath();
await testLnurlBounds();
await testMissingAddress();
await testWalletFailure();
await testStringFeeOverride();

console.log("zap-split tests passed");
