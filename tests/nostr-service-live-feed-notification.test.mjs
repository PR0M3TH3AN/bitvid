import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { NostrService } from "../js/services/nostrService.js";
import {
  getVideosMap,
  setVideosMap,
  getVideoSubscription,
  setVideoSubscription,
} from "../js/state/appState.js";

const storageKey = "bitvid:filtered-videos:v1";
const video = (id, created_at, extra = {}) => ({
  id,
  created_at,
  pubkey: "a".repeat(64),
  title: id,
  url: "https://example.invalid/video.mp4",
  ...extra,
});
const ids = (videos) => videos.map((entry) => entry.id);

function fixture(t, { cached = [], persisted = [] } = {}) {
  const previousMap = getVideosMap();
  const previousSubscription = getVideoSubscription();
  const previousStorage = window.localStorage.getItem(storageKey);
  setVideosMap(new Map());
  setVideoSubscription(null);
  window.localStorage.setItem(storageKey, JSON.stringify(persisted));
  const service = new NostrService();
  service.moderationService = null;
  const events = [];
  const subscriptions = [];
  const unsubscribe = service.on("videos:updated", (detail) => {
    events.push({ ...detail, videos: detail.videos.slice() });
  });
  let receive;
  let networkAttempts = 0;
  const globals = ["fetch", "WebSocket"].map((key) => [
    key, Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  globalThis.fetch = () => {
    networkAttempts++;
    throw new Error("Unexpected live-feed network IO");
  };
  globalThis.WebSocket = class {
    constructor() {
      networkAttempts++;
      throw new Error("Unexpected live-feed socket");
    }
  };
  t.after(() => {
    service.clearVideoSubscription();
    unsubscribe();
    setVideosMap(previousMap);
    setVideoSubscription(previousSubscription);
    if (previousStorage === null) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, previousStorage);
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    assert.equal(networkAttempts, 0);
    assert.ok(subscriptions.every((entry) => entry.closed));
  });
  service.nostrClient = {
    pubkey: null,
    getActiveVideos: () => cached,
    getLatestCachedCreatedAt: () => cached[0]?.created_at || 0,
    clampVideoRequestLimit: (limit) => limit,
    subscribeVideos(callback, options) {
      receive = callback;
      const subscription = { closed: false, unsub() { this.closed = true; } };
      subscriptions.push(subscription);
      return subscription;
    },
  };
  service.accessControl = {
    isHydrated: () => true,
    ensureReady: async () => {},
    canAccess: (entry) => entry.denied !== true,
  };
  return {
    service,
    events,
    subscriptions,
    currentReceiver: () => receive,
    receive: (updates) => receive(updates),
    persisted: () => JSON.parse(window.localStorage.getItem(storageKey)),
  };
}

test("cold feed consumer receives full ordered eligible snapshots after live arrivals", async (t) => {
  const f = fixture(t);
  const notifications = [];
  const initial = await f.service.loadVideos({
    blacklistedEventIds: new Set(["blocked-event"]),
    isAuthorBlocked: (pubkey) => pubkey === "b".repeat(64),
    onVideos: (videos, detail) => notifications.push({ ids: ids(videos), ...detail }),
  });
  assert.deepEqual(initial, []);
  assert.deepEqual(notifications, [{ ids: [], reason: "cache" }]);
  f.receive([
    video("older", 10), video("newer", 30),
    video("private", 40, { isPrivate: true }),
    video("denied", 50, { denied: true }),
    video("blocked-event", 60),
    video("blocked-author", 70, { pubkey: "b".repeat(64) }),
  ]);
  f.receive([video("middle", 20)]);
  assert.deepEqual(ids(Array.from(f.service.getVideosMap().values())), ["older", "newer", "middle"]);
  assert.deepEqual(ids(f.persisted()), ["newer", "middle", "older"]);
  assert.deepEqual(notifications, [
    { ids: [], reason: "cache" },
    { ids: ["newer", "older"], reason: "subscription" },
    { ids: ["newer", "middle", "older"], reason: "subscription" },
  ]);
  assert.deepEqual(f.events.map((entry) => ids(entry.videos)), notifications.map((entry) => entry.ids));
});

test("a reused live subscription notifies only the latest feed consumer", async (t) => {
  const f = fixture(t);
  const first = [];
  const latest = [];
  await f.service.loadVideos({ onVideos: (videos, detail) => first.push({ ids: ids(videos), ...detail }) });
  await f.service.loadVideos({ onVideos: (videos, detail) => latest.push({ ids: ids(videos), ...detail }) });
  f.receive([video("live", 10)]);
  assert.equal(f.subscriptions.length, 1, "feed switch reuses the live relay subscription");
  assert.deepEqual(first, [{ ids: [], reason: "cache" }]);
  assert.deepEqual(latest, [{ ids: [], reason: "cache" }, { ids: ["live"], reason: "subscription" }]);
  await f.service.loadVideos();
  const beforeDetach = latest.length;
  f.receive([video("event-only", 20)]);
  assert.equal(latest.length, beforeDetach, "an event-only load detaches the prior feed consumer");
  assert.deepEqual(ids(f.events.at(-1).videos), ["event-only", "live"]);
});

test("force-fetch and clear invalidate late callbacks from replaced subscriptions", async (t) => {
  const f = fixture(t);
  const first = [];
  const current = [];
  await f.service.loadVideos({ onVideos: (videos) => first.push(ids(videos)) });
  const obsolete = f.currentReceiver();
  await f.service.loadVideos({ forceFetch: true, onVideos: (videos) => current.push(ids(videos)) });
  assert.equal(f.subscriptions.length, 2);
  assert.equal(f.subscriptions[0].closed, true);
  obsolete([video("obsolete", 10)]);
  assert.equal(f.service.getVideosMap().has("obsolete"), false);
  assert.deepEqual(first, [[]]);
  f.receive([video("current", 20)]);
  assert.deepEqual(current, [[], ["current"]]);
  const afterClear = f.currentReceiver();
  f.service.clearVideoSubscription();
  const eventsBefore = f.events.length;
  afterClear([video("late-after-clear", 30)]);
  assert.equal(f.events.length, eventsBefore);
  assert.deepEqual(current, [[], ["current"]]);
  assert.deepEqual(ids(f.persisted()), ["current"]);
});

test("deletion-only and mixed live updates notify reduced and empty feed snapshots", async (t) => {
  const first = video("first", 10);
  const second = video("second", 20);
  const f = fixture(t, { cached: [second, first] });
  const notifications = [];
  await f.service.loadVideos({ onVideos: (videos, detail) => notifications.push({ ids: ids(videos), ...detail }) });
  const deletedFirst = { ...first, deleted: true };
  f.receive([deletedFirst]);
  assert.equal(f.service.getVideosMap().has("first"), false);
  assert.deepEqual(f.events.at(-1).deleted, [deletedFirst]);
  assert.deepEqual(ids(f.persisted()), ["second"]);
  const third = video("third", 30);
  const deletedSecond = { ...second, deleted: true };
  f.receive([deletedSecond, third]);
  assert.deepEqual(f.events.at(-1).deleted, [deletedSecond]);
  assert.deepEqual(ids(f.persisted()), ["third"]);
  f.receive([{ ...third, deleted: true }]);
  assert.equal(f.service.getVideosMap().size, 0);
  assert.deepEqual(f.persisted(), []);
  assert.deepEqual(notifications, [
    { ids: ["second", "first"], reason: "cache" },
    { ids: ["second"], reason: "subscription" },
    { ids: ["third"], reason: "subscription" },
    { ids: [], reason: "subscription" },
  ]);
});

test("throwing live consumer does not lose service events, persistence or later notifications", async (t) => {
  const f = fixture(t);
  const notifications = [];
  await f.service.loadVideos({ onVideos(videos, detail) {
    notifications.push({ ids: ids(videos), ...detail });
    if (detail.reason === "subscription" && videos.length === 1) throw new Error("consumer failed");
  } });
  assert.doesNotThrow(() => f.receive([video("first", 10)]));
  assert.deepEqual(ids(f.events.at(-1).videos), ["first"]);
  assert.deepEqual(ids(f.persisted()), ["first"]);
  f.receive([video("second", 20)]);
  assert.deepEqual(notifications.at(-1), { ids: ["second", "first"], reason: "subscription" });
  assert.deepEqual(ids(f.events.at(-1).videos), ["second", "first"]);
  assert.deepEqual(ids(f.persisted()), ["second", "first"]);
});

test("warm persistent feed keeps optimistic notification without an empty cache flash", async (t) => {
  const f = fixture(t, { persisted: [video("warm", 10)] });
  const notifications = [];
  const initial = await f.service.loadVideos({ onVideos: (videos, detail) => notifications.push({ ids: ids(videos), ...detail }) });
  assert.deepEqual(ids(initial), ["warm"]);
  assert.deepEqual(notifications, [{ ids: ["warm"], reason: "persistent-cache" }]);
  f.receive([video("new", 20)]);
  assert.deepEqual(notifications.at(-1), { ids: ["new", "warm"], reason: "subscription" });
  assert.deepEqual(ids(f.persisted()), ["new", "warm"]);
});

test("absent consumer and empty or ineligible updates preserve notification and cache contracts", async (t) => {
  const f = fixture(t);
  await f.service.loadVideos();
  f.receive(null);
  f.receive([]);
  f.receive([video("private", 10, { isPrivate: true }), video("denied", 20, { denied: true })]);
  assert.equal(f.events.length, 1);
  assert.equal(f.service.getVideosMap().size, 0);
  assert.deepEqual(f.persisted(), []);
  assert.doesNotThrow(() => f.receive([video("public", 30)]));
  assert.deepEqual(ids(f.events.at(-1).videos), ["public"]);
  assert.deepEqual(ids(f.persisted()), ["public"]);
});
