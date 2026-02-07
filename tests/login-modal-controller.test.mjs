import test, { beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import LoginModalController from '../js/ui/loginModalController.js';

const loginModalHtml = await readFile(
  new URL('../components/login-modal.html', import.meta.url),
  'utf8',
);

let dom;
let container;
let controller;

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
  global.HTMLButtonElement = dom.window.HTMLButtonElement;
  global.HTMLInputElement = dom.window.HTMLInputElement;
  global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  global.HTMLFormElement = dom.window.HTMLFormElement;
  global.HTMLTemplateElement = dom.window.HTMLTemplateElement;
  global.Node = dom.window.Node;
  global.Element = dom.window.Element;
  global.MutationObserver = dom.window.MutationObserver;

  window.requestAnimationFrame = (callback) => callback(0);
  global.requestAnimationFrame = window.requestAnimationFrame;

  window.__matchMediaMocks = [];
  window.matchMedia = (query) => {
    const mql = createMatchMediaList(query, false);
    window.__matchMediaMocks.push(mql);
    return mql;
  };
  global.matchMedia = window.matchMedia;

  container = document.getElementById('modalMount');
  container.innerHTML = loginModalHtml;
});

afterEach(() => {
  if (controller) {
    controller.destroy();
    controller = null;
  }

  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.HTMLButtonElement;
  delete global.HTMLInputElement;
  delete global.HTMLTextAreaElement;
  delete global.HTMLFormElement;
  delete global.HTMLTemplateElement;
  delete global.Node;
  delete global.Element;
  delete global.MutationObserver;
  delete global.requestAnimationFrame;
  delete global.matchMedia;

  if (dom) {
    dom.window.close();
    dom = null;
  }
});

function createController(options = {}) {
    const modalElement = container.querySelector('#loginModal');
    return new LoginModalController({
        modalElement,
        providers: options.providers || [],
        services: options.services || {},
        callbacks: options.callbacks || {},
    });
}

test('LoginModalController shows custom error for empty nsec input', async (t) => {
    const providers = [{ id: 'nsec', label: 'Secret Key', login: async () => {} }];
    const authService = { requestLogin: async () => {} };
    controller = createController({ providers, services: { authService } });

    // Simulate clicking the nsec provider button
    // This requires us to inspect internal state or simulate events
    // But since `promptForNsecOptions` is async and returns a promise, we can call it if we can access the instance.
    // However, `handleProviderSelection` is what we usually trigger.

    // Let's use internal methods to render providers first
    controller.initialize();

    const providerButton = container.querySelector('[data-provider-id="nsec"]');
    assert.ok(providerButton, 'nsec provider button should be present');

    // Trigger click on provider
    const clickEvent = new dom.window.Event('click', { bubbles: true });
    providerButton.dispatchEvent(clickEvent);

    // Wait for the nsec form to appear
    await waitForAnimationFrame(window, 5);

    const form = container.querySelector('[data-nsec-form]');
    assert.ok(form, 'nsec form should be present');

    const secretInput = form.querySelector('[data-nsec-secret]');
    assert.ok(secretInput, 'secret input should be present');
    assert.ok(!secretInput.hasAttribute('required'), 'secret input should NOT have required attribute');
    assert.equal(secretInput.required, false, 'secret input property required should be false');

    const submitButton = form.querySelector('[data-nsec-submit]');
    assert.ok(submitButton, 'submit button should be present');

    const errorNode = form.querySelector('[data-nsec-error]');
    assert.ok(errorNode, 'error node should be present');
    assert.ok(errorNode.classList.contains('hidden'), 'error node should be initially hidden');

    // Submit with empty form
    const submitEvent = new dom.window.Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    // Wait for validation
    await waitForAnimationFrame(window, 2);

    assert.ok(!errorNode.classList.contains('hidden'), 'error node should be visible after empty submit');
    assert.equal(errorNode.textContent, 'Paste an nsec, hex key, or mnemonic to continue.');
});

test('LoginModalController does not set required attribute when toggling modes', async (t) => {
    const providers = [{ id: 'nsec', label: 'Secret Key', login: async () => {} }];
    const storedMetadata = { hasEncryptedKey: true };
    const nostrClient = {
        getStoredSessionActorMetadata: () => storedMetadata
    };
    const authService = { requestLogin: async () => {} };

    controller = createController({
        providers,
        services: { nostrClient, authService }
    });
    controller.initialize();

    const providerButton = container.querySelector('[data-provider-id="nsec"]');
    providerButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await waitForAnimationFrame(window, 5);

    const form = container.querySelector('[data-nsec-form]');
    const unlockRadio = form.querySelector('[data-nsec-mode="unlock"]');
    const importRadio = form.querySelector('[data-nsec-mode="import"]');
    const secretInput = form.querySelector('[data-nsec-secret]');
    const unlockPassphrase = form.querySelector('[data-nsec-unlock-passphrase]');

    // Initially should be in unlock mode because hasEncryptedKey is true
    assert.ok(unlockRadio.checked);
    assert.equal(secretInput.disabled, true);
    assert.equal(secretInput.required, false);

    // Unlock passphrase should be enabled but NOT required (because we want custom validation)
    assert.equal(unlockPassphrase.disabled, false);
    assert.equal(unlockPassphrase.required, false);

    // Switch to import mode
    importRadio.click();
    unlockRadio.checked = false;
    importRadio.checked = true;
    importRadio.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    await waitForAnimationFrame(window, 2);

    // Secret input should be enabled and NOT required
    assert.equal(secretInput.disabled, false);
    assert.equal(secretInput.required, false);

    // Unlock passphrase should be disabled
    assert.equal(unlockPassphrase.disabled, true);
    assert.equal(unlockPassphrase.required, false);
});

test('LoginModalController shows NIP-46 handshake panel', async (t) => {
    const providers = [{ id: 'nip46', label: 'Remote Signer', login: async () => {} }];
    const authService = { requestLogin: async () => {} };
    controller = createController({ providers, services: { authService } });
    controller.initialize();

    const providerButton = container.querySelector('[data-provider-id="nip46"]');
    assert.ok(providerButton, 'nip46 provider button should be present');

    // Trigger click on provider
    const clickEvent = new dom.window.Event('click', { bubbles: true });
    providerButton.dispatchEvent(clickEvent);

    // Wait for the nip46 form to appear
    await waitForAnimationFrame(window, 5);

    const form = container.querySelector('[data-nip46-form]');
    assert.ok(form, 'nip46 form should be present');

    const handshakePanel = form.querySelector('[data-nip46-handshake-panel]');
    assert.ok(handshakePanel, 'handshake panel should be present');
    assert.ok(!handshakePanel.classList.contains('hidden'), 'handshake panel should not be hidden');
});
