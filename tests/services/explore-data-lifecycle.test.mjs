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
