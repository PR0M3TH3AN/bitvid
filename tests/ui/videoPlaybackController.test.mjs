import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { VideoPlaybackController } from "../../js/ui/videoPlaybackController.js";

describe("VideoPlaybackController", () => {
  let controller;
  let mockServices;
  let mockState;
  let mockUi;
  let mockSession;

  beforeEach(() => {
    mockSession = {
      on: mock.fn(() => () => {}),
      start: mock.fn(async () => ({ source: "url" })),
      getPlaybackConfig: () => ({ infoHash: "hash" }),
      getMagnetForPlayback: () => "magnet:?",
      getFallbackMagnet: () => "",
    };

    mockServices = {
      playbackService: {
        createSession: mock.fn(() => mockSession),
      },
      torrentClient: {
        cleanup: mock.fn(),
      },
      watchHistoryTelemetry: {
        preparePlaybackLogging: mock.fn(),
      },
    };

    // Add getters
    mockServices.getPlaybackService = () => mockServices.playbackService;
    mockServices.getWatchHistoryTelemetry = () => mockServices.watchHistoryTelemetry;

    const mockVideoElement = {
      pause: mock.fn(),
      load: mock.fn(),
      removeAttribute: mock.fn(),
      hasAttribute: mock.fn(() => false),
      cloneNode: mock.fn(() => ({
          readyState: 0,
          networkState: 0,
          dataset: {},
          pause: mock.fn(),
          load: mock.fn(),
          removeAttribute: mock.fn(),
          hasAttribute: mock.fn(() => false),
      })),
      isConnected: true,
      dataset: {},
      readyState: 0,
      networkState: 0,
    };

    mockState = {
      getVideoModal: mock.fn(() => ({
        updateStatus: mock.fn(),
        forceRemovePoster: mock.fn(),
        setTorrentStatsVisibility: mock.fn(),
        setVideoElement: mock.fn(),
        resetStats: mock.fn(),
        clearPosterCleanup: mock.fn(),
        applyLoadingPoster: mock.fn(),
      })),
      getModalVideo: mock.fn(() => mockVideoElement),
      setModalVideo: mock.fn(),
      getCurrentVideo: mock.fn(() => ({})),
      getActivePlaybackSession: mock.fn(),
      setActivePlaybackSession: mock.fn(),
      getActivePlaybackResultPromise: mock.fn(),
      setActivePlaybackResultPromise: mock.fn(),
      getPlaySource: mock.fn(),
      setPlaySource: mock.fn(),
      setCurrentMagnetUri: mock.fn(),
      getCleanupPromise: mock.fn(),
    };

    mockUi = {
      ensureVideoModalReady: mock.fn(async () => ({ videoElement: mockVideoElement })),
      showError: mock.fn(),
      setLastModalTrigger: mock.fn(),
      showModalWithPoster: mock.fn(),
      probeUrl: mock.fn(),
    };

    controller = new VideoPlaybackController({
      services: mockServices,
      state: mockState,
      ui: mockUi,
    });
  });

  test("playVideoWithFallback initiates playback session", async () => {
    await controller.playVideoWithFallback({ url: "https://example.com/video.mp4" });

    assert.strictEqual(mockServices.playbackService.createSession.mock.callCount(), 1);
    assert.strictEqual(mockSession.start.mock.callCount(), 1);
  });

  test("playVideoWithFallback handles duplicate requests", async () => {
    mockState.getActivePlaybackSession.mock.mockImplementation(() => ({
        matchesRequestSignature: () => true,
        getResult: () => ({ source: "active" })
    }));

    const result = await controller.playVideoWithFallback({ url: "https://example.com/video.mp4" });
    assert.strictEqual(result.source, "active");
    assert.strictEqual(mockServices.playbackService.createSession.mock.callCount(), 0);
  });

  test("playVideoWithFallback handles forced source", async () => {
    await controller.playVideoWithFallback({ url: "https://example.com/video.mp4", forcedSource: "torrent" });

    assert.strictEqual(mockServices.playbackService.createSession.mock.callCount(), 1);
    const args = mockServices.playbackService.createSession.mock.calls[0].arguments[0];
    assert.strictEqual(args.forcedSource, "torrent");
  });
});
