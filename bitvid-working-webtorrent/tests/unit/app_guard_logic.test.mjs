import { test } from 'node:test';
import assert from 'node:assert';

/**
 * Validates the logic used in Application.resetTorrentStats.
 * Note: We test the function logic in isolation because importing the full Application class
 * triggers side effects (network, webtorrent) that are difficult to mock in this unit test environment.
 */
function resetTorrentStats(context, logger) {
    // Exact logic from js/app.js
    if (context.videoModal) {
      if (typeof context.videoModal.resetStats === "function") {
        context.videoModal.resetStats();
      } else {
        logger.info(
          "[Application] resetTorrentStats: videoModal.resetStats not available — skipping."
        );
      }
    }
}

test('Application.resetTorrentStats logic', async (t) => {
    const logger = {
        info: () => {},
        warn: () => {}
    };

    await t.test('does not throw when videoModal is null', () => {
        const context = { videoModal: null };
        assert.doesNotThrow(() => resetTorrentStats(context, logger));
    });

    await t.test('does not throw when videoModal is undefined', () => {
        const context = { videoModal: undefined };
        assert.doesNotThrow(() => resetTorrentStats(context, logger));
    });

    await t.test('does not throw when videoModal lacks resetStats', () => {
        const context = { videoModal: { other: 1 } };
        assert.doesNotThrow(() => resetTorrentStats(context, logger));
    });

    await t.test('calls resetStats when available', () => {
        let called = false;
        const context = {
            videoModal: { resetStats: () => { called = true; } }
        };
        resetTorrentStats(context, logger);
        assert.strictEqual(called, true);
    });
});
