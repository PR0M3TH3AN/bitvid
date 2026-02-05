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
  throw new Error("Unexpected fetch call during lnurl tests.");
};

const {
  encodeLnurlBech32,
  resolveLightningAddress,
  fetchPayServiceData,
  validateInvoiceAmount,
  requestInvoice,
  __TESTING__,
} = await import("../js/payments/lnurl.js");

const { bech32Encode, bech32Decode, decodeLnurlBech32, convertWords, createChecksum } =
  __TESTING__;

// ---------------------------------------------------------------------------
// bech32 encode/decode roundtrip
// ---------------------------------------------------------------------------

(function testBech32RoundtripSimpleUrl() {
  const url = "https://example.com/pay";
  const encoded = encodeLnurlBech32(url);
  assert(encoded.startsWith("lnurl"), "encoded should start with lnurl prefix");
  const decoded = decodeLnurlBech32(encoded);
  assert.equal(decoded, url);
})();

(function testBech32RoundtripWithSpecialChars() {
  const url = "https://example.com/api?user=alice&amount=1000";
  const encoded = encodeLnurlBech32(url);
  const decoded = decodeLnurlBech32(encoded);
  assert.equal(decoded, url);
})();

(function testBech32RoundtripWithPath() {
  const url = "https://wallet.example.org/.well-known/lnurlp/bob";
  const encoded = encodeLnurlBech32(url);
  const decoded = decodeLnurlBech32(encoded);
  assert.equal(decoded, url);
})();

(function testBech32EncodeOutputIsLowercase() {
  const encoded = encodeLnurlBech32("https://example.com");
  assert.equal(encoded, encoded.toLowerCase());
})();

// ---------------------------------------------------------------------------
// bech32Decode edge cases
// ---------------------------------------------------------------------------

(function testBech32DecodeRejectsNonString() {
  assert.throws(() => bech32Decode(123), /must be a string/);
  assert.throws(() => bech32Decode(null), /must be a string/);
  assert.throws(() => bech32Decode(undefined), /must be a string/);
})();

(function testBech32DecodeRejectsEmpty() {
  assert.throws(() => bech32Decode(""), /cannot be empty/);
  assert.throws(() => bech32Decode("   "), /cannot be empty/);
})();

(function testBech32DecodeRejectsMixedCase() {
  const encoded = encodeLnurlBech32("https://example.com");
  const mixedCase = encoded[0].toUpperCase() + encoded.slice(1).toLowerCase();
  if (mixedCase !== encoded.toLowerCase() && mixedCase !== encoded.toUpperCase()) {
    assert.throws(() => bech32Decode(mixedCase), /mix upper and lower/);
  }
})();

(function testBech32DecodeAcceptsAllUppercase() {
  const encoded = encodeLnurlBech32("https://example.com");
  const upper = encoded.toUpperCase();
  const { prefix } = bech32Decode(upper);
  assert.equal(prefix, "lnurl");
})();

// ---------------------------------------------------------------------------
// convertWords
// ---------------------------------------------------------------------------

(function testConvertWordsRoundtrip() {
  const original = [72, 101, 108, 108, 111]; // "Hello"
  const words5 = convertWords(original, 8, 5, { pad: true });
  const restored = convertWords(words5, 5, 8, { pad: false });
  assert.deepEqual(restored, original);
})();

(function testConvertWordsRejectsInvalidValue() {
  assert.throws(() => convertWords([-1], 8, 5), /Invalid bech32 word value/);
  assert.throws(() => convertWords([256], 8, 5), /Invalid bech32 word value/);
})();

// ---------------------------------------------------------------------------
// encodeLnurlBech32
// ---------------------------------------------------------------------------

(function testEncodeLnurlBech32RejectsEmpty() {
  assert.throws(() => encodeLnurlBech32(""), /missing/i);
  assert.throws(() => encodeLnurlBech32("  "), /missing/i);
})();

(function testEncodeLnurlBech32RejectsNonString() {
  assert.throws(() => encodeLnurlBech32(null), /missing/i);
  assert.throws(() => encodeLnurlBech32(undefined), /missing/i);
})();

// ---------------------------------------------------------------------------
// decodeLnurlBech32
// ---------------------------------------------------------------------------

(function testDecodeLnurlBech32RejectsWrongPrefix() {
  const encoded = encodeLnurlBech32("https://example.com");
  // Replace prefix: lnurl -> lnbcx (invalid prefix)
  const modified = "bc1" + encoded.slice(5);
  assert.throws(() => decodeLnurlBech32(modified));
})();

// ---------------------------------------------------------------------------
// resolveLightningAddress
// ---------------------------------------------------------------------------

(function testResolveEmailFormat() {
  const result = resolveLightningAddress("alice@example.com");
  assert.equal(result.type, "lud16");
  assert.equal(result.address, "alice@example.com");
  assert(result.url.includes("example.com"));
  assert(result.url.includes("/.well-known/lnurlp/alice"));
})();

(function testResolveEmailFormatLowercase() {
  const result = resolveLightningAddress("Alice@Example.COM");
  assert(result.url.includes("alice"), "username should be lowercased in URL");
})();

(function testResolveLnurlFormat() {
  const url = "https://pay.example.com/callback";
  const encoded = encodeLnurlBech32(url);
  const result = resolveLightningAddress(encoded);
  assert.equal(result.type, "lud06");
  assert.equal(result.url, url);
})();

(function testResolveHttpsUrl() {
  const url = "https://example.com/api/pay";
  const result = resolveLightningAddress(url);
  assert.equal(result.type, "url");
  assert.equal(result.url, url);
})();

(function testResolveHttpUrl() {
  const url = "http://example.com/api/pay";
  const result = resolveLightningAddress(url);
  assert.equal(result.type, "url");
  assert.equal(result.url, url);
})();

(function testResolveRejectsEmpty() {
  assert.throws(() => resolveLightningAddress(""), /required/i);
  assert.throws(() => resolveLightningAddress("  "), /required/i);
  assert.throws(() => resolveLightningAddress(null), /required/i);
  assert.throws(() => resolveLightningAddress(undefined), /required/i);
})();

(function testResolveRejectsInvalidEmailMissingParts() {
  assert.throws(() => resolveLightningAddress("@example.com"), /Invalid/);
  assert.throws(() => resolveLightningAddress("alice@"), /Invalid/);
  assert.throws(() => resolveLightningAddress("@"), /Invalid/);
})();

(function testResolveRejectsUnsupportedFormat() {
  assert.throws(() => resolveLightningAddress("just-a-string"), /Unsupported/);
})();

(function testResolveTrimsWhitespace() {
  const result = resolveLightningAddress("  alice@example.com  ");
  assert.equal(result.address, "alice@example.com");
})();

// ---------------------------------------------------------------------------
// fetchPayServiceData
// ---------------------------------------------------------------------------

async function testFetchPayServiceDataSuccess() {
  const mockFetcher = async () => ({
    ok: true,
    async json() {
      return {
        callback: "https://example.com/callback",
        minSendable: 1000,
        maxSendable: 1000000,
        commentAllowed: 100,
        allowsNostr: true,
        nostrPubkey: "a".repeat(64),
        metadata: '[ ["text/plain","test"] ]',
        tag: "payRequest",
      };
    },
  });

  const result = await fetchPayServiceData("https://example.com/.well-known/lnurlp/alice", {
    fetcher: mockFetcher,
  });

  assert.equal(result.callback, "https://example.com/callback");
  assert.equal(result.minSendable, 1000);
  assert.equal(result.maxSendable, 1000000);
  assert.equal(result.commentAllowed, 100);
  assert.equal(result.allowsNostr, true);
  assert.equal(result.nostrPubkey, "a".repeat(64));
  assert.equal(result.tag, "payRequest");
  assert(Array.isArray(result.metadata));
  assert.equal(result.metadata.length, 1);
}

async function testFetchPayServiceDataHttpError() {
  const mockFetcher = async () => ({
    ok: false,
    status: 404,
  });

  await assert.rejects(
    () => fetchPayServiceData("https://example.com/lnurl", { fetcher: mockFetcher }),
    /404/
  );
}

async function testFetchPayServiceDataInvalidJson() {
  const mockFetcher = async () => ({
    ok: true,
    async json() {
      throw new SyntaxError("Unexpected token");
    },
  });

  await assert.rejects(
    () => fetchPayServiceData("https://example.com/lnurl", { fetcher: mockFetcher }),
    /not return JSON/
  );
}

async function testFetchPayServiceDataMissingCallback() {
  const mockFetcher = async () => ({
    ok: true,
    async json() {
      return { minSendable: 1000, maxSendable: 1000000 };
    },
  });

  await assert.rejects(
    () => fetchPayServiceData("https://example.com/lnurl", { fetcher: mockFetcher }),
    /missing/i
  );
}

async function testFetchPayServiceDataErrorStatus() {
  const mockFetcher = async () => ({
    ok: true,
    async json() {
      return {
        status: "ERROR",
        reason: "Rate limit exceeded",
      };
    },
  });

  await assert.rejects(
    () => fetchPayServiceData("https://example.com/lnurl", { fetcher: mockFetcher }),
    /Rate limit exceeded/
  );
}

async function testFetchPayServiceDataErrorStatusNoReason() {
  const mockFetcher = async () => ({
    ok: true,
    async json() {
      return { status: "error" };
    },
  });

  await assert.rejects(
    () => fetchPayServiceData("https://example.com/lnurl", { fetcher: mockFetcher }),
    /returned an error/i
  );
}

async function testFetchPayServiceDataInvalidMetadataGracefullySkipped() {
  const mockFetcher = async () => ({
    ok: true,
    async json() {
      return {
        callback: "https://example.com/callback",
        metadata: "not-valid-json{{{",
      };
    },
  });

  const result = await fetchPayServiceData("https://example.com/lnurl", {
    fetcher: mockFetcher,
  });
  assert.deepEqual(result.metadata, []);
}

async function testFetchPayServiceDataNormalizesNumericFields() {
  const mockFetcher = async () => ({
    ok: true,
    async json() {
      return {
        callback: "https://example.com/callback",
        minSendable: "not-a-number",
        maxSendable: null,
        commentAllowed: -5,
      };
    },
  });

  const result = await fetchPayServiceData("https://example.com/lnurl", {
    fetcher: mockFetcher,
  });
  assert.equal(result.minSendable, 0);
  assert.equal(result.maxSendable, 0);
  assert.equal(result.commentAllowed, 0);
}

async function testFetchPayServiceDataRejectsEmptyUrl() {
  await assert.rejects(
    () => fetchPayServiceData("", { fetcher: async () => ({ ok: true, json: async () => ({}) }) }),
    /missing/i
  );
}

// ---------------------------------------------------------------------------
// validateInvoiceAmount
// ---------------------------------------------------------------------------

(function testValidateInvoiceAmountWithinLimits() {
  const metadata = { minSendable: 1000, maxSendable: 1000000 };
  const result = validateInvoiceAmount(metadata, 100);
  assert.equal(result.amountMsats, 100000);
})();

(function testValidateInvoiceAmountBelowMinimum() {
  const metadata = { minSendable: 5000, maxSendable: 1000000 };
  assert.throws(() => validateInvoiceAmount(metadata, 1), /below the minimum/);
})();

(function testValidateInvoiceAmountAboveMaximum() {
  const metadata = { minSendable: 1000, maxSendable: 100000 };
  assert.throws(() => validateInvoiceAmount(metadata, 200), /exceeds the maximum/);
})();

(function testValidateInvoiceAmountZero() {
  const metadata = { minSendable: 0, maxSendable: 1000000 };
  assert.throws(() => validateInvoiceAmount(metadata, 0), /positive integer/);
})();

(function testValidateInvoiceAmountNegative() {
  const metadata = { minSendable: 0, maxSendable: 1000000 };
  assert.throws(() => validateInvoiceAmount(metadata, -5), /positive integer/);
})();

(function testValidateInvoiceAmountNonNumeric() {
  const metadata = { minSendable: 0, maxSendable: 1000000 };
  assert.throws(() => validateInvoiceAmount(metadata, "abc"), /positive integer/);
})();

(function testValidateInvoiceAmountMissingMetadata() {
  assert.throws(() => validateInvoiceAmount(null, 100), /metadata is required/i);
  assert.throws(() => validateInvoiceAmount(undefined, 100), /metadata is required/i);
  assert.throws(() => validateInvoiceAmount("not-object", 100), /metadata is required/i);
})();

(function testValidateInvoiceAmountExactBoundaries() {
  const metadata = { minSendable: 10000, maxSendable: 100000 };
  const resultMin = validateInvoiceAmount(metadata, 10);
  assert.equal(resultMin.amountMsats, 10000);
  const resultMax = validateInvoiceAmount(metadata, 100);
  assert.equal(resultMax.amountMsats, 100000);
})();

(function testValidateInvoiceAmountNoMinMax() {
  const metadata = {};
  const result = validateInvoiceAmount(metadata, 50);
  assert.equal(result.amountMsats, 50000);
})();

// ---------------------------------------------------------------------------
// requestInvoice
// ---------------------------------------------------------------------------

async function testRequestInvoiceSuccess() {
  const metadata = {
    callback: "https://example.com/callback",
    commentAllowed: 50,
  };

  const capturedUrls = [];
  const fetcher = async (url) => {
    capturedUrls.push(url);
    return {
      ok: true,
      async json() {
        return { pr: "lnbc100u1p0..." };
      },
    };
  };

  const result = await requestInvoice(metadata, {
    amountSats: 100,
    comment: "Great video!",
    fetcher,
  });

  assert.equal(result.invoice, "lnbc100u1p0...");
  assert.equal(capturedUrls.length, 1);

  const url = new URL(capturedUrls[0]);
  assert.equal(url.searchParams.get("amount"), "100000");
  assert.equal(url.searchParams.get("comment"), "Great video!");
}

async function testRequestInvoiceCommentTruncation() {
  const metadata = {
    callback: "https://example.com/callback",
    commentAllowed: 5,
  };

  const capturedUrls = [];
  const fetcher = async (url) => {
    capturedUrls.push(url);
    return {
      ok: true,
      async json() {
        return { pr: "lnbc1..." };
      },
    };
  };

  await requestInvoice(metadata, {
    amountSats: 10,
    comment: "A much longer comment that should be truncated",
    fetcher,
  });

  const url = new URL(capturedUrls[0]);
  assert.equal(url.searchParams.get("comment"), "A muc");
}

async function testRequestInvoiceCommentDisabled() {
  const metadata = {
    callback: "https://example.com/callback",
    commentAllowed: 0,
  };

  const capturedUrls = [];
  const fetcher = async (url) => {
    capturedUrls.push(url);
    return {
      ok: true,
      async json() {
        return { pr: "lnbc1..." };
      },
    };
  };

  await requestInvoice(metadata, {
    amountSats: 10,
    comment: "Should be excluded",
    fetcher,
  });

  const url = new URL(capturedUrls[0]);
  assert.equal(url.searchParams.get("comment"), null, "comment should not be sent when commentAllowed is 0");
}

async function testRequestInvoiceUsesAmountMsats() {
  const metadata = {
    callback: "https://example.com/callback",
    commentAllowed: 0,
  };

  const capturedUrls = [];
  const fetcher = async (url) => {
    capturedUrls.push(url);
    return {
      ok: true,
      async json() {
        return { pr: "lnbc1..." };
      },
    };
  };

  await requestInvoice(metadata, {
    amountMsats: 55555,
    fetcher,
  });

  const url = new URL(capturedUrls[0]);
  assert.equal(url.searchParams.get("amount"), "55555");
}

async function testRequestInvoiceMissingInvoice() {
  const metadata = {
    callback: "https://example.com/callback",
    commentAllowed: 0,
  };

  const fetcher = async () => ({
    ok: true,
    async json() {
      return {};
    },
  });

  await assert.rejects(
    () => requestInvoice(metadata, { amountSats: 10, fetcher }),
    /did not return an invoice/i
  );
}

async function testRequestInvoiceHttpError() {
  const metadata = {
    callback: "https://example.com/callback",
    commentAllowed: 0,
  };

  const fetcher = async () => ({ ok: false, status: 500 });

  await assert.rejects(
    () => requestInvoice(metadata, { amountSats: 10, fetcher }),
    /500/
  );
}

async function testRequestInvoiceErrorStatus() {
  const metadata = {
    callback: "https://example.com/callback",
    commentAllowed: 0,
  };

  const fetcher = async () => ({
    ok: true,
    async json() {
      return { status: "ERROR", reason: "Service unavailable" };
    },
  });

  await assert.rejects(
    () => requestInvoice(metadata, { amountSats: 10, fetcher }),
    /Service unavailable/
  );
}

async function testRequestInvoiceMissingMetadata() {
  await assert.rejects(
    () => requestInvoice(null, { amountSats: 10 }),
    /metadata is required/i
  );
}

async function testRequestInvoiceIncludesZapRequestAndLnurl() {
  const metadata = {
    callback: "https://example.com/callback",
    commentAllowed: 0,
  };

  const capturedUrls = [];
  const fetcher = async (url) => {
    capturedUrls.push(url);
    return {
      ok: true,
      async json() {
        return { pr: "lnbc1..." };
      },
    };
  };

  const zapReq = JSON.stringify({ kind: 9734 });
  await requestInvoice(metadata, {
    amountSats: 10,
    zapRequest: zapReq,
    lnurl: "lnurl1test",
    fetcher,
  });

  const url = new URL(capturedUrls[0]);
  assert.equal(url.searchParams.get("nostr"), zapReq);
  assert.equal(url.searchParams.get("lnurl"), "lnurl1test");
}

// Run async tests
await testFetchPayServiceDataSuccess();
await testFetchPayServiceDataHttpError();
await testFetchPayServiceDataInvalidJson();
await testFetchPayServiceDataMissingCallback();
await testFetchPayServiceDataErrorStatus();
await testFetchPayServiceDataErrorStatusNoReason();
await testFetchPayServiceDataInvalidMetadataGracefullySkipped();
await testFetchPayServiceDataNormalizesNumericFields();
await testFetchPayServiceDataRejectsEmptyUrl();

await testRequestInvoiceSuccess();
await testRequestInvoiceCommentTruncation();
await testRequestInvoiceCommentDisabled();
await testRequestInvoiceUsesAmountMsats();
await testRequestInvoiceMissingInvoice();
await testRequestInvoiceHttpError();
await testRequestInvoiceErrorStatus();
await testRequestInvoiceMissingMetadata();
await testRequestInvoiceIncludesZapRequestAndLnurl();

console.log("lnurl tests passed");
