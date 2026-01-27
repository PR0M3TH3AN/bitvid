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
    // Default is most-recent-videos if not logged in
    assert.equal(loadedView, 'views/most-recent-videos.html');
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
