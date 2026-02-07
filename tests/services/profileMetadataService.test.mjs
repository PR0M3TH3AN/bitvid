import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  fetchProfileMetadataBatch,
  fetchProfileMetadata,
  ensureProfileMetadataSubscription
} from "../../js/services/profileMetadataService.js";

describe("profileMetadataService", () => {
  let mockNostr;
  let mockPool;
  let mockLogger;

  beforeEach(() => {
    mockPool = {
      list: mock.fn(async () => []),
      sub: mock.fn(() => ({
        on: mock.fn(),
        unsub: mock.fn(),
      })),
    };

    mockNostr = {
      pool: mockPool,
      relays: ["wss://relay.example.com"],
      readRelays: ["wss://read.example.com"],
    };

    mockLogger = {
      warn: mock.fn(),
      log: mock.fn(),
      debug: mock.fn(),
    };
  });

  describe("fetchProfileMetadataBatch", () => {
    it("should return empty map if no pubkeys provided", async () => {
      const results = await fetchProfileMetadataBatch({
        pubkeys: [],
        nostr: mockNostr,
        logger: mockLogger,
      });
      assert.equal(results.size, 0);
      assert.equal(mockPool.list.mock.callCount(), 0);
    });

    it("should fetch profiles for provided pubkeys", async () => {
      const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
      const mockEvent = {
        pubkey,
        created_at: 1000,
        content: JSON.stringify({ name: "Alice", about: "Tester" }),
      };

      mockPool.list.mock.mockImplementation(async () => [mockEvent]);

      const results = await fetchProfileMetadataBatch({
        pubkeys: [pubkey],
        nostr: mockNostr,
        logger: mockLogger,
      });

      assert.equal(results.size, 1);
      const profileData = results.get(pubkey);
      assert.ok(profileData);
      assert.equal(profileData.profile.name, "Alice");
      assert.equal(profileData.profile.about, "Tester");

      // Verify pool.list was called
      assert.equal(mockPool.list.mock.callCount(), 1); // Once per relay (mockNostr has 2, but logic merges? Wait, let's check logic)
      // Logic: resolveRelays prefers readRelays if available.
      // resolveRelays(relays, nostr)
      // if relays arg is passed, use it.
      // else if nostr.readRelays, use it.
      // else if nostr.relays, use it.

      // Here we didn't pass relays, so it should use readRelays ("wss://read.example.com")
      // So call count should be 1 (since 1 relay in readRelays)
      assert.equal(mockPool.list.mock.callCount(), 1);
      const callArgs = mockPool.list.mock.calls[0].arguments;
      assert.deepEqual(callArgs[0], ["wss://read.example.com"]);
      assert.deepEqual(callArgs[1], [{ kinds: [0], authors: [pubkey], limit: 1 }]);
    });

    it("should handle relay failures gracefully", async () => {
      const pubkey = "0000000000000000000000000000000000000000000000000000000000000002";
      mockPool.list.mock.mockImplementation(async () => {
        throw new Error("Relay error");
      });

      const results = await fetchProfileMetadataBatch({
        pubkeys: [pubkey],
        nostr: mockNostr,
        logger: mockLogger,
      });

      assert.equal(results.size, 0);
      assert.equal(mockLogger.warn.mock.callCount(), 1);
    });

    it("should parse profile content correctly", async () => {
      const pubkey = "0000000000000000000000000000000000000000000000000000000000000003";
      const content = JSON.stringify({
        display_name: "Bob",
        picture: "https://example.com/bob.jpg",
        website: "https://bob.com",
        banner: "https://bob.com/banner.jpg",
        lud16: "bob@ln.address",
        lud06: "lnurl1...",
      });

      const mockEvent = {
        pubkey,
        created_at: 2000,
        content,
      };

      mockPool.list.mock.mockImplementation(async () => [mockEvent]);

      const results = await fetchProfileMetadataBatch({
        pubkeys: [pubkey],
        nostr: mockNostr,
        logger: mockLogger,
      });

      const profile = results.get(pubkey).profile;
      assert.equal(profile.name, "Bob");
      assert.equal(profile.picture, "https://example.com/bob.jpg");
      assert.equal(profile.website, "https://bob.com");
      assert.equal(profile.banner, "https://bob.com/banner.jpg");
      assert.equal(profile.lud16, "bob@ln.address");
      assert.equal(profile.lud06, "lnurl1...");
    });

    it("should deduplicate concurrent requests (inflight)", async () => {
        const pubkey = "0000000000000000000000000000000000000000000000000000000000000004";
        let resolveList;
        const listPromise = new Promise(r => { resolveList = r; });

        mockPool.list.mock.mockImplementation(() => listPromise);

        // Start two requests
        const p1 = fetchProfileMetadataBatch({ pubkeys: [pubkey], nostr: mockNostr, logger: mockLogger });
        const p2 = fetchProfileMetadataBatch({ pubkeys: [pubkey], nostr: mockNostr, logger: mockLogger });

        // Verify only one list call was made so far
        // Wait a tick
        await new Promise(r => setTimeout(r, 0));
        assert.equal(mockPool.list.mock.callCount(), 1);

        // Resolve
        resolveList([{ pubkey, created_at: 1, content: "{}" }]);

        await Promise.all([p1, p2]);
        assert.equal(mockPool.list.mock.callCount(), 1);
    });
  });

  describe("fetchProfileMetadata", () => {
    it("should return null for invalid pubkey", async () => {
        const result = await fetchProfileMetadata("invalid", { nostr: mockNostr });
        assert.equal(result, null);
    });

    it("should return single profile result", async () => {
        const pubkey = "0000000000000000000000000000000000000000000000000000000000000005";
        mockPool.list.mock.mockImplementation(async () => [{
            pubkey,
            created_at: 1,
            content: JSON.stringify({ name: "Single" })
        }]);

        const result = await fetchProfileMetadata(pubkey, { nostr: mockNostr, logger: mockLogger });
        assert.equal(result.profile.name, "Single");
    });
  });

  describe("ensureProfileMetadataSubscription", () => {
      it("should return null if nostr pool is missing", () => {
          const res = ensureProfileMetadataSubscription({
              pubkey: "abc",
              nostr: {}, // No pool
          });
          assert.equal(res, null);
      });

      it("should create a subscription via relaySubscriptionService", () => {
          const pubkey = "0000000000000000000000000000000000000000000000000000000000000006";
          const mockSub = {
              on: mock.fn(),
              unsub: mock.fn(),
          };
          mockPool.sub.mock.mockImplementation(() => mockSub);

          const sub = ensureProfileMetadataSubscription({
              pubkey,
              nostr: mockNostr,
              logger: mockLogger,
          });

          // relaySubscriptionService returns the subscription object
          assert.equal(sub, mockSub);

          assert.equal(mockPool.sub.mock.callCount(), 1);
          const args = mockPool.sub.mock.calls[0].arguments;
          // check relays
          assert.deepEqual(args[0], ["wss://read.example.com"]);
          // check filters
          assert.deepEqual(args[1], [{ kinds: [0], authors: [pubkey], limit: 1 }]);
      });

      it("should handle onProfile callback", () => {
          const pubkey = "0000000000000000000000000000000000000000000000000000000000000007";
          let capturedOnEvent;

          // We need to capture the onEvent passed to relaySubscriptionService.ensureSubscription
          // Since we can't easily mock the internal import of relaySubscriptionService,
          // we rely on the fact that relaySubscriptionService attaches a listener to the sub.
          // BUT, relaySubscriptionService attaches `subscription.on('event', ...)`
          // So if we mock `sub.on`, we can capture the handler provided by relaySubscriptionService.

          let relayServiceEventHandler;
          const mockSub = {
              on: mock.fn((event, handler) => {
                  if (event === 'event') {
                      relayServiceEventHandler = handler;
                  }
              }),
              unsub: mock.fn(),
          };
          mockPool.sub.mock.mockImplementation(() => mockSub);

          const onProfileSpy = mock.fn();

          ensureProfileMetadataSubscription({
              pubkey,
              nostr: mockNostr,
              logger: mockLogger,
              onProfile: onProfileSpy,
          });

          // Now simulate an event coming from the pool subscription
          const event = {
              pubkey,
              content: JSON.stringify({ name: "Live Update" }),
          };

          if (relayServiceEventHandler) {
              relayServiceEventHandler(event);
          }

          assert.equal(onProfileSpy.mock.callCount(), 1);
          const calledArg = onProfileSpy.mock.calls[0].arguments[0];
          assert.equal(calledArg.profile.name, "Live Update");
          assert.equal(calledArg.event, event);
      });
  });
});
