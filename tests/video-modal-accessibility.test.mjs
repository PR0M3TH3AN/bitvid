import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

import { VideoModal } from "../js/ui/components/VideoModal.js";
import { resetRuntimeFlags } from "../js/constants.js";
import { applyDesignSystemAttributes } from "../js/designSystem.js";

const modalMarkupPromise = readFile(
  new URL("../components/video-modal.html", import.meta.url),
  "utf8"
);

export async function setupModal({ lazyLoad = false } = {}) {
  const markup = await modalMarkupPromise;
  const modalMarkup = lazyLoad ? "" : markup;
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body><button id="trigger" type="button">Open modal</button><div id="modalContainer">${modalMarkup}</div></body></html>`,
    { url: "https://example.com", pretendToBeVisual: true }
  );

  const { window } = dom;
  const { document } = window;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLVideoElement = window.HTMLVideoElement;
  globalThis.Element = window.Element;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.Node = window.Node;
  globalThis.EventTarget = window.EventTarget;
  globalThis.navigator = window.navigator;
  globalThis.location = window.location;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.MouseEvent = window.MouseEvent;
  const hadWebSocket = typeof globalThis.WebSocket !== "undefined";
  if (typeof window.scrollTo !== "function") {
    window.scrollTo = () => {};
  }
  globalThis.scrollTo = window.scrollTo;
  if (!hadWebSocket) {
    globalThis.WebSocket = class {
      constructor() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
      send() {}
    };
  }

  applyDesignSystemAttributes(document);

  if (!window.ResizeObserver) {
    class ResizeObserverStub {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserverStub;
    globalThis.ResizeObserver = ResizeObserverStub;
  }

  let restoreFetch = null;
  if (lazyLoad) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (resource, init) => {
      const url = typeof resource === "string" ? resource : resource?.url;
      if (url && url.endsWith("components/video-modal.html")) {
        return {
          ok: true,
          status: 200,
          async text() {
            return markup;
          },
        };
      }
      if (typeof originalFetch === "function") {
        return originalFetch(resource, init);
      }
      throw new Error(`Unexpected fetch request in tests: ${String(url || resource)}`);
    };
    restoreFetch = () => {
      if (originalFetch) {
        globalThis.fetch = originalFetch;
      } else {
        delete globalThis.fetch;
      }
    };
  }

  const modal = new VideoModal({
    removeTrackingScripts: () => {},
    setGlobalModalState: () => {},
    document,
    logger: console,
  });

  let playerModal = document.querySelector("#playerModal");
  if (playerModal) {
    modal.hydrate(playerModal);
  } else {
    await modal.load();
    playerModal = modal.getRoot();
    assert.ok(playerModal, "player modal markup should exist after load");
  }

  const trigger = document.getElementById("trigger");
  assert.ok(trigger, "trigger button should exist");

  const cleanup = () => {
    try {
      resetRuntimeFlags();
    } catch (error) {
      console.warn("[tests] failed to reset runtime flags", error);
    }
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLVideoElement;
    delete globalThis.Element;
    delete globalThis.CustomEvent;
    delete globalThis.Event;
    delete globalThis.Node;
    delete globalThis.EventTarget;
    delete globalThis.navigator;
    delete globalThis.location;
    delete globalThis.KeyboardEvent;
    delete globalThis.MouseEvent;
    delete globalThis.scrollTo;
    if (!hadWebSocket) {
      delete globalThis.WebSocket;
    }
    if (restoreFetch) {
      restoreFetch();
    }
  };

  return { window, document, modal, playerModal, trigger, cleanup };
}

function createVideoModalPlaybackStub(document) {
  const root = document.createElement("div");
  root.id = "playerModal";
  const panel = document.createElement("div");
  panel.className = "bv-modal__panel";
  root.append(panel);
  document.body.append(root);

  let currentVideo = document.createElement("video");
  panel.append(currentVideo);

  const listeners = new Map();

  return {
    loadCalls: 0,
    setVideoElementCalls: [],
    getRoot() {
      return root;
    },
    getVideoElement() {
      return currentVideo;
    },
    setVideoElement(element) {
      this.setVideoElementCalls.push(element);
      currentVideo = element;
    },
    load() {
      this.loadCalls += 1;
      if (!root.isConnected) {
        document.body.append(root);
      }
      if (!currentVideo || !currentVideo.isConnected) {
        currentVideo = document.createElement("video");
        panel.replaceChildren(currentVideo);
      }
    },
    open() {},
    close() {},
    clearPosterCleanup() {},
    applyLoadingPoster() {},
    resetStats() {},
    setCopyEnabled() {},
    setShareEnabled() {},
    updateStatus() {},
    updateViewCountLabel() {},
    setViewCountPointer() {},
    getViewCountElement() {
      return null;
    },
    forceRemovePoster() {
      return true;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatchEvent(event) {
      const handler = listeners.get(event?.type);
      if (typeof handler === "function") {
        handler(event);
      }
      return true;
    },
  };
}

function createPlaybackService(records) {
  const torrentClient = {
    cleanupCalls: 0,
    async cleanup() {
      this.cleanupCalls += 1;
      return undefined;
    },
  };

  return {
    torrentClient,
    createSession(options) {
      const record = {
        options,
        videoElement: options.videoElement,
        isConnectedDuringStart: false,
        source: null,
      };
      records.push(record);

      const listeners = new Map();

      const session = {
        matchesRequestSignature(signature) {
          return signature === options.requestSignature;
        },
        getPlaybackConfig: () => ({}),
        getMagnetForPlayback: () => "",
        getFallbackMagnet: () => "",
        getMagnetProvided: () => Boolean(options.magnet),
        on(eventName, handler) {
          if (typeof handler !== "function") {
            return () => {};
          }
          if (!listeners.has(eventName)) {
            listeners.set(eventName, new Set());
          }
          const handlers = listeners.get(eventName);
          handlers.add(handler);
          return () => {
            handlers.delete(handler);
            if (!handlers.size) {
              listeners.delete(eventName);
            }
          };
        },
        emit(eventName, detail) {
          const handlers = listeners.get(eventName);
          if (!handlers || !handlers.size) {
            return;
          }
          for (const handler of Array.from(handlers)) {
            try {
              handler(detail);
            } catch (error) {
              console.warn(
                `[tests] session listener for "${eventName}" threw`,
                error,
              );
            }
          }
        },
        async start() {
          const element = options.videoElement || null;
          record.videoElement = element;
          record.isConnectedDuringStart = Boolean(
            element && element.isConnected,
          );
          const hasUrl = Boolean(options.url && options.url.trim());
          const hasMagnet = Boolean(options.magnet && options.magnet.trim());
          record.source = hasUrl ? "url" : hasMagnet ? "torrent" : null;
          this.emit("video-prepared", { videoElement: element });
          if (record.source) {
            this.emit("sourcechange", { source: record.source });
          }
          return { source: record.source };
        },
      };

      return session;
    },
  };
}

async function setupPlaybackHarness() {
  const dom = new JSDOM(
    "<!DOCTYPE html><html><body><div id=\"app\"></div></body></html>",
    { url: "https://example.com/", pretendToBeVisual: true },
  );

  const { window } = dom;
  const { document } = window;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLVideoElement = window.HTMLVideoElement;
  globalThis.Element = window.Element;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.Node = window.Node;
  globalThis.EventTarget = window.EventTarget;
  globalThis.navigator = window.navigator;
  globalThis.location = window.location;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.self = window;
  const hadHarnessWebSocket = typeof globalThis.WebSocket !== "undefined";
  if (typeof window.scrollTo !== "function") {
    window.scrollTo = () => {};
  }
  globalThis.scrollTo = window.scrollTo;
  if (!hadHarnessWebSocket) {
    globalThis.WebSocket = class {
      constructor() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
      send() {}
    };
  }

  window.NostrTools = {
    nip19: {
      neventEncode: () => "nevent1example",
      npubEncode: () => "npub1example",
      decode: () => ({ type: "nevent", data: { id: "f".repeat(64) } }),
    },
  };

  applyDesignSystemAttributes(document);

  const modalStub = createVideoModalPlaybackStub(document);
  const playbackRecords = [];
  const playbackService = createPlaybackService(playbackRecords);

  const services = {
    nostrService: {
      getVideoSubscription: () => null,
      getVideosMap: () => new Map(),
      on: () => () => {},
    },
    feedEngine: {
      run: () => {},
      registerFeed: () => {},
      getFeedDefinition: () => null,
    },
    playbackService,
    authService: {
      on: () => () => {},
    },
  };

  const helpers = {
    mediaLoaderFactory: () => ({ observe() {}, unobserve() {} }),
  };

  const { Application } = await import("../js/app.js");
  const app = new Application({
    services,
    helpers,
    ui: { videoModal: () => modalStub },
  });

  app.showError = () => {};
  app.showSuccess = () => {};
  app.showStatus = () => {};
  app.cleanup = () => Promise.resolve();
  app.waitForCleanup = () => Promise.resolve();
  app.cancelPendingViewLogging = () => {};
  app.clearActiveIntervals = () => {};
  app.preparePlaybackLogging = () => {};
  app.teardownModalViewCountSubscription = () => {};
  app.autoplayModalVideo = () => {};
  app.probeUrl = () => Promise.resolve({ ok: true });

  const cleanup = () => {
    try {
      app.destroy?.();
    } catch (error) {
      console.warn("[tests] app.destroy failed", error);
    }
    try {
      resetRuntimeFlags();
    } catch (error) {
      console.warn("[tests] failed to reset runtime flags", error);
    }
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLVideoElement;
    delete globalThis.Element;
    delete globalThis.CustomEvent;
    delete globalThis.Event;
    delete globalThis.Node;
    delete globalThis.EventTarget;
    delete globalThis.navigator;
    delete globalThis.location;
    delete globalThis.KeyboardEvent;
    delete globalThis.MouseEvent;
    delete globalThis.self;
    delete globalThis.scrollTo;
    if (!hadHarnessWebSocket) {
      delete globalThis.WebSocket;
    }
  };

  return { app, modalStub, playbackRecords, window, cleanup };
}

test(
  "video modal rehydrates and plays through a connected element across views",
  async (t) => {
    const { app, modalStub, playbackRecords, window, cleanup } =
      await setupPlaybackHarness();
    t.after(cleanup);

    const playbackUrl = "https://cdn.example.com/video.mp4";
    app.currentVideo = {
      id: "event123",
      pubkey: "f".repeat(64),
      tags: [],
      title: "Test Video",
      url: playbackUrl,
      magnet: "",
    };

    await app.playVideoWithFallback({ url: playbackUrl });

    assert.equal(
      playbackRecords.length,
      1,
      "first playback should create a session",
    );
    const firstRecord = playbackRecords[0];
    assert.ok(firstRecord.videoElement, "first playback needs a video element");
    assert.equal(
      firstRecord.isConnectedDuringStart,
      true,
      "initial playback should start with a connected element",
    );

    const initialVideoElement = firstRecord.videoElement;
    assert.ok(initialVideoElement.isConnected);

    initialVideoElement.remove();
    assert.equal(
      initialVideoElement.isConnected,
      false,
      "detaching the node should mark it disconnected",
    );

    window.location.hash = "#view=channel-profile&npub=testnpub";

    await app.playVideoWithFallback({ url: playbackUrl });

    assert.equal(
      playbackRecords.length,
      2,
      "second playback should create a new session",
    );
    const secondRecord = playbackRecords[1];
    assert.ok(
      secondRecord.videoElement,
      "rehydrated playback should supply a video element",
    );
    assert.notStrictEqual(
      secondRecord.videoElement,
      initialVideoElement,
      "playback should use a refreshed video element",
    );
    assert.equal(
      secondRecord.isConnectedDuringStart,
      true,
      "rehydrated playback should start successfully",
    );
    assert.ok(
      secondRecord.videoElement.isConnected,
      "refreshed video element should be connected",
    );
    assert.strictEqual(
      modalStub.getVideoElement(),
      secondRecord.videoElement,
      "modal should expose the refreshed video element",
    );
    assert.ok(
      modalStub.setVideoElementCalls.includes(secondRecord.videoElement),
      "setVideoElement should receive the refreshed clone",
    );
    assert.ok(
      modalStub.loadCalls >= 1,
      "modal should reload when the previous element is detached",
    );
  },
);

test(
  "torrent-only playback resets the modal video before the next hosted session",
  async (t) => {
    const { app, modalStub, playbackRecords, cleanup } =
      await setupPlaybackHarness();
    t.after(cleanup);

    const magnet = `magnet:?xt=urn:btih:${"a".repeat(40)}`;
    await app.playVideoWithFallback({ magnet });

    assert.equal(
      playbackRecords.length,
      1,
      "magnet playback should create the first session",
    );
    const torrentRecord = playbackRecords[0];
    assert.equal(
      torrentRecord.source,
      "torrent",
      "first session should report torrent playback",
    );
    const torrentVideo = torrentRecord.videoElement;
    assert.ok(torrentVideo, "torrent session should supply a video element");
    assert.equal(
      Boolean(torrentVideo?.isConnected),
      true,
      "torrent playback should start with a connected element",
    );

    const playbackUrl = "https://cdn.example.com/next-video.mp4";
    await app.playVideoWithFallback({ url: playbackUrl });

    assert.equal(
      playbackRecords.length,
      2,
      "subsequent hosted playback should create a second session",
    );
    const hostedRecord = playbackRecords[1];
    assert.equal(
      hostedRecord.source,
      "url",
      "second session should report hosted playback",
    );
    assert.ok(hostedRecord.videoElement, "hosted playback needs a video element");
    assert.equal(
      Boolean(hostedRecord.videoElement?.isConnected),
      true,
      "hosted playback should reuse a connected element",
    );
    assert.notStrictEqual(
      hostedRecord.videoElement,
      torrentVideo,
      "hosted playback should swap in a refreshed video element",
    );
    assert.strictEqual(
      modalStub.getVideoElement(),
      hostedRecord.videoElement,
      "modal should expose the refreshed hosted video element",
    );
    assert.ok(
      modalStub.setVideoElementCalls.includes(hostedRecord.videoElement),
      "modal controller should receive the refreshed hosted element",
    );
    assert.ok(
      app.playbackService.torrentClient.cleanupCalls >= 1,
      "torrent cleanup should run before the hosted playback begins",
    );
  },
);

test("backdrop data-dismiss closes the modal and restores focus", async (t) => {
  const { window, document, modal, playerModal, trigger, cleanup } =
    await setupModal();
  t.after(cleanup);
  const backdrop = playerModal.querySelector("[data-dismiss]");
  assert.ok(backdrop, "modal backdrop should be present");

  let closeEvents = 0;
  modal.addEventListener("modal:close", () => {
    closeEvents += 1;
    modal.close();
  });

  modal.open(null, { triggerElement: trigger });
  await Promise.resolve();

  backdrop.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true })
  );

  await Promise.resolve();

  assert.equal(closeEvents, 1);
  assert.strictEqual(document.activeElement, trigger);
});

test("Escape key closes the modal and returns focus to the trigger", async (t) => {
  const { window, document, modal, playerModal, trigger, cleanup } =
    await setupModal();
  t.after(cleanup);
  const closeButton = playerModal.querySelector("#closeModal");
  assert.ok(closeButton, "close button should be present");

  let closeEvents = 0;
  modal.addEventListener("modal:close", () => {
    closeEvents += 1;
    modal.close();
  });

  modal.open(null, { triggerElement: trigger });
  await Promise.resolve();

  closeButton.focus();

  document.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
  );

  await Promise.resolve();

  assert.equal(closeEvents, 1);
  assert.strictEqual(document.activeElement, trigger);
});

for (const _ of [0]) {

  test(
    "video modal sticky navigation responds to scroll direction",
    async (t) => {
      const { window, modal, playerModal, trigger, cleanup } =
        await setupModal();
      t.after(cleanup);

      modal.open(null, { triggerElement: trigger });
      await Promise.resolve();

      const nav = document.getElementById("modalNav");
      assert.ok(nav, "navigation bar should exist");
      const scrollRegion = playerModal.querySelector(".bv-modal__panel");
      assert.ok(scrollRegion, "modal panel should exist");

      let scrollPosition = 0;
      Object.defineProperty(scrollRegion, "scrollTop", {
        configurable: true,
        get() {
          return scrollPosition;
        },
        set(value) {
          scrollPosition = Number(value) || 0;
        }
      });

      scrollRegion.scrollTop = 120;
      assert.equal(modal.scrollRegion.scrollTop, 120);
      modal.modalNavScrollHandler?.();
      assert.ok(nav.classList.contains("modal-nav--hidden"));
      assert.ok(!nav.classList.contains("modal-nav--visible"));

      scrollRegion.scrollTop = 60;
      assert.equal(modal.scrollRegion.scrollTop, 60);
      modal.modalNavScrollHandler?.();
      assert.ok(nav.classList.contains("modal-nav--visible"));
      assert.ok(!nav.classList.contains("modal-nav--hidden"));

      scrollRegion.scrollTop = 10;
      assert.equal(modal.scrollRegion.scrollTop, 10);
      modal.modalNavScrollHandler?.();
      assert.ok(nav.classList.contains("modal-nav--visible"));
      assert.ok(!nav.classList.contains("modal-nav--hidden"));
    }
  );

  test(
    "video modal video shell is not sticky at mobile breakpoints",
    async (t) => {
      const { window, modal, playerModal, trigger, cleanup } =
        await setupModal();
      t.after(cleanup);

      const originalInnerWidth = window.innerWidth;
      window.innerWidth = 390;
      t.after(() => {
        window.innerWidth = originalInnerWidth;
      });
      window.dispatchEvent(new window.Event("resize"));

      modal.open(null, { triggerElement: trigger });
      await Promise.resolve();

      const videoShell = playerModal.querySelector(".video-modal__video");
      assert.ok(videoShell, "video shell wrapper should exist");

      const stickyTargets = [
        videoShell,
        videoShell.querySelector(".card"),
      ].filter(Boolean);

      stickyTargets.forEach((element) => {
        assert.equal(
          element.classList.contains("sticky"),
          false,
          "video shell should not use sticky positioning on mobile"
        );
      });
    }
  );

  test(
    "video modal toggles document scroll locking on open/close",
    async (t) => {
      const { document, modal, trigger, cleanup } = await setupModal();
      t.after(cleanup);

      modal.open(null, { triggerElement: trigger });
      await Promise.resolve();

      assert.equal(
        document.documentElement.classList.contains("modal-open"),
        true
      );
      assert.equal(document.body.classList.contains("modal-open"), true);

      modal.close();
      await Promise.resolve();

      assert.equal(
        document.documentElement.classList.contains("modal-open"),
        false
      );
      assert.equal(document.body.classList.contains("modal-open"), false);
      assert.strictEqual(document.activeElement, trigger);
    }
  );

  test(
    "video modal zap dialog updates aria state while toggling",
    async (t) => {
      const { window, document, modal, playerModal, trigger, cleanup } =
        await setupModal();
      t.after(cleanup);

      modal.open(null, { triggerElement: trigger });
      await Promise.resolve();

      const zapButton = document.getElementById("modalZapBtn");
      const zapDialog = document.getElementById("modalZapDialog");
      const amountInput = document.getElementById("modalZapAmountInput");
      assert.ok(zapButton, "zap trigger should exist");
      assert.ok(zapDialog, "zap dialog should exist");
      assert.ok(amountInput, "zap amount input should exist");

      modal.setZapVisibility(true);

      assert.equal(zapDialog.hidden, true);
      assert.equal(zapDialog.dataset.state, "closed");
      assert.equal(zapButton.getAttribute("aria-expanded"), "false");

      zapButton.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true })
      );

      assert.equal(zapDialog.hidden, false);
      assert.equal(zapDialog.dataset.state, "open");
      assert.equal(zapDialog.getAttribute("aria-hidden"), "false");
      assert.equal(zapButton.getAttribute("aria-expanded"), "true");

      zapButton.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true })
      );

      assert.equal(zapDialog.hidden, true);
      assert.equal(zapDialog.dataset.state, "closed");
      assert.equal(zapDialog.getAttribute("aria-hidden"), "true");
      assert.equal(zapButton.getAttribute("aria-expanded"), "false");

      zapButton.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true })
      );
      await Promise.resolve();

      assert.equal(zapDialog.hidden, false);
      assert.equal(zapDialog.dataset.state, "open");
      assert.equal(zapDialog.getAttribute("aria-hidden"), "false");
      assert.equal(zapButton.getAttribute("aria-expanded"), "true");

      const closeButton = document.getElementById("modalZapCloseBtn");
      assert.ok(closeButton, "zap close button should exist");

      closeButton.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true })
      );

      assert.equal(zapDialog.hidden, true);
      assert.equal(zapDialog.dataset.state, "closed");
      assert.equal(zapDialog.getAttribute("aria-hidden"), "true");
      assert.equal(zapButton.getAttribute("aria-expanded"), "false");

      modal.close();
    }
  );

  test(
    "video modal inherits design system mode when loaded dynamically",
    async (t) => {
      const { playerModal, cleanup } = await setupModal({ lazyLoad: true });
      t.after(cleanup);

      assert.strictEqual(playerModal.getAttribute("data-ds"), "new");
    }
  );
}
