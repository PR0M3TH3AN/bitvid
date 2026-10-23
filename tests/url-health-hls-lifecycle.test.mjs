import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { probeHlsManifest } from "../js/services/hlsPlayback.js";
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
  const url = (name) => `https://media.invalid/${name}.m3u8`;
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
  const bodies = [],
    clears = [];
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
    clears.push(handle);
    if (!timers.delete(handle)) nativeClearTimeout(handle);
  };
  globalThis.fetch = (source, options) =>
    options.method === "HEAD"
      ? Promise.resolve({ ok: true, status: 200, type: "basic" })
      : new Promise((resolve, reject) => {
          const head = { source, options, resolve, reject, aborted: 0 };
          heads.push(head);
          options.signal?.addEventListener(
            "abort",
            () => {
              head.aborted++;
              if (!ignoreAbort)
                reject(new DOMException("Aborted", "AbortError"));
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
      head.resolve({
        ok: true,
        status: 200,
        type: "basic",
        text: async () => "#EXTM3U\nsegment.ts"
      });
    for (const body of bodies) body.resolve("#EXTM3U\nsegment.ts");
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
    bodies,
    clears,
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

// Actual observer/controller/cache/manifest helper; only IO, clock and viewport
// boundaries are controlled. No engine/decoder/public network is involved.
const inFlight = (v) =>
  cache.getInFlightUrlProbe(v.id, v.url, { confirmPlayable: true });
const cached = (v) => cache.getCachedUrlHealth(v.id, v.url);
const manifest = {
  ok: true,
  text: async () => "#EXTM3U\n#EXTINF:2\nsegment.ts"
};
function tracking(promise) {
  const result = { settled: false };
  promise.then((value) => Object.assign(result, { settled: true, value }));
  return result;
}
function bodyReader(f) {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const body = { promise, resolve, reject };
  f.bodies.push(body);
  return body;
}
async function start(f, { phase = "fetch", mirror = false } = {}) {
  const v = f.video(phase);
  if (mirror) v.sources = [{ url: `${v.url}?mirror` }];
  const old = f.feed([v]);
  old.observer.show();
  await flush();
  assert.equal(f.heads.length, 1);
  assert.equal(f.heads[0].options.method, "GET");
  assert.equal(f.media.length, 0);
  let body;
  if (phase === "body") {
    body = bodyReader(f);
    f.heads[0].resolve({ ok: true, text: () => body.promise });
    await flush();
  }
  return {
    v,
    old,
    body,
    promise: f.promises[0],
    result: tracking(f.promises[0])
  };
}
for (const phase of ["fetch", "body"]) {
  for (const transport of ["abortable", "ignores-abort", "missing-abort"]) {
    test(`HLS ${phase} final owner releases resources with ${transport}`, async (t) => {
      const f = fixture(t, {
        ignoreAbort: transport === "ignores-abort",
        missingAbort: transport === "missing-abort"
      });
      const { v, old, result } = await start(f, { phase, mirror: true });
      const timer = [...f.timers.keys()][0];
      old.dispose();
      old.dispose();
      await flush();
      assert.equal(
        result.settled,
        true,
        "settle independently of fetch/body cooperation"
      );
      assert.equal(result.value, null);
      assert.equal(f.heads[0].aborted, transport === "missing-abort" ? 0 : 1);
      assert.equal(f.timers.size, 0);
      assert.equal(f.clears.filter((x) => x === timer).length, 1);
      assert.equal(cached(v), null);
      assert.equal(inFlight(v), null);
      assert.equal(f.heads.length, 1, "no obsolete mirror");
      assert.equal(f.media.length, 0);
      assert.equal(old.badges[0].dataset.urlHealthState, "checking");
      assert.equal(f.controller.activeVideoProbes, 0);
      assert.equal(f.controller.videoProbeQueue.length, 0);
      await f.finishAll();
      assert.equal(cached(v), null, "late completion cannot cache");
      assert.equal(f.clears.filter((x) => x === timer).length, 1);
    });
  }
  for (const timing of ["same-turn", "after-flush"])
    for (const late of ["success", "error", "timer"]) {
      test(`HLS ${phase} ${timing} replacement survives old ${late}`, async (t) => {
        const f = fixture(t, { ignoreAbort: true });
        const { v, old, body, promise, result } = await start(f, { phase });
        const staleTimer = [...f.timers.values()][0].fn;
        old.dispose();
        if (timing === "after-flush") await flush();
        const live = f.feed([v]);
        live.observer.show();
        const replacement = inFlight(v);
        assert.notEqual(
          replacement,
          promise,
          "new owner requires fresh inflight identity"
        );
        await flush();
        assert.equal(f.heads.length, 2);
        assert.equal(result.settled, true);
        assert.equal(result.value, null);
        assert.equal(inFlight(v), replacement);
        assert.equal(f.timers.size, 1);
        if (late === "timer") staleTimer();
        else if (phase === "body") {
          if (late === "success") body.resolve("#EXTM3U\nold.ts");
          else body.reject(Error("late body failure"));
        } else if (late === "success") f.heads[0].resolve(manifest);
        else f.heads[0].reject(Error("late fetch failure"));
        await flush();
        assert.equal(inFlight(v), replacement);
        assert.equal(cached(v), null);
        assert.equal(f.timers.size, 1);
        assert.equal(old.badges[0].dataset.urlHealthState, "checking");
        f.heads[1].resolve(manifest);
        await replacement;
        await flush();
        assert.equal(cached(v).status, "healthy");
        assert.equal(live.badges[0].dataset.urlHealthState, "healthy");
        assert.equal(old.badges[0].dataset.urlHealthState, "checking");
        assert.equal(inFlight(v), null);
        assert.equal(f.timers.size, 0);
      });
    }
  for (const kind of ["shared", "cross-controller", "legacy"]) {
    test(`HLS ${phase} cancellation preserves ${kind} survivor`, async (t) => {
      const f = fixture(t);
      const { v, old, result } = await start(f, { phase });
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
      await f.finishAll();
      assert.equal(result.value.status, "healthy");
      assert.equal(cached(v).status, "healthy");
      assert.equal(live.badges[0].dataset.urlHealthState, "healthy");
      assert.equal(old.badges[0].dataset.urlHealthState, "checking");
      assert.equal(f.timers.size, 0);
    });
  }
}
for (const outcome of ["success", "error", "bad-body", "timeout"]) {
  test(`HLS live ${outcome} preserves health/cache semantics`, async (t) => {
    const f = fixture(t);
    const { v, old, result } = await start(f);
    if (outcome === "timeout") [...f.timers.values()][0].fn();
    else
      f.heads[0].resolve(
        outcome === "success"
          ? manifest
          : outcome === "error"
            ? { ok: false, status: 500 }
            : { ok: true, text: async () => "<html>not a manifest</html>" }
      );
    await flush();
    assert.equal(result.settled, true);
    const status =
      outcome === "success"
        ? "healthy"
        : outcome === "timeout"
          ? "timeout"
          : "offline";
    assert.equal(result.value.status, status);
    assert.equal(cached(v).status, status);
    assert.equal(old.badges[0].dataset.urlHealthState, status);
    assert.equal(f.timers.size, 0);
    assert.equal(f.heads[0].aborted, outcome === "timeout" ? 1 : 0);
  });
}
test("HLS disposal during HEAD handoff prevents manifest GET", async (t) => {
  const f = fixture(t);
  const v = f.video("handoff"),
    old = f.feed([v]);
  old.observer.show();
  old.dispose();
  await flush();
  const result = tracking(f.promises[0]);
  await flush();
  assert.equal(result.settled, true);
  assert.equal(result.value, null);
  assert.equal(f.heads.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(cached(v), null);
});
test("HLS native preference keeps cancellable media path", async (t) => {
  const f = fixture(t);
  f.dom.window.HTMLMediaElement.prototype.canPlayType = () => "probably";
  const v = f.video("native"),
    old = f.feed([v]);
  old.observer.show();
  await flush();
  assert.equal(f.heads.length, 0);
  assert.equal(f.media.length, 1);
  assert.equal(f.controller.activeVideoProbes, 1);
  old.dispose();
  await flush();
  const result = tracking(f.promises[0]);
  await flush();
  assert.equal(result.settled, true);
  assert.equal(result.value, null);
  assert.equal(f.controller.activeVideoProbes, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.resources.size, 0);
  assert.equal(cached(v), null);
});
for (const preCancelled of [false, true])
  test(`manifest helper skips cancelled lifecycle before start ${preCancelled}`, async (t) => {
    const f = fixture(t);
    const lifecycle = {
      owners: new Set(preCancelled ? [{}] : []),
      cancelled: preCancelled
    };
    const result = tracking(
      probeHlsManifest(f.video("prestart").url, 5000, lifecycle)
    );
    await flush();
    assert.equal(
      result.settled,
      true,
      "pre-cancelled helper settles without IO"
    );
    assert.equal(result.value, "cancelled");
    assert.equal(lifecycle.cancelled, true);
    assert.equal(f.heads.length, 0);
    assert.equal(f.timers.size, 0);
  });
test("manifest helper clears its hook exactly once on cancellation", async (t) => {
  const f = fixture(t, { ignoreAbort: true });
  const lifecycle = { owners: new Set([{}]) };
  const promise = probeHlsManifest(f.video("hook").url, 5000, lifecycle);
  const cancel = lifecycle.cancelActive;
  const timer = [...f.timers.keys()][0];
  cancel();
  cancel();
  assert.equal(lifecycle.cancelled, true);
  const result = tracking(promise);
  await flush();
  assert.equal(
    result.settled,
    true,
    "cancelled helper settles without cooperative IO"
  );
  assert.equal(result.value, "cancelled");
  assert.equal(lifecycle.cancelActive, null);
  assert.equal(f.heads[0].aborted, 1);
  assert.equal(f.clears.filter((x) => x === timer).length, 1);
  assert.equal(f.timers.size, 0);
});
test("manifest helper finalizer preserves a successor cancellation hook", async (t) => {
  const f = fixture(t);
  const lifecycle = { owners: new Set([{}]) };
  const promise = probeHlsManifest(f.video("successor").url, 5000, lifecycle);
  const successor = () => {};
  lifecycle.cancelActive = successor;
  f.heads[0].resolve(manifest);
  assert.equal(await promise, "ok");
  assert.equal(lifecycle.cancelActive, successor);
  assert.equal(f.timers.size, 0);
});

test("HLS cancellation during native-support check prevents manifest start", async (t) => {
  const f = fixture(t);
  const v = f.video("support-handoff"),
    old = f.feed([v]);
  f.dom.window.HTMLMediaElement.prototype.canPlayType = () => {
    old.dispose();
    return "";
  };
  old.observer.show();
  await flush();
  const result = tracking(f.promises[0]);
  await flush();
  assert.equal(result.settled, true);
  assert.equal(result.value, null);
  assert.equal(f.heads.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(cached(v), null);
});
