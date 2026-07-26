import test from "node:test";
import assert from "node:assert/strict";
import {
  initPerformanceHarness,
  isLocalPerformanceHarnessEnabled,
  PERFORMANCE_HARNESS_STORAGE_KEY,
} from "../js/performanceHarness.js";

function createStorage(value = null) {
  return { getItem: (key) => (key === PERFORMANCE_HARNESS_STORAGE_KEY ? value : null) };
}

function createPerformance() {
  const marks = [];
  return {
    now: () => 100,
    mark: (name) => marks.push(name),
    getEntriesByType: (type) => {
      if (type === "resource") {
        return [{ transferSize: 12 }, { transferSize: 30 }];
      }
      if (type === "navigation") {
        return [{ domContentLoadedEventEnd: 12, loadEventEnd: 24 }];
      }
      return [];
    },
    memory: { usedJSHeapSize: 10, totalJSHeapSize: 20, jsHeapSizeLimit: 30 },
    marks,
  };
}

test("performance harness stays absent without explicit loopback opt-in", () => {
  const scope = {
    location: { hostname: "localhost" },
    localStorage: createStorage(),
    performance: createPerformance(),
  };

  assert.equal(isLocalPerformanceHarnessEnabled({
    locationRef: scope.location,
    storage: scope.localStorage,
  }), false);
  assert.equal(initPerformanceHarness({ scope }), null);
  assert.equal(scope.__bitvidPerformance, undefined);
});

test("performance harness cannot be enabled on a non-loopback host", () => {
  assert.equal(isLocalPerformanceHarnessEnabled({
    locationRef: { hostname: "unstable.bitvid.network" },
    storage: createStorage("1"),
  }), false);
});

test("explicit loopback opt-in exposes bounded local measurements", () => {
  let observerCallback = null;
  class FakePerformanceObserver {
    constructor(callback) {
      observerCallback = callback;
    }
    observe() {}
    disconnect() {}
  }
  const scope = {
    location: { hostname: "127.0.0.1" },
    localStorage: createStorage("1"),
    performance: createPerformance(),
    PerformanceObserver: FakePerformanceObserver,
  };

  const api = initPerformanceHarness({ scope });
  assert.equal(typeof api?.snapshot, "function");
  assert.equal(scope.__bitvidPerformance, api);

  observerCallback({
    getEntries: () => [{ name: "longtask", startTime: 3, duration: 51 }],
  });
  api.mark("feed-refresh", { feed: "for-you" });
  api.setGauge("active-workers", 1);
  api.increment("active-workers");

  const snapshot = api.snapshot();
  assert.equal(snapshot.longTasks.count, 1);
  assert.equal(snapshot.longTasks.totalDurationMs, 51);
  assert.equal(snapshot.resources.transferSize, 42);
  assert.equal(snapshot.gauges["active-workers"], 2);
  assert.equal(snapshot.memory.usedJsHeapSize, 10);
  assert.ok(snapshot.marks.some((entry) => entry.name === "feed-refresh"));

  api.stop();
  assert.equal(scope.__bitvidPerformance, undefined);
});
