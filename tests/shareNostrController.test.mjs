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

  await t.test('handleShare forwards title and thumbnail for the imeta hint', async () => {
    // The controller used to pass only { id, pubkey } to buildShareEvent, so
    // the NIP-92 imeta entry could never be built and the thumbnail URL in the
    // note body rendered as a bare link instead of a preview image.
    const ui = {
      showError: t.mock.fn(),
      showSuccess: t.mock.fn(),
      getModal: () => ({})
    };
    const state = {
      getPubkey: () => 'signerpubkey',
      normalizeHexPubkey: (k) => k,
      getCurrentVideo: () => null
    };

    mockBuildShareEvent.mock.resetCalls();
    const controller = new ShareNostrController({ ui, state, services });

    await controller.handleShare({
      video: {
        id: 'video1',
        title: 'Video 1',
        pubkey: 'creator1',
        thumbnail: '  https://cdn.example/thumb.jpg  '
      },
      content: 'Check this out',
      relays: ['wss://relay.example.com']
    });

    const passedVideo = mockBuildShareEvent.mock.calls[0].arguments[0].video;
    assert.equal(passedVideo.title, 'Video 1');
    assert.equal(passedVideo.thumbnail, 'https://cdn.example/thumb.jpg');
    assert.equal(passedVideo.id, 'video1');
    assert.equal(passedVideo.pubkey, 'creator1');
  });

  await t.test('handleShare tolerates a video with no thumbnail', async () => {
    const ui = {
      showError: t.mock.fn(),
      showSuccess: t.mock.fn(),
      getModal: () => ({})
    };
    const state = {
      getPubkey: () => 'signerpubkey',
      normalizeHexPubkey: (k) => k,
      getCurrentVideo: () => null
    };

    mockBuildShareEvent.mock.resetCalls();
    const controller = new ShareNostrController({ ui, state, services });

    const result = await controller.handleShare({
      video: { id: 'video1', title: 'Video 1', pubkey: 'creator1' },
      content: 'Check this out',
      relays: ['wss://relay.example.com']
    });

    assert.ok(result.ok);
    assert.equal(
      mockBuildShareEvent.mock.calls[0].arguments[0].video.thumbnail,
      ''
    );
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

// SCN-share-mirror-lookup
// The share modal embeds a quote pointer ONLY when a mirror is confirmed on
// relays. A pointer to a missing event renders as a broken/empty quote box in
// nostr clients — strictly worse than the plain-link fallback — so every
// failure path here must degrade to "no pointer" rather than guess.

test('ShareNostrController mirror pointer', async (t) => {
  const NIP19 = { naddrEncode: (p) => `naddr1-${p.kind}-${p.identifier}` };

  const baseUi = () => ({
    showError: t.mock.fn(),
    showSuccess: t.mock.fn(),
    getModal: () => ({ open: async () => {} }),
  });
  const baseState = () => ({
    getPubkey: () => 'signerpubkey',
    normalizeHexPubkey: (k) => k,
    getCurrentVideo: () => null,
    buildShareUrlFromEventId: () => 'https://bitvid.network/?v=nevent1abc',
  });

  const VIDEO = {
    id: 'video1',
    title: 'Video 1',
    pubkey: 'b'.repeat(64),
    videoRootId: 'root-abc',
    thumbnail: 'https://cdn.example/t.jpg',
    width: 1280,
    height: 720,
  };

  const makeController = (mirrorService) =>
    new ShareNostrController({
      ui: baseUi(),
      state: baseState(),
      services: {
        mirrorService,
        nip19: NIP19,
        nostrClient: { pool: {}, writeRelays: ['wss://relay.one'] },
        userLogger: { warn: () => {}, error: () => {}, info: () => {} },
        devLogger: { warn: () => {}, error: () => {}, log: () => {} },
      },
    });

  await t.test('confirmed mirror yields an naddr and coordinate', async () => {
    const controller = makeController({
      isAvailable: () => true,
      findMirror: async () => ({ mirrored: true, kinds: [34235] }),
    });
    const out = await controller.resolveMirrorPointer(VIDEO);
    assert.equal(out.naddr, 'naddr1-34235-root-abc');
    assert.equal(out.coordinate, `34235:${'b'.repeat(64)}:root-abc`);
  });

  await t.test('the observed kind wins over the dimension heuristic', async () => {
    // Portrait dims would suggest 34236; relays say 34235, so 34235 it is.
    const controller = makeController({
      isAvailable: () => true,
      findMirror: async () => ({ mirrored: true, kinds: [34235] }),
    });
    const out = await controller.resolveMirrorPointer({
      ...VIDEO,
      width: 720,
      height: 1280,
    });
    assert.equal(out.naddr, 'naddr1-34235-root-abc');
  });

  await t.test('no mirror on relays yields no pointer', async () => {
    const controller = makeController({
      isAvailable: () => true,
      findMirror: async () => ({ mirrored: false, kinds: [] }),
    });
    assert.deepEqual(await controller.resolveMirrorPointer(VIDEO), {
      naddr: '',
      coordinate: '',
    });
  });

  await t.test('a throwing lookup degrades instead of breaking the share', async () => {
    const controller = makeController({
      isAvailable: () => true,
      findMirror: async () => {
        throw new Error('relay exploded');
      },
    });
    assert.deepEqual(await controller.resolveMirrorPointer(VIDEO), {
      naddr: '',
      coordinate: '',
    });
  });

  await t.test('a disabled mirror service is never consulted', async () => {
    let called = false;
    const controller = makeController({
      isAvailable: () => false,
      findMirror: async () => {
        called = true;
        return { mirrored: true, kinds: [34235] };
      },
    });
    const out = await controller.resolveMirrorPointer(VIDEO);
    assert.equal(out.naddr, '');
    assert.equal(called, false);
  });

  await t.test('a video without a videoRootId cannot be addressed', async () => {
    const controller = makeController({
      isAvailable: () => true,
      findMirror: async () => ({ mirrored: true, kinds: [34235] }),
    });
    const out = await controller.resolveMirrorPointer({
      ...VIDEO,
      videoRootId: '',
    });
    assert.equal(out.naddr, '');
  });

  await t.test('a missing mirror service is tolerated', async () => {
    const controller = makeController(null);
    assert.deepEqual(await controller.resolveMirrorPointer(VIDEO), {
      naddr: '',
      coordinate: '',
    });
  });
});
