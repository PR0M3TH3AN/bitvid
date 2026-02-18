import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import ExploreDataService from '../../../js/services/exploreDataService.js';

describe('ExploreDataService', () => {
    let service;
    let originalDocument;
    let visibilityHandler;

    beforeEach(() => {
        // Mock global document
        originalDocument = global.document;
        visibilityHandler = null;
        global.document = {
            hidden: false,
            addEventListener: (event, handler) => {
                if (event === 'visibilitychange') {
                    visibilityHandler = handler;
                }
            },
            removeEventListener: () => {}
        };

        service = new ExploreDataService({
            historyRefreshIntervalMs: 100,
            idfRefreshIntervalMs: 100,
            logger: { warn: () => {} } // silent logger
        });

        // Mock the refresh methods to track calls
        service.refreshWatchHistoryTagCounts = mock.fn();
        service.refreshTagIdf = mock.fn();
    });

    afterEach(() => {
        if (service) {
            service.destroy();
        }
        global.document = originalDocument;
        mock.restoreAll();
    });

    test('intervals trigger refresh when visible', (t) => {
        t.mock.timers.enable({ apis: ['setInterval'] });
        service.startIntervals();

        // Advance time by 150ms (interval is 100ms)
        t.mock.timers.tick(150);

        assert.strictEqual(service.refreshWatchHistoryTagCounts.mock.callCount(), 1);
        assert.strictEqual(service.refreshTagIdf.mock.callCount(), 1);
    });

    test('intervals skip refresh when hidden', (t) => {
        global.document.hidden = true;
        t.mock.timers.enable({ apis: ['setInterval'] });
        service.startIntervals();

        // Advance time by 150ms
        t.mock.timers.tick(150);

        assert.strictEqual(service.refreshWatchHistoryTagCounts.mock.callCount(), 0, "Should skip history refresh when hidden");
        assert.strictEqual(service.refreshTagIdf.mock.callCount(), 0, "Should skip IDF refresh when hidden");
    });

    test('visibility change triggers refresh', (t) => {
        t.mock.timers.enable({ apis: ['setInterval'] });
        service.subscribeToUpdates();

        assert.ok(visibilityHandler, "Visibility change listener should be registered");

        // Simulate hidden -> visible
        global.document.hidden = false;
        visibilityHandler();

        // Advance time to trigger the interval refresh
        t.mock.timers.tick(150);

        assert.strictEqual(service.refreshWatchHistoryTagCounts.mock.callCount(), 1, "Should refresh history on visibility");
        assert.strictEqual(service.refreshTagIdf.mock.callCount(), 1, "Should refresh IDF on visibility");
    });

    test('visibility change DOES NOT trigger refresh if hidden', () => {
        service.subscribeToUpdates();

        assert.ok(visibilityHandler, "Visibility change listener should be registered");

        // Simulate visible -> hidden (handler called but document.hidden is true)
        global.document.hidden = true;
        visibilityHandler();

        assert.strictEqual(service.refreshWatchHistoryTagCounts.mock.callCount(), 0, "Should NOT refresh when becoming hidden");
        assert.strictEqual(service.refreshTagIdf.mock.callCount(), 0, "Should NOT refresh when becoming hidden");
    });
});
