// #47 §5.9: the popularity chart gains a zaps-over-time (orange) series with a
// visible date axis. buildZapSatsTimeSeries buckets cumulative SATS from 9735
// receipts + verified tallies, deduped by payment_hash (same rule as the badge
// store). buildPopularityChartSvg draws two token-colored lines + date ticks.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-zap-sats-series
//       given: "zap events (9735) across days, incl. a duplicate payment_hash"
//       when: "buildZapSatsTimeSeries buckets them"
//       then: "cumulative sats per day; a repeated payment counts once"
//     - id: SCN-popularity-svg
//       given: "views + zaps cumulative series"
//       when: "buildPopularityChartSvg renders"
//       then: "two <polyline> series (accent + zap colors) and visible date <text> ticks"
//   observable_outcomes:
//     - "series buckets/cumulative/total"
//     - "SVG polyline count, series color classes, date-tick text present"
//   determinism_controls:
//     - "in-test bech32 bolt11 vector; injected getSats; JSDOM"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import { bech32 } from "../vendor/crypto-helpers.bundle.min.js";
import {
  buildZapSatsTimeSeries,
  buildPopularityChartSvg,
} from "../js/viewCountChart.js";

const lenWords = (n) => [n >> 5, n & 31];
function bolt11WithPaymentHash(fillByte) {
  const pWords = bech32.toWords(new Uint8Array(32).fill(fillByte));
  const words = [0, 0, 0, 0, 0, 0, 0, 1, ...lenWords(pWords.length), ...pWords, ...new Array(104).fill(0)];
  return bech32.encode("lnbc", words, 2000);
}
const DAY = 86400;
const receipt = (id, createdAt, fillByte) => ({
  id,
  kind: 9735,
  created_at: createdAt,
  tags: [["bolt11", bolt11WithPaymentHash(fillByte)]],
});
const tools = { nip57: { getSatoshisAmountFromBolt11: () => 500 } };

test("buildZapSatsTimeSeries: cumulative sats per day", () => {
  const events = [
    receipt("a", 10 * DAY + 100, 0x11),
    receipt("b", 11 * DAY + 100, 0x22),
    receipt("c", 11 * DAY + 200, 0x33),
  ];
  const { series, total } = buildZapSatsTimeSeries(events, { tools });
  assert.equal(total, 1500, "3 × 500 sats");
  assert.equal(series.length, 2, "two day buckets");
  assert.equal(series[0].sats, 500);
  assert.equal(series[1].sats, 1000);
  assert.equal(series[1].cumulative, 1500, "cumulative across days");
});

test("buildZapSatsTimeSeries: a repeated payment_hash is counted once", () => {
  const events = [
    receipt("a", 10 * DAY, 0xab),
    receipt("b", 10 * DAY, 0xab), // same payment_hash (same bolt11 fill) → dup
  ];
  const { total } = buildZapSatsTimeSeries(events, { tools });
  assert.equal(total, 500, "deduped by payment_hash, not 1000");
});

test("buildZapSatsTimeSeries: empty/garbage → empty series", () => {
  assert.deepEqual(buildZapSatsTimeSeries([], { tools }), { series: [], total: 0 });
  assert.deepEqual(buildZapSatsTimeSeries(null, { tools }), { series: [], total: 0 });
});

test("buildPopularityChartSvg: two colored lines + visible date ticks", () => {
  const doc = new JSDOM("<!DOCTYPE html><body></body>").window.document;
  const views = [
    { bucketStart: 10 * DAY, cumulative: 3 },
    { bucketStart: 12 * DAY, cumulative: 8 },
  ];
  const zaps = [
    { bucketStart: 11 * DAY, cumulative: 500 },
    { bucketStart: 12 * DAY, cumulative: 2100 },
  ];
  const svg = buildPopularityChartSvg(doc, { views, zaps });

  const polylines = svg.querySelectorAll("polyline");
  assert.equal(polylines.length, 2, "one line per series");
  assert.ok(svg.querySelector("g.text-accent polyline"), "views line uses the accent color");
  assert.ok(svg.querySelector("g.text-zap polyline"), "zaps line uses the zap color");

  const ticks = svg.querySelectorAll("text");
  assert.ok(ticks.length >= 2, "visible x-axis date ticks rendered");
  assert.ok(
    Array.from(ticks).every((t) => t.textContent && t.textContent.length > 0),
    "each tick has a formatted date label",
  );
  assert.match(svg.getAttribute("aria-label"), /views and .* sats zapped/);
});

test("buildPopularityChartSvg: no data → labelled empty, no lines", () => {
  const doc = new JSDOM("<!DOCTYPE html><body></body>").window.document;
  const svg = buildPopularityChartSvg(doc, { views: [], zaps: [] });
  assert.equal(svg.querySelectorAll("polyline").length, 0);
  assert.match(svg.getAttribute("aria-label"), /No views or zaps/i);
});
