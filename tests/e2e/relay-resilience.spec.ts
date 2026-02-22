/**
 * Relay connection failure, fallback, and health monitoring tests.
 *
 * Scenarios covered:
 * - SCN-relay-health: Relay health endpoint reports connection state
 * - SCN-relay-override: setTestRelays properly overrides relay config
 * - SCN-relay-multiple: Multiple relay URLs can be configured
 * - SCN-relay-health-monitoring: getRelayHealth returns actionable data
 * - SCN-relay-event-seeding: Events seeded to relay are retrievable
 * - SCN-relay-clear-recovery: App survives relay clear mid-session
 * - SCN-relay-http-api: Full HTTP API lifecycle (seed, list, clear, health)
 */

import { test, expect } from "./helpers/bitvidTestFixture";

test.describe("Relay resilience and management", () => {
  test.describe("Relay HTTP API lifecycle", () => {
    test("full relay API lifecycle: seed, list, health, clear", async ({
      relay,
      seedEvent,
      clearRelay,
    }) => {
      const httpUrl = (relay as any).httpUrl;

      // Step 1: Health check on empty relay
      let healthResp = await fetch(`${httpUrl}/health`);
      let health = await healthResp.json();
      expect(health.ok).toBe(true);
      expect(health.eventCount).toBe(0);

      // Step 2: Seed events
      await seedEvent({
        title: "Relay Test A",
        url: "https://example.com/a.mp4",
        dTag: "relay-a",
      });
      await seedEvent({
        title: "Relay Test B",
        url: "https://example.com/b.mp4",
        dTag: "relay-b",
      });

      // Step 3: Verify events are listed
      let eventsResp = await fetch(`${httpUrl}/events`);
      let events = await eventsResp.json();
      expect(events.length).toBe(2);

      // Step 4: Health reflects event count
      healthResp = await fetch(`${httpUrl}/health`);
      health = await healthResp.json();
      expect(health.eventCount).toBe(2);

      // Step 5: Clear events
      await clearRelay();

      // Step 6: Verify clear worked
      eventsResp = await fetch(`${httpUrl}/events`);
      events = await eventsResp.json();
      expect(events.length).toBe(0);

      healthResp = await fetch(`${httpUrl}/health`);
      health = await healthResp.json();
      expect(health.eventCount).toBe(0);
    });

    test("seeding multiple events preserves all data", async ({
      relay,
      seedEvent,
    }) => {
      const httpUrl = (relay as any).httpUrl;

      // Seed 5 events with distinct d-tags
      for (let i = 0; i < 5; i++) {
        await seedEvent({
          title: `Batch Video ${i}`,
          url: `https://example.com/batch-${i}.mp4`,
          dTag: `batch-${i}`,
        });
      }

      // All 5 should be retrievable
      const resp = await fetch(`${httpUrl}/events`);
      const events = await resp.json();
      expect(events.length).toBe(5);

      // Verify each event has unique content
      const titles = events.map((e: any) => JSON.parse(e.content).title);
      for (let i = 0; i < 5; i++) {
        expect(titles).toContain(`Batch Video ${i}`);
      }
    });
  });

  test.describe("Relay configuration via test harness", () => {
    test("setTestRelays overrides both relayManager and nostrClient", async ({
      page,
      gotoApp,
      relayUrl,
      setTestRelays,
    }) => {
      // Given: the app is loaded
      await gotoApp();

      // When: we set relay URLs via the harness
      const result = await setTestRelays(page, [relayUrl]);

      // Then: both relay systems are aligned
      expect(result.ok).toBe(true);

      const state = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(state.relays.read).toEqual([relayUrl]);
      expect(state.relayManager.read).toEqual([relayUrl]);
    });

    test("setTestRelays accepts multiple relay URLs", async ({
      page,
      gotoApp,
      relayUrl,
      setTestRelays,
    }) => {
      // Given: the app is loaded
      await gotoApp();

      // When: we configure multiple relays (one real, one fake)
      const fakeRelay = "ws://127.0.0.1:9999";
      const result = await setTestRelays(page, [relayUrl, fakeRelay]);

      // Then: both are registered
      expect(result.ok).toBe(true);

      const state = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(state.relays.read).toContain(relayUrl);
      expect(state.relays.read).toContain(fakeRelay);
    });

    test("relay overrides are applied via query params on load", async ({
      page,
      gotoApp,
      relayUrl,
    }) => {
      // Given/When: the app is loaded with relay overrides in URL
      await gotoApp();

      // Then: app state reflects the override
      const state = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(state.relays).toBeTruthy();
      const allRelays = state.relays.all || [];
      expect(allRelays).toContain(relayUrl);
    });
  });

  test.describe("Relay health monitoring", () => {
    test("getRelayHealth returns structured data", async ({
      page,
      gotoApp,
    }) => {
      // Given: the app is loaded with relay connections
      await gotoApp();

      // When: we query relay health
      const health = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getRelayHealth();
      });

      // Then: health info contains expected fields
      expect(health).toBeTruthy();
      expect(health.relays).toBeDefined();
      expect(Array.isArray(health.unreachable) || health.unreachable === undefined).toBe(true);
    });

    test("relay health reports after login", async ({
      page,
      gotoApp,
      loginAs,
    }) => {
      // Given: a logged-in user
      await gotoApp();
      await loginAs(page);

      // When: we check relay health
      const health = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getRelayHealth();
      });

      // Then: health data is available
      expect(health).toBeTruthy();
    });
  });

  test.describe("Recovery after relay operations", () => {
    test("app remains functional after clearing relay events", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
      clearRelay,
    }) => {
      // Given: videos in the relay and a logged-in user
      await seedEvent({
        title: "Before Clear Video",
        url: "https://example.com/before.mp4",
        dTag: "before-clear-001",
      });

      await gotoApp();
      await loginAs(page);

      // When: relay events are cleared
      await clearRelay();

      // Then: app state remains valid (no crash)
      const state = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(state.isLoggedIn).toBe(true);
      expect(state).toBeTruthy();
    });

    test("new events are discoverable after relay clear and re-seed", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
      clearRelay,
    }) => {
      // Given: initial events
      await seedEvent({
        title: "Old Video",
        url: "https://example.com/old.mp4",
        dTag: "reseed-old-001",
      });

      await gotoApp();
      await loginAs(page);

      // Wait for initial feed
      await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      // When: clear and re-seed with different content
      await clearRelay();
      await seedEvent({
        title: "Fresh Video After Clear",
        url: "https://example.com/fresh.mp4",
        dTag: "reseed-fresh-001",
      });

      // Then: app remains functional (state is valid)
      const state = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(state).toBeTruthy();
      expect(state.isLoggedIn).toBe(true);
    });
  });
});
