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
  getEventHash() {
    return "0".repeat(64);
  },
  signEvent() {
    return "sig-stub";
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
  throw new Error("Unexpected fetch call during validator tests.");
};

const {
  validateZapReceipt,
  __TESTING__: validatorTesting,
} = await import("../js/payments/zapReceiptValidator.js");

const { computeZapRequestHash, extractDescriptionHashFromBolt11 } = validatorTesting;

const BOLT11_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

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

function buildZapRequest({ relays = ["wss://relay.example"], pubkey = "f".repeat(64) } = {}) {
  return {
    kind: 9734,
    pubkey,
    content: "",
    created_at: 1_700_000_000,
    tags: [
      ["p", "a".repeat(64)],
      ["amount", String(1_000_000)],
      ["relays", ...relays],
    ],
  };
}

// ---------------------------------------------------------------------------
// computeZapRequestHash
// ---------------------------------------------------------------------------

(function testComputeZapRequestHashDeterministic() {
  const input = JSON.stringify({ kind: 9734, content: "test" });
  const hash1 = computeZapRequestHash(input);
  const hash2 = computeZapRequestHash(input);
  assert.equal(hash1, hash2);
  assert.equal(typeof hash1, "string");
  assert(hash1.length > 0, "hash should be non-empty");
})();

(function testComputeZapRequestHashDifferentInputs() {
  const hash1 = computeZapRequestHash("input-a");
  const hash2 = computeZapRequestHash("input-b");
  assert.notEqual(hash1, hash2);
})();

(function testComputeZapRequestHashEmptyString() {
  const hash = computeZapRequestHash("");
  assert.equal(typeof hash, "string");
  assert(hash.length > 0);
})();

(function testComputeZapRequestHashNonString() {
  // Treats non-string as empty string
  const hash = computeZapRequestHash(null);
  const hashEmpty = computeZapRequestHash("");
  assert.equal(hash, hashEmpty);
})();

// ---------------------------------------------------------------------------
// extractDescriptionHashFromBolt11
// ---------------------------------------------------------------------------

(function testExtractDescriptionHashFromValidBolt11() {
  const descriptionHashHex = "bb".repeat(32);
  const invoice = buildTestBolt11Invoice({ amountCode: "1m", descriptionHashHex });
  const extracted = extractDescriptionHashFromBolt11(invoice);
  assert.equal(extracted, descriptionHashHex);
})();

(function testExtractDescriptionHashFromBolt11WithoutHash() {
  const invoice = buildTestBolt11Invoice({ amountCode: "1m" });
  const extracted = extractDescriptionHashFromBolt11(invoice);
  assert.equal(extracted, null);
})();

(function testExtractDescriptionHashFromEmptyString() {
  assert.equal(extractDescriptionHashFromBolt11(""), null);
})();

(function testExtractDescriptionHashFromNull() {
  assert.equal(extractDescriptionHashFromBolt11(null), null);
})();

(function testExtractDescriptionHashFromUndefined() {
  assert.equal(extractDescriptionHashFromBolt11(undefined), null);
})();

(function testExtractDescriptionHashFromGarbage() {
  assert.equal(extractDescriptionHashFromBolt11("not-a-bolt11-invoice"), null);
})();

// ---------------------------------------------------------------------------
// validateZapReceipt — missing/invalid zap request
// ---------------------------------------------------------------------------

async function testValidateSkippedWhenNoZapRequest() {
  const result = await validateZapReceipt({});
  assert.equal(result.status, "skipped");
  assert.match(result.reason, /not provided/i);
}

async function testValidateSkippedWhenZapRequestIsEmpty() {
  const result = await validateZapReceipt({ zapRequest: "" });
  assert.equal(result.status, "skipped");
  assert.match(result.reason, /not provided/i);
}

async function testValidateFailsWhenZapRequestIsInvalidJson() {
  const result = await validateZapReceipt({ zapRequest: "not-json{{{" });
  assert.equal(result.status, "failed");
  assert.match(result.reason, /could not be parsed/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — no relays
// ---------------------------------------------------------------------------

async function testValidateFailsWhenNoRelaysInZapRequest() {
  const zapEvent = {
    kind: 9734,
    pubkey: "f".repeat(64),
    tags: [["p", "a".repeat(64)]],
  };
  const result = await validateZapReceipt({
    zapRequest: JSON.stringify(zapEvent),
  });
  assert.equal(result.status, "failed");
  assert.match(result.reason, /relays/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — missing invoice
// ---------------------------------------------------------------------------

async function testValidateFailsWhenNoInvoice() {
  const zapEvent = buildZapRequest();
  const result = await validateZapReceipt({
    zapRequest: JSON.stringify(zapEvent),
  });
  assert.equal(result.status, "failed");
  assert.match(result.reason, /invoice.*not available/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — description hash mismatch
// ---------------------------------------------------------------------------

async function testValidateFailsOnDescriptionHashMismatch() {
  const zapEvent = buildZapRequest();
  const zapRequestString = JSON.stringify(zapEvent);
  const mismatchHash = "cc".repeat(32);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: mismatchHash });

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: {
        validateEvent: () => true,
        verifyEvent: () => true,
        SimplePool: class {
          async list() {
            return [];
          }
          close() {}
        },
      },
    }
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /description hash/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — invoice has no description hash
// ---------------------------------------------------------------------------

async function testValidateFailsWhenInvoiceLacksDescriptionHash() {
  const zapEvent = buildZapRequest();
  const zapRequestString = JSON.stringify(zapEvent);
  const bolt11 = buildTestBolt11Invoice({});

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: {
        validateEvent: () => true,
        verifyEvent: () => true,
        SimplePool: class {
          async list() {
            return [];
          }
          close() {}
        },
      },
    }
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /description hash/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — amount mismatch
// ---------------------------------------------------------------------------

async function testValidateFailsOnAmountMismatch() {
  const zapEvent = buildZapRequest();
  const zapRequestString = JSON.stringify(zapEvent);
  const descriptionHash = computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: descriptionHash });

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      amountSats: 500,
      metadata: { nostrPubkey: "b".repeat(64) },
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: {
        validateEvent: () => true,
        verifyEvent: () => true,
        SimplePool: class {
          async list() {
            return [];
          }
          close() {}
        },
      },
      getAmountFromBolt11: () => 999,
    }
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /amount.*did not match/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — missing nostrPubkey in metadata
// ---------------------------------------------------------------------------

async function testValidateFailsWhenMetadataMissingPubkey() {
  const zapEvent = buildZapRequest();
  const zapRequestString = JSON.stringify(zapEvent);
  const descriptionHash = computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: descriptionHash });

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      amountSats: 0,
      metadata: {},
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: {
        validateEvent: () => true,
        verifyEvent: () => true,
        SimplePool: class {
          async list() {
            return [];
          }
          close() {}
        },
      },
    }
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /nostrPubkey/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — no receipt found on relays
// ---------------------------------------------------------------------------

async function testValidateFailsWhenNoReceiptOnRelays() {
  const zapEvent = buildZapRequest();
  const zapRequestString = JSON.stringify(zapEvent);
  const descriptionHash = computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: descriptionHash });

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      metadata: { nostrPubkey: "b".repeat(64) },
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: {
        validateEvent: () => true,
        verifyEvent: () => true,
        SimplePool: class {
          async list() {
            return [];
          }
          close() {}
        },
      },
    }
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /no zap receipt/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — receipt with wrong pubkey
// ---------------------------------------------------------------------------

async function testValidateFailsWhenReceiptPubkeyDoesNotMatch() {
  const relays = ["wss://relay.test"];
  const zapEvent = buildZapRequest({ relays });
  const zapRequestString = JSON.stringify(zapEvent);
  const descriptionHash = computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: descriptionHash });

  const wrongPubkeyReceipt = {
    kind: 9735,
    pubkey: "d".repeat(64),
    tags: [
      ["bolt11", bolt11],
      ["description", zapRequestString],
    ],
  };

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      metadata: { nostrPubkey: "b".repeat(64) },
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: {
        validateEvent: () => true,
        verifyEvent: () => true,
        SimplePool: class {
          async list() {
            return [wrongPubkeyReceipt];
          }
          close() {}
        },
      },
    }
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /no compliant zap receipt/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — receipt with invalid signature
// ---------------------------------------------------------------------------

async function testValidateFailsWhenReceiptSignatureInvalid() {
  const relays = ["wss://relay.test"];
  const zapEvent = buildZapRequest({ relays });
  const zapRequestString = JSON.stringify(zapEvent);
  const descriptionHash = computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: descriptionHash });

  const receipt = {
    kind: 9735,
    pubkey: "b".repeat(64),
    tags: [
      ["bolt11", bolt11],
      ["description", zapRequestString],
    ],
  };

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      metadata: { nostrPubkey: "b".repeat(64) },
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: {
        validateEvent: () => true,
        verifyEvent: () => false,
        SimplePool: class {
          async list() {
            return [receipt];
          }
          close() {}
        },
      },
    }
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /no compliant zap receipt/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — successful validation
// ---------------------------------------------------------------------------

async function testValidateReceiptSuccess() {
  const relays = ["wss://relay.test"];
  const zapEvent = buildZapRequest({ relays });
  const zapRequestString = JSON.stringify(zapEvent);
  const descriptionHash = computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: descriptionHash });

  const receipt = {
    kind: 9735,
    pubkey: "b".repeat(64),
    tags: [
      ["bolt11", bolt11],
      ["description", zapRequestString],
    ],
  };

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      metadata: { nostrPubkey: "b".repeat(64) },
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: {
        validateEvent: () => true,
        verifyEvent: () => true,
        SimplePool: class {
          async list() {
            return [receipt];
          }
          close() {}
        },
      },
    }
  );

  assert.equal(result.status, "passed");
  assert.equal(result.event, receipt);
  assert.deepEqual(result.checkedRelays, relays);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — override injection
// ---------------------------------------------------------------------------

async function testValidateReceiptWithOverrides() {
  const relays = ["wss://relay.test"];
  const zapEvent = buildZapRequest({ relays });
  const zapRequestString = JSON.stringify(zapEvent);
  const descriptionHash = computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: descriptionHash });

  const receipt = {
    kind: 9735,
    pubkey: "b".repeat(64),
    tags: [
      ["bolt11", bolt11],
      ["description", zapRequestString],
    ],
  };

  let listEventsCalled = false;
  let createPoolCalled = false;

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      amountSats: 42,
      metadata: { nostrPubkey: "b".repeat(64) },
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: {
        validateEvent: () => true,
        verifyEvent: () => true,
        SimplePool: class {
          async list() {
            return [];
          }
          close() {}
        },
      },
      createPool(tools) {
        createPoolCalled = true;
        return {
          list: async () => [],
          close() {},
        };
      },
      listEvents(pool, poolRelays, filters) {
        listEventsCalled = true;
        assert.deepEqual(poolRelays, relays);
        return [receipt];
      },
      getAmountFromBolt11: () => 42,
    }
  );

  assert.equal(result.status, "passed");
  assert(createPoolCalled, "createPool override should be called");
  assert(listEventsCalled, "listEvents override should be called");
}

// ---------------------------------------------------------------------------
// validateZapReceipt — nostrTools unavailable
// ---------------------------------------------------------------------------

async function testValidateFailsWhenNostrToolsUnavailable() {
  const zapEvent = buildZapRequest();
  const zapRequestString = JSON.stringify(zapEvent);
  const descriptionHash = computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: descriptionHash });

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      metadata: { nostrPubkey: "b".repeat(64) },
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: 42, // truthy but not an object → triggers "unavailable"
    }
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /unavailable/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — nostrTools missing validate/verify
// ---------------------------------------------------------------------------

async function testValidateFailsWhenToolsMissingValidators() {
  const zapEvent = buildZapRequest();
  const zapRequestString = JSON.stringify(zapEvent);
  const descriptionHash = computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: descriptionHash });

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      metadata: { nostrPubkey: "b".repeat(64) },
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: { someOtherProp: true },
    }
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /missing/i);
}

// ---------------------------------------------------------------------------
// validateZapReceipt — invoice from payment object
// ---------------------------------------------------------------------------

async function testValidateExtractsInvoiceFromPayment() {
  const relays = ["wss://relay.test"];
  const zapEvent = buildZapRequest({ relays });
  const zapRequestString = JSON.stringify(zapEvent);
  const descriptionHash = computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: descriptionHash });

  const receipt = {
    kind: 9735,
    pubkey: "b".repeat(64),
    tags: [
      ["bolt11", bolt11],
      ["description", zapRequestString],
    ],
  };

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      metadata: { nostrPubkey: "b".repeat(64) },
      payment: { bolt11 },
    },
    {
      nostrTools: {
        validateEvent: () => true,
        verifyEvent: () => true,
        SimplePool: class {
          async list() {
            return [receipt];
          }
          close() {}
        },
      },
    }
  );

  assert.equal(result.status, "passed");
}

// ---------------------------------------------------------------------------
// validateZapReceipt — receipt missing description tag
// ---------------------------------------------------------------------------

async function testValidateFailsWhenReceiptMissingDescription() {
  const relays = ["wss://relay.test"];
  const zapEvent = buildZapRequest({ relays });
  const zapRequestString = JSON.stringify(zapEvent);
  const descriptionHash = computeZapRequestHash(zapRequestString);
  const bolt11 = buildTestBolt11Invoice({ descriptionHashHex: descriptionHash });

  const receiptNoDesc = {
    kind: 9735,
    pubkey: "b".repeat(64),
    tags: [["bolt11", bolt11]],
  };

  const result = await validateZapReceipt(
    {
      zapRequest: zapRequestString,
      metadata: { nostrPubkey: "b".repeat(64) },
      invoice: { invoice: bolt11 },
    },
    {
      nostrTools: {
        validateEvent: () => true,
        verifyEvent: () => true,
        SimplePool: class {
          async list() {
            return [receiptNoDesc];
          }
          close() {}
        },
      },
    }
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /no compliant zap receipt/i);
}

// Run all async tests
await testValidateSkippedWhenNoZapRequest();
await testValidateSkippedWhenZapRequestIsEmpty();
await testValidateFailsWhenZapRequestIsInvalidJson();
await testValidateFailsWhenNoRelaysInZapRequest();
await testValidateFailsWhenNoInvoice();
await testValidateFailsOnDescriptionHashMismatch();
await testValidateFailsWhenInvoiceLacksDescriptionHash();
await testValidateFailsOnAmountMismatch();
await testValidateFailsWhenMetadataMissingPubkey();
await testValidateFailsWhenNoReceiptOnRelays();
await testValidateFailsWhenReceiptPubkeyDoesNotMatch();
await testValidateFailsWhenReceiptSignatureInvalid();
await testValidateReceiptSuccess();
await testValidateReceiptWithOverrides();
await testValidateFailsWhenNostrToolsUnavailable();
await testValidateFailsWhenToolsMissingValidators();
await testValidateExtractsInvoiceFromPayment();
await testValidateFailsWhenReceiptMissingDescription();

console.log("zap-receipt-validator tests passed");
