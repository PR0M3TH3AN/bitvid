import test from "node:test";
import assert from "node:assert/strict";

// Mock globals before importing modules that might use them
if (!globalThis.window) {
    globalThis.window = {
        addEventListener: () => {},
        removeEventListener: () => {},
    };
}
if (!globalThis.navigator) {
    globalThis.navigator = {
        userAgent: "node",
        clipboard: {
            writeText: async () => {},
        }
    };
}
if (!globalThis.localStorage) {
    globalThis.localStorage = {
        getItem: () => null,
        setItem: () => {},
    };
}

// Now import the controller
import VideoModalController from "../../../js/ui/videoModalController.js";

test("VideoModalController bindEvents attaches listeners", (t) => {
  const listeners = {};
  const mockVideoModal = {
    addEventListener: (event, handler) => {
      listeners[event] = handler;
    },
    getRoot: () => ({}),
  };

  const controller = new VideoModalController({
    getVideoModal: () => mockVideoModal,
    callbacks: {
        attachMoreMenuHandlers: () => {},
    }
  });

  controller.bindEvents();

  assert.ok(listeners["video:share-nostr"], "should attach share handler");
  assert.ok(listeners["video:copy-cdn"], "should attach copy-cdn handler");
  assert.ok(listeners["video:copy-magnet"], "should attach copy-magnet handler");
  assert.ok(listeners["playback:switch-source"], "should attach switch-source handler");
});

test("VideoModalController handleShareNostr triggers callback", (t) => {
  let called = false;
  let args = null;
  const controller = new VideoModalController({
    getVideoModal: () => ({}),
    callbacks: {
      openShareNostrModal: (opts) => {
        called = true;
        args = opts;
      },
    },
  });

  controller.handleShareNostr({ detail: { video: { id: "1" } } });
  assert.equal(called, true);
  assert.equal(args.video.id, "1");
});

test("VideoModalController handleCopyCdn triggers clipboard write", async (t) => {
  let clipboardText = "";
  if (!globalThis.navigator.clipboard) {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
          value: {},
          writable: true,
          configurable: true
      });
  }

  const originalWriteText = globalThis.navigator.clipboard.writeText;
  globalThis.navigator.clipboard.writeText = async (text) => {
      clipboardText = text;
  };

  t.after(() => {
      if (originalWriteText) {
          globalThis.navigator.clipboard.writeText = originalWriteText;
      } else {
          delete globalThis.navigator.clipboard.writeText;
      }
  });

  let successCalled = false;
  const controller = new VideoModalController({
    getVideoModal: () => ({}),
    callbacks: {
        getCurrentVideo: () => ({ url: "https://example.com/video.mp4" }),
        showSuccess: () => { successCalled = true; }
    }
  });

  await controller.handleCopyCdn({});
  assert.equal(clipboardText, "https://example.com/video.mp4");
  // We can't easily await the promise chain inside handleCopyCdn because it doesn't return the promise.
  // But since the mock writeText is synchronous (returns resolved promise), the callback should fire in microtask.
  // We can wait a bit.
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(successCalled, true);
});

test("VideoModalController handleCopyMagnet triggers callback", (t) => {
    let called = false;
    const controller = new VideoModalController({
        getVideoModal: () => ({}),
        callbacks: {
            handleCopyMagnet: () => { called = true; }
        }
    });

    // Manually trigger the logic that would be called by the event listener
    if (controller.handleCopyMagnetCallback) {
        controller.handleCopyMagnetCallback();
    }
    assert.equal(called, true);
});

test("VideoModalController handleSourceSwitch calls playVideoWithFallback", async (t) => {
    let called = false;
    let args = null;
    const controller = new VideoModalController({
        getVideoModal: () => ({}),
        callbacks: {
            getCurrentVideo: () => ({ id: "vid1", url: "http://url", magnet: "magnet:?" }),
            getStreamHealthSnapshots: () => new Map([["vid1", { peers: 5 }]]),
            getCachedUrlHealth: () => ({ status: "ok" }),
            playVideoWithFallback: async (opts) => {
                called = true;
                args = opts;
            }
        }
    });

    controller.handleSourceSwitch({ detail: { source: "torrent", video: { id: "vid1" } } });

    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(called, true);
    assert.equal(args.forcedSource, "torrent");
});
