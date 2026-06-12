// Verifies the For You feed re-runs when background watch-history resolution
// completes, so newly-resolved watched videos are suppressed and watch-history
// tags applied — without the feed ever blocking on the watch-history load.
//
// Scenario (SCN-foryou-rerun-on-watch-history):
//   Given the For You feed is the active feed,
//   When watch history finishes resolving in the background and emits
//     "fingerprint",
//   Then the For You feed is refreshed (once, debounced) with the resolved
//     watch-history reason; and it is NOT refreshed when a different feed is
//     active.

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createFeedCoordinator } from "../../js/app/feedCoordinator.js";
import { FEED_TYPES } from "../../js/constants.js";

function makeCoordinator() {
  let fingerprintCb = null;
  const watchHistoryService = {
    subscribe: (eventName, cb) => {
      if (eventName === "fingerprint") fingerprintCb = cb;
      return () => {};
    },
  };
  const noop = mock.fn();
  const deps = {
    devLogger: { log: noop, warn: noop, info: noop, debug: noop },
    userLogger: { warn: noop },
    nostrClient: {},
    watchHistoryService,
    subscriptions: {},
    getSidebarLoadingMarkup: noop,
    pointerKey: () => "",
    isValidMagnetUri: () => false,
    readCachedUrlHealth: noop,
    persistUrlHealth: noop,
    createActiveNostrSource: noop,
    createBlacklistFilterStage: noop,
    createDisinterestFilterStage: noop,
    createDedupeByRootStage: noop,
    createExploreDiversitySorter: noop,
    createExploreScorerStage: noop,
    createKidsAudienceFilterStage: noop,
    createKidsScorerStage: noop,
    createKidsScoreSorter: noop,
    createModerationStage: noop,
    createResolvePostedAtStage: noop,
    createTagPreferenceFilterStage: noop,
    createWatchHistorySuppressionStage: noop,
    createChronologicalSorter: noop,
    createSubscriptionAuthorsSource: noop,
    registerWatchHistoryFeed: noop,
  };
  const coordinator = createFeedCoordinator(deps);
  const app = {
    ...coordinator,
    feedTelemetryState: { activeFeed: FEED_TYPES.FOR_YOU },
    refreshFeed: mock.fn(async () => {}),
  };
  return { app, fireFingerprint: () => fingerprintCb && fingerprintCb() };
}

test("re-runs For You (debounced) when watch history resolves while active", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { app, fireFingerprint } = makeCoordinator();
    app.subscribeWatchHistoryFeedRefresh();

    // Two rapid fingerprint events should collapse into one refresh (debounce).
    fireFingerprint();
    fireFingerprint();
    assert.equal(app.refreshFeed.mock.callCount(), 0, "should debounce, not fire immediately");

    mock.timers.tick(450);
    assert.equal(app.refreshFeed.mock.callCount(), 1, "should refresh once after debounce");
    const [feedType, opts] = app.refreshFeed.mock.calls[0].arguments;
    assert.equal(feedType, FEED_TYPES.FOR_YOU);
    assert.equal(opts.reason, "watch-history-resolved");
  } finally {
    mock.timers.reset();
  }
});

test("does not re-run when the active feed is not For You", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { app, fireFingerprint } = makeCoordinator();
    app.feedTelemetryState.activeFeed = FEED_TYPES.EXPLORE;
    app.subscribeWatchHistoryFeedRefresh();

    fireFingerprint();
    mock.timers.tick(450);
    assert.equal(app.refreshFeed.mock.callCount(), 0, "must not refresh a non-active For You feed");
  } finally {
    mock.timers.reset();
  }
});

test("subscribing twice does not double-register", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { app, fireFingerprint } = makeCoordinator();
    app.subscribeWatchHistoryFeedRefresh();
    app.subscribeWatchHistoryFeedRefresh();
    fireFingerprint();
    mock.timers.tick(450);
    assert.equal(app.refreshFeed.mock.callCount(), 1, "idempotent subscription => single refresh");
  } finally {
    mock.timers.reset();
  }
});
