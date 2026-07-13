import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHashChangeHandler } from '../../js/hashChangeHandler.js';

test('createHashChangeHandler', async (t) => {
  // Mock window
  const mockLocation = { hash: '' };
  global.window = {
    location: mockLocation,
    history: {
        replaceState: () => {}
    }
  };

  // Mock dependencies
  let loadedView = null;
  const mockLoadView = async (url) => {
    loadedView = url;
  };

  const mockViewInitRegistry = {
      docs: async () => {},
      "for-you": async () => {}
  };

  const handler = createHashChangeHandler({
    getApplication: () => ({ isUserLoggedIn: () => false }),
    getApplicationReady: () => Promise.resolve(),
    loadView: mockLoadView,
    viewInitRegistry: mockViewInitRegistry,
    userLogger: { error: () => {}, warn: () => {} },
    devLogger: { log: () => {} }
  });

  await t.test('loads default view if hash is empty', async () => {
    loadedView = null;
    mockLocation.hash = '';
    await handler();
    // spec_correction (todo-11): commit 04621efc (2026-06-24, "Trending defaults")
    // made TRENDING the deliberate logged-out landing (FEATURE_TRENDING_FEED
    // defaults on; hashChangeHandler.js:95-99). This test still expected the OLD
    // default (most-recent-videos) — the same stale spec the sibling
    // tests/app/hash-change-handler.test.mjs was already corrected for. Equally
    // strict: the correct observable outcome is views/trending.html.
    assert.equal(loadedView, 'views/trending.html');
  });

  await t.test('redirects legacy view', async () => {
    loadedView = null;
    mockLocation.hash = '#view=about';
    await handler();
    // It should update hash and return
    assert.equal(mockLocation.hash, '#view=docs&doc=about');
    assert.equal(loadedView, null);
  });

  await t.test('skips redundant reload', async () => {
    // First load docs
    loadedView = null;
    mockLocation.hash = '#view=docs';
    await handler();
    assert.equal(loadedView, 'views/docs.html');

    // Call again with same hash
    loadedView = null;
    await handler();
    assert.equal(loadedView, null, 'Should not reload view if same');
  });
});
