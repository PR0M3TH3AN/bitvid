import test from "node:test";
import assert from "node:assert/strict";
import VideoModalController from "../js/ui/videoModalController.js";

test("VideoModalController", async (t) => {
  await t.test("ensureVideoModalReady throws if modal is missing", async () => {
    const controller = new VideoModalController({
      getVideoModal: () => null,
    });
    await assert.rejects(
      controller.ensureVideoModalReady(),
      /Video modal instance is not available/
    );
  });

  await t.test("ensureVideoModalReady loads modal if needs rehydrate", async () => {
    let loadCalled = false;
    let setVideoElementCalled = false;
    const mockRoot = { isConnected: true };
    const mockVideoElement = { isConnected: true };

    const mockModal = {
      // First call returns null (simulate missing root), subsequent calls return valid
      getRoot: (() => {
        let calls = 0;
        return () => {
          calls++;
          return calls === 1 ? null : mockRoot;
        };
      })(),
      getVideoElement: () => mockVideoElement,
      load: async () => {
        loadCalled = true;
      },
      setVideoElement: (el) => {
        setVideoElementCalled = true;
        assert.equal(el, mockVideoElement);
      },
    };

    const controller = new VideoModalController({
      getVideoModal: () => mockModal,
    });

    const result = await controller.ensureVideoModalReady();

    assert.equal(loadCalled, true, "Should call load()");
    assert.equal(setVideoElementCalled, true, "Should set video element");
    assert.equal(result.root, mockRoot);
    assert.equal(result.videoElement, mockVideoElement);
  });

  await t.test("showModalWithPoster uses provided video", async () => {
    const mockVideo = { id: "v1" };
    let openedVideo = null;
    let appliedPoster = false;

    const mockModal = {
        getRoot: () => ({ isConnected: true }),
        getVideoElement: () => ({ isConnected: true }),
        load: async () => {},
        open: (video) => { openedVideo = video; },
        applyLoadingPoster: () => { appliedPoster = true; },
        setVideoElement: () => {},
    };

    const controller = new VideoModalController({
      getVideoModal: () => mockModal,
    });

    await controller.showModalWithPoster(mockVideo);
    assert.deepEqual(openedVideo, mockVideo);
    assert.equal(appliedPoster, true);
  });

  await t.test("showModalWithPoster falls back to current video", async () => {
    const currentVideo = { id: "current" };
    let openedVideo = null;

    const mockModal = {
        getRoot: () => ({ isConnected: true }),
        getVideoElement: () => ({ isConnected: true }),
        load: async () => {},
        open: (video) => { openedVideo = video; },
        applyLoadingPoster: () => {},
        setVideoElement: () => {},
    };

    const controller = new VideoModalController({
      getVideoModal: () => mockModal,
      callbacks: {
          getCurrentVideo: () => currentVideo,
      }
    });

    await controller.showModalWithPoster(); // No video passed
    assert.deepEqual(openedVideo, currentVideo);
  });

  await t.test("forceRemoveModalPoster calls modal method", async () => {
    let removeReason = null;
    const mockModal = {
        forceRemovePoster: (reason) => { removeReason = reason; return true; }
    };

    const controller = new VideoModalController({
        getVideoModal: () => mockModal,
    });

    controller.forceRemoveModalPoster("test-reason");
    assert.equal(removeReason, "test-reason");
  });
});
