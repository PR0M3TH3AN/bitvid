import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
// Resolve real cache dependencies with installed Node packages before DOM setup.
import * as cache from "../js/state/cache.js";
import UrlHealthController from "../js/ui/urlHealthController.js";
import { attachUrlHealthBadges } from "../js/urlHealthObserver.js";
import {
  setCardLivenessPolicy,
  getCardLivenessPolicy
} from "../js/constants.js";
import { updateVideoCardSourceVisibility } from "../js/utils/cardSourceVisibility.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));
let sequence = 0;
function fixture(t, { ignoreAbort = false, missingAbort = false } = {}) {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "https://example.invalid"
  });
  const names = [
    "window",
    "document",
    "HTMLElement",
    "localStorage",
    "fetch",
    "IntersectionObserver",
    "requestAnimationFrame",
    "setTimeout",
    "clearTimeout",
    "AbortController"
  ];
  const saved = names.map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key)
  ]);
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage
  });
  if (missingAbort) globalThis.AbortController = undefined;
  const policy = getCardLivenessPolicy();
  setCardLivenessPolicy("show-pending");
  const resources = new Set(),
    listeners = new Map(),
    handlers = new Map(),
    pauses = [];
  const observers = [],
    media = [],
    heads = [],
    promises = [],
    warnings = [],
    registrations = [],
    visibility = [],
    checks = [];
  const id = (name) => `url-lifecycle-${++sequence}-${name}`;
  const url = (name) => `https://media.invalid/${name}.mp4`;
  globalThis.IntersectionObserver = class {
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
      this.callback(
        this.cards.map((target) => ({
          target,
          isIntersecting: true,
          intersectionRatio: 1
        }))
      );
    }
  };
  const timers = new Map(),
    nativeSetTimeout = globalThis.setTimeout,
    nativeClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => {
    if (!ms) return nativeSetTimeout(fn, ms);
    const handle = {};
    timers.set(handle, { fn, ms });
    return handle;
  };
  globalThis.clearTimeout = (handle) => {
    if (!timers.delete(handle)) nativeClearTimeout(handle);
  };
  globalThis.fetch = (source, options) =>
    new Promise((resolve, reject) => {
      const head = { source, options, resolve, reject, aborted: 0 };
      heads.push(head);
      options.signal?.addEventListener(
        "abort",
        () => {
          head.aborted++;
          if (!ignoreAbort) reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    });
  const proto = dom.window.HTMLMediaElement.prototype;
  const addListener = proto.addEventListener,
    removeListener = proto.removeEventListener;
  proto.addEventListener = function (type, fn, options) {
    if (["loadeddata", "canplay", "error"].includes(type)) {
      if (!listeners.has(this)) listeners.set(this, new Map());
      if (!handlers.has(this)) handlers.set(this, new Map());
      listeners.get(this).set(type, fn);
      handlers.get(this).set(type, fn);
    }
    return addListener.call(this, type, fn, options);
  };
  proto.removeEventListener = function (type, fn, options) {
    listeners.get(this)?.delete(type);
    return removeListener.call(this, type, fn, options);
  };
  proto.load = function () {
    if (this.getAttribute("src")) {
      if (!media.includes(this)) media.push(this);
      resources.add(this);
    } else resources.delete(this);
  };
  proto.pause = function () {
    pauses.push(this);
  };
  const controller = new UrlHealthController({
    state: {
      ...cache,
      setInFlightUrlProbe(...args) {
        promises.push(args[2]);
        return cache.setInFlightUrlProbe(...args);
      }
    },
    logger: {
      warn(...args) {
        warnings.push(args);
      }
    },
    utils: {
      updateVideoCardSourceVisibility(card) {
        visibility.push(card);
        updateVideoCardSourceVisibility(card);
      }
    }
  });
  function feed(
    videos,
    {
      container = document.createElement("section"),
      consumer = controller
    } = {}
  ) {
    container.replaceChildren();
    for (const video of videos) {
      const card = document.createElement("article");
      card.className = "card";
      card.dataset.videoId = video.id;
      card.dataset.urlHealthEventId = video.id;
      card.dataset.urlHealthUrl = encodeURIComponent(video.url);
      card.dataset.urlHealthState = "checking";
      card.dataset.streamHealthState = "unsupported";
      const badge = document.createElement("span");
      badge.dataset.urlHealthState = "checking";
      card.append(badge);
      container.append(card);
      updateVideoCardSourceVisibility(card);
    }
    document.body.append(container);
    const registration = { container, videos };
    registration.dispose = attachUrlHealthBadges(
      container,
      ({ badgeEl, url, eventId }) => {
        checks.push(eventId);
        consumer.handleUrlHealthBadge({
          video: videos.find((v) => v.id === eventId),
          url,
          badgeEl
        });
      }
    );
    registration.observer = observers.at(-1);
    registration.cards = [...container.children];
    registration.badges = registration.cards.map(
      (card) => card.firstElementChild
    );
    registrations.push(registration);
    return registration;
  }
  const video = (name) => {
    const key = id(name);
    return { id: key, url: url(key) };
  };
  const done = (element, event = "loadeddata") =>
    element.dispatchEvent(new dom.window.Event(event));
  async function finishAll() {
    // Event-driven drain: each iteration completes the currently created media.
    // No wall-clock delay or retry of a failed assertion.
    for (const head of heads)
      head.resolve({ ok: true, status: 200, type: "basic" });
    await flush();
    let handled = 0;
    while (handled < media.length) {
      for (const element of media.slice(handled)) {
        done(element);
        handled++;
      }
      await flush();
    }
    await Promise.all(promises);
    await flush();
  }
  t.after(async () => {
    for (const registration of registrations) registration.dispose();
    await finishAll();
    dom.window.close();
    setCardLivenessPolicy(policy);
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    dom,
    resources,
    listeners,
    handlers,
    pauses,
    controller,
    media,
    heads,
    timers,
    promises,
    warnings,
    visibility,
    checks,
    feed,
    video,
    done,
    finishAll
  };
}
// All transport and time boundaries are controlled; ownership, cache, observer,
// controller, DOM events and media queue are real. Flush drains continuations,
// never a wall-clock wait or assertion retry.
const inFlight = (v) =>
  cache.getInFlightUrlProbe(v.id, v.url, { confirmPlayable: true });
const cached = (v) => cache.getCachedUrlHealth(v.id, v.url);
function tracking(promise) {
  const result = { settled: false };
  promise.then((value) => Object.assign(result, { settled: true, value }));
  return result;
}
async function start(f, name = "head") {
  const v = f.video(name);
  v.sources = [{ url: `${v.url}?mirror` }];
  const old = f.feed([v]);
  old.observer.show();
  await flush();
  assert.equal(f.heads.length, 1);
  assert.equal(f.media.length, 0);
  return { v, old, promise: f.promises[0], result: tracking(f.promises[0]) };
}
function cleanCancelled(f, v, old, result) {
  assert.equal(result.settled, true, "cancelled HEAD must settle promptly");
  assert.equal(result.value, null);
  assert.equal(cached(v), null);
  assert.equal(inFlight(v), null);
  assert.equal(f.timers.size, 0, "no HEAD or media timer retained");
  assert.equal(f.heads.length, 1, "no obsolete mirror");
  assert.equal(f.media.length, 0, "no obsolete media fallback");
  assert.equal(f.controller.activeVideoProbes, 0);
  assert.equal(old.badges[0].dataset.urlHealthState, "checking");
}
for (const transport of ["abortable", "ignores-abort", "missing-abort"]) {
  test(`last HEAD owner disposal releases promise/timer with ${transport} transport`, async (t) => {
    const f = fixture(t, {
      ignoreAbort: transport === "ignores-abort",
      missingAbort: transport === "missing-abort"
    });
    const { v, old, result } = await start(f);
    assert.equal(f.timers.size, 1);
    old.dispose();
    old.dispose();
    await flush();
    assert.equal(f.heads[0].aborted, transport === "missing-abort" ? 0 : 1);
    cleanCancelled(f, v, old, result);
    // Even a transport that never settles its own promise cannot block release.
  });
}
for (const timing of ["same-turn", "after-flush"]) {
  for (const late of ["success", "error", "timeout"]) {
    test(`HEAD ${timing} rejoin has fresh identity despite late ${late}`, async (t) => {
      const f = fixture(t, { ignoreAbort: true });
      const { v, old, promise, result } = await start(f);
      const oldTimer = [...f.timers.values()][0].fn;
      old.dispose();
      if (timing === "after-flush") await flush();
      const live = f.feed([v]);
      live.observer.show();
      const replacement = inFlight(v);
      assert.notEqual(replacement, promise, "same-turn owner must start fresh");
      await flush();
      assert.equal(f.heads.length, 2);
      assert.equal(result.settled, true);
      assert.equal(result.value, null);
      assert.equal(
        inFlight(v),
        replacement,
        "old finalizer preserves replacement"
      );
      if (late === "success")
        f.heads[0].resolve({ ok: true, status: 200, type: "basic" });
      if (late === "error") f.heads[0].reject(new Error("obsolete HEAD error"));
      if (late === "timeout") oldTimer();
      await flush();
      assert.equal(inFlight(v), replacement);
      assert.equal(cached(v), null);
      assert.equal(f.media.length, 0);
      assert.equal(f.timers.size, 1, "only replacement timer remains");
      assert.equal(old.badges[0].dataset.urlHealthState, "checking");
      f.heads[1].resolve({ ok: true, status: 200, type: "basic" });
      await flush();
      assert.equal(f.media.length, 1);
      f.done(f.media[0]);
      await flush();
      assert.equal(cached(v).status, "healthy");
      assert.equal(live.badges[0].dataset.urlHealthState, "healthy");
      assert.equal(old.badges[0].dataset.urlHealthState, "checking");
      assert.equal(f.timers.size, 0);
      assert.equal(f.controller.activeVideoProbes, 0);
    });
  }
}
for (const kind of ["shared", "cross-controller", "legacy"]) {
  test(`HEAD disposal preserves ${kind} survivor and live media handoff`, async (t) => {
    const f = fixture(t);
    const { v, old, result } = await start(f);
    const consumer =
      kind === "cross-controller"
        ? new UrlHealthController({ state: cache, logger: { warn() {} } })
        : f.controller;
    let live;
    if (kind === "legacy") {
      const badge = document.createElement("span");
      document.body.append(badge);
      consumer.handleUrlHealthBadge({ video: v, url: v.url, badgeEl: badge });
      live = { badges: [badge] };
    } else {
      live = f.feed([v], { consumer });
      live.observer.show();
    }
    await flush();
    old.dispose();
    await flush();
    assert.equal(f.heads.length, 1);
    assert.equal(f.heads[0].aborted, 0);
    assert.equal(result.settled, false);
    assert.equal(f.timers.size, 1);
    f.heads[0].resolve({ ok: true, status: 200, type: "basic" });
    await flush();
    assert.equal(f.media.length, 1);
    f.done(f.media[0]);
    await flush();
    assert.equal(cached(v).status, "healthy");
    assert.equal(live.badges[0].dataset.urlHealthState, "healthy");
    assert.equal(old.badges[0].dataset.urlHealthState, "checking");
    assert.equal(f.timers.size, 0);
  });
}
for (const response of [
  "success",
  "error",
  "timeout",
  "opaque",
  "bad-status"
]) {
  test(`live HEAD ${response} retains playable media fallback/cache`, async (t) => {
    const f = fixture(t);
    const { v, old, result } = await start(f);
    if (response === "error")
      f.heads[0].reject(new Error("controlled HEAD error"));
    else if (response === "timeout") [...f.timers.values()][0].fn();
    else
      f.heads[0].resolve({
        ok: response !== "bad-status",
        status: response === "bad-status" ? 405 : 200,
        type: response === "opaque" ? "opaque" : "basic"
      });
    await flush();
    assert.equal(f.media.length, 1);
    assert.equal(f.timers.size, 1);
    f.done(f.media[0]);
    await flush();
    assert.equal(result.settled, true);
    assert.equal(cached(v).status, "healthy");
    assert.equal(old.badges[0].dataset.urlHealthState, "healthy");
    assert.equal(f.heads[0].aborted, response === "timeout" ? 1 : 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.controller.activeVideoProbes, 0);
  });
}
test("HEAD completion immediately before disposal never starts media or mirrors", async (t) => {
  const f = fixture(t);
  const { v, old, result } = await start(f);
  f.heads[0].resolve({ ok: true, status: 200, type: "basic" });
  old.dispose();
  await flush();
  cleanCancelled(f, v, old, result);
});
test("HEAD to media handoff retains the new cancellation hook", async (t) => {
  const f = fixture(t);
  const { v, old, result } = await start(f);
  f.heads[0].resolve({ ok: true, status: 200, type: "basic" });
  await flush();
  assert.equal(f.media.length, 1);
  assert.equal(f.controller.activeVideoProbes, 1);
  old.dispose();
  await flush();
  assert.equal(result.settled, true);
  assert.equal(result.value, null);
  assert.equal(f.resources.size, 0);
  assert.equal(f.listeners.get(f.media[0]).size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.controller.activeVideoProbes, 0);
  assert.equal(cached(v), null);
  assert.equal(f.heads.length, 1);
});
test("HEAD cancellation during saturated media queue preserves live FIFO and cap", async (t) => {
  const f = fixture(t),
    videos = ["a", "b", "c", "queued1", "queued2"].map(f.video);
  const live = f.feed(videos);
  live.observer.show();
  await flush();
  for (const head of f.heads)
    head.resolve({ ok: true, status: 200, type: "basic" });
  await flush();
  assert.equal(f.media.length, 3);
  assert.equal(f.controller.activeVideoProbes, 3);
  assert.equal(f.controller.videoProbeQueue.length, 2);
  const obsolete = f.video("obsolete"),
    old = f.feed([obsolete]);
  old.observer.show();
  await flush();
  const cancelled = tracking(f.promises.at(-1));
  old.dispose();
  await flush();
  assert.equal(cancelled.settled, true);
  assert.equal(cancelled.value, null);
  assert.equal(f.controller.activeVideoProbes, 3);
  assert.equal(f.controller.videoProbeQueue.length, 2);
  f.done(f.media[0]);
  await flush();
  assert.equal(f.media.length, 4);
  assert.equal(f.media[3].getAttribute("src"), videos[3].url);
  assert.equal(f.controller.activeVideoProbes, 3);
  f.done(f.media[1]);
  await flush();
  assert.equal(f.media.length, 5);
  assert.equal(f.media[4].getAttribute("src"), videos[4].url);
  await f.finishAll();
  assert.equal(f.controller.activeVideoProbes, 0);
  assert.equal(cached(obsolete), null);
  assert.equal(f.timers.size, 0);
});
for (const state of ["no-owners", "already-cancelled"]) {
  test(`HEAD ${state} lifecycle starts no fetch or timer`, async (t) => {
    const f = fixture(t),
      lifecycle = {
        owners: new Set(),
        cancelled: state === "already-cancelled"
      };
    if (state === "already-cancelled") lifecycle.owners.add({ active: true });
    const promise = f.controller.probeUrl("https://media.invalid/before.mp4", {
      confirmPlayable: true,
      lifecycle
    });
    f.promises.push(promise);
    await flush();
    assert.equal(f.heads.length, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.media.length, 0);
    assert.deepEqual(await promise, { outcome: "cancelled" });
  });
}
test("live HEAD and failed media still try one mirror then cache offline", async (t) => {
  const f = fixture(t);
  const { v, old, result } = await start(f);
  f.heads[0].resolve({ ok: false, status: 405, type: "basic" });
  await flush();
  assert.equal(f.media.length, 1);
  f.done(f.media[0], "error");
  await flush();
  assert.equal(f.heads.length, 2);
  assert.equal(f.heads[1].source, v.sources[0].url);
  f.heads[1].resolve({ ok: false, status: 503, type: "basic" });
  await flush();
  assert.equal(f.media.length, 2);
  f.done(f.media[1], "error");
  await flush();
  assert.equal(result.settled, true);
  assert.equal(cached(v).status, "offline");
  assert.equal(old.badges[0].dataset.urlHealthState, "offline");
  assert.equal(f.timers.size, 0);
  assert.equal(f.controller.activeVideoProbes, 0);
});
