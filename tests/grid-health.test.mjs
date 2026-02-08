import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { prioritizeEntries } from "../js/gridHealthLogic.js";

function setupDom() {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  return dom;
}

function teardownDom(dom) {
  dom.window.close();
  delete globalThis.window;
  delete globalThis.HTMLElement;
}

test("prioritizeEntries input validation", (t) => {
  const dom = setupDom();
  t.after(() => teardownDom(dom));

  assert.deepEqual(prioritizeEntries(null), [], "should return empty array for null entries");
  assert.deepEqual(prioritizeEntries(undefined), [], "should return empty array for undefined entries");
  assert.deepEqual(prioritizeEntries([]), [], "should return empty array for empty entries");
});

test("prioritizeEntries filtering", (t) => {
  const dom = setupDom();
  t.after(() => teardownDom(dom));

  const entries = [
    { isIntersecting: false, target: dom.window.document.createElement("div") },
    { isIntersecting: true, target: {} }, // Not an HTMLElement
    { isIntersecting: true, target: dom.window.document.createElement("div"), intersectionRect: { width: 0, height: 0 } }, // Invalid rect
  ];

  const result = prioritizeEntries(entries, { x: 500, y: 500 });
  assert.deepEqual(result, [], "should filter out invalid entries");
});

test("prioritizeEntries without viewport center", (t) => {
  const dom = setupDom();
  t.after(() => teardownDom(dom));

  // prioritizeEntries sorts by ratio desc, then centerY asc
  // Note: the implementation sorts by ratio desc (b.ratio - a.ratio), then a.centerY - b.centerY

  const entries = [
    {
      isIntersecting: true,
      target: dom.window.document.createElement("div"),
      intersectionRect: { top: 100, height: 100, width: 100 }, // centerY = 150
      intersectionRatio: 0.5,
      id: 1
    },
    {
      isIntersecting: true,
      target: dom.window.document.createElement("div"),
      intersectionRect: { top: 200, height: 100, width: 100 }, // centerY = 250
      intersectionRatio: 0.8,
      id: 2
    },
    {
      isIntersecting: true,
      target: dom.window.document.createElement("div"),
      intersectionRect: { top: 0, height: 100, width: 100 }, // centerY = 50
      intersectionRatio: 0.5,
      id: 3
    },
  ];

  const result = prioritizeEntries(entries, null);

  assert.equal(result.length, 3);
  // Highest ratio first (id: 2)
  assert.equal(result[0].entry.id, 2);

  // Equal ratio (0.5), sort by centerY asc (id: 3 (50) < id: 1 (150))
  assert.equal(result[1].entry.id, 3);
  assert.equal(result[2].entry.id, 1);
});

test("prioritizeEntries with viewport center", (t) => {
  const dom = setupDom();
  t.after(() => teardownDom(dom));

  const viewportCenter = { x: 500, y: 500 };

  const entries = [
    {
      isIntersecting: true,
      target: dom.window.document.createElement("div"),
      intersectionRect: { top: 450, height: 100, width: 100 }, // centerY = 500 (distance 0)
      intersectionRatio: 1.0,
      id: "center"
    },
    {
      isIntersecting: true,
      target: dom.window.document.createElement("div"),
      intersectionRect: { top: 350, height: 100, width: 100 }, // centerY = 400 (distance 100)
      intersectionRatio: 1.0,
      id: "above"
    },
    {
      isIntersecting: true,
      target: dom.window.document.createElement("div"),
      intersectionRect: { top: 550, height: 100, width: 100 }, // centerY = 600 (distance 100)
      intersectionRatio: 1.0,
      id: "below"
    },
    {
      isIntersecting: true,
      target: dom.window.document.createElement("div"),
      intersectionRect: { top: 0, height: 100, width: 100 }, // centerY = 50 (distance 450)
      intersectionRatio: 0.5,
      id: "far_above"
    }
  ];

  const result = prioritizeEntries(entries, viewportCenter);

  assert.equal(result.length, 4);

  // The closest to center should be first
  assert.equal(result[0].entry.id, "center");

  // The logic for left/right (above/below) depends on implementation details
  // but "above" and "below" are equidistant.
  // The implementation sorts by centerY first: above (400), center (500), below (600), far_above(50) -> far_above, above, center, below
  // centerIndex is found (min distance).
  // Then it expands left/right.

  // Let's trace:
  // Ordered by Y: far_above (50), above (400), center (500), below (600)
  // minDistance is center (0). centerIndex = 2.
  // result: [center]
  // left = 1 (above), right = 3 (below)
  // leftDist = 100, rightDist = 100.
  // delta = 0 <= 0.5.
  // rightRatio (1.0) > leftRatio (1.0) -> False.
  // else -> push left (above), left--
  // result: [center, above]
  // left = 0 (far_above), right = 3 (below)
  // leftDist = 450, rightDist = 100.
  // leftDist > rightDist -> push right (below), right++
  // result: [center, above, below]
  // left = 0 (far_above), right = 4 (out)
  // push left (far_above)
  // result: [center, above, below, far_above]

  assert.equal(result[1].entry.id, "above");
  assert.equal(result[2].entry.id, "below");
  assert.equal(result[3].entry.id, "far_above");
});

test("prioritizeEntries ratio prioritization when distances are similar", (t) => {
  const dom = setupDom();
  t.after(() => teardownDom(dom));

  const viewportCenter = { x: 500, y: 500 };

  const entries = [
    {
      isIntersecting: true,
      target: dom.window.document.createElement("div"),
      intersectionRect: { top: 450, height: 100, width: 100 }, // centerY = 500 (distance 0)
      intersectionRatio: 1.0,
      id: "center"
    },
    {
      isIntersecting: true,
      target: dom.window.document.createElement("div"),
      intersectionRect: { top: 350, height: 100, width: 100 }, // centerY = 400 (distance 100)
      intersectionRatio: 0.5,
      id: "above_low_ratio"
    },
    {
      isIntersecting: true,
      target: dom.window.document.createElement("div"),
      intersectionRect: { top: 550, height: 100, width: 100 }, // centerY = 600 (distance 100)
      intersectionRatio: 0.9,
      id: "below_high_ratio"
    }
  ];

  // Logic check:
  // Ordered by Y: above_low_ratio (400), center (500), below_high_ratio (600)
  // centerIndex = 1 (center)
  // left = 0 (above), right = 2 (below)
  // Distances: 100 vs 100. Delta = 0.
  // rightRatio (0.9) > leftRatio (0.5) -> True.
  // Push right (below)

  const result = prioritizeEntries(entries, viewportCenter);

  assert.equal(result[0].entry.id, "center");
  assert.equal(result[1].entry.id, "below_high_ratio");
  assert.equal(result[2].entry.id, "above_low_ratio");
});

test("prioritizeEntries uses boundingClientRect fallback", (t) => {
  const dom = setupDom();
  t.after(() => teardownDom(dom));

  const viewportCenter = { x: 500, y: 500 };
  const entries = [
    {
      isIntersecting: true,
      target: dom.window.document.createElement("div"),
      // No intersectionRect
      boundingClientRect: { top: 450, height: 100, width: 100 },
      intersectionRatio: 1.0,
      id: "fallback"
    }
  ];

  const result = prioritizeEntries(entries, viewportCenter);
  assert.equal(result.length, 1);
  assert.equal(result[0].entry.id, "fallback");
});
