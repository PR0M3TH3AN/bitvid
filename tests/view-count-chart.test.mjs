// #26: the popularity chart buckets view events into a cumulative time series,
// deduped by (viewer, day) like the counter, and renders a token-colored SVG.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  buildViewCountTimeSeries,
  buildViewCountChartSvg,
  VIEW_CHART_WINDOW_SECONDS,
} from "../js/viewCountChart.js";

const W = VIEW_CHART_WINDOW_SECONDS;
const ev = (id, pubkey, day, secInDay = 10) => ({
  id,
  pubkey,
  created_at: day * W + secInDay,
});

test("cumulative series: one view per (viewer, day), summed over time", () => {
  const events = [
    ev("1", "alice", 100),
    ev("2", "alice", 100, 50), // same viewer+day → deduped
    ev("3", "bob", 100),
    ev("4", "alice", 101), // alice again next day → counts
    ev("5", "carol", 102),
  ];
  const { series, total } = buildViewCountTimeSeries(events);

  assert.equal(total, 4, "alice(d100)+bob(d100)+alice(d101)+carol(d102)");
  assert.deepEqual(
    series.map((s) => [s.bucketStart / W, s.count, s.cumulative]),
    [
      [100, 2, 2],
      [101, 1, 3],
      [102, 1, 4],
    ],
  );
});

test("ignores events without a valid pubkey or created_at", () => {
  const events = [
    ev("1", "alice", 100),
    { id: "2", created_at: 100 * W }, // no pubkey
    { id: "3", pubkey: "bob" }, // no created_at
    { id: "4", pubkey: "carol", created_at: -5 },
  ];
  const { total } = buildViewCountTimeSeries(events);
  assert.equal(total, 1);
});

test("empty input yields an empty series", () => {
  assert.deepEqual(buildViewCountTimeSeries([]), { series: [], total: 0 });
  assert.deepEqual(buildViewCountTimeSeries(null), { series: [], total: 0 });
});

test("SVG renders a line+area for a multi-point series, token-colored", () => {
  const dom = new JSDOM("<!DOCTYPE html><body></body>");
  const doc = dom.window.document;
  const { series } = buildViewCountTimeSeries([
    ev("1", "a", 100),
    ev("2", "b", 101),
    ev("3", "c", 102),
  ]);
  const svg = buildViewCountChartSvg(doc, series, { width: 300, height: 100 });

  assert.equal(svg.tagName.toLowerCase(), "svg");
  assert.ok(svg.classList.contains("text-accent"), "uses the accent token via currentColor");
  assert.ok(svg.querySelector("polyline"), "has the cumulative line");
  assert.ok(svg.querySelector("polygon"), "has the area fill");
  assert.equal(svg.querySelector("polyline").getAttribute("stroke"), "currentColor");
});

test("SVG handles empty + single-point series without throwing", () => {
  const dom = new JSDOM("<!DOCTYPE html><body></body>");
  const doc = dom.window.document;

  const empty = buildViewCountChartSvg(doc, [], { width: 300, height: 100 });
  assert.equal(empty.querySelector("polyline"), null, "no line when there are no views");

  const single = buildViewCountChartSvg(
    doc,
    buildViewCountTimeSeries([ev("1", "a", 100)]).series,
    { width: 300, height: 100 },
  );
  assert.ok(single.querySelector("polyline"), "single point draws a flat baseline");
});
