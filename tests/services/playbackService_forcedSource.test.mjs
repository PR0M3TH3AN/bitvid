import { describe, test, mock, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createUiDom } from "../ui/helpers/jsdom-test-helpers.mjs";
import { PlaybackService } from "../../js/services/playbackService.js";

describe("PlaybackService Forced Source Logic", () => {
  let dom;
  let document;
  let window;
  let service;
  let video;
  let playMock;
  let loadMock;
  let pauseMock;

  before(() => {
    dom = createUiDom();
    window = dom.window;
    document = dom.document;

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

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    service = new PlaybackService({
      logger: () => {},
      isValidMagnetUri: () => true,
      playbackStartTimeout: 100,
    });
    video = document.createElement("video");

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

  afterEach(() => {
    mock.timers.reset();
  });

  test("Normal flow: Timeout triggers fallback to Torrent if URL stalls", async () => {
    const probeUrl = mock.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      return { outcome: "good", status: 200 };
    });
    const playViaWebTorrent = mock.fn(async () => ({ infoHash: "123" }));

    const session = service.createSession({
      url: "https://example.com/video.mp4",
      magnet: "magnet:?xt=urn:btih:123",
      videoElement: video,
      probeUrl,
      playViaWebTorrent,
    });

    const startPromise = session.start();

    // Tick enough to trigger timeout (100ms) but not enough to resolve probeUrl (200ms)
    mock.timers.tick(150);
    // await microtasks to ensure timeout callback runs
    await new Promise(resolve => process.nextTick(resolve));

    const result = await startPromise;

    assert.equal(result.source, "torrent");
    assert.equal(playViaWebTorrent.mock.callCount(), 1);
  });

  test("Forced Source 'url': Ignores playbackStartTimeout and does NOT fallback to Torrent", async () => {
    const probeUrl = mock.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      return { outcome: "good", status: 200 };
    });
    const playViaWebTorrent = mock.fn(async () => ({ infoHash: "123" }));

    const session = service.createSession({
      url: "https://example.com/video.mp4",
      magnet: "magnet:?xt=urn:btih:123",
      videoElement: video,
      probeUrl,
      playViaWebTorrent,
      forcedSource: "url",
    });

    const startPromise = session.start();

    // Advance time past the 100ms default timeout
    mock.timers.tick(150);
    await new Promise(resolve => process.nextTick(resolve));

    // The promise should NOT be resolved yet (still probing)
    // We can't easily check 'pending' state without race, but we assume it didn't return 'torrent'.

    // Advance time to complete probeUrl (200ms total)
    mock.timers.tick(100);
    await new Promise(resolve => process.nextTick(resolve));

    // Now trigger playing
    video.dispatchEvent(new window.Event("playing"));
    await new Promise(resolve => process.nextTick(resolve));

    const result = await startPromise;

    assert.equal(result.source, "url");
    assert.equal(playViaWebTorrent.mock.callCount(), 0);
  });

  test("Forced Source 'url': Does NOT fallback to Torrent even if URL fails (probe bad)", async () => {
    const probeUrl = mock.fn(async () => {
      return { outcome: "bad", status: 404 };
    });
    const playViaWebTorrent = mock.fn(async () => ({ infoHash: "123" }));

    const session = service.createSession({
      url: "https://example.com/video.mp4",
      magnet: "magnet:?xt=urn:btih:123",
      videoElement: video,
      probeUrl,
      playViaWebTorrent,
      forcedSource: "url",
    });

    const result = await session.start();

    // It should have tried URL, failed, and returned error/null, skipping torrent fallback
    assert.equal(result.source, null); // Or maybe 'url' with error? No, execute returns { source: null, error } if everything fails.
    assert.equal(playViaWebTorrent.mock.callCount(), 0);
  });

  test("Forced Source 'torrent': Ignores playbackStartTimeout and does NOT fallback to URL", async () => {
    const probeUrl = mock.fn(async () => ({ outcome: "good" }));

    // Mock torrent to take longer than timeout
    const playViaWebTorrent = mock.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { infoHash: "123" };
    });

    const session = service.createSession({
      url: "https://example.com/video.mp4",
      magnet: "magnet:?xt=urn:btih:123",
      videoElement: video,
      probeUrl,
      playViaWebTorrent,
      forcedSource: "torrent",
    });

    const startPromise = session.start();

    // Advance time past default timeout
    mock.timers.tick(150);
    await new Promise(resolve => process.nextTick(resolve));

    // Complete torrent init
    mock.timers.tick(100);
    await new Promise(resolve => process.nextTick(resolve));

    const result = await startPromise;

    assert.equal(result.source, "torrent");
    assert.equal(probeUrl.mock.callCount(), 0);
  });

  test("Forced Source 'torrent': Does NOT fallback to URL even if Torrent fails", async () => {
      const probeUrl = mock.fn(async () => ({ outcome: "good" }));

      const playViaWebTorrent = mock.fn(async () => {
          throw new Error("Torrent failed");
      });

      const session = service.createSession({
        url: "https://example.com/video.mp4",
        magnet: "magnet:?xt=urn:btih:123",
        videoElement: video,
        probeUrl,
        playViaWebTorrent,
        forcedSource: "torrent",
      });

      const result = await session.start();

      assert.equal(result.source, null);
      assert.equal(probeUrl.mock.callCount(), 0);
  });
});
