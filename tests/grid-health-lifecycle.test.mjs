import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { torrentClient } from "../js/webtorrent.js";
import { attachHealthBadges } from "../js/gridHealth.js";
import {
  FIVE_MINUTES_MS,
  setCardLivenessPolicy,
  getCardLivenessPolicy
} from "../js/constants.js";
import { readTorrentProbeFromStorage } from "../js/utils/storage.js";

const healthy = {
  healthy: true,
  peers: 1,
  reason: "peer",
  hasProbeTrackers: true
};
let nextHash = 1;
const magnet = () =>
  "magnet:?xt=urn:btih:" + (nextHash++).toString(16).padStart(40, "0");
// A task-turn boundary drains the queue's promise continuations and badge writes;
// no wall-clock delay, polling or live network is involved.
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(t) {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "https://example.invalid"
  });
  Object.defineProperty(dom.window, "innerHeight", { value: 20 });
  const previousPolicy = getCardLivenessPolicy();
  const saved = new Map(
    [
      "window",
      "document",
      "HTMLElement",
      "localStorage",
      "IntersectionObserver",
      "__BITVID_CARD_LIVENESS_POLICY__"
    ].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage
  });
  const observers = [];
  class Observer {
    constructor(callback) {
      this.callback = callback;
      this.cards = [];
      observers.push(this);
    }
    observe(card) {
      this.cards.push(card);
    }
    takeRecords() {
      return [];
    }
    disconnect() {
      this.disconnected = true;
    }
    show() {
      // Intentionally allow late delivery after disconnect to test stale entries.
      this.callback(
        this.cards.map((target, index) => ({
          target,
          isIntersecting: true,
          intersectionRatio: 1,
          intersectionRect: { top: index * 20, width: 100, height: 20 }
        }))
      );
    }
  }
  globalThis.IntersectionObserver = Observer;
  const calls = [];
  const disposals = [];
  let active = 0;
  let peakActive = 0;
  t.mock.method(torrentClient, "probePeers", (source, options) => {
    active += 1;
    peakActive = Math.max(peakActive, active);
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    const call = {
      source,
      options,
      settled: false,
      finish(result = healthy) {
        if (call.settled) return;
        call.settled = true;
        active -= 1;
        resolve(result);
      }
    };
    calls.push(call);
    return promise;
  });
  setCardLivenessPolicy("show-pending");
  t.after(async () => {
    disposals.forEach((dispose) => dispose());
    // Disposing removes queued owners; only the controlled active calls remain.
    calls.forEach((call) => call.finish());
    await flush();
    setCardLivenessPolicy(previousPolicy);
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  function feed(sources, options = {}) {
    const container = document.createElement("section");
    const cards = sources.map((source) => {
      const card = document.createElement("article");
      card.className = "card";
      card.dataset.videoId = source;
      card.dataset.magnet = source;
      if (options.hidden) {
        card.hidden = true;
        card.dataset.urlHealthUrl = encodeURIComponent(
          "https://media.example.invalid/video.mp4"
        );
        card.dataset.urlHealthState = "checking";
      }
      const badge = document.createElement("span");
      badge.className = "torrent-health-badge";
      card.appendChild(badge);
      container.appendChild(card);
      return card;
    });
    document.body.appendChild(container);
    const dispose = attachHealthBadges(container, options);
    disposals.push(dispose);
    return { container, cards, dispose, observer: observers.at(-1) };
  }
  function saturate() {
    const blockers = feed(Array.from({ length: 4 }, magnet));
    blockers.observer.show();
    assert.equal(
      calls.length,
      4,
      "current four-probe concurrency must be saturated"
    );
    return blockers;
  }
  function reattach(feed) {
    const dispose = attachHealthBadges(feed.container);
    disposals.push(dispose);
    return { ...feed, dispose, observer: observers.at(-1) };
  }
  return {
    feed,
    reattach,
    saturate,
    calls,
    get peakActive() {
      return peakActive;
    }
  };
}

test("last feed owner disposal prevents the fifth queued probe from starting", async (t) => {
  const f = fixture(t);
  const feed = f.feed(Array.from({ length: 5 }, magnet));
  feed.observer.show();
  assert.equal(f.calls.length, 4);
  feed.dispose();
  feed.container.remove();
  assert.equal(feed.observer.disconnected, true);
  f.calls.forEach((call) => call.finish());
  await flush();
  assert.equal(f.calls.length, 4, "obsolete queued source must never start");
});

test("disposing one of two queued source owners preserves the live owner", async (t) => {
  const f = fixture(t);
  f.saturate();
  const source = magnet();
  const disposedUpdates = [];
  const first = f.feed([source], {
    onUpdate: (event) => disposedUpdates.push(event.state)
  });
  const second = f.feed([source]);
  first.observer.show();
  second.observer.show();
  assert.equal(f.calls.length, 4);
  first.dispose(); // Keep DOM connected: stale writes must be guarded by ownership.
  disposedUpdates.length = 0;
  f.calls[0].finish();
  await flush();
  assert.equal(
    f.calls.length,
    5,
    "remaining live owner must retain the shared queued probe"
  );
  assert.equal(f.calls[4].source, source);
  f.calls[4].finish();
  await flush();
  assert.equal(second.cards[0].dataset.streamHealthState, "healthy");
  assert.equal(first.cards[0].dataset.streamHealthState, "checking");
  assert.deepEqual(
    disposedUpdates,
    [],
    "disposed registration must receive no later badge notifications"
  );
});

test("cancelled source can be re-requested before old settlement without cache poison or duplicate work", async (t) => {
  const f = fixture(t);
  f.saturate();
  const source = magnet();
  const first = f.feed([source]);
  first.observer.show();
  first.dispose();
  const replacement = f.feed([source]);
  replacement.observer.show(); // New inflight record before cancelled promise settles.
  await flush();
  assert.equal(
    readTorrentProbeFromStorage(source.slice(-40)),
    null,
    "cancelled job must not cache an unhealthy result"
  );
  assert.equal(replacement.cards[0].dataset.streamHealthState, "checking");
  const sharedReplacement = f.feed([source]);
  sharedReplacement.observer.show(); // Must still find the replacement inflight record.
  f.calls.forEach((call) => call.finish());
  await flush();
  assert.equal(
    f.calls.filter((call) => call.source === source).length,
    1,
    "old finalizer must not delete newer inflight work"
  );
  f.calls.at(-1).finish();
  await flush();
  for (const feed of [replacement, sharedReplacement]) {
    assert.equal(feed.cards[0].dataset.streamHealthState, "healthy");
  }
  const cached = f.feed([source]);
  cached.observer.show();
  assert.equal(cached.cards[0].dataset.streamHealthState, "healthy");
  assert.equal(
    f.calls.length,
    5,
    "successful replacement must retain normal cache reuse"
  );
});

test("queue cancellation preserves stable priority and concurrency of four", async (t) => {
  const f = fixture(t);
  f.saturate();
  const [first, low, high, cancelled] = Array.from({ length: 4 }, magnet);
  const batch = f.feed([first, low]);
  batch.observer.show(); // First gets baseline, low gets baseline minus one.
  const newer = f.feed([high]);
  newer.observer.show(); // Baseline: follows the earlier equal-priority first.
  const obsolete = f.feed([cancelled]);
  obsolete.observer.show();
  obsolete.dispose();
  for (const [slot, expected] of [
    [0, first],
    [4, high],
    [5, low]
  ]) {
    f.calls[slot].finish();
    await flush();
    assert.equal(f.calls.at(-1).source, expected);
  }
  assert.equal(
    f.peakActive,
    4,
    "cancellation must not free active slots prematurely"
  );
  assert.deepEqual(
    f.calls.slice(4).map((call) => call.source),
    [first, high, low]
  );
  assert.equal(
    f.calls.some((call) => call.source === cancelled),
    false
  );
});

test("healthy hidden card probes eagerly and reveals without an intersection", async (t) => {
  const f = fixture(t);
  setCardLivenessPolicy("hide-all");
  const source = magnet() + "&tr=wss%3A%2F%2Ftracker.example.invalid";
  const feed = f.feed([source], { hidden: true });
  assert.equal(
    f.calls.length,
    1,
    "hidden card must eagerly probe on registration"
  );
  assert.equal(feed.cards[0].hidden, true);
  assert.deepEqual(f.calls[0].options.urlList, [
    "https://media.example.invalid/video.mp4"
  ]);
  assert.equal(
    f.calls[0].source,
    source,
    "magnet bytes must reach the probe unchanged"
  );
  f.calls[0].finish();
  await flush();
  assert.equal(feed.cards[0].dataset.streamHealthState, "healthy");
  assert.equal(feed.cards[0].hidden, false);
  assert.equal(feed.cards[0].dataset.sourceVisibility, "visible");
});

test("active probe remains shared while disposed owners and late observer entries stay inert", async (t) => {
  const f = fixture(t);
  const source = magnet();
  const first = f.feed([source]);
  first.observer.show();
  first.dispose();
  first.observer.show(); // An already-delivered entry may arrive after disconnect.
  const live = f.feed([source]);
  live.observer.show();
  assert.equal(
    f.calls.length,
    1,
    "already active probe must remain deduplicated"
  );
  f.calls[0].finish();
  await flush();
  assert.equal(first.cards[0].dataset.streamHealthState, "checking");
  assert.equal(live.cards[0].dataset.streamHealthState, "healthy");
});

test("repeated old disposal cannot cancel a reattached live registration", async (t) => {
  const f = fixture(t);
  f.saturate();
  const source = magnet();
  const old = f.feed([source]);
  old.observer.show();
  old.dispose();
  const renewed = f.reattach(old);
  renewed.observer.show();
  old.dispose();
  f.calls[0].finish();
  await flush();
  assert.equal(
    f.calls.length,
    5,
    "old disposer must not unregister the new queued owner"
  );
  f.calls[4].finish();
  await flush();
  assert.equal(renewed.cards[0].dataset.streamHealthState, "healthy");
});

test("disposed active completion remains cached for a later live owner", async (t) => {
  const f = fixture(t);
  const source = magnet();
  const old = f.feed([source]);
  old.observer.show();
  old.dispose();
  f.calls[0].finish();
  await flush();
  assert.equal(old.cards[0].dataset.streamHealthState, "checking");
  const live = f.feed([source]);
  live.observer.show();
  assert.equal(
    f.calls.length,
    1,
    "ownerless active completion must retain its healthy cache result"
  );
  assert.equal(live.cards[0].dataset.streamHealthState, "healthy");
});

test("completed healthy and negative probes retain existing cache TTL behavior", async (t) => {
  const f = fixture(t);
  let time = 1_000_000;
  t.mock.method(Date, "now", () => time);
  const sources = [magnet(), magnet()];
  const first = f.feed(sources);
  first.observer.show();
  f.calls[0].finish();
  f.calls[1].finish({
    healthy: false,
    peers: 0,
    hasProbeTrackers: true,
    reason: "timeout"
  });
  await flush();
  const cached = f.feed(sources);
  cached.observer.show();
  assert.deepEqual(
    cached.cards.map((card) => card.dataset.streamHealthState),
    ["healthy", "unhealthy"]
  );
  assert.equal(f.calls.length, 2);
  time += FIVE_MINUTES_MS;
  cached.observer.show();
  assert.equal(
    f.calls.length,
    2,
    "existing inclusive TTL boundary must remain cached"
  );
  time += 1;
  const expired = f.feed(sources);
  expired.observer.show();
  assert.equal(
    f.calls.length,
    4,
    "both healthy and negative entries must expire under the existing TTL"
  );
});
