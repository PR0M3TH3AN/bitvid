import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { createHashChangeHandler } from "../../js/hashChangeHandler.js";

const setupDom = (url) => {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url });
  const { window } = dom;
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousHTMLElement = global.HTMLElement;

  global.window = window;
  global.document = window.document;
  global.HTMLElement = window.HTMLElement;

  return () => {
    global.window = previousWindow;
    global.document = previousDocument;
    if (previousHTMLElement === undefined) {
      delete global.HTMLElement;
    } else {
      global.HTMLElement = previousHTMLElement;
    }
  };
};

const createLogger = () => ({
  log() {},
  warn() {},
  error() {},
});

test("handleHashChange defaults to for-you when logged in", async () => {
  const restore = setupDom("https://example.com");

  try {
    const loadViewCalls = [];
    let initCalled = false;

    const handleHashChange = createHashChangeHandler({
      getApplication: () => ({ isUserLoggedIn: () => true }),
      getApplicationReady: () => Promise.resolve(),
      loadView: async (viewUrl) => {
        loadViewCalls.push(viewUrl);
      },
      viewInitRegistry: {
        "for-you": async () => {
          initCalled = true;
        },
      },
      devLogger: createLogger(),
      userLogger: createLogger(),
    });

    await handleHashChange();

    assert.deepEqual(loadViewCalls, ["views/for-you.html"]);
    assert.equal(initCalled, true);
  } finally {
    restore();
  }
});

test("handleHashChange defaults to most-recent-videos when logged out", async () => {
  const restore = setupDom("https://example.com");

  try {
    const loadViewCalls = [];
    let initCalled = false;

    const handleHashChange = createHashChangeHandler({
      getApplication: () => ({ isUserLoggedIn: () => false }),
      getApplicationReady: () => Promise.resolve(),
      loadView: async (viewUrl) => {
        loadViewCalls.push(viewUrl);
      },
      viewInitRegistry: {
        "most-recent-videos": async () => {
          initCalled = true;
        },
      },
      devLogger: createLogger(),
      userLogger: createLogger(),
    });

    await handleHashChange();

    assert.deepEqual(loadViewCalls, ["views/most-recent-videos.html"]);
    assert.equal(initCalled, true);
  } finally {
    restore();
  }
});

test("handleHashChange respects explicit view regardless of login state", async () => {
  const restore = setupDom("https://example.com/#view=subscriptions");

  try {
    const loadViewCalls = [];
    let initCalled = false;

    const handleHashChange = createHashChangeHandler({
      getApplication: () => ({ isUserLoggedIn: () => true }),
      getApplicationReady: () => Promise.resolve(),
      loadView: async (viewUrl) => {
        loadViewCalls.push(viewUrl);
      },
      viewInitRegistry: {
        subscriptions: async () => {
          initCalled = true;
        },
      },
      devLogger: createLogger(),
      userLogger: createLogger(),
    });

    await handleHashChange();

    assert.deepEqual(loadViewCalls, ["views/subscriptions.html"]);
    assert.equal(initCalled, true);
  } finally {
    restore();
  }
});
