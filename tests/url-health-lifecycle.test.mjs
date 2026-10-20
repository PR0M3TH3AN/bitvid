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
function fixture(t) {
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
    "requestAnimationFrame"
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
  const policy = getCardLivenessPolicy();
  setCardLivenessPolicy("show-pending");
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
  globalThis.fetch = async (source, options) => {
    heads.push({ source, options });
    return { ok: true, status: 200, type: "basic" };
  };
  dom.window.HTMLMediaElement.prototype.load = function () {
    if (this.getAttribute("src") && !media.includes(this)) media.push(this);
  };
  dom.window.HTMLMediaElement.prototype.pause = function () {};
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
    { container = document.createElement("section") } = {}
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
        controller.handleUrlHealthBadge({
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
    controller,
    media,
    heads,
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
async function saturated(f) {
  const videos = ["a", "b", "c", "queued"].map(f.video);
  const feed = f.feed(videos);
  feed.observer.show();
  await flush();
  assert.equal(f.media.length, 3);
  assert.equal(f.heads.length, 4);
  return { ...feed, videos };
}

test("last feed disposal settles queued URL work without an obsolete media start or negative cache", async (t) => {
  const f = fixture(t),
    old = await saturated(f),
    queuedPromise = f.promises[3];
  old.dispose();
  old.container.remove();
  await flush();
  f.done(f.media[0]);
  await flush();
  assert.equal(f.media.length, 3);
  assert.equal(await queuedPromise, null);
  assert.equal(
    cache.getCachedUrlHealth(old.videos[3].id, old.videos[3].url),
    null
  );
  assert.equal(
    cache.getInFlightUrlProbe(old.videos[3].id, old.videos[3].url, {
      confirmPlayable: true
    }),
    null
  );
  await f.finishAll();
  assert.equal(f.controller.activeVideoProbes, 0);
  assert.equal(f.warnings.length, 0);
});

test("a queued shared URL survives disposal of one owner and updates only the live badge", async (t) => {
  const f = fixture(t),
    old = await saturated(f),
    live = f.feed([old.videos[3]]);
  live.observer.show();
  await flush();
  assert.equal(f.promises.length, 4);
  assert.equal(f.heads.length, 4);
  old.dispose(); // Keep DOM connected: stale badge guard must not rely on isConnected.
  f.done(f.media[0]);
  await flush();
  assert.equal(f.media.length, 4);
  f.done(f.media[3]);
  await flush();
  assert.equal(live.badges[0].dataset.urlHealthState, "healthy");
  assert.equal(old.badges[3].dataset.urlHealthState, "checking");
});

test("disposing the final shared owner cancels queued work", async (t) => {
  const f = fixture(t),
    old = await saturated(f),
    live = f.feed([old.videos[3]]);
  live.observer.show();
  await flush();
  old.dispose();
  live.dispose();
  await flush();
  f.done(f.media[0]);
  await flush();
  assert.equal(f.media.length, 3);
  assert.equal(await f.promises[3], null);
});

test("same source can re-request immediately after cancellation without old settlement deleting its inflight record", async (t) => {
  const f = fixture(t),
    old = await saturated(f),
    v = old.videos[3];
  old.dispose();
  const live = f.feed([v]);
  live.observer.show(); // Deliberately before cancelled promise continuations.
  const replacement = f.promises[4];
  assert.ok(replacement);
  assert.notEqual(replacement, f.promises[3]);
  await flush();
  assert.equal(
    cache.getInFlightUrlProbe(v.id, v.url, { confirmPlayable: true }),
    replacement
  );
  assert.equal(cache.getCachedUrlHealth(v.id, v.url), null);
  f.done(f.media[0]);
  await flush();
  assert.equal(f.media.length, 4);
  f.done(f.media[3]);
  await flush();
  assert.equal(live.badges[0].dataset.urlHealthState, "healthy");
});

test("cancelled queued primary does not fall through to a mirror or update a connected disposed badge", async (t) => {
  const f = fixture(t),
    busy = f.feed(["a", "b", "c"].map(f.video));
  busy.observer.show();
  await flush();
  const v = f.video("mirrored");
  v.sources = [{ url: "https://mirror.invalid/alternate.mp4" }];
  const old = f.feed([v]);
  old.observer.show();
  await flush();
  old.dispose();
  await flush();
  assert.equal(f.heads.length, 4);
  assert.equal(await f.promises[3], null);
  assert.equal(old.badges[0].dataset.urlHealthState, "checking");
  await f.finishAll();
  assert.equal(f.media.length, 3);
  assert.equal(f.heads.length, 4);
});

test("disposal blocks queued eager microtasks and late observer callbacks, including after container reuse", async (t) => {
  const f = fixture(t);
  setCardLivenessPolicy("hide-all");
  const old = f.feed([f.video("old")]);
  old.dispose();
  const live = f.feed([f.video("new")], { container: old.container });
  old.dispose();
  old.observer.show();
  await flush();
  assert.deepEqual(f.checks, [live.videos[0].id]);
  assert.equal(f.heads.length, 1);
  assert.equal(f.heads[0].source, live.videos[0].url);
  assert.equal(f.media.length, 1);
  f.done(f.media[0]);
  await flush();
  assert.equal(live.badges[0].dataset.urlHealthState, "healthy");
});

test("active media retain prior result/cache behavior while disposed connected badges stay unchanged", async (t) => {
  const f = fixture(t),
    v = f.video("active"),
    old = f.feed([v]);
  old.observer.show();
  await flush();
  old.dispose();
  assert.equal(f.media[0].src, v.url);
  f.done(f.media[0]);
  await flush();
  assert.equal(cache.getCachedUrlHealth(v.id, v.url).status, "healthy");
  assert.equal(old.badges[0].dataset.urlHealthState, "checking");
  const live = f.feed([v]);
  live.observer.show();
  await flush();
  assert.equal(live.badges[0].dataset.urlHealthState, "healthy");
  assert.equal(f.heads.length, 1);
});

test("hidden URL-only card probes eagerly and reveals after healthy media confirmation", async (t) => {
  const f = fixture(t);
  setCardLivenessPolicy("hide-all");
  const live = f.feed([f.video("hidden")]);
  assert.equal(live.cards[0].hidden, true);
  await flush();
  assert.equal(f.heads.length, 1);
  assert.equal(f.media.length, 1);
  f.done(f.media[0]);
  await flush();
  assert.equal(live.cards[0].hidden, false);
  assert.equal(live.cards[0].dataset.sourceVisibility, "visible");
});

test("three-media FIFO limit holds while a freed slot and a newly visible card compete", async (t) => {
  const f = fixture(t),
    old = await saturated(f);
  const extra = f.feed([f.video("extra")]);
  f.done(f.media[0]);
  extra.observer.show();
  await flush();
  assert.equal(f.media.length, 4);
  assert.equal(f.media[3].src, old.videos[3].url);
  assert.equal(f.controller.activeVideoProbes, 3);
  f.done(f.media[1]);
  await flush();
  assert.equal(f.media.length, 5);
  assert.equal(f.media[4].src, extra.videos[0].url);
  assert.equal(f.controller.activeVideoProbes, 3);
});

test("live mirrors stay ordered and stop after first playable source", async (t) => {
  const f = fixture(t),
    v = f.video("primary");
  v.sources = [
    { url: "https://mirror.invalid/one.mp4" },
    { url: "https://mirror.invalid/two.mp4" }
  ];
  const live = f.feed([v]);
  live.observer.show();
  await flush();
  assert.equal(f.heads.length, 1);
  assert.equal(f.heads[0].source, v.url);
  f.done(f.media[0], "error");
  await flush();
  assert.equal(f.heads.length, 2);
  assert.equal(f.heads[1].source, v.sources[0].url);
  f.done(f.media[1]);
  await flush();
  assert.equal(f.heads.length, 2);
  assert.equal(live.badges[0].dataset.urlHealthState, "healthy");
});

test("legacy direct callback consumers without observer ownership still settle and paint", async (t) => {
  const f = fixture(t),
    v = f.video("legacy"),
    badge = document.createElement("span");
  document.body.append(badge);
  f.controller.handleUrlHealthBadge({ video: v, url: v.url, badgeEl: badge });
  await flush();
  f.done(f.media[0]);
  await flush();
  assert.equal(badge.dataset.urlHealthState, "healthy");
});

test("shared inflight ownership also survives a second controller using the same cache", async (t) => {
  const f = fixture(t),
    old = await saturated(f),
    v = old.videos[3];
  const controller = new UrlHealthController({
    state: cache,
    logger: { warn() {} }
  });
  // Preserve the production observer callback shape while selecting another controller.
  const container = document.createElement("section"),
    card = document.createElement("article"),
    badge = document.createElement("span");
  card.className = "card";
  card.dataset.videoId = v.id;
  card.dataset.urlHealthEventId = v.id;
  card.dataset.urlHealthUrl = encodeURIComponent(v.url);
  badge.dataset.urlHealthState = "checking";
  card.append(badge);
  container.append(card);
  document.body.append(container);
  const dispose = attachUrlHealthBadges(container, ({ badgeEl, url }) =>
    controller.handleUrlHealthBadge({ video: v, url, badgeEl })
  );
  t.after(dispose);
  // The fixture observer class records new observations on the returned object.
  controller.handleUrlHealthBadge({ video: v, url: v.url, badgeEl: badge });
  old.dispose();
  f.done(f.media[0]);
  await flush();
  assert.equal(f.media.length, 4);
  f.done(f.media[3]);
  await flush();
  assert.equal(badge.dataset.urlHealthState, "healthy");
  assert.equal(f.heads.length, 4);
});

test("active primary error after last-owner disposal starts no mirror HEAD and permits a fresh request", async (t) => {
  const f = fixture(t),
    v = f.video("disposed-active-mirror");
  v.sources = [{ url: "https://mirror.invalid/obsolete.mp4" }];
  const old = f.feed([v]);
  old.observer.show();
  await flush();
  assert.equal(f.heads.length, 1);
  assert.equal(f.media.length, 1);
  old.dispose();
  f.done(f.media[0], "error");
  await flush();
  assert.equal(
    f.heads.length,
    1,
    "disposed chain must not start a mirror HEAD"
  );
  assert.equal(await f.promises[0], null);
  assert.equal(cache.getCachedUrlHealth(v.id, v.url), null);
  assert.equal(f.controller.activeVideoProbes, 0);
  assert.equal(f.media[0].getAttribute("src"), null);
  assert.equal(old.badges[0].dataset.urlHealthState, "checking");
  const fresh = f.feed([v]);
  fresh.observer.show();
  await flush();
  assert.equal(f.heads.length, 2);
  assert.equal(f.media.length, 2);
  f.done(f.media[1]);
  await flush();
  assert.equal(fresh.badges[0].dataset.urlHealthState, "healthy");
  assert.equal(cache.getCachedUrlHealth(v.id, v.url).status, "healthy");
});

for (const timing of ["shared", "rejoin"]) {
  test(`active primary error preserves ordered mirror for a ${timing} live owner`, async (t) => {
    const f = fixture(t),
      v = f.video(`active-${timing}`);
    v.sources = [
      { url: "https://mirror.invalid/live-first.mp4" },
      { url: "https://mirror.invalid/unused-second.mp4" }
    ];
    const old = f.feed([v]);
    old.observer.show();
    await flush();
    if (timing === "rejoin") old.dispose();
    const live = f.feed([v]);
    live.observer.show();
    await flush();
    if (timing === "shared") old.dispose();
    assert.equal(f.heads.length, 1);
    assert.equal(f.promises.length, 1);
    f.done(f.media[0], "error");
    await flush();
    assert.equal(f.heads.length, 2);
    assert.equal(f.heads[1].source, v.sources[0].url);
    assert.equal(f.media.length, 2);
    f.done(f.media[1]);
    await flush();
    assert.equal(f.heads.length, 2, "healthy first mirror must stop fallback");
    assert.equal(live.badges[0].dataset.urlHealthState, "healthy");
    assert.equal(old.badges[0].dataset.urlHealthState, "checking");
    assert.equal(f.controller.activeVideoProbes, 0);
    const cached = f.feed([v]);
    cached.observer.show();
    await flush();
    assert.equal(f.heads.length, 2);
    assert.equal(cached.badges[0].dataset.urlHealthState, "healthy");
  });
}

test("active first mirror error after disposal does not start the next mirror", async (t) => {
  const f = fixture(t),
    v = f.video("later-mirror");
  v.sources = [
    { url: "https://mirror.invalid/first.mp4" },
    { url: "https://mirror.invalid/obsolete-second.mp4" }
  ];
  const old = f.feed([v]);
  old.observer.show();
  await flush();
  f.done(f.media[0], "error");
  await flush();
  assert.equal(f.heads.length, 2);
  old.dispose();
  f.done(f.media[1], "error");
  await flush();
  assert.equal(f.heads.length, 2);
  assert.equal(f.media.length, 2);
  assert.equal(await f.promises[0], null);
  assert.equal(cache.getCachedUrlHealth(v.id, v.url), null);
  assert.equal(f.controller.activeVideoProbes, 0);
  assert.equal(old.badges[0].dataset.urlHealthState, "checking");
});

test("disposed active media timeout releases its slot without retry resources and later requests remain playable", async (t) => {
  const f = fixture(t),
    v = f.video("active-timeout");
  f.controller.constants = {
    URL_PROBE_TIMEOUT_MS: cache.URL_PROBE_TIMEOUT_MS,
    urlHealthConstants: cache.urlHealthConstants
  };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const old = f.feed([v]);
  old.observer.show();
  await flush();
  old.dispose();
  t.mock.timers.tick(cache.URL_PROBE_TIMEOUT_MS);
  await flush();
  assert.equal(f.heads.length, 1);
  assert.equal(f.media.length, 1);
  assert.equal(f.controller.activeVideoProbes, 0);
  assert.equal(f.media[0].getAttribute("src"), null);
  assert.equal(await f.promises[0], null);
  assert.equal(cache.getCachedUrlHealth(v.id, v.url), null);
  assert.equal(old.badges[0].dataset.urlHealthState, "checking");
  const fresh = f.feed([v]);
  fresh.observer.show();
  await flush();
  assert.equal(f.heads.length, 2);
  assert.equal(f.media.length, 2);
  f.done(f.media[1]);
  await flush();
  assert.equal(fresh.badges[0].dataset.urlHealthState, "healthy");
  assert.equal(f.controller.activeVideoProbes, 0);
});

test("completed active failure without another candidate preserves its existing offline cache result", async (t) => {
  const f = fixture(t),
    v = f.video("final-active-failure"),
    old = f.feed([v]);
  old.observer.show();
  await flush();
  old.dispose();
  f.done(f.media[0], "error");
  await flush();
  assert.equal(f.heads.length, 1);
  assert.equal(f.controller.activeVideoProbes, 0);
  assert.equal(cache.getCachedUrlHealth(v.id, v.url).status, "offline");
  assert.equal(old.badges[0].dataset.urlHealthState, "checking");
});
