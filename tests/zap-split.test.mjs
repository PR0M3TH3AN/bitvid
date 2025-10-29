import assert from "node:assert/strict";
import { bech32 } from "@scure/base";

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
  SimplePool: class {
    async list() {
      return [];
    }
    sub() {
      return {
        on() {},
        unsub() {},
      };
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
  throw new Error("Unexpected fetch call during zap split tests.");
};

const { splitAndZap } = await import("../js/payments/zapSplit.js");
const {
  validateZapReceipt,
  __TESTING__: validatorTesting,
} = await import("../js/payments/zapReceiptValidator.js");
const platformAddressModule = await import("../js/payments/platformAddress.js");
const { __resetPlatformAddressCache } = platformAddressModule;
const lnurlModule = await import("../js/payments/lnurl.js");
const {
  encodeLnurlBech32,
  resolveLightningAddress: baseResolveLightningAddress,
  requestInvoice,
} = lnurlModule;
const { decodeLnurlBech32 } = lnurlModule.__TESTING__;
const { nostrClient } = await import("../js/nostr.js");

const DEFAULT_WALLET_RELAYS = [
  "wss://wallet.primary.example",
  "wss://wallet.secondary.example",
  "wss://wallet.primary.example",
];

const BOLT11_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function createDeps({
  commentAllowed = 120,
  platformAddress = "platform@example.com",
  minSendable = 1000,
  maxSendable = 2_000_000,
  allowsNostr = true,
  sendPaymentImplementation,
  walletRelays = DEFAULT_WALLET_RELAYS,
  validatorImplementation,
} = {}) {
  let ensureWalletCalls = 0;
  const sendCalls = [];
  const validatorCalls = [];

  return {
    deps: {
      lnurl: {
        resolveLightningAddress(address) {
          return { ...baseResolveLightningAddress(address) };
        },
        encodeLnurlBech32(url) {
          return encodeLnurlBech32(url);
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
        async requestInvoice(metadata, { amountMsats, comment, zapRequest, lnurl }) {
          return {
            invoice: `bolt11-${metadata.callback}-${amountMsats}-${comment}-${Boolean(
              zapRequest
            )}-${lnurl || ""}`,
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
            relayUrl: walletRelays[0] || null,
            relayUrls: walletRelays.slice(),
            relays: walletRelays.slice(),
          };
        },
        async sendPayment(invoice, { amountSats, zapRequest, lnurl }) {
          sendCalls.push({ invoice, amountSats, zapRequest, lnurl });
          if (typeof sendPaymentImplementation === "function") {
            return sendPaymentImplementation({
              invoice,
              amountSats,
              zapRequest,
              lnurl,
            });
          }
          return {
            invoice,
            amountSats,
            zapRequest,
            lnurl,
          };
        },
      },
      platformAddress: {
        async getPlatformLightningAddress() {
          return platformAddress;
        },
      },
      validator: {
        async validateZapReceipt(payload) {
          validatorCalls.push(payload);
          if (typeof validatorImplementation === "function") {
            return validatorImplementation(payload);
          }
          return {
            status: "skipped",
            reason: "Zap receipt validation is disabled in tests.",
          };
        },
      },
    },
    getEnsureWalletCalls() {
      return ensureWalletCalls;
    },
    getSendCalls() {
      return sendCalls;
    },
    getValidatorCalls() {
      return validatorCalls;
    },
  };
}

function buildTestBolt11Invoice({ amountCode = "10u", descriptionHashHex }) {
  const hrp = `lnbc${amountCode}`;
  const timestamp = 1_700_000_000;

  const timestampWords = [];
  let remaining = timestamp;
  for (let i = 0; i < 7; i += 1) {
    timestampWords.unshift(remaining & 31);
    remaining >>= 5;
  }

  const words = [...timestampWords];

  const pushTag = (tag, dataWords) => {
    const code = BOLT11_CHARSET.indexOf(tag);
    words.push(code);
    const length = dataWords.length;
    words.push((length >> 5) & 31);
    words.push(length & 31);
    words.push(...dataWords);
  };

  const paymentHashHex = "11".repeat(32);
  pushTag("p", bech32.toWords(Buffer.from(paymentHashHex, "hex")));

  if (descriptionHashHex) {
    pushTag("h", bech32.toWords(Buffer.from(descriptionHashHex, "hex")));
  }

  const signatureWords = new Array(104).fill(0);
  const data = [...words, ...signatureWords];

  return bech32.encode(hrp, data, 2000);
}

async function testSplitMath() {
  globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = 10;
  const { deps, getSendCalls, getEnsureWalletCalls, getValidatorCalls } = createDeps();

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

  const creatorResolved = baseResolveLightningAddress(videoEvent.lightningAddress);
  const platformResolved = baseResolveLightningAddress("platform@example.com");

  assert.equal(result.totalAmount, 1000);
  assert.equal(result.creatorShare, 900);
  assert.equal(result.platformShare, 100);
  assert.equal(result.receipts.length, 2);
  assert.equal(getEnsureWalletCalls(), 1);
  assert.equal(getValidatorCalls().length, 2, "validator should run for each share");

  const sendCalls = getSendCalls();
  assert.equal(sendCalls.length, 2, "should send two payments");
  assert.equal(sendCalls[0].amountSats, 900);
  assert.equal(sendCalls[1].amountSats, 100);

  const creatorReceipt = result.receipts[0];
  assert.equal(creatorReceipt.recipientType, "creator");
  assert.equal(creatorReceipt.status, "success");
  assert.equal(creatorReceipt.validation?.status, "skipped");
  assert(creatorReceipt.zapRequest, "creator zap request should be present");
  const parsedZap = JSON.parse(creatorReceipt.zapRequest);
  assert.equal(parsedZap.kind, 9734);
  assert(parsedZap.tags.some((tag) => tag[0] === "amount" && tag[1] === "900000"));

  const relaysTag = parsedZap.tags.find((tag) => Array.isArray(tag) && tag[0] === "relays");
  assert(relaysTag, "relays tag should be present in zap request");
  const expectedRelays = Array.from(
    new Set(
      DEFAULT_WALLET_RELAYS.map((relay) =>
        typeof relay === "string" ? relay.trim() : ""
      ).filter((relay) => relay)
    )
  );
  assert.deepEqual(
    relaysTag.slice(1),
    expectedRelays,
    "relays tag should match wallet relay list"
  );

  const creatorLnurlTag = parsedZap.tags.find(
    (tag) => Array.isArray(tag) && tag[0] === "lnurl"
  );
  assert(creatorLnurlTag, "creator zap should include lnurl tag");
  assert.equal(creatorLnurlTag[1], creatorLnurlTag[1].toLowerCase());
  assert(creatorLnurlTag[1].startsWith("lnurl"));
  assert.equal(
    decodeLnurlBech32(creatorLnurlTag[1]),
    creatorResolved.url
  );

  const platformReceipt = result.receipts[1];
  assert.equal(platformReceipt.recipientType, "platform");
  assert.equal(platformReceipt.status, "success");
  assert.equal(platformReceipt.validation?.status, "skipped");

  const platformZap = JSON.parse(platformReceipt.zapRequest);
  const platformLnurlTag = platformZap.tags.find(
    (tag) => Array.isArray(tag) && tag[0] === "lnurl"
  );
  assert(platformLnurlTag, "platform zap should include lnurl tag");
  assert.equal(platformLnurlTag[1], platformLnurlTag[1].toLowerCase());
  assert(platformLnurlTag[1].startsWith("lnurl"));
  assert.equal(
    decodeLnurlBech32(platformLnurlTag[1]),
    platformResolved.url
  );

  delete globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
}

async function testBech32LightningAddressZapTag() {
  const previousOverride = globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
  globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = 0;

  const { deps } = createDeps();
  const callbackUrl = "https://lnurl.example/api/callback";
  const bech32Address = encodeLnurlBech32(callbackUrl);

  const videoEvent = {
    id: "event-id",
    pubkey: "c".repeat(64),
    lightningAddress: bech32Address,
    tags: [["d", "pointer"]],
    kind: 30078,
  };

  const result = await splitAndZap({ videoEvent, amountSats: 500, comment: "Bech32" }, deps);

  assert.equal(result.platformShare, 0);
  assert.equal(result.receipts.length, 1);

  const parsedZap = JSON.parse(result.receipts[0].zapRequest);
  const lnurlTag = parsedZap.tags.find((tag) => Array.isArray(tag) && tag[0] === "lnurl");
  assert(lnurlTag, "bech32 address zap should include lnurl tag");
  assert.equal(lnurlTag[1], lnurlTag[1].toLowerCase());
  assert.equal(lnurlTag[1], bech32Address.toLowerCase());
  assert.equal(decodeLnurlBech32(lnurlTag[1]), callbackUrl);

  if (previousOverride === undefined) {
    delete globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
  } else {
    globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = previousOverride;
  }
}

async function testUrlLightningAddressZapTag() {
  const previousOverride = globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
  globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = 0;

  const { deps } = createDeps();
  const directUrl = "https://direct-lnurl.example/api/pay";

  const videoEvent = {
    id: "event-id",
    pubkey: "c".repeat(64),
    lightningAddress: directUrl,
    tags: [["d", "pointer"]],
    kind: 30078,
  };

  const result = await splitAndZap({ videoEvent, amountSats: 800, comment: "Direct" }, deps);

  assert.equal(result.platformShare, 0);
  assert.equal(result.receipts.length, 1);

  const parsedZap = JSON.parse(result.receipts[0].zapRequest);
  const lnurlTag = parsedZap.tags.find((tag) => Array.isArray(tag) && tag[0] === "lnurl");
  assert(lnurlTag, "direct url zap should include lnurl tag");
  assert.equal(lnurlTag[1], lnurlTag[1].toLowerCase());
  assert(lnurlTag[1].startsWith("lnurl"));
  assert.equal(decodeLnurlBech32(lnurlTag[1]), directUrl);

  if (previousOverride === undefined) {
    delete globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
  } else {
    globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = previousOverride;
  }
}

async function testRequestInvoiceIncludesLnurlParam() {
  const callback = "https://callback-lnurl.example/api/pay";
  const lnurlValue = encodeLnurlBech32(callback);
  const zapRequest = JSON.stringify({ kind: 9734, content: "zap" });
  const requestedUrls = [];

  const metadata = {
    callback,
    commentAllowed: 0,
  };

  const fetcher = async (url) => {
    requestedUrls.push(url);
    return {
      ok: true,
      async json() {
        return { pr: "bolt11-invoice" };
      },
    };
  };

  const result = await requestInvoice(metadata, {
    amountMsats: 123_000,
    zapRequest,
    lnurl: lnurlValue,
    fetcher,
  });

  assert.equal(result.invoice, "bolt11-invoice");
  assert.equal(requestedUrls.length, 1, "should call fetcher once");

  const [url] = requestedUrls;
  const parsed = new URL(url);

  assert.equal(parsed.searchParams.get("amount"), "123000");
  assert.equal(parsed.searchParams.get("nostr"), zapRequest);
  assert.equal(parsed.searchParams.get("lnurl"), lnurlValue);
}

async function testWaitsForPoolBeforePlatformLookup() {
  const previousOverride = globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
  globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = 10;

  const originalEnsurePool = nostrClient.ensurePool;
  const originalPool = nostrClient.pool;
  const originalPoolPromise = nostrClient.poolPromise;

  nostrClient.pool = null;
  nostrClient.poolPromise = null;

  let poolReady = false;
  let listCalls = 0;
  let ensureCalls = 0;

  const poolStub = {
    async list(relays, filters) {
      assert(poolReady, "should wait for ensurePool to resolve before listing metadata");
      listCalls += 1;
      return [
        {
          pubkey: "f".repeat(64),
          content: JSON.stringify({ lud16: "platform@example.com" }),
          created_at: Math.floor(Date.now() / 1000),
        },
      ];
    },
  };

  nostrClient.ensurePool = () => {
    ensureCalls += 1;
    if (nostrClient.poolPromise) {
      return nostrClient.poolPromise;
    }
    const promise = new Promise((resolve) => {
      setTimeout(() => {
        poolReady = true;
        nostrClient.pool = poolStub;
        nostrClient.poolPromise = Promise.resolve(poolStub);
        resolve(poolStub);
      }, 10);
    });
    nostrClient.poolPromise = promise;
    return promise;
  };

  const { deps: baseDeps } = createDeps();
  const deps = {
    lnurl: baseDeps.lnurl,
    wallet: baseDeps.wallet,
    platformAddress: {
      async getPlatformLightningAddress() {
        const pool = await nostrClient.ensurePool();
        if (pool && typeof pool.list === "function") {
          await pool.list([], []);
        }
        return "platform@example.com";
      },
    },
  };

  const videoEvent = {
    id: "event-id",
    pubkey: "c".repeat(64),
    lightningAddress: "creator@example.com",
    tags: [["d", "pointer"]],
    kind: 30078,
  };

  try {
    const result = await splitAndZap(
      { videoEvent, amountSats: 1000, comment: "Delayed pool" },
      deps
    );

    assert.equal(ensureCalls, 1, "should initialize the pool once");
    assert.equal(listCalls, 1, "should fetch platform metadata once the pool is ready");
    assert.equal(result.platformShare, 100);
    assert.equal(result.receipts.length, 2);
  } finally {
    nostrClient.ensurePool = originalEnsurePool;
    nostrClient.pool = originalPool;
    nostrClient.poolPromise = originalPoolPromise;
    __resetPlatformAddressCache();

    if (previousOverride === undefined) {
      delete globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
    } else {
      globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = previousOverride;
    }
  }
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

async function testPlatformShareFailure() {
  globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = 10;

  const platformCallbackMarker = `${
    baseResolveLightningAddress("platform@example.com").url
  }/callback`;

  const { deps, getSendCalls } = createDeps({
    sendPaymentImplementation: ({ invoice, amountSats, zapRequest }) => {
      if (invoice.includes(platformCallbackMarker)) {
        const error = new Error("Budget exceeded");
        error.code = "budget_exceeded";
        throw error;
      }
      return { invoice, amountSats, zapRequest };
    },
  });

  const videoEvent = {
    id: "event-id",
    pubkey: "c".repeat(64),
    lightningAddress: "creator@example.com",
    tags: [["d", "pointer"]],
    kind: 30078,
  };

  const result = await splitAndZap(
    { videoEvent, amountSats: 1000, comment: "Budget capped" },
    deps
  );

  assert.equal(result.receipts.length, 2, "should return receipts for both shares");

  const [creatorReceipt, platformReceipt] = result.receipts;

  assert.equal(creatorReceipt.recipientType, "creator");
  assert.equal(creatorReceipt.status, "success");
  assert(creatorReceipt.payment, "creator share should still have a payment record");

  assert.equal(platformReceipt.recipientType, "platform");
  assert.equal(platformReceipt.status, "error");
  assert.equal(platformReceipt.payment, null);
  assert(platformReceipt.error instanceof Error);
  assert.match(platformReceipt.error.message, /Budget exceeded/);

  const sendCalls = getSendCalls();
  assert.equal(sendCalls.length, 2, "should attempt each share exactly once");

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

async function testValidateZapReceiptSuccess() {
  const relays = ["wss://relay.validation"];
  const zapRequestEvent = {
    kind: 9734,
    pubkey: "f".repeat(64),
    content: "",
    created_at: 1_700_000_000,
    tags: [
      ["p", "a".repeat(64)],
      ["amount", String(900_000)],
      ["relays", ...relays],
    ],
  };
  const zapRequestString = JSON.stringify(zapRequestEvent);
  const descriptionHash = validatorTesting.computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ amountCode: "9u", descriptionHashHex: descriptionHash });

  const receiptEvent = {
    kind: 9735,
    pubkey: "b".repeat(64),
    tags: [
      ["bolt11", bolt11],
      ["description", zapRequestString],
    ],
  };

  const nostrTools = {
    validateEvent: () => true,
    verifyEvent: () => true,
    SimplePool: class {
      async list(requestedRelays, filters) {
        assert.deepEqual(requestedRelays, relays);
        assert.equal(filters[0]["#bolt11"][0], bolt11.toLowerCase());
        return [receiptEvent];
      }
      close() {}
    },
  };

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      amountSats: 900,
      metadata: { nostrPubkey: receiptEvent.pubkey },
      invoice: { invoice: bolt11 },
      payment: { invoice: bolt11 },
    },
    {
      nostrTools,
      getAmountFromBolt11: () => 900,
    }
  );

  assert.equal(result.status, "passed");
  assert.equal(result.event, receiptEvent);
  assert.deepEqual(result.checkedRelays, relays);
}

async function testValidateZapReceiptRejectsMismatchedDescriptionHash() {
  const relays = ["wss://relay.validation"];
  const zapRequestEvent = {
    kind: 9734,
    pubkey: "f".repeat(64),
    content: "",
    created_at: 1_700_000_000,
    tags: [
      ["p", "a".repeat(64)],
      ["amount", String(1_000_000)],
      ["relays", ...relays],
    ],
  };
  const zapRequestString = JSON.stringify(zapRequestEvent);
  const mismatchHash = "aa".repeat(32);
  const bolt11 = buildTestBolt11Invoice({ amountCode: "10u", descriptionHashHex: mismatchHash });

  const receiptEvent = {
    kind: 9735,
    pubkey: "b".repeat(64),
    tags: [
      ["bolt11", bolt11],
      ["description", zapRequestString],
    ],
  };

  const nostrTools = {
    validateEvent: () => true,
    verifyEvent: () => true,
    SimplePool: class {
      async list() {
        return [receiptEvent];
      }
      close() {}
    },
  };

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      amountSats: 1_000,
      metadata: { nostrPubkey: receiptEvent.pubkey },
      invoice: { invoice: bolt11 },
      payment: { invoice: bolt11 },
    },
    {
      nostrTools,
      getAmountFromBolt11: () => 1_000,
    }
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason || "", /description hash/i);
}

function testExtractDescriptionHashFromBolt11() {
  const descriptionHashHex = "bb".repeat(32);
  const invoice = buildTestBolt11Invoice({ amountCode: "1m", descriptionHashHex });
  const extracted = validatorTesting.extractDescriptionHashFromBolt11(invoice);
  assert.equal(extracted, descriptionHashHex);
}

await testSplitMath();
await testBech32LightningAddressZapTag();
await testUrlLightningAddressZapTag();
await testRequestInvoiceIncludesLnurlParam();
await testWaitsForPoolBeforePlatformLookup();
await testLnurlBounds();
await testMissingAddress();
await testWalletFailure();
await testStringFeeOverride();
await testPlatformShareFailure();
await testValidateZapReceiptSuccess();
await testValidateZapReceiptRejectsMismatchedDescriptionHash();
testExtractDescriptionHashFromBolt11();

console.log("zap-split tests passed");
