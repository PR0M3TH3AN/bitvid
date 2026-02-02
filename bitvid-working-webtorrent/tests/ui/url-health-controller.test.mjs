import test, { beforeEach, afterEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { JSDOM } from 'jsdom';
import UrlHealthController from '../../js/ui/urlHealthController.js';

let dom;
let controller;
let mockCache = new Map();
let inFlightProbes = new Map();

const mockState = {
  getCachedUrlHealth: (eventId, url) => mockCache.get(`${eventId}-${url}`),
  storeUrlHealth: (eventId, url, result) => {
    mockCache.set(`${eventId}-${url}`, result);
    return result;
  },
  getInFlightUrlProbe: (eventId, url) => inFlightProbes.get(`${eventId}-${url}`),
  setInFlightUrlProbe: (eventId, url, promise) => {
    inFlightProbes.set(`${eventId}-${url}`, promise);
  },
  URL_PROBE_TIMEOUT_MS: 50,
  urlHealthConstants: { URL_PROBE_TIMEOUT_RETRY_MS: 50 },
};

const mockLogger = {
  warn: () => {},
  log: () => {},
  error: () => {},
};

const mockUtils = {
  updateVideoCardSourceVisibility: () => {},
};

const mockCallbacks = {
  getVideoListView: () => ({
    cacheUrlHealth: () => {},
  }),
};

beforeEach(() => {
  dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://example.com',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.AbortController = dom.window.AbortController;

  // Mock fetch
  global.fetch = async (url) => {
    if (url.includes('timeout')) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: false, status: 408 };
    }
    if (url.includes('404')) {
      return { ok: false, status: 404 };
    }
    if (url.includes('error')) {
        throw new Error('Network error');
    }
    if (url.includes('opaque')) {
        return { type: 'opaque', ok: false, status: 0 };
    }
    return { ok: true, status: 200, type: 'basic' };
  };

  mockCache.clear();
  inFlightProbes.clear();

  controller = new UrlHealthController({
    state: mockState,
    utils: mockUtils,
    logger: mockLogger,
    constants: { URL_PROBE_TIMEOUT_MS: 50 },
    callbacks: mockCallbacks,
  });
});

afterEach(() => {
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.fetch;
  delete global.AbortController;
});

describe('UrlHealthController', () => {
  it('probeUrl returns ok for valid URL', async () => {
    // Mock video element behavior
    const originalCreateElement = document.createElement;
    document.createElement = (tagName) => {
        if (tagName === 'video') {
            return {
                addEventListener: (event, handler) => {
                    if (event === 'loadeddata') {
                        setTimeout(handler, 10);
                    }
                },
                removeEventListener: () => {},
                load: () => {},
                pause: () => {},
                removeAttribute: () => {},
                isConnected: false,
            };
        }
        return originalCreateElement(tagName);
    };

    const result = await controller.probeUrl('https://example.com/video.mp4', { confirmPlayable: true });
    assert.equal(result.outcome, 'ok');
    assert.equal(result.status, 200);

    document.createElement = originalCreateElement;
  });

  it('probeUrl returns error for 404', async () => {
     // Mock video element behavior to fail
     const originalCreateElement = document.createElement;
     document.createElement = (tagName) => {
         if (tagName === 'video') {
             return {
                 addEventListener: (event, handler) => {
                     if (event === 'error') {
                         setTimeout(handler, 10);
                     }
                 },
                 removeEventListener: () => {},
                 load: () => {},
                 pause: () => {},
                 removeAttribute: () => {},
                 isConnected: false,
             };
         }
         return originalCreateElement(tagName);
     };

    const result = await controller.probeUrl('https://example.com/404.mp4', { confirmPlayable: true });
    assert.ok(result.outcome === 'bad' || result.outcome === 'error');

    document.createElement = originalCreateElement;
  });

  it('handleUrlHealthBadge updates badge', async () => {
    const badgeEl = document.createElement('span');
    document.body.appendChild(badgeEl); // Ensure isConnected is true
    badgeEl.dataset.urlHealthUrl = 'https://example.com/video.mp4';
    badgeEl.dataset.urlHealthEventId = 'event1';

    // Mock successful probe via video element
    const originalCreateElement = document.createElement;
    document.createElement = (tagName) => {
        if (tagName === 'video') {
            return {
                addEventListener: (event, handler) => {
                    if (event === 'loadeddata') {
                        setTimeout(handler, 0);
                    }
                },
                removeEventListener: () => {},
                load: () => {},
                pause: () => {},
                removeAttribute: () => {},
                isConnected: false,
            };
        }
        return originalCreateElement(tagName);
    };

    await controller.handleUrlHealthBadge({
        video: { id: 'event1' },
        url: 'https://example.com/video.mp4',
        badgeEl
    });

    // Since handleUrlHealthBadge sets an in-flight probe, we might need to wait or verify the state.
    // The implementation of handleUrlHealthBadge awaits internally if not careful, or just triggers logic.
    // In js/app.js, it sets the in-flight probe and attaches .then() handlers.
    // We need to wait for microtasks.

    await new Promise(resolve => setTimeout(resolve, 50));

    assert.equal(badgeEl.dataset.urlHealthState, 'healthy');
    assert.equal(badgeEl.textContent, '✅ CDN');

    document.createElement = originalCreateElement;
  });

  it('getUrlHealthPlaceholderMarkup returns string', () => {
      const markup = controller.getUrlHealthPlaceholderMarkup();
      assert.ok(typeof markup === 'string');
      assert.ok(markup.includes('CDN'));
  });
});
