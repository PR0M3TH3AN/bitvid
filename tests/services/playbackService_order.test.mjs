import { describe, test, mock, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PlaybackService } from "../../js/services/playbackService.js";

describe("PlaybackService Ordering", () => {
  let video;
  let window;

  before(() => {
    // Mock global window/document
    global.window = {
        HTMLMediaElement: {
            HAVE_NOTHING: 0,
            HAVE_METADATA: 1,
            HAVE_CURRENT_DATA: 2,
            HAVE_FUTURE_DATA: 3,
            HAVE_ENOUGH_DATA: 4,
        },
        Event: class Event { constructor(type) { this.type = type; } },
        localStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        }
    };
    global.document = {
        createElement: (tag) => {
            if (tag === 'video') return video;
            return {};
        }
    };
    window = global.window;
  });

  after(() => {
    delete global.window;
    delete global.document;
  });

  describe("Playback Execution Order", () => {
    let playMock;
    let loadMock;
    let pauseMock;
    let eventListeners;

    beforeEach(() => {
      mock.timers.enable({ apis: ['setTimeout'] });
      eventListeners = {};

      video = {
          play: mock.fn(async () => {}),
          load: mock.fn(),
          pause: mock.fn(),
          removeAttribute: mock.fn(),
          addEventListener: (event, handler) => {
              if (!eventListeners[event]) eventListeners[event] = [];
              eventListeners[event].push(handler);
          },
          removeEventListener: (event, handler) => {
              if (eventListeners[event]) {
                  eventListeners[event] = eventListeners[event].filter(h => h !== handler);
              }
          },
          dispatchEvent: (event) => {
              if (eventListeners[event.type]) {
                  eventListeners[event.type].forEach(h => h(event));
              }
          },
          readyState: 0,
          networkState: 0,
          dataset: {},
          muted: false
      };

      playMock = video.play;
      loadMock = video.load;
      pauseMock = video.pause;
    });

    afterEach(() => {
      mock.timers.reset();
    });

    test("urlFirstEnabled=true: Tries URL first, succeeds", async () => {
      const service = new PlaybackService({
        logger: () => {},
        urlFirstEnabled: true,
        isValidMagnetUri: () => true,
      });

      const probeUrl = mock.fn(async () => ({ outcome: "good", status: 200 }));
      const playViaWebTorrent = mock.fn(async () => ({ infoHash: "123" }));

      const session = service.createSession({
        url: "https://example.com/vid.mp4",
        magnet: "magnet:?xt=urn:btih:123",
        videoElement: video,
        probeUrl,
        playViaWebTorrent,
      });

      const startPromise = session.start();
      await new Promise(resolve => process.nextTick(resolve));
      await new Promise(resolve => process.nextTick(resolve));
      video.dispatchEvent(new window.Event("playing"));
      const result = await startPromise;

      assert.equal(probeUrl.mock.callCount(), 1, "Should probe URL");
      assert.equal(playViaWebTorrent.mock.callCount(), 0, "Should NOT call torrent");
      assert.equal(result.source, "url");
    });

    test("urlFirstEnabled=true: Tries URL first, fails, falls back to Torrent", async () => {
      const service = new PlaybackService({
        logger: () => {},
        urlFirstEnabled: true,
        isValidMagnetUri: () => true,
      });

      // Probe returns error
      const probeUrl = mock.fn(async () => ({ outcome: "bad", status: 404 }));
      const playViaWebTorrent = mock.fn(async () => ({ infoHash: "123" }));

      const session = service.createSession({
        url: "https://example.com/vid.mp4",
        magnet: "magnet:?xt=urn:btih:123",
        videoElement: video,
        probeUrl,
        playViaWebTorrent,
      });

      const result = await session.start();

      assert.equal(probeUrl.mock.callCount(), 1, "Should probe URL");
      assert.equal(playViaWebTorrent.mock.callCount(), 1, "Should fall back to torrent");
      assert.equal(result.source, "torrent");
    });

    // SPEC CHANGE: dual-source videos are now CDN-first (see PlaybackSession
    // execute(): `if (httpsUrl) tryUrlFirst = true`). A torrent-first instance
    // default no longer forces P2P when a hosted URL is also available, because
    // waiting on a P2P cold start when a working CDN exists was the slow/flaky
    // path users hit. WebTorrent is now reserved for URL-less videos (and
    // explicit forcedSource: "torrent", covered below).
    test("urlFirstEnabled=false but a hosted URL exists: CDN-first plays the URL", async () => {
      const service = new PlaybackService({
        logger: () => {},
        urlFirstEnabled: false,
        isValidMagnetUri: () => true,
      });

      const probeUrl = mock.fn(async () => ({ outcome: "good", status: 200 }));
      const playViaWebTorrent = mock.fn(async () => ({ infoHash: "123" }));

      const session = service.createSession({
        url: "https://example.com/vid.mp4",
        magnet: "magnet:?xt=urn:btih:123",
        videoElement: video,
        probeUrl,
        playViaWebTorrent,
      });

      const startPromise = session.start();
      await new Promise((resolve) => process.nextTick(resolve));
      await new Promise((resolve) => process.nextTick(resolve));
      video.dispatchEvent(new window.Event("playing"));
      const result = await startPromise;

      assert.equal(
        playViaWebTorrent.mock.callCount(),
        0,
        "Should NOT use torrent when a hosted URL exists",
      );
      assert.equal(probeUrl.mock.callCount(), 1, "Should probe the URL first");
      assert.equal(result.source, "url");
    });

    test("urlFirstEnabled=false with NO hosted URL: uses WebTorrent", async () => {
      const service = new PlaybackService({
        logger: () => {},
        urlFirstEnabled: false,
        isValidMagnetUri: () => true,
      });

      const probeUrl = mock.fn(async () => ({ outcome: "good", status: 200 }));
      const playViaWebTorrent = mock.fn(async () => ({ infoHash: "123" }));

      const session = service.createSession({
        url: "",
        magnet: "magnet:?xt=urn:btih:123",
        videoElement: video,
        probeUrl,
        playViaWebTorrent,
      });

      const result = await session.start();

      assert.equal(
        playViaWebTorrent.mock.callCount(),
        1,
        "Should use WebTorrent when there is no URL to prefer",
      );
      assert.equal(probeUrl.mock.callCount(), 0, "No URL to probe");
      assert.equal(result.source, "torrent");
    });

    test("forcedSource=torrent overrides urlFirstEnabled=true", async () => {
        const service = new PlaybackService({
          logger: () => {},
          urlFirstEnabled: true,
          isValidMagnetUri: () => true,
        });

        const probeUrl = mock.fn();
        const playViaWebTorrent = mock.fn(async () => ({ infoHash: "123" }));

        const session = service.createSession({
          url: "https://example.com/vid.mp4",
          magnet: "magnet:?xt=urn:btih:123",
          videoElement: video,
          probeUrl,
          playViaWebTorrent,
          forcedSource: "torrent"
        });

        const result = await session.start();

        assert.equal(playViaWebTorrent.mock.callCount(), 1);
        assert.equal(probeUrl.mock.callCount(), 0);
        assert.equal(result.source, "torrent");
      });
  });
});
