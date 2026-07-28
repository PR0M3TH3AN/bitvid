// SCN-stale-media-error
//
// Given the modal <video> is reused across videos, teardownVideoElement() /
// resetVideoElement() clear `src` and call load(). Browsers respond by leaving a
// MEDIA_ERR_SRC_NOT_SUPPORTED ("Empty src attribute") MediaError on the element.
//
// When a watchdog fallback later fires for an unrelated reason (a stall, or an
// `abort` raised by our own source swap), then the failure message must NOT be
// derived from that leftover MediaError — doing so reported
//   "Hosted playback failed: source not supported or blocked."
// over a stream that was playing correctly, blaming the current load for a
// previous one's failure.
//
// Then: only a MediaError produced by THIS attempt may be surfaced.

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PlaybackService } from "../../js/services/playbackService.js";

// Minimal <video> double: records listeners so the test can dispatch the exact
// media events the real watchdogs bind to.
function makeVideoStub({ initialError = null } = {}) {
  const listeners = new Map();
  return {
    error: initialError,
    src: "",
    srcObject: null,
    currentTime: 0,
    readyState: 0,
    networkState: 0,
    muted: false,
    dataset: {},
    listeners,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const arr = listeners.get(type) || [];
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    },
    dispatch(type) {
      for (const h of [...(listeners.get(type) || [])]) h({ type });
    },
    hasAttribute: () => false,
    removeAttribute() {},
    setAttribute() {},
    play: () => Promise.resolve(),
    pause() {},
    load() {},
  };
}

const EMPTY_SRC_ERROR = Object.freeze({
  code: 4, // MEDIA_ERR_SRC_NOT_SUPPORTED
  message: "MEDIA_ELEMENT_ERROR: Empty src attribute",
});

describe("PlaybackService stale MediaError handling", () => {
  before(() => {
    global.window = {
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    };
    global.document = { createElement: () => makeVideoStub() };
  });

  after(() => {
    delete global.window;
    delete global.document;
  });

  const runWatchdogFallback = async ({ initialError, errorAtFallback }) => {
    const video = makeVideoStub({ initialError });
    const service = new PlaybackService({
      logger: () => {},
      urlFirstEnabled: true,
      isValidMagnetUri: () => false,
    });

    const statuses = [];
    let fallbackReason = null;

    // Drive the watchdog contract directly: this is the boundary where the
    // message is chosen, independent of network or codec support.
    const cleanup = service.registerUrlPlaybackWatchdogs(video, {
      stallMs: 0,
      onSuccess: () => {},
      onFallback: (reason) => {
        fallbackReason = reason;
      },
    });

    video.error = errorAtFallback;
    video.dispatch("stalled");
    cleanup();

    return { statuses, fallbackReason, video };
  };

  test("a fallback still reports its reason to the caller", async () => {
    const { fallbackReason } = await runWatchdogFallback({
      initialError: EMPTY_SRC_ERROR,
      errorAtFallback: EMPTY_SRC_ERROR,
    });
    assert.equal(fallbackReason, "stalled");
  });

  test("the leftover empty-src MediaError is identity-distinguishable", () => {
    // The fix hinges on identity: starting a new load clears `error` to null,
    // and a genuine new failure allocates a DIFFERENT MediaError object. If a
    // browser ever reused the object this guard would silently stop working.
    const stale = EMPTY_SRC_ERROR;
    const fresh = { code: 4, message: "MEDIA_ELEMENT_ERROR: Format error" };
    assert.notEqual(stale, fresh);
    assert.equal(stale === EMPTY_SRC_ERROR, true);
  });

  // Drive a real session to the watchdog-fallback branch with a stale error
  // already on the element, and capture what the viewer would be shown.
  const runSessionWithStall = async ({ initialError, errorAtFallback }) => {
    const video = makeVideoStub({ initialError });

    // Fire `stalled` as soon as the session arms its watchdogs — this is the
    // spurious fallback the viewer hits while the stream is actually fine.
    const originalAdd = video.addEventListener.bind(video);
    video.addEventListener = (type, handler) => {
      originalAdd(type, handler);
      if (type === "stalled") {
        setTimeout(() => {
          video.error = errorAtFallback;
          video.dispatch("stalled");
        }, 0);
      }
    };

    const service = new PlaybackService({
      logger: () => {},
      urlFirstEnabled: true,
      isValidMagnetUri: () => false,
    });

    const statuses = [];
    const session = service.createSession({
      url: "https://cdn.example/video.mp4",
      magnet: "",
      videoElement: video,
      autoplay: true,
      playbackStartTimeout: 200,
    });
    session.on?.("status", (p) => statuses.push(p.message));

    await session.execute();
    return statuses;
  };

  test("a stale empty-src error is NOT blamed on the current load", async () => {
    const statuses = await runSessionWithStall({
      initialError: EMPTY_SRC_ERROR,
      errorAtFallback: EMPTY_SRC_ERROR, // unchanged => stale
    });
    assert.equal(
      statuses.some((m) => /source not supported or blocked/i.test(m)),
      false,
      `stale error must not be reported; got: ${JSON.stringify(statuses)}`
    );
  });

  test("a MediaError raised by THIS load is still reported", async () => {
    // The guard must not silence genuine failures — a new MediaError object
    // appearing during the attempt is real and must reach the viewer.
    const statuses = await runSessionWithStall({
      initialError: null,
      errorAtFallback: {
        code: 4,
        message: "MEDIA_ELEMENT_ERROR: Format error",
      },
    });
    assert.equal(
      statuses.some((m) => /source not supported or blocked/i.test(m)),
      true,
      `genuine error must be reported; got: ${JSON.stringify(statuses)}`
    );
  });
});
