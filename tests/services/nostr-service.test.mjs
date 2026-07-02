import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import nostrService from "../../js/services/nostrService.js";

describe("NostrService", () => {
  let mockClient;

  beforeEach(() => {
    // Reset state
    nostrService.videosMap = new Map();
    nostrService.dmMessages = [];

    // Mock the internal nostrClient
    mockClient = {
      relays: ["wss://relay.example.com"],
      pool: {
        list: mock.fn(async () => []),
      },
      clampVideoRequestLimit: (l) => l || 100,
      getActiveVideos: mock.fn(() => []),
      getLatestCachedCreatedAt: mock.fn(() => 1000),
      subscribeVideos: mock.fn(() => ({ unsub: mock.fn() })),
      activeMap: new Map(),
      allEvents: new Map(),
      rawEvents: new Map(),
      applyRootCreatedAt: mock.fn(),
      populateNip71MetadataForVideos: mock.fn(async () => {}),
      applyTombstoneGuard: mock.fn(),
      recordTombstone: mock.fn(),
    };

    nostrService.nostrClient = mockClient;

    // Mock accessControl
    nostrService.accessControl = {
      waitForReady: mock.fn(async () => {}),
      canAccess: mock.fn(() => true),
    };
  });

  afterEach(() => {
    mock.reset();
  });

  describe("loadVideos", () => {
    it("should load cached videos and start subscription", async () => {
      const mockVideos = [{ id: "v1", title: "Cached Video" }];
      mockClient.getActiveVideos.mock.mockImplementation(() => mockVideos);

      const videos = await nostrService.loadVideos();

      assert.equal(videos.length, 1);
      assert.equal(videos[0].id, "v1");
      assert.equal(mockClient.subscribeVideos.mock.callCount(), 1);
    });
  });

  describe("fetchVideosByAuthors", () => {
    it("should fetch videos from relays for specific authors", async () => {
      const authors = ["pubkey1"];
      const mockEvent = {
        id: "evt1",
        kind: 30078,
        pubkey: "pubkey1",
        created_at: 2000,
        content: JSON.stringify({
          title: "Author Video",
          videoRootId: "root1",
          url: "https://example.com/v.mp4"
        }),
        tags: [["d", "d1"], ["t", "video"]]
      };

      mockClient.pool.list.mock.mockImplementation(async () => [mockEvent]);

      const videos = await nostrService.fetchVideosByAuthors(authors);

      assert.equal(videos.length, 1);
      assert.equal(videos[0].title, "Author Video");
      assert.equal(mockClient.pool.list.mock.callCount(), 1);
    });
  });

  // Account switch must not leave the previous account's DMs on screen: the DM
  // store lives here (nostrService), so a switch clears the in-memory store. With
  // keepSnapshot it preserves each account's persisted cache for fast switch-back.
  describe("clearDirectMessages", () => {
    it("empties the in-memory DM store and resets the active actor", () => {
      nostrService.dmMessages = [{ id: "m1" }, { id: "m2" }];
      nostrService.dmMessageIndex = new Map([["m1", 0], ["m2", 1]]);
      nostrService.dmActorPubkey = "a".repeat(64);

      const events = [];
      const originalEmit = nostrService.emit;
      nostrService.emit = (name) => events.push(name);
      try {
        nostrService.clearDirectMessages({ emit: true, keepSnapshot: true });
      } finally {
        nostrService.emit = originalEmit;
      }

      assert.deepEqual(nostrService.dmMessages, []);
      assert.equal(nostrService.dmMessageIndex.size, 0);
      assert.equal(nostrService.dmActorPubkey, null);
      assert.ok(events.includes("directMessages:cleared"));
      assert.ok(events.includes("directMessages:updated"));
    });

    it("clears the in-memory store in both keepSnapshot modes (logout parity)", () => {
      nostrService.dmMessages = [{ id: "m1" }];
      nostrService.dmMessageIndex = new Map([["m1", 0]]);
      nostrService.clearDirectMessages({ emit: false, keepSnapshot: false });
      assert.deepEqual(nostrService.dmMessages, []);
      assert.equal(nostrService.dmMessageIndex.size, 0);
    });
  });
});
