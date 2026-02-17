import assert from "node:assert/strict";
import { test, describe, it } from "node:test";
import {
  formatZapAmount,
  aggregateZapTotals,
  normalizeZapReceipt,
} from "../../../js/ui/dm/zapHelpers.js";

describe("formatZapAmount", () => {
  it("formats standard amounts correctly", () => {
    assert.equal(formatZapAmount(100), "100 sats");
    assert.equal(formatZapAmount(1000), "1,000 sats");
    assert.equal(formatZapAmount(1234567), "1,234,567 sats");
  });

  it("formats compact amounts correctly", () => {
    // With maximumFractionDigits: 0, compact notation rounds to nearest integer
    assert.equal(formatZapAmount(100, { compact: true }), "100 sats");
    assert.equal(formatZapAmount(1000, { compact: true }), "1K sats");
    assert.equal(formatZapAmount(1200, { compact: true }), "1K sats");
    assert.equal(formatZapAmount(1500, { compact: true }), "2K sats");
    assert.equal(formatZapAmount(1234567, { compact: true }), "1M sats");
  });

  it("handles zero and small numbers", () => {
    assert.equal(formatZapAmount(0), "0 sats");
    // normalizeAmount uses Math.round
    assert.equal(formatZapAmount(0.5), "1 sats");
    assert.equal(formatZapAmount(0.4), "0 sats");
  });

  it("handles invalid inputs gracefully", () => {
    assert.equal(formatZapAmount(NaN), "0 sats");
    assert.equal(formatZapAmount(null), "0 sats");
    assert.equal(formatZapAmount(undefined), "0 sats");
    assert.equal(formatZapAmount("invalid"), "0 sats");
  });

  it("handles string number inputs", () => {
    assert.equal(formatZapAmount("100"), "100 sats");
  });
});

describe("aggregateZapTotals", () => {
  it("aggregates totals correctly", () => {
    const receipts = [
      { amountSats: 100, conversationId: "c1", profileId: "p1" },
      { amountSats: 200, conversationId: "c1", profileId: "p2" },
      { amountSats: 50, conversationId: "c2", profileId: "p1" },
    ];

    const result = aggregateZapTotals(receipts);

    assert.equal(result.overallSats, 350);
    assert.equal(result.totalsByConversation.get("c1"), 300);
    assert.equal(result.totalsByConversation.get("c2"), 50);
    assert.equal(result.totalsByProfile.get("p1"), 150);
    assert.equal(result.totalsByProfile.get("p2"), 200);
  });

  it("handles empty input", () => {
    const result = aggregateZapTotals([]);
    assert.equal(result.overallSats, 0);
    assert.equal(result.totalsByConversation.size, 0);
    assert.equal(result.totalsByProfile.size, 0);
  });

  it("handles non-array input", () => {
    const result = aggregateZapTotals(null);
    assert.equal(result.overallSats, 0);
    assert.equal(result.totalsByConversation.size, 0);
    assert.equal(result.totalsByProfile.size, 0);
  });

  it("handles missing or invalid amounts", () => {
    const receipts = [
      { amountSats: 100, conversationId: "c1" },
      { conversationId: "c1" }, // missing amount
      { amountSats: "invalid", conversationId: "c1" },
      { amount: 50, conversationId: "c1" }, // fallback to amount property
    ];

    const result = aggregateZapTotals(receipts);
    // 100 + 0 + 0 + 50 = 150
    assert.equal(result.overallSats, 150);
    assert.equal(result.totalsByConversation.get("c1"), 150);
  });

  it("handles missing IDs", () => {
    const receipts = [
      { amountSats: 100 },
      { amountSats: 200, conversationId: "c1" },
      { amountSats: 300, profileId: "p1" },
    ];

    const result = aggregateZapTotals(receipts);
    assert.equal(result.overallSats, 600);
    assert.equal(result.totalsByConversation.get("c1"), 200);
    assert.equal(result.totalsByConversation.size, 1);
    assert.equal(result.totalsByProfile.get("p1"), 300);
    assert.equal(result.totalsByProfile.size, 1);
  });
});

describe("normalizeZapReceipt", () => {
  it("normalizes valid receipt", () => {
    const receipt = { amountSats: 100, other: "field" };
    const normalized = normalizeZapReceipt(receipt);
    assert.equal(normalized.amountSats, 100);
    assert.equal(normalized.other, "field");
  });

  it("normalizes receipt with amount fallback", () => {
    const receipt = { amount: 100 };
    const normalized = normalizeZapReceipt(receipt);
    assert.equal(normalized.amountSats, 100);
    // It should preserve original fields
    assert.equal(normalized.amount, 100);
  });

  it("normalizes empty receipt", () => {
    const normalized = normalizeZapReceipt({});
    assert.equal(normalized.amountSats, 0);
  });

  it("normalizes undefined receipt", () => {
      // The function default param is {} so calling with undefined works
      const normalized = normalizeZapReceipt(undefined);
      assert.equal(normalized.amountSats, 0);
  });

  it("normalizes invalid amount", () => {
    const normalized = normalizeZapReceipt({ amountSats: "invalid" });
    assert.equal(normalized.amountSats, 0);
  });
});
