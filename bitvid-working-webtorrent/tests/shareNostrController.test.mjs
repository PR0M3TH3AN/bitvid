import test from 'node:test';
import { strict as assert } from 'node:assert';
import ShareNostrController from '../js/ui/shareNostrController.js';

test('ShareNostrController', async (t) => {
  const mockGetActiveSigner = t.mock.fn(() => ({
    pubkey: 'signerpubkey',
    signEvent: async () => ({ id: 'signed_event' }),
    type: 'extension'
  }));

  const mockQueueSignEvent = t.mock.fn(async (signer, event) => ({
    ...event,
    id: 'signed_event',
    sig: 'signature'
  }));

  const mockPublishEventToRelays = t.mock.fn(async () => ({
    accepted: ['wss://relay.example.com'],
    failed: []
  }));

  const mockAssertAnyRelayAccepted = t.mock.fn((summary) => summary);

  const mockSanitizeRelayList = t.mock.fn((list) => list);

  const mockBuildShareEvent = t.mock.fn(({ pubkey, content, video }) => ({
    kind: 1,
    pubkey,
    content,
    tags: [['e', video.id], ['p', video.pubkey]]
  }));

  const mockNostrClient = {
    pool: {},
    ensureExtensionPermissions: async () => ({ ok: true })
  };

  const mockLogger = {
    warn: t.mock.fn(),
    error: t.mock.fn(),
    info: t.mock.fn(),
    log: t.mock.fn()
  };

  const services = {
    sanitizeRelayList: mockSanitizeRelayList,
    buildShareEvent: mockBuildShareEvent,
    publishEventToRelays: mockPublishEventToRelays,
    assertAnyRelayAccepted: mockAssertAnyRelayAccepted,
    getActiveSigner: mockGetActiveSigner,
    queueSignEvent: mockQueueSignEvent,
    permissionMethods: {},
    nostrClient: mockNostrClient,
    userLogger: mockLogger,
    devLogger: mockLogger
  };

  await t.test('handleShare shares video successfully', async () => {
    const ui = {
      showError: t.mock.fn(),
      showSuccess: t.mock.fn(),
      getModal: () => ({})
    };
    const state = {
      getPubkey: () => 'signerpubkey', // Match the signer pubkey
      normalizeHexPubkey: (k) => k,
      getCurrentVideo: () => ({ id: 'video1', title: 'Video 1' })
    };

    const controller = new ShareNostrController({ ui, state, services });

    const payload = {
      video: { id: 'video1', title: 'Video 1', pubkey: 'creator1' },
      content: 'Check this out',
      relays: ['wss://relay.example.com']
    };

    const result = await controller.handleShare(payload);

    assert.ok(result.ok);
    assert.equal(ui.showSuccess.mock.calls.length, 1);
    assert.equal(ui.showError.mock.calls.length, 0);
  });

  await t.test('handleShare throws error if missing video details', async () => {
    const ui = {
      showError: t.mock.fn(),
      showSuccess: t.mock.fn(),
      getModal: () => ({})
    };
    const state = {
        getPubkey: () => 'userpubkey',
        normalizeHexPubkey: (k) => k
    };
    const controller = new ShareNostrController({ ui, state, services });

    const payload = {
        video: { id: '', title: '' } // Invalid
    };

    await assert.rejects(async () => {
        await controller.handleShare(payload);
    }, /share-missing-video-details/);

    assert.equal(ui.showError.mock.calls.length, 1);
  });

  await t.test('openModal shows error if no video', async () => {
      const ui = {
          showError: t.mock.fn(),
          getModal: () => ({})
      };
      const state = {
          getCurrentVideo: () => null
      };
      const controller = new ShareNostrController({ ui, state, services });

      await controller.openModal({ video: null });
      assert.equal(ui.showError.mock.calls.length, 1);
      assert.match(ui.showError.mock.calls[0].arguments[0], /No video/);
  });

  await t.test('openModal opens modal with correct payload', async () => {
      const modalMock = {
          open: t.mock.fn(async () => {})
      };
      const ui = {
          showError: t.mock.fn(),
          getModal: () => modalMock
      };
      const video = { id: 'v1', title: 'T1', pubkey: 'p1' };
      const state = {
          getCurrentVideo: () => video,
          buildShareUrlFromEventId: (id) => `https://example.com/${id}`
      };
      const controller = new ShareNostrController({ ui, state, services });

      await controller.openModal();

      assert.equal(modalMock.open.mock.calls.length, 1);
      const openArg = modalMock.open.mock.calls[0].arguments[0];
      assert.equal(openArg.video.id, 'v1');
      assert.equal(openArg.video.shareUrl, 'https://example.com/v1');
  });
});
