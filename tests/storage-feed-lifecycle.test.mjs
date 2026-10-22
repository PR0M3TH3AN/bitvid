import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  tombstoneFixture,
  videoEvent,
  ids
} from "./test-helpers/storage-tombstone-fixture.mjs";
import * as feeds from "../js/feedEngine/index.js";
import { createFeedCoordinator } from "../js/app/feedCoordinator.js";
import { createPlaybackCoordinator } from "../js/app/playbackCoordinator.js";
import { VideoListView } from "../js/ui/views/VideoListView.js";
import { dedupeVideos } from "../js/utils/videoDeduper.js";
import * as timestamps from "../js/utils/videoTimestamps.js";
import { FEED_TYPES } from "../js/constants.js";
const logger = { log() {}, warn() {}, error() {} };
async function fixture(t, { failDelayed = false } = {}) {
  const f = tombstoneFixture(t);
  await f.load();
  await f.ingest(
    videoEvent("original", 100),
    videoEvent("unrelated", 110, { root: "other" })
  );
  const dom = new JSDOM(
    '<!doctype html><body><div id="videoList"></div></body>',
    { url: "http://fixture.invalid" }
  );
  const root = dom.window.document.getElementById("videoList");
  const previousHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = dom.window.HTMLElement;
  t.after(() => {
    if (previousHTMLElement === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = previousHTMLElement;
  });
  const history = { loadLatest: async () => [] };
  const methods = createFeedCoordinator({
    ...feeds,
    watchHistoryService: history,
    devLogger: logger,
    userLogger: logger,
    nostrClient: f.client
  });
  const playback = createPlaybackCoordinator({
    ...timestamps,
    devLogger: logger,
    userLogger: logger,
    nostrClient: f.client
  });
  let release, entered;
  const reached = new Promise((r) => (entered = r));
  const gate = new Promise((r) => (release = r));
  let hold = true;
  // Defer actual moderation-stage report-subscription IO, not a custom stage.
  f.service.moderationService = {
    async setActiveEventIds(activeIds) {
      if (hold && activeIds.has("original")) {
        hold = false;
        entered();
        await gate;
      }
    }
  };
  f.client.hydrateVideoHistory = async (video) => [
    { created_at: video.created_at, deleted: false }
  ];
  const effects = [];
  const app = {
    ...methods,
    nostrService: f.service,
    feedEngine: feeds.createFeedEngine(),
    videosMap: f.service.getVideosMap(),
    blacklistedEventIds: new Set(),
    buildRecentFeedRuntime: () => ({}),
    buildExploreFeedRuntime: () => ({}),
    buildForYouFeedRuntime: () => ({}),
    isAuthorBlocked: () => false,
    dedupeVideosByRoot: dedupeVideos,
    getKnownVideoPostedAt: playback.getKnownVideoPostedAt,
    resolveVideoPostedAt: playback.resolveVideoPostedAt,
    cacheVideoRootCreatedAt: playback.cacheVideoRootCreatedAt,
    decorateVideoModeration: (v) => v,
    decorateVideoCreatorIdentity: (v) => v,
    emitFeedImpressions(videos) {
      effects.push(ids(videos));
    },
    updateModalSimilarContent() {},
    checkRelayHealthWarning() {},
    mountVideoListView() {
      if (!this.videoListView) return null;
      return this.videoListView.mount(root);
    }
  };
  const makeView = () =>
    new VideoListView({
      document: dom.window.document,
      utils: {
        dedupeVideos,
        getKnownVideoPostedAt: (video) => app.getKnownVideoPostedAt(video)
      }
    });
  if (failDelayed) {
    const run = app.feedEngine.run.bind(app.feedEngine);
    let first = true;
    app.feedEngine.run = async (...args) => {
      const fail = first;
      first = false;
      const result = await run(...args);
      if (fail)
        throw new Error("controlled engine rejection after production stages");
      return result;
    };
  }
  app.videoListView = makeView();
  // View-count/zap subscription transport is disabled at its own UI adapter boundary.
  app.videoListView.syncViewCountSubscriptions = () => {};
  assert.ok(app.registerRecentFeed());
  assert.ok(app.registerExploreFeed());
  const renders = [];
  const originalRender = app.renderVideoList;
  app.renderVideoList = function (payload) {
    renders.push({
      active: this.feedTelemetryState?.activeFeed,
      reason: payload.metadata?.reason,
      ids: ids(payload.videos),
      deleted: payload.videos.filter((v) => v.deleted).map((v) => v.id)
    });
    return originalRender.call(this, payload);
  };
  const runs = [];
  const refresh = app.refreshFeed;
  app.refreshFeed = function (...args) {
    const p = refresh.apply(this, args);
    runs.push(p);
    return p;
  };
  t.after(() => {
    release();
    app.videoListView?.destroy();
    dom.window.close();
  });
  return {
    ...f,
    app,
    root,
    reached,
    release,
    runs,
    renders,
    makeView,
    history,
    effects,
    domIds: () =>
      Array.from(
        root.querySelectorAll('[data-component="video-card"]'),
        (node) => node.dataset.videoId
      ).sort()
  };
}
test("control: valid delayed registered recent pipeline renders live cards", async (t) => {
  const f = await fixture(t);
  const loading = f.app.loadFeedVideos("recent");
  await f.reached;
  f.release();
  await loading;
  assert.deepEqual(f.domIds(), ["original", "unrelated"]);
  assert.equal(f.app.isFeedActive("recent"), true);
});
test("registered recent pipeline must not restore deleted DOM card after a fresher subscription render", async (t) => {
  const f = await fixture(t);
  const loading = f.app.loadFeedVideos("recent");
  await f.reached;
  await f.ingest(videoEvent("delete", 200, { deleted: true }));
  await f.runs.at(-1);
  assert.deepEqual(f.domIds(), ["unrelated"]);
  f.release();
  await loading;
  assert.deepEqual(f.domIds(), ["unrelated"]);
});
test("registered recent result must not overwrite replacement Explore view after destroy/remount", async (t) => {
  const f = await fixture(t);
  const loading = f.app.loadFeedVideos("recent");
  await f.reached;
  await f.ingest(videoEvent("delete", 200, { deleted: true }));
  await f.runs.at(-1);
  f.app.videoListView.destroy();
  f.app.videoListView = f.makeView();
  f.app.videoListView.syncViewCountSubscriptions = () => {};
  await f.app.loadFeedVideos(FEED_TYPES.EXPLORE);
  assert.deepEqual(f.domIds(), ["unrelated"]);
  assert.equal(f.app.isFeedActive(FEED_TYPES.EXPLORE), true);
  f.release();
  await loading;
  assert.deepEqual(f.domIds(), ["unrelated"]);
  assert.equal(
    f.app.videoListView.state.feedMetadata.sortOrder,
    FEED_TYPES.EXPLORE
  );
});
test("control: fully disposed view is not remounted when delayed pipeline completes", async (t) => {
  const f = await fixture(t);
  const loading = f.app.loadFeedVideos("recent");
  await f.reached;
  const view = f.app.videoListView;
  view.destroy();
  f.app.videoListView = null;
  f.release();
  await loading;
  assert.equal(view.container, null);
  assert.equal(f.app.videoListView, null);
  assert.equal(f.renders.length, 0);
  assert.equal(f.effects.length, 0);
  assert.deepEqual(f.domIds(), []);
});

test("late old failure returns its fallback without painting over the newer success", async (t) => {
  const f = await fixture(t, { failDelayed: true });
  f.app.mountVideoListView();
  const old = f.app.refreshFeed("recent", {
    fallbackVideos: [f.app.videosMap.get("original")]
  });
  await f.reached;
  await f.ingest(videoEvent("delete", 200, { deleted: true }));
  await f.app.refreshFeed("recent", { reason: "newest" });
  const metadata = f.app.latestFeedMetadata;
  const count = f.effects.length;
  f.release();
  const result = await old;
  assert.equal(result.metadata.error, true);
  assert.deepEqual(ids(result.videos), ["original"]);
  assert.deepEqual(f.domIds(), ["unrelated"]);
  assert.equal(f.app.latestFeedMetadata, metadata);
  assert.equal(f.effects.length, count);
});
test("reverse completion order never paints the older result even while newest is pending", async (t) => {
  const f = await fixture(t);
  f.app.mountVideoListView();
  const old = f.app.refreshFeed("recent");
  await f.reached;
  let releaseNew, entered;
  const reached = new Promise((r) => (entered = r));
  const gate = new Promise((r) => (releaseNew = r));
  f.service.moderationService.setActiveEventIds = async () => {
    entered();
    await gate;
  };
  t.after(() => releaseNew());
  const newest = f.app.refreshFeed("recent", { reason: "newest" });
  await reached;
  f.release();
  const oldResult = await old;
  assert.deepEqual(ids(oldResult.videos), ["original", "unrelated"]);
  assert.equal(f.renders.length, 0);
  releaseNew();
  await newest;
  assert.equal(f.renders.length, 1);
  assert.equal(f.app.latestFeedMetadata.reason, "newest");
});
test("same feed remount preserves replacement metadata and suppresses old side effects", async (t) => {
  const f = await fixture(t);
  const old = f.app.loadFeedVideos("recent");
  await f.reached;
  f.app.videoListView.destroy();
  f.app.videoListView = f.makeView();
  f.app.videoListView.syncViewCountSubscriptions = () => {};
  await f.app.loadFeedVideos("recent");
  const metadata = f.app.latestFeedMetadata;
  const count = f.effects.length;
  f.release();
  await old;
  assert.equal(f.app.latestFeedMetadata, metadata);
  assert.equal(f.effects.length, count);
  assert.deepEqual(f.domIds(), ["original", "unrelated"]);
});
test("destroyed view still referenced by app cannot be remounted by completion", async (t) => {
  const f = await fixture(t);
  const old = f.app.loadFeedVideos("recent");
  await f.reached;
  const view = f.app.videoListView;
  view.destroy();
  f.release();
  await old;
  assert.equal(view.container, null);
  assert.equal(f.renders.length, 0);
  assert.equal(f.effects.length, 0);
});
test("new empty result remains empty after older populated result", async (t) => {
  const f = await fixture(t);
  const old = f.app.loadFeedVideos("recent");
  await f.reached;
  await f.ingest(
    videoEvent("delete", 200, { deleted: true }),
    videoEvent("delete-other", 210, { deleted: true, root: "other" })
  );
  await f.runs.at(-1);
  assert.deepEqual(f.domIds(), []);
  const count = f.effects.length;
  f.release();
  await old;
  assert.deepEqual(f.domIds(), []);
  assert.equal(f.effects.length, count);
});
test("current engine failure paints supplied live fallback and error metadata", async (t) => {
  const f = await fixture(t, { failDelayed: true });
  f.app.mountVideoListView();
  const current = f.app.refreshFeed("recent", {
    fallbackVideos: [f.app.videosMap.get("unrelated")]
  });
  await f.reached;
  f.release();
  const payload = await current;
  assert.equal(payload.metadata.error, true);
  assert.deepEqual(f.domIds(), ["unrelated"]);
  assert.equal(f.effects.length, 1);
});
test("current unavailable engine paints fallback", async (t) => {
  const f = await fixture(t);
  f.app.mountVideoListView();
  f.app.feedEngine = null;
  const result = await f.app.refreshFeed("recent", {
    fallbackVideos: [f.app.videosMap.get("unrelated")]
  });
  assert.equal(result.metadata.engine, "unavailable");
  assert.deepEqual(f.domIds(), ["unrelated"]);
  assert.equal(f.effects.length, 1);
});
test("obsolete awaited runtime cannot start engine or alter current telemetry", async (t) => {
  const f = await fixture(t);
  f.app.mountVideoListView();
  f.app.setFeedTelemetryContext(FEED_TYPES.FOR_YOU);
  let release, entered;
  const reached = new Promise((r) => (entered = r));
  const gate = new Promise((r) => (release = r));
  f.history.loadLatest = async () => {
    entered();
    await gate;
    return [];
  };
  t.after(() => release());
  const old = f.app.refreshFeed(FEED_TYPES.FOR_YOU, { fallbackVideos: [] });
  await reached;
  // A different feed becomes current before history IO completes.
  f.release();
  await f.app.loadFeedVideos(FEED_TYPES.EXPLORE);
  const metadata = f.app.latestFeedMetadata;
  const count = f.effects.length;
  release();
  const result = await old;
  assert.equal(result.metadata.engine, "superseded");
  assert.equal(f.app.latestFeedMetadata, metadata);
  assert.equal(f.effects.length, count);
  assert.equal(f.app.isFeedActive(FEED_TYPES.EXPLORE), true);
});

test("current awaited history runtime completes registered For You rendering and telemetry", async (t) => {
  const f = await fixture(t);
  assert.ok(f.app.registerForYouFeed());
  f.app.mountVideoListView();
  f.app.setFeedTelemetryContext(FEED_TYPES.FOR_YOU);
  let entered, release;
  const reached = new Promise((r) => (entered = r));
  const gate = new Promise((r) => (release = r));
  f.history.loadLatest = async () => {
    entered();
    await gate;
    return [];
  };
  t.after(() => release());
  const current = f.app.refreshFeed(FEED_TYPES.FOR_YOU);
  await reached;
  release();
  await f.reached;
  f.release();
  const result = await current;
  assert.deepEqual(ids(result.videos), ["original", "unrelated"]);
  assert.deepEqual(f.domIds(), ["original", "unrelated"]);
  assert.equal(result.metadata.preserveOrder, true);
});
for (const failDelayed of [false, true])
  test(`stale For You ${failDelayed ? "failure" : "success"} cannot update telemetry or impressions`, async (t) => {
    const f = await fixture(t, { failDelayed });
    assert.ok(f.app.registerForYouFeed());
    f.app.mountVideoListView();
    f.app.setFeedTelemetryContext(FEED_TYPES.FOR_YOU);
    const updates = [];
    f.app.updateFeedTelemetryMetadata = (...args) => updates.push(args);
    const old = f.app.refreshFeed(FEED_TYPES.FOR_YOU);
    await f.reached;
    f.app.videoListView.destroy();
    f.app.videoListView = f.makeView();
    f.app.videoListView.syncViewCountSubscriptions = () => {};
    await f.app.loadFeedVideos(FEED_TYPES.EXPLORE);
    const count = f.effects.length;
    const metadata = f.app.latestFeedMetadata;
    f.release();
    await old;
    assert.equal(updates.length, 0);
    assert.equal(f.effects.length, count);
    assert.equal(f.app.latestFeedMetadata, metadata);
  });
test("retained obsolete load callback cannot start refresh after a same-feed remount", async (t) => {
  const f = await fixture(t);
  const load = f.service.loadVideos.bind(f.service);
  const callbacks = [];
  f.service.loadVideos = (opts) => {
    callbacks.push(opts.onVideos);
    return load(opts);
  };
  const old = f.app.loadFeedVideos("recent");
  await f.reached;
  f.app.videoListView.destroy();
  f.app.videoListView = f.makeView();
  f.app.videoListView.syncViewCountSubscriptions = () => {};
  await f.app.loadFeedVideos("recent");
  const count = f.runs.length;
  const effects = f.effects.length;
  callbacks[0]([], { reason: "obsolete" });
  assert.equal(f.runs.length, count);
  assert.equal(f.effects.length, effects);
  f.release();
  await old;
});
