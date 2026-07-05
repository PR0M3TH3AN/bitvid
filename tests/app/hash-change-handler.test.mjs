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

// spec_correction: commit 04621efc (2026-06-24, "Trending defaults") made
// TRENDING the deliberate logged-out landing ("the best not-personalized
// landing", falling back to Recent only when FEATURE_TRENDING_FEED is off —
// see js/hashChangeHandler.js). This test still encoded the pre-change
// default (most-recent-videos) and has been failing since; the flag defaults
// to true, so the correct observable outcome is views/trending.html.
//
// test_integrity_note:
//   change_type: ["spec_correction"]
//   scenarios:
//     - id: SCN-logged-out-default-view
//       given: "no #view= hash and a logged-out user (FEATURE_TRENDING_FEED default-on)"
//       when: "handleHashChange resolves the default view"
//       then: "the Trending view loads and its init runs"
//   observable_outcomes:
//     - "loadView called with views/trending.html and the trending init fires"
//   determinism_controls:
//     - "JSDOM with fixed URL; injected logged-out application stub"
//   anti_cheat_rationale:
//     prevents: ["snapshot rubber-stamping"]
//   relaxation:
//     did_relax_any_assertion: false
//     if_true_explain_spec_basis: "expectation moved to the newer intended default (equally strict)"
test("handleHashChange defaults to trending when logged out", async () => {
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
        trending: async () => {
          initCalled = true;
        },
      },
      devLogger: createLogger(),
      userLogger: createLogger(),
    });

    await handleHashChange();

    assert.deepEqual(loadViewCalls, ["views/trending.html"]);
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
