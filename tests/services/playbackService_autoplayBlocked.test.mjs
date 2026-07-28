// SCN-autoplay-blocked-no-p2p-yank
//
// Given a video with BOTH a hosted URL and a magnet, when the browser refuses
// autoplay (a deep link opened from a nostr client arrives with no user
// gesture, so every mobile browser refuses), then bitvid must show "Press play"
// and WAIT — not treat the pause as a stalled source.
//
// It used to: the 3s start timeout fired regardless, the video was yanked into
// WebTorrent, and a swarm with no peers played nothing while the prompt the
// viewer was meant to act on had already been torn down. Desktop usually hides
// this because an established Media Engagement score lets autoplay through.

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PlaybackService } from "../../js/services/playbackService.js";

function makeVideoStub({ autoplayAllowed = false } = {}) {
  const listeners = new Map();
  const el = {
    error: null,
    src: "",
    srcObject: null,
    currentTime: 0,
    readyState: 0,
    networkState: 0,
    muted: false,
    paused: true,
    dataset: {},
    playCalls: 0,
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
    pause() {},
    load() {},
    play() {
      el.playCalls += 1;
      if (autoplayAllowed) {
        el.paused = false;
        // A real element signals playback started; the watchdog's success path
        // keys off this. Without it even a healthy source would (correctly)
        // fall back once the start timeout elapsed.
        setTimeout(() => el.dispatch("playing"), 0);
        return Promise.resolve();
      }
      const error = new Error("play() failed because the user didn't interact");
      error.name = "NotAllowedError";
      return Promise.reject(error);
    },
  };
  return el;
}

const HOSTED_URL = "https://cdn.example/video.mp4";
const MAGNET = "magnet:?xt=urn:btih:024c6044dfcbadef3ac5abbfa8a36766dc0606f1";

describe("PlaybackService autoplay-blocked handling", () => {
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

  const run = async ({ autoplayAllowed }) => {
    const video = makeVideoStub({ autoplayAllowed });
    const statuses = [];
    let torrentAttempted = false;

    const service = new PlaybackService({
      logger: () => {},
      urlFirstEnabled: true,
      isValidMagnetUri: () => true,
      // MUST be set on the service: createSession() overwrites any
      // playbackStartTimeout passed in its own options with this value, so a
      // per-session override is silently ignored (and the test would then race
      // the real 3s default and prove nothing).
      playbackStartTimeout: 60,
    });

    const session = service.createSession({
      url: HOSTED_URL,
      magnet: MAGNET,
      videoElement: video,
      autoplay: true,
      playViaWebTorrent: async () => {
        torrentAttempted = true;
        await new Promise(() => {}); // a swarm with no peers
      },
    });
    session.on?.("status", (p) => statuses.push(p.message));

    const outcome = await Promise.race([
      session.execute(),
      new Promise((r) => setTimeout(() => r({ source: "PENDING" }), 600)),
    ]);

    return { outcome, statuses, torrentAttempted, video };
  };

  test("a blocked autoplay never falls back to WebTorrent", async () => {
    const { statuses, torrentAttempted } = await run({ autoplayAllowed: false });

    assert.equal(
      torrentAttempted,
      false,
      `must not switch to P2P while awaiting a gesture; got: ${JSON.stringify(statuses)}`
    );
    assert.equal(
      statuses.some((m) => /switching to webtorrent/i.test(m)),
      false
    );
  });

  test("the viewer is told to press play, and the prompt is the last word", async () => {
    const { statuses } = await run({ autoplayAllowed: false });

    assert.equal(
      statuses.some((m) => /press play/i.test(m)),
      true,
      "viewer needs an actionable prompt"
    );
    // Nothing may overwrite that prompt with a failure message.
    assert.match(statuses[statuses.length - 1], /press play/i);
  });

  test("the session stays pending rather than reporting no playable source", async () => {
    const { outcome } = await run({ autoplayAllowed: false });
    assert.equal(outcome.source, "PENDING");
    assert.notEqual(outcome.source, null);
  });

  test("permitted autoplay is unaffected and still starts on the hosted URL", async () => {
    // The guard must not suppress the timeout for everyone -- only while
    // autoplay is actually blocked.
    const { outcome, torrentAttempted, statuses } = await run({
      autoplayAllowed: true,
    });
    assert.equal(torrentAttempted, false);
    assert.equal(
      statuses.some((m) => /press play/i.test(m)),
      false
    );
    assert.equal(outcome.source, "url", "a healthy source still starts normally");
  });
});
