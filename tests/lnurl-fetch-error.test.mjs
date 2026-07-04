// A recipient's Lightning endpoint being unreachable (down, or — common for
// LNURL — missing CORS headers) makes the browser fetch reject with
// "Failed to fetch". The zap flow should surface a clear, actionable message,
// not the raw error.

import assert from "node:assert/strict";
import test from "node:test";
import { fetchPayServiceData } from "../js/payments/lnurl.js";

test("network/CORS failure throws a friendly, coded error", async () => {
  const fetcher = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(
    () =>
      fetchPayServiceData("https://example.com/.well-known/lnurlp/x", {
        fetcher,
        retryDelayMs: 0,
      }),
    (err) => {
      assert.match(err.message, /reach this recipient's Lightning address/i);
      assert.equal(err.code, "lnurl-unreachable");
      assert.ok(err.cause, "preserves the original error as cause");
      return true;
    },
  );
});

test("a non-OK HTTP response still reports a status error (unchanged)", async () => {
  const fetcher = async () => ({ ok: false, status: 502 });
  await assert.rejects(
    () =>
      fetchPayServiceData("https://example.com/.well-known/lnurlp/x", {
        fetcher,
        retryDelayMs: 0,
      }),
    /Failed to load LNURL metadata \(502\)/,
  );
});

// LNURL servers intermittently return {status:"ERROR"} bodies (observed live
// against strike.me: "Could not get user information" on one request, a valid
// callback on the next). A single retry must absorb that blip; a PERSISTENT
// error must still surface the server's reason after the retry budget.
test("a transient LNURL ERROR body recovers on the retry", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        json: async () => ({ status: "ERROR", reason: "Could not get user information" }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        tag: "payRequest",
        callback: "https://example.com/cb",
        minSendable: 1000,
        maxSendable: 100000,
      }),
    };
  };
  const meta = await fetchPayServiceData(
    "https://example.com/.well-known/lnurlp/x",
    { fetcher, retryDelayMs: 0 },
  );
  assert.equal(meta.callback, "https://example.com/cb");
  assert.equal(calls, 2, "exactly one retry");
});

test("a persistent LNURL ERROR still fails with the server's reason", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({ status: "ERROR", reason: "Could not get user information" }),
    };
  };
  await assert.rejects(
    () =>
      fetchPayServiceData("https://example.com/.well-known/lnurlp/x", {
        fetcher,
        retryDelayMs: 0,
      }),
    /Could not get user information/,
  );
  assert.equal(calls, 2, "retry budget spent, then surfaced");
});

test("a valid LNURL pay response parses (no false friendly error)", async () => {
  const fetcher = async () => ({
    ok: true,
    json: async () => ({
      callback: "https://example.com/cb",
      minSendable: 1000,
      maxSendable: 100000,
      tag: "payRequest",
    }),
  });
  const meta = await fetchPayServiceData("https://example.com/.well-known/lnurlp/x", {
    fetcher,
  });
  assert.equal(meta.callback, "https://example.com/cb");
});

import { checkLightningAddressZappable } from "../js/payments/lnurl.js";

// Helper: a fetcher that returns a valid LNURL pay-service-data JSON response.
function okFetcher({ allowsNostr = true } = {}) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      tag: "payRequest",
      callback: "https://host/callback",
      minSendable: 1000,
      maxSendable: 1000000,
      metadata: "[]",
      allowsNostr,
      nostrPubkey: allowsNostr ? "a".repeat(64) : "",
    }),
  });
}

test("checkLightningAddressZappable: reachable + Nostr-enabled host -> ok", async () => {
  const result = await checkLightningAddressZappable("name@host.example", {
    fetcher: okFetcher({ allowsNostr: true }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "ok");
  assert.equal(result.address, "name@host.example");
});

test("checkLightningAddressZappable: CORS/offline host -> not ok, coded", async () => {
  const result = await checkLightningAddressZappable("name@host.example", {
    fetcher: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "lnurl-unreachable");
  assert.equal(result.address, "name@host.example");
});

test("checkLightningAddressZappable: reachable but not Nostr-aware -> ok with no-nostr", async () => {
  const result = await checkLightningAddressZappable("name@host.example", {
    fetcher: okFetcher({ allowsNostr: false }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "no-nostr");
  assert.equal(result.allowsNostr, false);
});

test("checkLightningAddressZappable: invalid address -> not ok", async () => {
  const result = await checkLightningAddressZappable("", { fetcher: okFetcher() });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid-address");
});
