import { test } from "node:test";
import assert from "node:assert/strict";
import "./test-helpers/setup-localstorage.mjs";
import { createPlaybackCoordinator } from "../js/app/playbackCoordinator.js";
import { PlaybackStrategyService } from "../js/services/playbackStrategyService.js";
import { PlaybackService } from "../js/services/playbackService.js";
import { deriveTorrentPlaybackConfig } from "../js/playbackUtils.js";
import { isValidMagnetUri } from "../js/utils/magnetValidators.js";

// Real coordinator/strategy/session/magnet helpers; only IO and modal rendering
// are substituted. This proves orchestration, not native decoding or WebTorrent.
const primary = "https://localhost/dead.webm";
const mirror = "https://localhost/mirror.webm";
const seed = "https://localhost/original.webm";
const hash = "ABCDEF0123456789abcdef0123456789ABCDEF01";
const magnet = `magnet:?xt=urn:btih:${hash}&ws=${encodeURIComponent(seed)}`;

class ControlledMedia extends EventTarget {
  dataset = {};
  isConnected = true;
  src = "";
  readyState = 0;
  networkState = 0;
  currentTime = 0;
  paused = true;
  error = null;
  constructor(onPlay) {
    super();
    this.onPlay = onPlay;
  }
  pause() {
    this.paused = true;
  }
  load() {
    this.error = null;
  }
  removeAttribute(name) {
    if (name === "src") this.src = "";
  }
  async play() {
    this.onPlay(this);
  }
}

async function runScenario(mode) {
  const probes = [],
    mediaStarts = [],
    torrents = [],
    errors = [],
    statuses = [];
  const torrentInstance = { fixture: "alternate-IO" };
  const video = new ControlledMedia((element) => {
    mediaStarts.push(element.src);
    if (element.src === mirror) {
      element.dispatchEvent(new Event("playing"));
    } else {
      // Repeated failures must still lead to just one alternate selection.
      element.dispatchEvent(new Event("error"));
      element.dispatchEvent(new Event("stalled"));
    }
  });
  const service = new PlaybackService({
    deriveTorrentPlaybackConfig,
    isValidMagnetUri
  });
  const strategy = new PlaybackStrategyService({
    playbackService: service,
    logger: { log() {} }
  });
  const app = {
    modalVideo: video,
    currentVideo: {},
    playbackStrategyService: strategy,
    videoModal: { updateStatus: (message) => statuses.push(message) },
    waitForCleanup: async () => {},
    cancelPendingViewLogging() {},
    clearActiveIntervals() {},
    showModalWithPoster() {},
    teardownVideoElement: (element) => element,
    applyModalLoadingPoster() {},
    resetTorrentStats() {},
    preparePlaybackLogging() {},
    autoplayModalVideo() {},
    forceRemoveModalPoster() {},
    probeUrl: async (url) => {
      probes.push(url);
      return mode === "media-error" || url === mirror
        ? { outcome: "ok", status: 200 }
        : { outcome: "bad", status: 404 };
    },
    playViaWebTorrent: async (uri, options) => {
      torrents.push({ uri, options });
      if (mode === "both-fail") throw new Error("local alternate unavailable");
      return torrentInstance;
    },
    showError: (message) => errors.push(message)
  };
  const result = await createPlaybackCoordinator({}).playVideoWithFallback.call(
    app,
    {
      url: primary,
      magnet,
      ...(mode === "mirror" ? { sources: [primary, mirror, mirror] } : {})
    }
  );

  assert.equal(
    app.activePlaybackSession,
    null,
    "finished session released from app"
  );
  assert.equal(
    app.activePlaybackResultPromise,
    null,
    "finished promise released from app"
  );
  assert.equal(strategy.activePlaybackSession, null);
  assert.equal(strategy.activePlaybackResultPromise, null);
  assert.equal(service.currentSession.isActive(), false);
  // Stale media notifications after settlement must not start another alternate.
  video.dispatchEvent(new Event("error"));
  video.dispatchEvent(new Event("stalled"));
  return {
    result,
    probes,
    mediaStarts,
    torrents,
    errors,
    statuses,
    app,
    torrentInstance
  };
}

function assertTorrentHandoff(torrents) {
  assert.equal(torrents.length, 1, "alternate selected exactly once");
  const { uri, options } = torrents[0];
  assert.equal(
    uri.split("&")[0],
    `magnet:?xt=urn:btih:${hash}`,
    "literal original xt/hash preserved"
  );
  const hints = uri
    .split("&")
    .filter((part) => part.startsWith("ws="))
    .map((part) => decodeURIComponent(part.slice(3)));
  assert.ok(hints.includes(seed), "original webseed preserved");
  assert.ok(
    hints.includes(primary),
    "hosted webseed preserved in normalized magnet"
  );
  assert.equal(options.hostedUrlWebSeed, primary);
  assert.deepEqual(options.urlList, [seed, primary]);
}

for (const mode of ["probe-404", "media-error", "both-fail", "mirror"]) {
  test(
    `actual playback orchestration: ${mode}`,
    { timeout: 2000 },
    async () => {
      const {
        result,
        probes,
        mediaStarts,
        torrents,
        errors,
        statuses,
        app,
        torrentInstance
      } = await runScenario(mode);
      assert.deepEqual(
        probes,
        mode === "mirror" ? [primary, mirror] : [primary]
      );
      assert.deepEqual(
        mediaStarts,
        mode === "media-error" ? [primary] : mode === "mirror" ? [mirror] : []
      );
      if (mode === "mirror") {
        assert.equal(result.source, "url");
        assert.equal(app.playSource, "url");
        assert.equal(
          torrents.length,
          0,
          "viable hosted mirror prevents torrent fallback"
        );
        assert.deepEqual(errors, []);
        assert.ok(statuses.includes("✅ Streaming from hosted URL"));
      } else {
        assertTorrentHandoff(torrents);
        if (mode === "both-fail") {
          assert.equal(result.source, null);
          assert.ok(result.error instanceof Error);
          assert.equal(app.playSource, null);
          assert.equal(errors.length, 1, "one surfaced terminal error");
          assert.match(errors[0], /^Playback error:/);
        } else {
          assert.equal(result.source, "torrent");
          assert.equal(result.torrentInstance, torrentInstance);
          assert.equal(app.playSource, "torrent");
          assert.deepEqual(errors, []);
          assert.ok(statuses.includes("Switching to WebTorrent..."));
        }
      }
    }
  );
}
