import test, { beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import ProfileModalController from '../js/ui/profileModalController.js';
import { createWatchHistoryRenderer } from '../js/historyView.js';
import watchHistoryService from '../js/watchHistoryService.js';
import { formatShortNpub } from '../js/utils/formatters.js';
import { resetRuntimeFlags } from '../js/constants.js';
import { applyDesignSystemAttributes } from '../js/designSystem.js';

const profileModalHtml = await readFile(
  new URL('../components/profile-modal.html', import.meta.url),
  'utf8',
);

const defaultActorNpub = 'npub1actor0exampleexampleexampleexampleexampleex';
const defaultActorHex = 'a'.repeat(64);

let dom;
let container;

async function waitForAnimationFrame(window, cycles = 1) {
  for (let i = 0; i < cycles; i += 1) {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }
}

function createMatchMediaList(query, initialMatches = false) {
  let matches = Boolean(initialMatches);
  const listeners = new Set();

  const notify = () => {
    const event = { matches, media: query, type: 'change' };
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {}
    });
  };

  return {
    get matches() {
      return matches;
    },
    set matches(value) {
      matches = Boolean(value);
    },
    media: query,
    addEventListener(type, listener) {
      if (type === 'change' && typeof listener === 'function') {
        listeners.add(listener);
      }
    },
    removeEventListener(type, listener) {
      if (type === 'change' && typeof listener === 'function') {
        listeners.delete(listener);
      }
    },
    addListener(listener) {
      if (typeof listener === 'function') {
        listeners.add(listener);
      }
    },
    removeListener(listener) {
      if (typeof listener === 'function') {
        listeners.delete(listener);
      }
    },
    dispatchEvent(event) {
      if (!event || event.type !== 'change') {
        return true;
      }
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch {}
      });
      return true;
    },
    setMatches(value) {
      matches = Boolean(value);
      notify();
    },
  };
}

beforeEach(() => {
  dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="modalMount"></div></body></html>',
    {
      url: 'https://example.com',
      pretendToBeVisual: true,
    },
  );

  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.HTMLImageElement = dom.window.HTMLImageElement;
  global.HTMLInputElement = dom.window.HTMLInputElement;
  global.HTMLButtonElement = dom.window.HTMLButtonElement;
  global.Node = dom.window.Node;
  global.CustomEvent = dom.window.CustomEvent;
  global.Event = dom.window.Event;
  global.KeyboardEvent = dom.window.KeyboardEvent;
  global.MutationObserver = dom.window.MutationObserver;

  window.requestAnimationFrame = (callback) => callback(0);
  window.cancelAnimationFrame = () => {};
  global.requestAnimationFrame = window.requestAnimationFrame;
  global.cancelAnimationFrame = window.cancelAnimationFrame;

  window.confirm = () => true;
  global.confirm = window.confirm;

  window.__matchMediaMocks = [];
  window.matchMedia = (query) => {
    const mql = createMatchMediaList(query, false);
    window.__matchMediaMocks.push(mql);
    return mql;
  };
  global.matchMedia = window.matchMedia;

  container = document.getElementById('modalMount');

  global.fetch = async (resource) => {
    if (
      typeof resource === 'string' &&
      resource.includes('components/profile-modal.html')
    ) {
      return {
        ok: true,
        status: 200,
        text: async () => profileModalHtml,
      };
    }

    throw new Error(`Unexpected fetch: ${resource}`);
  };
});

afterEach(() => {
  delete global.fetch;
  delete global.confirm;
  delete global.requestAnimationFrame;
  delete global.cancelAnimationFrame;
  delete global.MutationObserver;
  delete global.KeyboardEvent;
  delete global.Event;
  delete global.CustomEvent;
  delete global.HTMLButtonElement;
  delete global.HTMLInputElement;
  delete global.HTMLImageElement;
  delete global.Node;
  delete global.HTMLElement;
  delete global.document;
  delete global.window;
  delete global.matchMedia;

  if (dom) {
    dom.window.close();
    dom = null;
  }
  if (typeof window !== 'undefined') {
    delete window.matchMedia;
    delete window.__matchMediaMocks;
  }
  container = null;
});

function normalizeTestTag(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/^#+/, '').toLowerCase();
}

function createController(options = {}) {
  const {
    services: serviceOverrides = {},
    callbacks = {},
    createWatchHistoryRenderer = options.createWatchHistoryRenderer ?? null,
  } = options;

  const {
    relayManager: relayManagerOverrides = {},
    userBlocks: userBlocksOverrides = {},
    accessControl: accessControlOverrides = {},
    nostrClient: nostrClientOverrides = {},
    hashtagPreferences: hashtagPreferencesOverrides = {},
    ...otherServices
  } = serviceOverrides;

  const baseRelayManager = {
    getEntries: () => [],
    snapshot: () => [],
    addRelay: () => ({ changed: true }),
    removeRelay: () => ({ changed: true }),
    restoreDefaults: () => ({ changed: true }),
    cycleRelayMode: () => ({ changed: true }),
    publishRelayList: async () => ({ ok: true }),
    setEntries: () => {},
  };

  const baseUserBlocks = {
    ensureLoaded: async () => {},
    isBlocked: () => false,
    addBlock: async () => ({ ok: true }),
    removeBlock: async () => ({ ok: true }),
    getBlockedPubkeys: () => [],
  };

  const hashtagStore = {
    interests: new Set(),
    disinterests: new Set(),
  };

  const baseHashtagPreferences = {
    getInterests: () => Array.from(hashtagStore.interests).sort(),
    getDisinterests: () => Array.from(hashtagStore.disinterests).sort(),
    addInterest: (tag) => {
      const normalized = normalizeTestTag(tag);
      if (!normalized) {
        return false;
      }
      const moved = hashtagStore.disinterests.delete(normalized);
      const had = hashtagStore.interests.has(normalized);
      hashtagStore.interests.add(normalized);
      return !had || moved;
    },
    removeInterest: (tag) => {
      const normalized = normalizeTestTag(tag);
      if (!normalized) {
        return false;
      }
      return hashtagStore.interests.delete(normalized);
    },
    addDisinterest: (tag) => {
      const normalized = normalizeTestTag(tag);
      if (!normalized) {
        return false;
      }
      const moved = hashtagStore.interests.delete(normalized);
      const had = hashtagStore.disinterests.has(normalized);
      hashtagStore.disinterests.add(normalized);
      return !had || moved;
    },
    removeDisinterest: (tag) => {
      const normalized = normalizeTestTag(tag);
      if (!normalized) {
        return false;
      }
      return hashtagStore.disinterests.delete(normalized);
    },
    publish: async () => ({ ok: true }),
    on: () => () => {},
  };

  const hashtagPreferences = {
    ...baseHashtagPreferences,
    ...hashtagPreferencesOverrides,
  };

  const baseAccessControl = {
    ensureReady: async () => {},
    canEditAdminLists: () => false,
    isSuperAdmin: () => false,
    getEditors: () => [],
    getWhitelist: () => [],
    getBlacklist: () => [],
    addModerator: async () => ({ ok: true }),
    removeModerator: async () => ({ ok: true }),
    addToWhitelist: async () => ({ ok: true }),
    removeFromWhitelist: async () => ({ ok: true }),
    addToBlacklist: async () => ({ ok: true }),
    removeFromBlacklist: async () => ({ ok: true }),
  };

  const mergedServices = {
    relayManager: { ...baseRelayManager, ...relayManagerOverrides },
    userBlocks: { ...baseUserBlocks, ...userBlocksOverrides },
    accessControl: { ...baseAccessControl, ...accessControlOverrides },
    nostrClient: { sessionActor: { pubkey: null }, ...nostrClientOverrides },
    hashtagPreferences,
    getHashtagPreferences: () => ({
      interests: hashtagPreferences.getInterests(),
      disinterests: hashtagPreferences.getDisinterests(),
      eventId: null,
      createdAt: null,
      loaded: true,
    }),
    describeHashtagPreferencesError: () => '',
    onAccessControlUpdated: async () => {},
    describeAdminError: () => 'Unable to update moderation settings. Please try again.',
    describeNotificationError: () => '',
    sendAdminListNotification: async () => ({ ok: true }),
    getCurrentUserNpub: () => defaultActorNpub,
    ...otherServices,
  };

  return new ProfileModalController({
    modalContainer: container,
    removeTrackingScripts: () => {},
    setGlobalModalState: () => {},
    showError: options.showError ?? (() => {}),
    showSuccess: options.showSuccess ?? (() => {}),
    showStatus: options.showStatus ?? (() => {}),
    createWatchHistoryRenderer,
    callbacks,
    services: mergedServices,
    state: options.state ?? {},
    constants: options.constants ?? {},
  });
}

for (const _ of [0]) {

  test(
    'Profile modal Escape closes and restores trigger focus',
    async (t) => {
      const controller = createController();
      await controller.load();
      applyDesignSystemAttributes(document);

      const trigger = document.createElement('button');
      trigger.id = 'profileTrigger';
      trigger.textContent = 'Open profile';
      document.body.appendChild(trigger);
      trigger.focus();
      await waitForAnimationFrame(window, 1);

      const cleanup = () => {
        try {
          controller.hide({ silent: true });
        } catch {}
        try {
          trigger.remove();
        } catch {}
      };

      let cleanupRan = false;
      try {
        await controller.show('account');
        await waitForAnimationFrame(window, 2);

        const focusTrap =
          controller.focusTrapContainer ||
          controller.profileModalPanel ||
          controller.profileModal ||
          document.getElementById('profileModal');
        assert.ok(focusTrap, 'focus trap container should exist');

        focusTrap.dispatchEvent(
          new window.KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
          }),
        );

        await waitForAnimationFrame(window, 2);

        const modalRoot = document.getElementById('profileModal');
        assert.ok(modalRoot?.classList.contains('hidden'));
        assert.strictEqual(document.activeElement, trigger);
      } finally {
        cleanup();
        cleanupRan = true;
      }

      t.after(() => {
        if (!cleanupRan) {
          cleanup();
        }
        resetRuntimeFlags();
      });
    },
  );

  test(
    'Profile modal navigation buttons toggle active state',
    async (t) => {
      const controller = createController();
      await controller.load();
      applyDesignSystemAttributes(document);

      let cleanupRan = false;
      const cleanup = () => {
        try {
          controller.hide({ silent: true });
        } catch {}
        cleanupRan = true;
      };

      try {
        await controller.show('account');
        await waitForAnimationFrame(window, 2);

        const accountButton = document.getElementById('profileNavAccount');
        const relaysButton = document.getElementById('profileNavRelays');
        const accountPane = document.getElementById('profilePaneAccount');
        const relaysPane = document.getElementById('profilePaneRelays');

        assert.ok(accountButton && relaysButton);
        assert.ok(accountPane && relaysPane);

        controller.selectPane('relays');
        await waitForAnimationFrame(window, 1);

        assert.equal(relaysButton?.getAttribute('aria-selected'), 'true');
        assert.equal(accountButton?.getAttribute('aria-selected'), 'false');
        assert.equal(relaysPane?.classList.contains('hidden'), false);
        assert.equal(accountPane?.classList.contains('hidden'), true);

        controller.selectPane('account');
        await waitForAnimationFrame(window, 1);

        assert.equal(accountButton?.getAttribute('aria-selected'), 'true');
        assert.equal(relaysButton?.getAttribute('aria-selected'), 'false');
        assert.equal(accountPane?.classList.contains('hidden'), false);
        assert.equal(relaysPane?.classList.contains('hidden'), true);
      } finally {
        cleanup();
      }

      t.after(() => {
        if (!cleanupRan) {
          cleanup();
        }
        resetRuntimeFlags();
      });
    },
  );

  test('Profile modal toggles mobile menu and pane views', async (t) => {
    const controller = createController();
    await controller.load();
    applyDesignSystemAttributes(document);

    let cleanupRan = false;
    const cleanup = () => {
      try {
        controller.hide({ silent: true });
      } catch {}
      cleanupRan = true;
    };

    try {
      await controller.show('account');
      await waitForAnimationFrame(window, 2);

      const layout = document.querySelector('[data-profile-layout]');
      const menuWrapper = document.querySelector('[data-profile-mobile-menu]');
      const paneWrapper = document.querySelector('[data-profile-mobile-pane]');
      const backButton = document.getElementById('profileModalBack');

      assert.ok(layout && menuWrapper && paneWrapper && backButton);

      assert.equal(layout?.dataset.mobileView, 'menu');
      assert.equal(menuWrapper?.getAttribute('aria-hidden'), 'false');
      assert.equal(menuWrapper?.classList.contains('hidden'), false);
      assert.equal(menuWrapper?.hasAttribute('hidden'), false);
      assert.equal(paneWrapper?.getAttribute('aria-hidden'), 'true');
      assert.equal(paneWrapper?.classList.contains('hidden'), true);
      assert.equal(paneWrapper?.hasAttribute('hidden'), true);
      assert.equal(backButton?.classList.contains('hidden'), true);

      controller.selectPane('relays');
      await waitForAnimationFrame(window, 1);

      assert.equal(layout?.dataset.mobileView, 'pane');
      assert.equal(menuWrapper?.getAttribute('aria-hidden'), 'true');
      assert.equal(menuWrapper?.classList.contains('hidden'), true);
      assert.equal(menuWrapper?.hasAttribute('hidden'), true);
      assert.equal(paneWrapper?.getAttribute('aria-hidden'), 'false');
      assert.equal(paneWrapper?.classList.contains('hidden'), false);
      assert.equal(paneWrapper?.hasAttribute('hidden'), false);
      assert.equal(backButton?.classList.contains('hidden'), false);

      backButton?.click();
      await waitForAnimationFrame(window, 1);

      assert.equal(layout?.dataset.mobileView, 'menu');
      assert.equal(menuWrapper?.getAttribute('aria-hidden'), 'false');
      assert.equal(menuWrapper?.classList.contains('hidden'), false);
      assert.equal(menuWrapper?.hasAttribute('hidden'), false);
      assert.equal(paneWrapper?.getAttribute('aria-hidden'), 'true');
      assert.equal(paneWrapper?.classList.contains('hidden'), true);
      assert.equal(paneWrapper?.hasAttribute('hidden'), true);
      assert.equal(backButton?.classList.contains('hidden'), true);
    } finally {
      cleanup();
    }

    t.after(() => {
      if (!cleanupRan) {
        cleanup();
      }
      resetRuntimeFlags();
    });
  });

  test('wallet URI input masks persisted values and restores on focus', async (t) => {
    const controller = createController();
    await controller.load();

    controller.state.setActivePubkey('a'.repeat(64));

    await controller.show('wallet');

    const sampleUri =
      'nostr+walletconnect://pub1?relay=wss://relay.example.com';
    await controller.services.nwcSettings.updateActiveNwcSettings({
      nwcUri: sampleUri,
      defaultZap: 21,
    });

    controller.refreshWalletPaneState();

    assert.ok(
      controller.walletUriInput instanceof window.HTMLElement,
      'wallet URI input should exist',
    );
    assert.equal(controller.walletUriInput.value, '*****');
    assert.equal(controller.walletUriInput.dataset.secretValue, sampleUri);
    assert.equal(
      controller.walletDisconnectButton?.classList.contains('hidden'),
      false,
      'disconnect button should remain visible when a URI exists',
    );

    const formValues = controller.getWalletFormValues();
    assert.equal(formValues.uri, sampleUri);

    controller.walletUriInput.dispatchEvent(new window.Event('focus'));
    assert.equal(controller.walletUriInput.value, sampleUri);

    controller.walletUriInput.dispatchEvent(new window.Event('blur'));
    assert.equal(controller.walletUriInput.value, '*****');

    controller.walletUriInput.dispatchEvent(new window.Event('focus'));
    const updatedUri = `${sampleUri}&name=bitvid`;
    controller.walletUriInput.value = updatedUri;
    controller.walletUriInput.dispatchEvent(new window.Event('input'));
    controller.walletUriInput.dispatchEvent(new window.Event('blur'));

    const updatedValues = controller.getWalletFormValues();
    assert.equal(updatedValues.uri, updatedUri);
    assert.equal(controller.walletUriInput.value, '*****');

    controller.walletUriInput.dispatchEvent(new window.Event('focus'));
    controller.walletUriInput.value = '';
    controller.walletUriInput.dispatchEvent(new window.Event('input'));
    controller.walletUriInput.dispatchEvent(new window.Event('blur'));

    assert.equal(controller.walletUriInput.value, '');
    assert.equal(controller.walletUriInput.dataset.secretValue, undefined);

    t.after(() => {
      try {
        controller.hide({ silent: true });
      } catch {}
    });
  });

  test('Profile modal uses abbreviated npub display', async () => {
    const sampleProfiles = [
      {
        pubkey: defaultActorHex,
        npub: 'npub1abcdefghijkmnopqrstuvwxyz1234567890example',
        name: '',
        picture: '',
        providerId: 'nip07',
        authType: 'nip07',
      },
      {
        pubkey: 'b'.repeat(64),
        npub: 'npub1zyxwvutsrqponmlkjihgfedcba1234567890sample',
        name: '',
        picture: '',
        providerId: 'nsec',
        authType: 'nsec',
      },
    ];

    const controller = createController({
      services: {
        formatShortNpub,
      },
    });

    await controller.load();

    controller.state.setSavedProfiles(sampleProfiles);
    controller.state.setActivePubkey(sampleProfiles[0].pubkey);

    controller.renderSavedProfiles();

    const expectedActive = formatShortNpub(sampleProfiles[0].npub);
    assert.equal(controller.profileNpub.textContent, expectedActive);

    const switcherNpubEl = controller.switcherList.querySelector('.font-mono');
    assert.ok(switcherNpubEl, 'switcher should render the secondary profile');
    const expectedSwitcher = formatShortNpub(sampleProfiles[1].npub);
    assert.equal(switcherNpubEl.textContent, expectedSwitcher);
  });

  test('renderSavedProfiles applies provider metadata', async () => {
    const sampleProfiles = [
      {
        pubkey: defaultActorHex,
        npub: 'npub1abcdefghijkmnopqrstuvwxyz1234567890example',
        name: 'Primary Account',
        picture: '',
        providerId: 'nip07',
        authType: 'nip07',
      },
      {
        pubkey: 'b'.repeat(64),
        npub: 'npub1zyxwvutsrqponmlkjihgfedcba1234567890sample',
        name: 'Backup',
        picture: '',
        providerId: 'nsec',
        authType: 'nsec',
      },
    ];

    const controller = createController({
      services: {
        formatShortNpub,
      },
    });

    await controller.load();

    controller.state.setSavedProfiles(sampleProfiles);
    controller.state.setActivePubkey(null);

    controller.renderSavedProfiles();

    const buttons = Array.from(
      controller.switcherList.querySelectorAll('button[data-provider-id]'),
    );

    assert.equal(buttons.length, 2, 'expected two provider entries in the switcher');

    const [extensionButton, directKeyButton] = buttons;

    assert.equal(extensionButton.dataset.providerId, 'nip07');
    const extensionLabel = extensionButton.querySelector('[data-provider-variant]');
    assert.ok(extensionLabel, 'extension entry should include a provider badge');
    assert.equal(extensionLabel.textContent, 'extension (nip-07)');
    assert.equal(extensionLabel.dataset.providerVariant, 'info');
    assert.equal(extensionButton.getAttribute('aria-pressed'), 'false');

    assert.equal(directKeyButton.dataset.providerId, 'nsec');
    const directKeyLabel = directKeyButton.querySelector('[data-provider-variant]');
    assert.ok(directKeyLabel, 'direct key entry should include a provider badge');
    assert.equal(
      directKeyLabel.textContent,
      'nsec or seed (direct private key)',
    );
    assert.equal(directKeyLabel.dataset.providerVariant, 'warning');
    assert.equal(directKeyButton.getAttribute('aria-pressed'), 'false');
  });

  test('Hashtag pane shows empty states by default', async (t) => {
    const controller = createController();
    await controller.load();
    applyDesignSystemAttributes(document);

    let cleanupRan = false;
    const cleanup = () => {
      try {
        controller.hide({ silent: true });
      } catch {}
      cleanupRan = true;
    };

    try {
      await controller.show('hashtags');
      await waitForAnimationFrame(window, 2);

      const interestList = document.getElementById('profileHashtagInterestList');
      const interestEmpty = document.getElementById('profileHashtagInterestEmpty');
      const disinterestList = document.getElementById('profileHashtagDisinterestList');
      const disinterestEmpty = document.getElementById(
        'profileHashtagDisinterestEmpty',
      );

      assert.ok(interestList && interestEmpty && disinterestList && disinterestEmpty);
      assert.equal(interestList?.classList.contains('hidden'), true);
      assert.equal(interestEmpty?.classList.contains('hidden'), false);
      assert.equal(disinterestList?.classList.contains('hidden'), true);
      assert.equal(disinterestEmpty?.classList.contains('hidden'), false);
    } finally {
      cleanup();
    }

    t.after(() => {
      if (!cleanupRan) {
        cleanup();
      }
      resetRuntimeFlags();
    });
  });

  test('Hashtag pane adds, moves, and removes tags', async (t) => {
    const controller = createController();
    await controller.load();
    applyDesignSystemAttributes(document);

    let cleanupRan = false;
    const cleanup = () => {
      try {
        controller.hide({ silent: true });
      } catch {}
      cleanupRan = true;
    };

    try {
      await controller.show('hashtags');
      await waitForAnimationFrame(window, 2);

      controller.hashtagInterestInput.value = '#nostr';
      controller.addHashtagInterestButton.click();
      await waitForAnimationFrame(window, 2);

      const interestList = document.getElementById('profileHashtagInterestList');
      assert.equal(interestList?.classList.contains('hidden'), false);
      assert.equal(interestList?.querySelectorAll('li').length, 1);
      const interestLabel = interestList?.querySelector('li span');
      assert.equal(interestLabel?.textContent, '#nostr');

      const disinterestList = document.getElementById('profileHashtagDisinterestList');
      const disinterestEmpty = document.getElementById('profileHashtagDisinterestEmpty');
      assert.equal(disinterestList?.classList.contains('hidden'), true);
      assert.equal(disinterestEmpty?.classList.contains('hidden'), false);

      controller.hashtagDisinterestInput.value = '#nostr';
      controller.addHashtagDisinterestButton.click();
      await waitForAnimationFrame(window, 2);

      assert.equal(interestList?.querySelectorAll('li').length, 0);
      const interestEmpty = document.getElementById('profileHashtagInterestEmpty');
      assert.equal(interestEmpty?.classList.contains('hidden'), false);

      assert.equal(disinterestList?.classList.contains('hidden'), false);
      assert.equal(disinterestList?.querySelectorAll('li').length, 1);
      const disinterestLabel = disinterestList?.querySelector('li span');
      assert.equal(disinterestLabel?.textContent, '#nostr');

      const removeButton = disinterestList?.querySelector(
        'button.profile-hashtag-remove',
      );
      assert.ok(removeButton);
      removeButton.click();
      await waitForAnimationFrame(window, 2);

      assert.equal(disinterestList?.querySelectorAll('li').length, 0);
      assert.equal(disinterestEmpty?.classList.contains('hidden'), false);
    } finally {
      cleanup();
    }

    t.after(() => {
      if (!cleanupRan) {
        cleanup();
      }
      resetRuntimeFlags();
    });
  });

  test('handleAddHashtagPreference publishes updates', async (t) => {
    const publishCalls = [];
    const controller = createController({
      services: {
        hashtagPreferences: {
          publish: async (payload) => {
            publishCalls.push(payload);
            return { ok: true };
          },
        },
      },
    });
    await controller.load();
    applyDesignSystemAttributes(document);

    controller.state.setActivePubkey(defaultActorHex);

    let cleanupRan = false;
    const cleanup = () => {
      try {
        controller.hide({ silent: true });
      } catch {}
      cleanupRan = true;
    };

    try {
      await controller.show('hashtags');
      await waitForAnimationFrame(window, 2);

      controller.hashtagInterestInput.value = '#nostr';
      const result = await controller.handleAddHashtagPreference('interest');

      assert.equal(result.success, true);
      assert.equal(publishCalls.length, 1);
      assert.deepEqual(publishCalls[0], { pubkey: defaultActorHex });
    } finally {
      cleanup();
    }

    t.after(() => {
      if (!cleanupRan) {
        cleanup();
      }
      resetRuntimeFlags();
    });
  });

  test('Hashtag pane resets after logout when service clears tags', async (t) => {
    const controller = createController();
    await controller.load();
    applyDesignSystemAttributes(document);

    let cleanupRan = false;
    const cleanup = () => {
      try {
        controller.hide({ silent: true });
      } catch {}
      cleanupRan = true;
    };

    try {
      await controller.show('hashtags');
      await waitForAnimationFrame(window, 2);

      controller.hashtagInterestInput.value = 'art';
      controller.addHashtagInterestButton.click();
      await waitForAnimationFrame(window, 2);

      const interestList = document.getElementById('profileHashtagInterestList');
      assert.equal(interestList?.querySelectorAll('li').length, 1);

      controller.hashtagPreferencesService.removeInterest('art');
      await controller.handleAuthLogout({});
      await waitForAnimationFrame(window, 2);

      const interestEmpty = document.getElementById('profileHashtagInterestEmpty');
      const disinterestEmpty = document.getElementById('profileHashtagDisinterestEmpty');
      assert.equal(interestList?.querySelectorAll('li').length, 0);
      assert.equal(interestEmpty?.classList.contains('hidden'), false);
      assert.equal(disinterestEmpty?.classList.contains('hidden'), false);
    } finally {
      cleanup();
    }

    t.after(() => {
      if (!cleanupRan) {
        cleanup();
      }
      resetRuntimeFlags();
    });
  });
}

test('load() injects markup and caches expected elements', async () => {
  const controller = createController();
  const result = await controller.load();

  assert.equal(result, true);
  const modal = container.querySelector('#profileModal');
  assert.ok(modal instanceof window.HTMLElement);
  assert.strictEqual(controller.profileModal, modal);

  assert.ok(controller.navButtons.account instanceof window.HTMLElement);
  assert.ok(controller.panes.account instanceof window.HTMLElement);
  assert.ok(controller.relayList instanceof window.HTMLElement);
  assert.ok(controller.blockList instanceof window.HTMLElement);
  assert.ok(controller.walletStatusText instanceof window.HTMLElement);
});

test('show()/hide() toggle panes, trap focus, and refresh the wallet pane', async () => {
  const controller = createController();
  await controller.load();

  let adminRefreshes = 0;
  controller.refreshAdminPaneState = async () => {
    adminRefreshes += 1;
  };

  let walletRefreshes = 0;
  controller.refreshWalletPaneState = () => {
    walletRefreshes += 1;
  };

  let relaysPopulated = 0;
  controller.populateProfileRelays = () => {
    relaysPopulated += 1;
  };

  controller.populateBlockedList = () => {};

  const focusBefore = document.createElement('button');
  focusBefore.id = 'before';
  document.body.appendChild(focusBefore);
  focusBefore.focus();

  await controller.show('wallet');

  assert.equal(adminRefreshes, 1);
  assert.equal(walletRefreshes, 2);
  assert.equal(relaysPopulated, 1);
  assert.equal(controller.getActivePane(), 'wallet');
  assert.equal(controller.profileModal.getAttribute('aria-hidden'), 'false');

  assert.ok(controller.boundKeydown);
  assert.ok(controller.focusableElements.length > 0);
  const first = controller.focusableElements[0];
  const last = controller.focusableElements[controller.focusableElements.length - 1];

  last.focus();
  let prevented = false;
  controller.boundKeydown({
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(document.activeElement, first);
  assert.equal(prevented, true);

  await controller.hide();
  assert.equal(controller.profileModal.getAttribute('aria-hidden'), 'true');
  assert.equal(controller.getActivePane(), 'account');
});

test('populateProfileRelays renders entries and wires action buttons', async () => {
  const relays = [
    { url: 'wss://relay.one', mode: 'write' },
    { url: 'wss://relay.two', read: true, write: false },
  ];

  const controller = createController({
    services: {
      relayManager: {
        getEntries: () => relays,
      },
    },
  });

  await controller.load();

  const modeCalls = [];
  const removeCalls = [];
  controller.handleRelayModeToggle = (url) => {
    modeCalls.push(url);
  };
  controller.handleRemoveRelay = (url) => {
    removeCalls.push(url);
  };

  controller.populateProfileRelays();

  const items = controller.relayList.querySelectorAll('li');
  assert.equal(items.length, relays.length);

  const firstButtons = items[0].querySelectorAll('button');
  assert.equal(firstButtons.length, 2);

  firstButtons[0].click();
  firstButtons[1].click();

  assert.deepEqual(modeCalls, ['wss://relay.one']);
  assert.deepEqual(removeCalls, ['wss://relay.one']);
});

test('admin mutations invoke accessControl stubs and update admin DOM', async () => {
  const successMessages = [];
  const errorMessages = [];
  const ensureReadyCalls = [];
  const accessEvents = [];

  const accessControl = {
    ensureReady: async () => {
      ensureReadyCalls.push('ensure');
    },
    canEditAdminLists: () => true,
    isSuperAdmin: () => true,
    getEditors: () => new Set(['npub1moderator']),
    getWhitelist: () => new Set(['npub1allow']),
    getBlacklist: () => new Set(['npub1block']),
    addModerator: async (actor, target) => {
      accessEvents.push(['addModerator', actor, target]);
      return { ok: true };
    },
    removeModerator: async (actor, target) => {
      accessEvents.push(['removeModerator', actor, target]);
      return { ok: true };
    },
    addToWhitelist: async (actor, target) => {
      accessEvents.push(['addWhitelist', actor, target]);
      return { ok: true };
    },
    removeFromWhitelist: async (actor, target) => {
      accessEvents.push(['removeWhitelist', actor, target]);
      return { ok: true };
    },
    addToBlacklist: async (actor, target) => {
      accessEvents.push(['addBlacklist', actor, target]);
      return { ok: true };
    },
    removeFromBlacklist: async (actor, target) => {
      accessEvents.push(['removeBlacklist', actor, target]);
      return { ok: true };
    },
  };

  const onAccessControlUpdatedCalls = [];

  const controller = createController({
    showSuccess: (message) => successMessages.push(message),
    showError: (message) => errorMessages.push(message),
    services: {
      accessControl,
      getCurrentUserNpub: () => defaultActorNpub,
      onAccessControlUpdated: async () => {
        onAccessControlUpdatedCalls.push('updated');
      },
    },
  });

  await controller.load();
  await controller.refreshAdminPaneState();

  assert.ok(controller.navButtons.admin);
  assert.equal(controller.navButtons.admin.classList.contains('hidden'), false);
  assert.equal(controller.moderatorSection.classList.contains('hidden'), false);
  assert.equal(controller.adminModeratorList.querySelectorAll('li').length, 1);
  assert.equal(controller.adminModeratorList.hasAttribute('hidden'), false);
  assert.equal(
    controller.whitelistList.querySelectorAll('button').length > 0,
    true,
  );
  assert.equal(controller.whitelistList.classList.contains('hidden'), false);
  assert.equal(controller.whitelistList.hasAttribute('hidden'), false);

  controller.moderatorInput.value = 'npub1newmoderator';
  await controller.handleAddModerator();

  assert.deepEqual(accessEvents[0], [
    'addModerator',
    defaultActorNpub,
    'npub1newmoderator',
  ]);
  assert.equal(controller.addModeratorButton.disabled, false);
  assert.equal(
    controller.addModeratorButton.hasAttribute('aria-busy'),
    false,
  );
  assert.equal(controller.moderatorInput.value, '');
  assert.ok(onAccessControlUpdatedCalls.length >= 1);
  assert.ok(successMessages.includes('Moderator added successfully.'));

  controller.whitelistInput.value = 'npub1fresh';
  const whitelistButton = controller.addWhitelistButton;
  await controller.handleAdminListMutation('whitelist', 'add');
  assert.deepEqual(accessEvents[1], [
    'addWhitelist',
    defaultActorNpub,
    'npub1fresh',
  ]);
  assert.equal(whitelistButton.disabled, false);
  assert.equal(whitelistButton.hasAttribute('aria-busy'), false);
  assert.ok(successMessages.includes('Added to the whitelist.'));

  const removeButton = controller.whitelistList.querySelector(
    'button[data-role="remove"]',
  );
  await controller.handleAdminListMutation('whitelist', 'remove', 'npub1allow', removeButton);
  const removeEvent = accessEvents.find((entry) => entry[0] === 'removeWhitelist');
  assert.deepEqual(removeEvent, [
    'removeWhitelist',
    defaultActorNpub,
    'npub1allow',
  ]);
  assert.equal(removeButton.disabled, false);
  assert.equal(removeButton.hasAttribute('aria-busy'), false);
  assert.ok(successMessages.includes('Removed from the whitelist.'));

  assert.deepEqual(errorMessages, []);
  assert.ok(ensureReadyCalls.length >= 3);
});

test('history pane lazily initializes the watch history renderer', async () => {
  const historyCalls = [];
  let capturedConfig = null;

  const fakeRenderer = {
    ensureInitialLoad: async ({ actor }) => {
      historyCalls.push(['ensure', actor]);
    },
    refresh: async ({ actor, force }) => {
      historyCalls.push(['refresh', actor, force]);
    },
    resume: () => {
      historyCalls.push(['resume']);
    },
    pause: () => {
      historyCalls.push(['pause']);
    },
    destroy: () => {
      historyCalls.push(['destroy']);
    },
  };

  const controller = createController({
    createWatchHistoryRenderer: (config) => {
      capturedConfig = config;
      return fakeRenderer;
    },
    services: {
      nostrClient: { sessionActor: { pubkey: defaultActorHex } },
      getCurrentUserNpub: () => defaultActorNpub,
    },
  });

  await controller.load();
  controller.refreshAdminPaneState = async () => {};
  controller.populateProfileRelays = () => {};
  controller.populateBlockedList = () => {};
  controller.refreshWalletPaneState = () => {};

  controller.setActivePubkey(defaultActorHex);
  await controller.show('history');
  await Promise.resolve();

  assert.ok(capturedConfig);
  assert.equal(capturedConfig.viewSelector, '#profilePaneHistory');
  assert.deepEqual(historyCalls.slice(0, 3), [
    ['ensure', defaultActorHex],
    ['refresh', defaultActorHex, true],
    ['resume'],
  ]);
  assert.ok(typeof controller.boundProfileHistoryVisibility === 'function');

  await controller.hide();
  await Promise.resolve();

  assert.equal(
    historyCalls.some((entry) => Array.isArray(entry) && entry[0] === 'destroy'),
    true,
  );
  assert.equal(controller.profileHistoryRenderer, null);
  assert.equal(controller.boundProfileHistoryVisibility, null);
});

test('history metadata toggle updates stored preference', async (t) => {
  let storedPreference = true;
  let clearCalls = 0;

  const originalSetPreference = watchHistoryService.setMetadataPreference;
  const originalShouldStore = watchHistoryService.shouldStoreMetadata;
  const originalClearMetadata = watchHistoryService.clearLocalMetadata;
  const originalSubscribe = watchHistoryService.subscribe;
  const originalIsEnabled = watchHistoryService.isEnabled;
  const originalSupportsLocal = watchHistoryService.supportsLocalHistory;
  const originalIsLocalOnly = watchHistoryService.isLocalOnly;

  watchHistoryService.setMetadataPreference = (value) => {
    storedPreference = value !== false;
  };
  watchHistoryService.shouldStoreMetadata = () => storedPreference;
  watchHistoryService.clearLocalMetadata = () => {
    clearCalls += 1;
  };
  watchHistoryService.subscribe = () => () => {};
  watchHistoryService.isEnabled = () => true;
  watchHistoryService.supportsLocalHistory = () => true;
  watchHistoryService.isLocalOnly = () => false;

  t.after(() => {
    watchHistoryService.setMetadataPreference = originalSetPreference;
    watchHistoryService.shouldStoreMetadata = originalShouldStore;
    watchHistoryService.clearLocalMetadata = originalClearMetadata;
    watchHistoryService.subscribe = originalSubscribe;
    watchHistoryService.isEnabled = originalIsEnabled;
    watchHistoryService.supportsLocalHistory = originalSupportsLocal;
    watchHistoryService.isLocalOnly = originalIsLocalOnly;
  });

  const controller = createController({
    createWatchHistoryRenderer: (config) =>
      createWatchHistoryRenderer({
        ...config,
        fetchHistory: async () => ({ items: [], metadata: {} }),
        snapshot: async () => ({}),
      }),
    services: {
      nostrClient: { sessionActor: { pubkey: defaultActorHex } },
      getCurrentUserNpub: () => defaultActorNpub,
    },
  });

  await controller.load();
  applyDesignSystemAttributes(document);

  controller.refreshAdminPaneState = async () => {};
  controller.populateProfileRelays = () => {};
  controller.populateBlockedList = () => {};
  controller.refreshWalletPaneState = () => {};

  controller.setActivePubkey(defaultActorHex);

  let cleanupRan = false;
  const cleanup = () => {
    try {
      controller.hide({ silent: true });
    } catch {}
    cleanupRan = true;
  };

  try {
    await controller.show('history');
    await waitForAnimationFrame(window, 3);

    const toggle = document.getElementById('profileHistoryMetadataToggle');
    assert.ok(toggle);
    assert.equal(toggle.getAttribute('aria-checked'), 'true');
    assert.equal(toggle.getAttribute('data-enabled'), 'true');

    toggle.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await waitForAnimationFrame(window, 2);

    assert.equal(storedPreference, false);
    assert.equal(toggle.getAttribute('aria-checked'), 'false');
    assert.equal(toggle.getAttribute('data-enabled'), 'false');
    assert.equal(clearCalls, 1);

    toggle.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await waitForAnimationFrame(window, 2);

    assert.equal(storedPreference, true);
    assert.equal(toggle.getAttribute('aria-checked'), 'true');
    assert.equal(toggle.getAttribute('data-enabled'), 'true');
  } finally {
    cleanup();
  }

  t.after(() => {
    if (!cleanupRan) {
      cleanup();
    }
  });
});
