// Service-worker image cache (TODO #55, part 2): cross-origin images
// (thumbnails / avatars / banners) are served stale-while-revalidate from the
// Cache API so revisits are instant even when the host sends no cache headers.
// These tests load the REAL sw.min.js in a VM sandbox with stubbed SW globals and
// drive its actual fetch/activate handlers.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-sw-image-cache
//       given: "the real sw.min.js evaluated with stubbed self/caches/fetch"
//       when: "fetch events fire for cross-origin images / same-origin images / other URLs, and activate fires"
//       then: "cross-origin images are cached + served stale-while-revalidate; others untouched; activate preserves ONLY the current image cache"
//   observable_outcomes:
//     - "cold fetch -> network response returned AND stored in bitvid-images-v1"
//     - "warm fetch -> cached body served; background refresh re-fetches"
//     - "network failure with a cached copy -> cached copy served"
//     - "same-origin image + non-image URL -> respondWith never called"
//     - "activate wipes other caches (incl. old image-cache versions) but keeps bitvid-images-v1"
//   determinism_controls:
//     - "vm sandbox; Map-backed CacheStorage stub; controllable fetch stub; no network"
//   anti_cheat_rationale:
//     prevents: ["testing a re-implementation instead of the shipped file", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const swSource = await readFile(new URL("../sw.min.js", import.meta.url), "utf8");

function makeCacheStorage() {
  const stores = new Map(); // name -> Map(url -> response)
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) {
        stores.set(name, new Map());
      }
      const store = stores.get(name);
      return {
        async match(request) {
          return store.get(request.url) || undefined;
        },
        async put(request, response) {
          store.set(request.url, response);
        },
        async keys() {
          return Array.from(store.keys()).map((url) => ({ url }));
        },
        async delete(request) {
          return store.delete(request.url);
        },
      };
    },
    async keys() {
      return Array.from(stores.keys());
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
}

function makeResponse(body, { ok = true, type = "basic" } = {}) {
  return {
    body,
    ok,
    type,
    clone() {
      return makeResponse(body, { ok, type });
    },
  };
}

function loadSw({ fetchImpl } = {}) {
  const listeners = new Map();
  const cacheStorage = makeCacheStorage();
  const sandbox = {
    location: { origin: "https://bitvid.network" },
    registration: { scope: "/" },
    addEventListener: (type, handler) => listeners.set(type, handler),
    skipWaiting: async () => {},
    clients: { matchAll: async () => [], claim: async () => {} },
    caches: cacheStorage,
    fetch: fetchImpl || (async () => makeResponse("net")),
    URL,
    Response,
    Headers,
    ReadableStream,
    MessageChannel,
    Promise,
    Object,
    Array,
    setTimeout,
    clearTimeout,
    console,
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(swSource, sandbox);
  return { listeners, cacheStorage, sandbox };
}

function makeFetchEvent(url, { destination = "image", method = "GET" } = {}) {
  const event = {
    request: { url, destination, method },
    response: null,
    pending: [],
    respondWith(promise) {
      this.response = Promise.resolve(promise);
    },
    waitUntil(promise) {
      this.pending.push(Promise.resolve(promise).catch(() => {}));
    },
  };
  return event;
}

const IMG = "https://cdn.example.com/thumb.jpg";

test("cold cross-origin image: network response served AND cached in bitvid-images-v1", async () => {
  let fetches = 0;
  const { listeners, cacheStorage } = loadSw({
    fetchImpl: async () => {
      fetches += 1;
      return makeResponse(`net-${fetches}`);
    },
  });

  const event = makeFetchEvent(IMG);
  listeners.get("fetch")(event);
  const response = await event.response;
  assert.equal(response.body, "net-1", "network response returned to the page");

  await Promise.all(event.pending);
  const store = cacheStorage.stores.get("bitvid-images-v1");
  assert.ok(store?.has(IMG), "response was stored in the image cache");
});

test("warm cross-origin image: cached copy served, background refresh still fetches", async () => {
  let fetches = 0;
  const { listeners, cacheStorage } = loadSw({
    fetchImpl: async () => {
      fetches += 1;
      return makeResponse(`net-${fetches}`);
    },
  });

  // Warm the cache.
  const first = makeFetchEvent(IMG);
  listeners.get("fetch")(first);
  await first.response;
  await Promise.all(first.pending);
  assert.equal(fetches, 1);

  // Second visit: served from cache; the revalidation fetch still happens.
  const second = makeFetchEvent(IMG);
  listeners.get("fetch")(second);
  const response = await second.response;
  assert.equal(response.body, "net-1", "cached copy served immediately");
  await Promise.all(second.pending);
  assert.equal(fetches, 2, "background refresh re-fetched the image");
  assert.equal(
    cacheStorage.stores.get("bitvid-images-v1").get(IMG).body,
    "net-2",
    "cache updated by the background refresh (self-heals changed images)",
  );
});

test("network failure with a cached copy: cached copy served (offline-friendly)", async () => {
  let shouldFail = false;
  const { listeners } = loadSw({
    fetchImpl: async () => {
      if (shouldFail) {
        throw new Error("offline");
      }
      return makeResponse("net-1");
    },
  });

  const warm = makeFetchEvent(IMG);
  listeners.get("fetch")(warm);
  await warm.response;
  await Promise.all(warm.pending);

  shouldFail = true;
  const offline = makeFetchEvent(IMG);
  listeners.get("fetch")(offline);
  const response = await offline.response;
  assert.equal(response.body, "net-1", "cached copy served when the network fails");
  await Promise.all(offline.pending);
});

test("same-origin images and non-image requests are NOT intercepted", () => {
  const { listeners } = loadSw();

  const sameOrigin = makeFetchEvent("https://bitvid.network/assets/logo.png");
  listeners.get("fetch")(sameOrigin);
  assert.equal(sameOrigin.response, null, "same-origin image left to the HTTP cache");

  const nonImage = makeFetchEvent("https://cdn.example.com/data.json", {
    destination: "fetch",
  });
  listeners.get("fetch")(nonImage);
  assert.equal(nonImage.response, null, "non-image request untouched");

  const post = makeFetchEvent(IMG, { method: "POST" });
  listeners.get("fetch")(post);
  assert.equal(post.response, null, "non-GET untouched");
});

test("activate wipes other caches but preserves the CURRENT image cache", async () => {
  const { listeners, cacheStorage } = loadSw();

  // Seed: the live image cache, an old image-cache version, and a stray cache.
  (await cacheStorage.open("bitvid-images-v1")).put({ url: IMG }, makeResponse("keep"));
  await cacheStorage.open("bitvid-images-v0");
  await cacheStorage.open("some-old-cache");

  const event = { pending: [], waitUntil(p) { this.pending.push(p); } };
  listeners.get("activate")(event);
  await Promise.all(event.pending);

  const names = await cacheStorage.keys();
  assert.deepEqual(names, ["bitvid-images-v1"], "only the current image cache survives");
  assert.equal(
    cacheStorage.stores.get("bitvid-images-v1").get(IMG).body,
    "keep",
    "cached thumbnails survive an SW update",
  );
});

test("the network fetch starts immediately — never serialized behind cache I/O", async () => {
  // Regression: the first version awaited caches.open + cache.match BEFORE
  // starting the download, so a cold thumbnail burst loaded visibly slower than
  // with no SW at all ("Recently Added fetching slowly").
  let fetchStarted = false;
  let releaseMatch;
  const matchGate = new Promise((resolve) => {
    releaseMatch = resolve;
  });

  const { listeners, sandbox } = loadSw({
    fetchImpl: async () => {
      fetchStarted = true;
      return makeResponse("net-1");
    },
  });
  // Make cache.match hang until released — the download must not wait for it.
  const realOpen = sandbox.caches.open.bind(sandbox.caches);
  sandbox.caches.open = async (name) => {
    const cache = await realOpen(name);
    return {
      ...cache,
      async match(request) {
        await matchGate;
        return cache.match(request);
      },
    };
  };

  const event = makeFetchEvent(IMG);
  listeners.get("fetch")(event);
  await Promise.resolve(); // let the handler take its first steps
  assert.equal(fetchStarted, true, "download began while cache.match was still pending");

  releaseMatch();
  const response = await event.response;
  assert.equal(response.body, "net-1");
  await Promise.all(event.pending);
});

test("opaque (cross-origin no-cors) responses are cached; failed basic responses are not", async () => {
  let mode = "opaque";
  const { listeners, cacheStorage } = loadSw({
    fetchImpl: async () =>
      mode === "opaque"
        ? makeResponse("opaque-body", { ok: false, type: "opaque" })
        : makeResponse("error-body", { ok: false, type: "basic" }),
  });

  const opaqueEvent = makeFetchEvent(IMG);
  listeners.get("fetch")(opaqueEvent);
  await opaqueEvent.response;
  await Promise.all(opaqueEvent.pending);
  assert.ok(
    cacheStorage.stores.get("bitvid-images-v1")?.has(IMG),
    "opaque response cached (status unreadable by design)",
  );

  mode = "error";
  const errUrl = "https://cdn.example.com/broken.png";
  const errEvent = makeFetchEvent(errUrl);
  listeners.get("fetch")(errEvent);
  await errEvent.response;
  await Promise.all(errEvent.pending);
  assert.ok(
    !cacheStorage.stores.get("bitvid-images-v1").has(errUrl),
    "a non-ok basic response (404/500) is not cached",
  );
});
