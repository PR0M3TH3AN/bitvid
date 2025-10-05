import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

const { __TESTING__ } = await import("../js/payments/nwcClient.js");
const { buildPayInvoiceParams } = __TESTING__;

await (async () => {
  const params = buildPayInvoiceParams({
    invoice: "bolt11-invoice",
    amountSats: 123,
    zapRequest: "zap-request-json",
  });

  assert.equal(params.invoice, "bolt11-invoice");
  assert.equal(params.amount, 123_000);
  assert.equal(params.zap_request, "zap-request-json");
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

process.exit(0);
