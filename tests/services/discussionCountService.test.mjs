import { describe, test, mock, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createUiDom } from "../ui/helpers/jsdom-test-helpers.mjs";
import DiscussionCountService from "../../js/services/discussionCountService.js";

describe("DiscussionCountService", () => {
  let dom;
  let document;
  let window;

  before(() => {
    dom = createUiDom();
    window = dom.window;
    document = dom.document;
  });

  after(() => {
    dom.cleanup();
  });

  test("initialization sets defaults", () => {
    const service = new DiscussionCountService();
    assert.equal(service.maxVideos, 24);
    assert.ok(service.logger);
    assert.equal(service.videoDiscussionCountCache.size, 0);
    assert.equal(service.inFlightDiscussionCounts.size, 0);
  });

  test("refreshCounts returns early if videos array is empty or invalid", () => {
    const service = new DiscussionCountService();
    // mock logger to ensure no warnings
    const logger = { warn: mock.fn() };
    service.logger = logger;

    service.refreshCounts([], {});
    service.refreshCounts(null, {});

    assert.equal(service.inFlightDiscussionCounts.size, 0);
    assert.equal(logger.warn.mock.callCount(), 0);
  });

  test("refreshCounts returns early if dependencies are missing", () => {
      const service = new DiscussionCountService();
      const video = { id: "video1" };

      // Missing nostrClient
      service.refreshCounts([video], { videoListRoot: document.createElement("div") });
      assert.equal(service.inFlightDiscussionCounts.size, 0);

      // Missing videoListRoot
      service.refreshCounts([video], { nostrClient: {} });
      assert.equal(service.inFlightDiscussionCounts.size, 0);
  });

  test("refreshCounts handles happy path (fetches and updates DOM)", async () => {
    const service = new DiscussionCountService();
    const video = { id: "video1", kind: 30078, pubkey: "pubkey1" };

    const root = document.createElement("div");
    const container = document.createElement("div");
    container.dataset.discussionCount = "video1";
    const valueEl = document.createElement("span");
    valueEl.dataset.discussionCountValue = "true";
    container.appendChild(valueEl);
    root.appendChild(container);

    const nostrClient = {
        pool: {},
        countEventsAcrossRelays: mock.fn(async () => ({
          total: 42,
          ok: true,
          perRelay: [{ ok: true }]
        }))
    };

    service.refreshCounts([video], { videoListRoot: root, nostrClient });

    // Wait for promise resolution (microtasks)
    await new Promise(resolve => process.nextTick(resolve));
    await new Promise(resolve => process.nextTick(resolve));

    assert.equal(nostrClient.countEventsAcrossRelays.mock.callCount(), 1);
    assert.equal(valueEl.textContent, "42");
    assert.equal(container.dataset.countState, "ready");
    assert.equal(service.videoDiscussionCountCache.get("video1"), 42);
  });

  test("refreshCounts uses cached count if available", async () => {
      const service = new DiscussionCountService();
      const video = { id: "video1" };
      service.videoDiscussionCountCache.set("video1", 100);

      const root = document.createElement("div");
      const container = document.createElement("div");
      container.dataset.discussionCount = "video1";
      const valueEl = document.createElement("span");
      valueEl.dataset.discussionCountValue = "true";
      container.appendChild(valueEl);
      root.appendChild(container);

      const nostrClient = {
          pool: {},
          countEventsAcrossRelays: mock.fn()
      };

      service.refreshCounts([video], { videoListRoot: root, nostrClient });

      assert.equal(nostrClient.countEventsAcrossRelays.mock.callCount(), 0);
      assert.equal(valueEl.textContent, "100");
  });

  test("refreshCounts handles API errors gracefully", async () => {
      const logger = { warn: mock.fn() };
      const service = new DiscussionCountService({ logger });
      const video = { id: "video1" };

      const root = document.createElement("div");
      const container = document.createElement("div");
      container.dataset.discussionCount = "video1";
      const valueEl = document.createElement("span");
      valueEl.dataset.discussionCountValue = "true";
      container.appendChild(valueEl);
      root.appendChild(container);

      const error = new Error("Network error");
      const nostrClient = {
          pool: {},
          countEventsAcrossRelays: mock.fn(async () => { throw error; })
      };

      service.refreshCounts([video], { videoListRoot: root, nostrClient });

      const requestPromise = service.inFlightDiscussionCounts.get("video1");
      await assert.rejects(requestPromise, error);

      assert.equal(logger.warn.mock.callCount(), 1);
      assert.equal(container.dataset.countState, "error");
      assert.equal(valueEl.textContent, "—");
  });

  test("refreshCounts handles partial results", async () => {
    const service = new DiscussionCountService();
    const video = { id: "video1" };

    const root = document.createElement("div");
    const container = document.createElement("div");
    container.dataset.discussionCount = "video1";
    const valueEl = document.createElement("span");
    valueEl.dataset.discussionCountValue = "true";
    container.appendChild(valueEl);
    root.appendChild(container);

    const nostrClient = {
        pool: {},
        countEventsAcrossRelays: mock.fn(async () => ({ total: 5, partial: true, ok: true, perRelay: [{ ok: true }] }))
    };

    service.refreshCounts([video], { videoListRoot: root, nostrClient });

    await new Promise(resolve => process.nextTick(resolve));
    await new Promise(resolve => process.nextTick(resolve));

    assert.equal(container.dataset.countState, "partial");
    assert.equal(valueEl.textContent, "5");
  });

  test("refreshCounts handles unsupported relays (empty perRelay)", async () => {
    const service = new DiscussionCountService();
    const video = { id: "video1" };

    const root = document.createElement("div");
    const container = document.createElement("div");
    container.dataset.discussionCount = "video1";
    const valueEl = document.createElement("span");
    valueEl.dataset.discussionCountValue = "true";
    container.appendChild(valueEl);
    root.appendChild(container);

    const nostrClient = {
        pool: {},
        countEventsAcrossRelays: mock.fn(async () => ({ total: 0, perRelay: [] }))
    };

    service.refreshCounts([video], { videoListRoot: root, nostrClient });

    await new Promise(resolve => process.nextTick(resolve));
    await new Promise(resolve => process.nextTick(resolve));

    assert.equal(container.dataset.countState, "unsupported");
    assert.equal(valueEl.textContent, "—");
  });
});
