import assert from "node:assert/strict";
import test from "node:test";
import ExploreDataService from "../../js/services/exploreDataService.js";

test("ExploreDataService stays idle until a recommendation feed activates it", async () => {
  const service = new ExploreDataService({
    historyRefreshIntervalMs: 0,
    idfRefreshIntervalMs: 0,
  });
  let historyRefreshes = 0;
  let idfRefreshes = 0;
  service.refreshWatchHistoryTagCounts = async () => {
    historyRefreshes += 1;
    return new Map();
  };
  service.refreshTagIdf = async () => {
    idfRefreshes += 1;
    return new Map();
  };

  await service.initialize();
  assert.equal(historyRefreshes, 0);
  assert.equal(idfRefreshes, 0);

  service.queueWatchHistoryRefresh("note");
  service.queueTagIdfRefresh("note");
  await service.setActive(true);
  assert.equal(historyRefreshes, 1, "dirty history is refreshed on activation");
  assert.equal(idfRefreshes, 1, "dirty IDF is refreshed on activation");

  await service.setActive(false);
  service.queueTagIdfRefresh("inactive-note");
  assert.equal(idfRefreshes, 1, "inactive feeds do not rebuild recommendation indexes");
  service.destroy();
});

test("ExploreDataService coalesces a refresh burst into one running pass and one follow-up", async () => {
  const service = new ExploreDataService({
    historyRefreshIntervalMs: 0,
    idfRefreshIntervalMs: 0,
  });
  service.active = true;
  let runs = 0;
  let releaseFirst;
  service._refreshTagIdf = async () => {
    runs += 1;
    if (runs === 1) {
      await new Promise((resolve) => {
        releaseFirst = resolve;
      });
    }
    return new Map();
  };

  const first = service.refreshTagIdf({ force: true, reason: "initial" });
  const duplicate = service.refreshTagIdf({ reason: "relay-event" });
  service.refreshTagIdf({ reason: "timer" });
  assert.equal(runs, 1, "only one rebuild starts during the burst");

  releaseFirst();
  await Promise.all([first, duplicate]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(runs, 2, "the burst produces exactly one follow-up rebuild");
  service.destroy();
});
