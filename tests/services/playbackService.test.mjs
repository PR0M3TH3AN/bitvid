import { describe, test, mock, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createUiDom } from "../ui/helpers/jsdom-test-helpers.mjs";
import { PlaybackService } from "../../js/services/playbackService.js";

describe("PlaybackService", () => {
  let dom;
  let document;
  let window;

  before(() => {
    dom = createUiDom();
    window = dom.window;
    document = dom.document;

    // Mock HTMLMediaElement constants if missing in JSDOM
    if (!window.HTMLMediaElement) {
      window.HTMLMediaElement = {
        HAVE_NOTHING: 0,
        HAVE_METADATA: 1,
        HAVE_CURRENT_DATA: 2,
        HAVE_FUTURE_DATA: 3,
        HAVE_ENOUGH_DATA: 4,
      };
    }
  });

  after(() => {
    dom.cleanup();
  });

  test("Initialization sets defaults and dependencies", () => {
    const logger = mock.fn();
    const service = new PlaybackService({ logger });

    assert.ok(service);
    assert.equal(typeof service.log, "function");
    service.log("test");
    assert.equal(logger.mock.callCount(), 1);
    assert.equal(service.urlFirstEnabled, true);
  });

  test("prepareVideoElement respects localStorage and binds listener", () => {
    const service = new PlaybackService();
    const video = document.createElement("video");

    // Default: muted (unless localStorage says unmuted)
    localStorage.removeItem("unmutedAutoplay");
    service.prepareVideoElement(video);
    assert.equal(video.muted, true);
    assert.equal(video.dataset.autoplayBound, "true");

    // Simulate volume change
    video.muted = false;
    video.dispatchEvent(new window.Event("volumechange"));
    assert.equal(localStorage.getItem("unmutedAutoplay"), "true");

    // Test respecting stored value
    const video2 = document.createElement("video");
    service.prepareVideoElement(video2);
    assert.equal(video2.muted, false);
  });

  test("registerUrlPlaybackWatchdogs triggers onFallback on error", () => {
    const service = new PlaybackService();
    const video = document.createElement("video");
    const onFallback = mock.fn();
    const onSuccess = mock.fn();

    service.registerUrlPlaybackWatchdogs(video, { onFallback, onSuccess });

    video.dispatchEvent(new window.Event("error"));
    assert.equal(onFallback.mock.callCount(), 1);
    assert.equal(onFallback.mock.calls[0].arguments[0], "error");
  });

  test("registerUrlPlaybackWatchdogs triggers onSuccess on playing", () => {
    const service = new PlaybackService();
    const video = document.createElement("video");
    const onFallback = mock.fn();
    const onSuccess = mock.fn();

    service.registerUrlPlaybackWatchdogs(video, { onFallback, onSuccess });

    video.dispatchEvent(new window.Event("playing"));
    assert.equal(onSuccess.mock.callCount(), 1);
  });

  test("createSession returns a PlaybackSession", () => {
    const service = new PlaybackService();
    const session = service.createSession({ url: "https://example.com/video.mp4" });

    assert.ok(session);
    assert.equal(service.currentSession, session);
    assert.equal(session.sanitizedUrl, "https://example.com/video.mp4");
  });

  describe("PlaybackSession Flow", () => {
    let service;
    let video;
    let playMock;
    let loadMock;
    let pauseMock;

    beforeEach(() => {
      mock.timers.enable({ apis: ['setTimeout'] });
      service = new PlaybackService({
        logger: () => {},
        isValidMagnetUri: () => true, // Allow all magnets
      });
      video = document.createElement("video");

      // Mock methods not implemented in JSDOM
      playMock = mock.fn(async () => {});
      loadMock = mock.fn();
      pauseMock = mock.fn();

      video.play = playMock;
      video.load = loadMock;
      video.pause = pauseMock;

      Object.defineProperty(video, 'readyState', {
        writable: true,
        value: window.HTMLMediaElement.HAVE_NOTHING
      });
      Object.defineProperty(video, 'networkState', {
        writable: true,
        value: 0
      });
    });

    test("URL Probe Success starts playback", async () => {
      const probeUrl = mock.fn(async () => ({ outcome: "good", status: 200 }));
      const playViaWebTorrent = mock.fn();

      const testSession = service.createSession({
        url: "https://example.com/video.mp4",
        videoElement: video,
        probeUrl,
        playViaWebTorrent,
      });

      const startPromise = testSession.start();

      // Allow execute() to proceed past await probeUrl() and install watchdogs
      await new Promise(resolve => process.nextTick(resolve));
      await new Promise(resolve => process.nextTick(resolve));

      // Trigger success event
      video.dispatchEvent(new window.Event("playing"));

      const result = await startPromise;

      assert.equal(probeUrl.mock.callCount(), 1);
      assert.equal(playMock.mock.callCount(), 1);
      assert.equal(result.source, "url");
      assert.equal(playViaWebTorrent.mock.callCount(), 0);
    });

    test("URL Probe Failure triggers fallback", async () => {
      const probeUrl = mock.fn(async () => ({ outcome: "bad", status: 404 }));
      const playViaWebTorrent = mock.fn(async () => ({ infoHash: "123" }));

      const session = service.createSession({
        url: "https://example.com/video.mp4",
        magnet: "magnet:?xt=urn:btih:123",
        videoElement: video,
        probeUrl,
        playViaWebTorrent,
      });

      const result = await session.start();

      assert.equal(probeUrl.mock.callCount(), 1);
      assert.equal(playViaWebTorrent.mock.callCount(), 1);
      assert.equal(result.source, "torrent");
    });

    test("Watchdog Stall triggers fallback", async () => {
        const probeUrl = mock.fn(async () => ({ outcome: "good", status: 200 }));
        const playViaWebTorrent = mock.fn(async () => ({ infoHash: "123" }));

        const session = service.createSession({
          url: "https://example.com/video.mp4",
          magnet: "magnet:?xt=urn:btih:123",
          videoElement: video,
          probeUrl,
          playViaWebTorrent,
        });

        const startPromise = session.start();

        // Allow execute() to proceed past await probeUrl() and install watchdogs
        await new Promise(resolve => process.nextTick(resolve));
        await new Promise(resolve => process.nextTick(resolve));
        await new Promise(resolve => process.nextTick(resolve));

        // Advance time to trigger stall (default 8000ms)
        mock.timers.tick(10000);

        const result = await startPromise;

        assert.equal(probeUrl.mock.callCount(), 1);
        assert.equal(playMock.mock.callCount(), 1); // It tried to play
        assert.equal(playViaWebTorrent.mock.callCount(), 1); // Fallback happened
        assert.equal(result.source, "torrent");
      });

    afterEach(() => {
        mock.timers.reset();
    });
  });
});
