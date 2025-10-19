import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const noop = () => {};

class DummyElement {
  constructor() {
    this.classList = {
      add: noop,
      remove: noop,
      toggle: noop,
      contains: () => false,
    };
    Object.defineProperty(this, "style", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: {},
    });
    this.dataset = {};
    this.children = [];
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    return child;
  }
  querySelector() {
    return null;
  }
  addEventListener() {}
  removeEventListener() {}
  setAttribute() {}
  removeAttribute() {}
  focus() {}
  contains() {
    return false;
  }
}

function createDocumentStub() {
  const doc = {
    body: new DummyElement(),
    documentElement: new DummyElement(),
    head: new DummyElement(),
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => new DummyElement(),
    addEventListener: noop,
    removeEventListener: noop,
  };
  doc.body.contains = () => false;
  doc.defaultView = null;
  return doc;
}

function createWindowStub(documentStub) {
  const nav = { clipboard: { writeText: async () => {} } };
  const win = {
    document: documentStub,
    location: {
      href: "https://example.com/",
      origin: "https://example.com",
      pathname: "/",
    },
    history: {
      pushState: noop,
      replaceState: noop,
    },
    navigator: nav,
    addEventListener: noop,
    removeEventListener: noop,
    requestAnimationFrame: (fn) => {
      if (typeof fn === "function") {
        fn();
      }
    },
    setTimeout,
    clearTimeout,
    NostrTools: {
      nip19: {
        neventEncode: () => "nevent1example",
        npubEncode: () => "npub1example",
        decode: (value) => {
          if (typeof value !== "string") {
            throw new Error("Invalid nip19 input");
          }
          if (value.startsWith("npub")) {
            return { type: "npub", data: "f".repeat(64) };
          }
          if (value.startsWith("nevent")) {
            return { type: "nevent", data: { id: "f".repeat(64) } };
          }
          return null;
        },
      },
    },
  };
  win.HTMLElement = DummyElement;
  win.HTMLImageElement = DummyElement;
  win.setInterval = setInterval;
  win.clearInterval = clearInterval;
  win.console = console;
  return win;
}

const documentStub = createDocumentStub();
const windowStub = createWindowStub(documentStub);
windowStub.document = documentStub;
documentStub.defaultView = windowStub;
windowStub.document.defaultView = windowStub;

globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = true;

if (typeof globalThis.window === "undefined") {
  globalThis.window = windowStub;
} else {
  Object.assign(globalThis.window, windowStub);
}

globalThis.HTMLElement = DummyElement;
globalThis.HTMLImageElement = DummyElement;

if (typeof globalThis.self === "undefined") {
  globalThis.self = globalThis.window;
} else if (globalThis.self !== globalThis.window) {
  globalThis.self = globalThis.window;
}

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {
    constructor() {
      throw new Error("WebSocket is not available in tests.");
    }
    close() {}
  };
}

globalThis.document = documentStub;
globalThis.navigator = windowStub.navigator;
globalThis.location = windowStub.location;

if (typeof globalThis.fetch === "undefined") {
  globalThis.fetch = async () => {
    throw new Error("Unexpected fetch call in tests.");
  };
}

const {
  rememberLightningMetadata,
  normalizeLightningAddressKey,
  setCachedPlatformLightningAddress,
  clearZapCaches,
} = await import("../js/payments/zapSharedState.js");

function primeLightningMetadata(address, overrides = {}) {
  const key = normalizeLightningAddressKey(address);
  rememberLightningMetadata({
    key,
    address,
    resolved: { address, url: `https://lnurl.test/${address}` },
    metadata: {
      callback: `https://lnurl.test/${address}/callback`,
      minSendable: 1_000,
      maxSendable: 10_000_000,
      commentAllowed: 280,
      allowsNostr: true,
      ...overrides,
    },
    fetchedAt: Date.now(),
  });
}

function createVideoModalStub() {
  const listeners = new Map();
  return {
    setCopyEnabled: noop,
    setShareEnabled: noop,
    setWalletPromptVisible: noop,
    zapVisibilityCalls: [],
    setZapVisibility(config) {
      const payload =
        config && typeof config === "object"
          ? { ...config }
          : { visible: Boolean(config) };
      this.zapVisibilityCalls.push(payload);
      this.lastZapVisibility = payload;
    },
    dialogOpen: false,
    closeZapDialogCalls: [],
    closeZapDialog(options = {}) {
      this.closeZapDialogCalls.push(options);
      this.dialogOpen = false;
    },
    resetStats: noop,
    updateViewCountLabel: noop,
    setViewCountPointer: noop,
    completedStates: [],
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    setZapPendingCalls: [],
    statusMessages: [],
    receipts: [],
    summaries: [],
    resetForms: [],
    currentAmount: "",
    currentComment: "",
    setZapPending(value) {
      this.setZapPendingCalls.push(Boolean(value));
    },
    setZapCompleted(value) {
      this.completedStates.push(Boolean(value));
    },
    setZapStatus(message, tone) {
      this.statusMessages.push({ message, tone });
    },
    clearZapReceipts() {
      this.receipts.push({ cleared: true });
    },
    renderZapReceipts(list, options) {
      this.receipts.push({ list, options });
    },
    setZapSplitSummary(text) {
      this.summaries.push(text);
    },
    setZapRetryPending(pending, { summary } = {}) {
      this.retryState = { pending, summary };
    },
    resetZapForm({ amount, comment }) {
      this.resetForms.push({ amount, comment });
      this.currentAmount = amount;
      this.currentComment = comment;
    },
    setZapAmount(value) {
      this.currentAmount = value;
    },
    setZapComment(value) {
      this.currentComment = value;
    },
    getZapCommentValue() {
      return this.currentComment || "";
    },
  };
}

function createServices({ splitAndZap }) {
  const nostrService = {
    getVideoSubscription: () => null,
    getVideosMap: () => new Map(),
    on: () => () => {},
  };
  const feedEngine = {
    run: noop,
    register: noop,
  };
  const playbackService = {
    createSession: () => ({
      getPlaybackConfig: () => ({}),
      getMagnetForPlayback: () => "",
    }),
  };
  const authService = {
    on: () => () => {},
  };
  return {
    nostrService,
    feedEngine,
    playbackService,
    authService,
    payments: {
      splitAndZap,
      ensureWallet: async ({ settings }) => settings,
      sendPayment: async () => ({}),
    },
  };
}

function createHelpers() {
  return {
    mediaLoaderFactory: () => ({ observe: noop, unobserve: noop }),
  };
}

async function createApp({ splitAndZap }) {
  clearZapCaches();
  const modalStub = createVideoModalStub();
  const { Application } = await import("../js/app.js");
  const app = new Application({
    services: createServices({ splitAndZap }),
    helpers: createHelpers(),
    ui: {
      videoModal: () => modalStub,
    },
  });

  const creatorAddress = "creator@example.com";
  const platformAddress = "platform@example.com";
  setCachedPlatformLightningAddress(platformAddress);
  primeLightningMetadata(creatorAddress);
  primeLightningMetadata(platformAddress);

  app.showError = noop;
  app.showSuccess = noop;
  app.showStatus = noop;

  return { app, modalStub, creatorAddress, platformAddress };
}

await (async () => {
  // Test: logged-out zap request closes modal and queues reopen
  const { app, modalStub } = await createApp({
    splitAndZap: async () => ({ receipts: [] }),
  });

  let loginNotificationCount = 0;
  app.zapController.notifyLoginRequired = () => {
    loginNotificationCount += 1;
  };

  modalStub.dialogOpen = true;
  modalStub.closeZapDialogCalls = [];

  app.pendingModalZapOpen = false;

  app.boundVideoModalZapOpenHandler({ detail: { requiresLogin: true } });

  assert.equal(
    loginNotificationCount,
    1,
    "should request login notification when zapping logged out",
  );
  assert.equal(
    app.pendingModalZapOpen,
    true,
    "zap should remain pending for post-login reopen",
  );
  assert.equal(
    modalStub.closeZapDialogCalls.length,
    1,
    "zap dialog should close immediately when login required",
  );
  assert.deepEqual(modalStub.closeZapDialogCalls[0], {
    silent: true,
    restoreFocus: false,
  });
  assert.equal(modalStub.dialogOpen, false, "zap dialog should be closed");

  app.destroy();
})();

await (async () => {
  // Test: session actors should not be treated as logged-in users for zaps
  const { app, modalStub } = await createApp({
    splitAndZap: async () => ({ receipts: [] }),
  });

  const { nostrClient } = await import("../js/nostr.js");
  const originalSessionActor = nostrClient.sessionActor;
  const sessionPubkey = "a".repeat(64);
  nostrClient.sessionActor = { pubkey: sessionPubkey, privateKey: "priv" };

  app.pubkey = sessionPubkey;

  modalStub.zapVisibilityCalls = [];
  app.zapController.setVisibility(true);

  const lastVisibility =
    modalStub.zapVisibilityCalls[modalStub.zapVisibilityCalls.length - 1];
  assert.deepEqual(
    lastVisibility,
    { visible: true, requiresLogin: true },
    "zap controller should require login when only a session actor is present",
  );
  assert.equal(
    app.isUserLoggedIn(),
    false,
    "session actor pubkeys should not count as logged-in users",
  );

  app.pubkey = null;
  nostrClient.sessionActor = originalSessionActor;
  app.destroy();
})();

await (async () => {
  // Test: wallet required before zapping
  const splitCalls = [];
  const { app, modalStub, creatorAddress } = await createApp({
    splitAndZap: async (...args) => {
      splitCalls.push(args);
      return { receipts: [] };
    },
  });

  let walletPaneCalls = 0;
  app.zapController.requestWalletPane = () => {
    walletPaneCalls += 1;
    return Promise.resolve();
  };

  app.currentVideo = {
    id: "event123",
    pubkey: "a".repeat(64),
    tags: [],
    content: "",
    created_at: 1_700_000_000,
    lightningAddress: creatorAddress,
  };

  await app.zapController.sendZap({ amount: 500, comment: "Hello" });

  assert.equal(walletPaneCalls, 1, "should prompt to open wallet pane");
  assert.equal(splitCalls.length, 0, "splitAndZap should not be invoked");
  assert.deepEqual(modalStub.setZapPendingCalls, [], "zap controls should remain idle");

  app.destroy();
})();

await (async () => {
  // Test: splitAndZap invoked with video metadata when wallet is present
  const splitCalls = [];
  const splitAndZap = async (payload, deps) => {
    splitCalls.push({ payload, deps });
    return {
      receipts: [
        {
          recipientType: "creator",
          amount: payload.amountSats,
          address: payload.videoEvent.lightningAddress,
          payment: { result: { preimage: "ff".repeat(16) } },
        },
      ],
    };
  };
  const { app, modalStub, creatorAddress } = await createApp({
    splitAndZap,
  });

  const pubkeyHex = "b".repeat(64);
  app.pubkey = pubkeyHex;
  const normalized = app.normalizeHexPubkey(pubkeyHex);
  app.nwcSettingsService.cache.set(normalized, {
    nwcUri: "nostr+walletconnect://example",
    defaultZap: null,
    lastChecked: null,
    version: "",
  });

  app.currentVideo = {
    id: "event456",
    pubkey: pubkeyHex,
    tags: [["d", "video123"]],
    content: "",
    created_at: 1_700_000_001,
    lightningAddress: creatorAddress,
  };

  app.zapController.setAmount(1500);
  app.zapController.setComment("Great video");

  await app.zapController.sendZap({ amount: 1500, comment: "Great video" });

  assert.equal(splitCalls.length, 1, "splitAndZap should be called once");
  const call = splitCalls[0];
  assert.equal(call.payload.amountSats, 1500);
  assert.equal(call.payload.comment, "Great video");
  assert.equal(
    call.payload.videoEvent.lightningAddress,
    creatorAddress,
    "video event should include lightning address"
  );
  assert.equal(call.payload.walletSettings.nwcUri, "nostr+walletconnect://example");
  assert.equal(call.payload.videoEvent.pubkey, pubkeyHex);
  assert.equal(call.payload.videoEvent.id, "event456");
  assert.deepEqual(call.payload.videoEvent.tags, [["d", "video123"]]);

  const lastStatus = modalStub.statusMessages[modalStub.statusMessages.length - 1];
  assert(lastStatus.message.includes("Sent 1500 sats"), "should report zap summary");
  assert.equal(lastStatus.tone, "success");
  assert.equal(modalStub.resetForms.length > 0, true, "form should reset after success");
  assert.equal(modalStub.currentComment, "");

  app.destroy();
})();

process.exit(0);
