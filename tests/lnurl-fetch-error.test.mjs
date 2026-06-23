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
    () => fetchPayServiceData("https://example.com/.well-known/lnurlp/x", { fetcher }),
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
    () => fetchPayServiceData("https://example.com/.well-known/lnurlp/x", { fetcher }),
    /Failed to load LNURL metadata \(502\)/,
  );
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
