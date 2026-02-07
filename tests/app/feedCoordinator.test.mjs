import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFeedCoordinator } from '../../js/app/feedCoordinator.js';
import { FEED_TYPES } from '../../js/constants.js';

test('createFeedCoordinator - loadForYouVideos', async (t) => {
  const mockDeps = {
    devLogger: { log: mock.fn(), warn: mock.fn() },
    userLogger: { warn: mock.fn() },
    nostrClient: {},
    getSidebarLoadingMarkup: mock.fn(() => '<div>Loading...</div>'),
    watchHistoryService: {},
    subscriptions: {},
    createActiveNostrSource: mock.fn(),
    createBlacklistFilterStage: mock.fn(),
    createDisinterestFilterStage: mock.fn(),
    createDedupeByRootStage: mock.fn(),
    createExploreDiversitySorter: mock.fn(),
    createExploreScorerStage: mock.fn(),
    createKidsAudienceFilterStage: mock.fn(),
    createKidsScorerStage: mock.fn(),
    createKidsScoreSorter: mock.fn(),
    createModerationStage: mock.fn(),
    createResolvePostedAtStage: mock.fn(),
    createTagPreferenceFilterStage: mock.fn(),
    createWatchHistorySuppressionStage: mock.fn(),
    createChronologicalSorter: mock.fn(),
    createSubscriptionAuthorsSource: mock.fn(),
    registerWatchHistoryFeed: mock.fn(),
  };

  const coordinator = createFeedCoordinator(mockDeps);

  // Mock application context
  const app = {
    ...coordinator,
    nostrService: {
      getFilteredActiveVideos: mock.fn(() => []), // Simulate no cached videos
      loadVideos: mock.fn(async ({ onVideos }) => {
        // Simulate fetch completing with videos
        onVideos([], { reason: 'test-reason' });
        return [];
      }),
      getVideoSubscription: mock.fn(() => 'mock-subscription'),
      getVideosMap: mock.fn(() => new Map()),
    },
    videoListView: {
      showLoading: mock.fn(),
      state: {},
    },
    mountVideoListView: mock.fn(() => ({ innerHTML: '' })),
    checkRelayHealthWarning: mock.fn(),
    setFeedTelemetryContext: mock.fn(),
    isAuthorBlocked: mock.fn(() => false),
    refreshForYouFeed: mock.fn(async () => {}),
    refreshRecentFeed: mock.fn(async () => {}),
    refreshKidsFeed: mock.fn(async () => {}),
    refreshExploreFeed: mock.fn(async () => {}),
    blacklistedEventIds: new Set(),
  };

  // Bind methods to app context
  const loadForYouVideos = app.loadForYouVideos.bind(app);

  await t.test('loadForYouVideos executes successfully', async () => {
      await loadForYouVideos(false);

      // Verify devLogger was called
      assert.strictEqual(mockDeps.devLogger.log.mock.callCount() > 0, true, 'devLogger.log should be called');

      // Verify telemetry context set
      assert.strictEqual(app.setFeedTelemetryContext.mock.calls[0].arguments[0], FEED_TYPES.FOR_YOU, 'Should set telemetry context to for-you');

      // Verify mountVideoListView called with includeTags: false
      assert.deepStrictEqual(app.mountVideoListView.mock.calls[0].arguments[0], { includeTags: false }, 'Should mount list view with includeTags: false');

      // Verify checkRelayHealthWarning called
      assert.strictEqual(app.checkRelayHealthWarning.mock.callCount(), 1, 'Should check relay health warning');

      // Verify nostrService.loadVideos called
      assert.strictEqual(app.nostrService.loadVideos.mock.callCount(), 1, 'Should call nostrService.loadVideos');

      // Verify refreshForYouFeed called via callback
      assert.strictEqual(app.refreshForYouFeed.mock.callCount(), 1, 'Should call refreshForYouFeed via callback');

      // Verify subscription updated
      assert.strictEqual(app.videoSubscription, 'mock-subscription', 'Should update videoSubscription');
  });
});
