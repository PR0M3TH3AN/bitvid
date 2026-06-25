import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";

import { createBeaconApp } from "../../torrent/app.js";

// The processing overlay is the only element these scenarios assert on; every
// other element createBeaconApp queries is optional and guarded.
const BODY = '<div data-beacon="processing-overlay" hidden></div>';
const MAGNET = `magnet:?xt=urn:btih:${"a".repeat(40)}`;

function makeFakeTorrent() {
  return { infoHash: "a".repeat(40), name: "fake", progress: 0, files: [], once() {} };
}

// A WebTorrent stub whose add() never invokes the ready callback — exactly what
// a magnet with no live seeders does, which used to spin the overlay forever.
class StuckWebTorrent {
  constructor() {
    this.torrents = [];
    this.downloadSpeed = 0;
    this.uploadSpeed = 0;
    this.ratio = 0;
  }
  on() {}
  removeListener() {}
  add() {
    const torrent = makeFakeTorrent();
    this.torrents.push(torrent);
    return torrent; // intentionally never calls the ready callback
  }
  seed() {
    const torrent = makeFakeTorrent();
    this.torrents.push(torrent);
    return torrent;
  }
  destroy() {}
}
StuckWebTorrent.WEBRTC_SUPPORT = true;

// A WebTorrent stub whose add() resolves immediately (metadata arrives).
class ReadyWebTorrent extends StuckWebTorrent {
  add(magnet, options, cb) {
    const torrent = makeFakeTorrent();
    this.torrents.push(torrent);
    if (typeof cb === "function") cb(torrent);
    return torrent;
  }
}
ReadyWebTorrent.WEBRTC_SUPPORT = true;

let dom;
let firedTimeouts;

function setupDom() {
  dom = new JSDOM(`<!doctype html><html><body>${BODY}</body></html>`, {
    url: `https://beacon.test/#${MAGNET}`,
    pretendToBeVisual: true,
  });
  const view = dom.window;
  view.requestAnimationFrame = (cb) => cb();
  // Capture the watchdog timeout so the scenario controls when it "fires",
  // and neutralise the 1s render interval so no real timers run.
  firedTimeouts = [];
  view.setTimeout = (fn) => {
    firedTimeouts.push(fn);
    return firedTimeouts.length;
  };
  view.clearTimeout = () => {};
  view.setInterval = () => 0;
  view.clearInterval = () => {};
  return view.document;
}

function overlay(documentRef) {
  return documentRef.querySelector('[data-beacon="processing-overlay"]');
}

describe("torrent/app beacon processing watchdog", () => {
  beforeEach(() => {});

  afterEach(() => {
    if (dom) {
      dom.window.close();
      dom = null;
    }
  });

  it("drops the spinner (and warns) when a magnet never finds peers", () => {
    const documentRef = setupDom();
    const app = createBeaconApp({ documentRef, WebTorrentCtor: StuckWebTorrent });

    app.mount(); // reads location.hash → addMagnet(MAGNET) → spinner on

    assert.equal(overlay(documentRef).hidden, false, "spinner shows while connecting");
    assert.equal(firedTimeouts.length, 1, "a watchdog timeout was armed");

    // Simulate the timeout elapsing with the torrent still not ready.
    firedTimeouts[0]();

    assert.equal(
      overlay(documentRef).hidden,
      true,
      "spinner is dismissed instead of hanging forever",
    );
    const toast = documentRef.querySelector(".torrent-toast--warn");
    assert.ok(toast, "a warning toast explains it's still trying in the background");
  });

  it("clears the spinner and the watchdog as soon as metadata arrives", () => {
    const documentRef = setupDom();
    const app = createBeaconApp({ documentRef, WebTorrentCtor: ReadyWebTorrent });

    app.mount(); // ready callback fires synchronously → handleTorrentReady

    assert.equal(overlay(documentRef).hidden, true, "spinner resolves on success");
    // Firing a stale watchdog after success must not re-hide / re-toast.
    const before = documentRef.querySelectorAll(".torrent-toast--warn").length;
    firedTimeouts.forEach((fn) => fn());
    const after = documentRef.querySelectorAll(".torrent-toast--warn").length;
    assert.equal(after, before, "a resolved op does not fire a stale watchdog warning");
  });
});
