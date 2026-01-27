import { test } from 'node:test';
import assert from 'node:assert/strict';
import RevertModalController from '../js/ui/revertModalController.js';

test('RevertModalController', async (t) => {
  const mockVideo = { id: 'v1', pubkey: 'p1' };
  const mockHistory = [{ id: 'v1' }, { id: 'v0' }];

  const mocks = {
    revertModal: {
      load: async () => true,
      setHistory: () => {},
      open: () => {},
      close: () => {},
      setBusy: () => {},
    },
    services: {
      nostrService: {
        fetchVideos: async () => [mockVideo],
      },
      nostrClient: {
        hydrateVideoHistory: async () => mockHistory,
        revertVideo: async () => {},
      },
    },
    state: {
      getPubkey: () => 'p1', // must match video pubkey
      getBlacklistedEventIds: () => new Set(),
    },
    ui: {
      showError: () => {},
      showSuccess: () => {},
    },
    callbacks: {
      loadVideos: async () => {},
      forceRefreshAllProfiles: () => {},
      isAuthorBlocked: () => false,
    },
    helpers: {
      normalizeActionTarget: () => ({ triggerElement: null }),
      resolveVideoActionTarget: async () => mockVideo,
      formatAbsoluteTimestamp: () => 'timestamp',
    },
  };

  await t.test('open() fetches history and opens modal', async () => {
    let historySet = null;
    let modalOpened = false;

    const controller = new RevertModalController({
      ...mocks,
      revertModal: {
        ...mocks.revertModal,
        setHistory: (_v, h) => {
          historySet = h;
        },
        open: () => {
          modalOpened = true;
        },
      },
    });

    await controller.open('v1');

    assert.deepEqual(historySet, mockHistory, 'History should be set');
    assert.equal(modalOpened, true, 'Modal should be opened');
  });

  await t.test('open() shows error if not logged in', async () => {
    let errorMsg = '';
    const controller = new RevertModalController({
      ...mocks,
      state: { ...mocks.state, getPubkey: () => null },
      ui: {
        ...mocks.ui,
        showError: (m) => {
          errorMsg = m;
        },
      },
    });

    await controller.open('v1');
    assert.match(errorMsg, /login/, 'Should show login error');
  });

  await t.test('handleConfirm() calls revertVideo and refreshes', async () => {
    let revertCalled = false;
    let refreshCalled = false;
    let modalClosed = false;
    let modalBusyState = null;

    const controller = new RevertModalController({
      ...mocks,
      services: {
        ...mocks.services,
        nostrClient: {
          ...mocks.services.nostrClient,
          revertVideo: async () => {
            revertCalled = true;
          },
        },
      },
      callbacks: {
        ...mocks.callbacks,
        loadVideos: async () => {
          refreshCalled = true;
        },
      },
      revertModal: {
        ...mocks.revertModal,
        close: () => {
          modalClosed = true;
        },
        setBusy: (busy) => {
          modalBusyState = busy;
        },
      },
    });

    await controller.handleConfirm({
      detail: {
        target: mockVideo,
        entries: [{ id: 'v1', pubkey: 'p1', tags: [] }],
      },
    });

    assert.equal(revertCalled, true, 'revertVideo should be called');
    assert.equal(refreshCalled, true, 'loadVideos should be called');
    assert.equal(modalClosed, true, 'Modal should be closed');
    assert.equal(modalBusyState, false, 'Modal should not be busy at end');
  });
});
