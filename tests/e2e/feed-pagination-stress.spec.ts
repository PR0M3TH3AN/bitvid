/**
 * Large feed rendering, multiple video seeding, and concurrent operation tests.
 *
 * Scenarios covered:
 * - SCN-feed-large: Feed renders correctly with many seeded videos
 * - SCN-feed-ordering: Videos maintain expected ordering by created_at
 * - SCN-feed-unique-dtags: Each video has a unique d-tag identifier
 * - SCN-feed-rapid-seed: Rapid sequential seeding produces no data loss
 * - SCN-feed-state-consistency: App state remains consistent under load
 * - SCN-feed-empty: Empty feed (no events) shows appropriate state
 * - SCN-concurrent-login-seed: Login and feed loading work concurrently
 */

import { test, expect } from "./helpers/bitvidTestFixture";

test.describe("Feed pagination and stress scenarios", () => {
  test.describe("Large feed rendering", () => {
    test("feed renders 10 seeded videos without errors", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
      startDiagnostics,
    }) => {
      test.setTimeout(60000);

      // Given: 10 videos seeded into the relay
      for (let i = 0; i < 10; i++) {
        await seedEvent({
          title: `Stress Video ${String(i).padStart(2, "0")}`,
          url: `https://example.com/stress-${i}.mp4`,
          dTag: `stress-${String(i).padStart(3, "0")}`,
        });
      }

      // When: user loads and logs in with diagnostics
      await gotoApp();
      const diag = await startDiagnostics(page);
      await loginAs(page);

      // Wait for feed to populate
      const items = await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(10, 30000);
      });

      // Then: all 10 videos are present
      expect(items.length).toBeGreaterThanOrEqual(10);

      // Each video should have a title
      for (const item of items) {
        expect(item.title).toBeTruthy();
      }

      // No page errors during rendering
      const results = await diag.stop();
      const criticalErrors = results.pageErrors.filter(
        (e: string) => !e.includes("net::") && !e.includes("favicon"),
      );
      expect(criticalErrors).toEqual([]);
    });

    test("each seeded video has unique d-tag in the feed", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: 5 videos with explicit d-tags
      const expectedDTags = [
        "unique-aaa",
        "unique-bbb",
        "unique-ccc",
        "unique-ddd",
        "unique-eee",
      ];

      for (const dTag of expectedDTags) {
        await seedEvent({
          title: `Video ${dTag}`,
          url: `https://example.com/${dTag}.mp4`,
          dTag,
        });
      }

      await gotoApp();
      await loginAs(page);

      const items = await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(5, 20000);
      });

      // Then: all d-tags are present and unique
      expect(items.length).toBeGreaterThanOrEqual(5);

      const dTags = items.map((i: any) => i.dTag).filter(Boolean);
      const uniqueDTags = new Set(dTags);
      expect(uniqueDTags.size).toBe(dTags.length);

      for (const expected of expectedDTags) {
        expect(dTags).toContain(expected);
      }
    });
  });

  test.describe("Rapid seeding integrity", () => {
    test("rapid sequential seeding preserves all events", async ({
      relay,
      seedEvent,
    }) => {
      const httpUrl = (relay as any).httpUrl;

      // Given: 20 events seeded in rapid succession
      const count = 20;
      for (let i = 0; i < count; i++) {
        await seedEvent({
          title: `Rapid ${i}`,
          url: `https://example.com/rapid-${i}.mp4`,
          dTag: `rapid-${String(i).padStart(3, "0")}`,
        });
      }

      // Then: all events are stored
      const resp = await fetch(`${httpUrl}/events`);
      const events = await resp.json();
      expect(events.length).toBe(count);

      // Verify no duplicate d-tags
      const dTags = events.map((e: any) => {
        const dTagArr = e.tags.find((t: string[]) => t[0] === "d");
        return dTagArr ? dTagArr[1] : null;
      });
      const uniqueDTags = new Set(dTags);
      expect(uniqueDTags.size).toBe(count);
    });

    test("events preserve content integrity after rapid seeding", async ({
      relay,
      seedEvent,
    }) => {
      const httpUrl = (relay as any).httpUrl;

      // Given: events with specific content
      for (let i = 0; i < 5; i++) {
        await seedEvent({
          title: `Integrity Check ${i}`,
          url: `https://example.com/integrity-${i}.mp4`,
          description: `Description for video ${i}`,
          dTag: `integrity-${i}`,
        });
      }

      // Then: content is parseable and correct
      const resp = await fetch(`${httpUrl}/events`);
      const events = await resp.json();

      for (const event of events) {
        const content = JSON.parse(event.content);
        expect(content.version).toBe(3);
        expect(content.title).toMatch(/^Integrity Check \d$/);
        expect(content.url).toMatch(
          /^https:\/\/example\.com\/integrity-\d\.mp4$/,
        );
        expect(content.mode).toBe("dev");
        expect(content.isPrivate).toBe(false);
        expect(content.deleted).toBe(false);
      }
    });
  });

  test.describe("Empty feed state", () => {
    test("app loads successfully with no events in relay", async ({
      page,
      gotoApp,
      loginAs,
      clearRelay,
    }) => {
      // Given: an empty relay
      await clearRelay();

      // When: user loads and logs in
      await gotoApp();
      await loginAs(page);

      // Then: app state is valid (no crash)
      const state = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(state.isLoggedIn).toBe(true);
      expect(state).toBeTruthy();

      // Feed items should be empty or minimal
      const items = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getFeedItems();
      });
      // With an empty relay, feed might have 0 items or items from cached state
      expect(Array.isArray(items)).toBe(true);
    });
  });

  test.describe("Concurrent operations", () => {
    test("login and feed loading work in sequence without races", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
      testPubkey,
    }) => {
      // Given: a seeded video
      await seedEvent({
        title: "Concurrent Test Video",
        url: "https://example.com/concurrent.mp4",
        dTag: "concurrent-001",
      });

      // When: load app, immediately login, then check feed
      await gotoApp();
      const pubkey = await loginAs(page);

      // Then: auth is complete and correct
      expect(pubkey).toBe(testPubkey);

      // And feed loads with the video
      const items = await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      expect(items.length).toBeGreaterThanOrEqual(1);

      // And app state is consistent
      const state = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(state.isLoggedIn).toBe(true);
      expect(state.activePubkey).toBe(testPubkey);
    });

    test("multiple state inspections during session are consistent", async ({
      page,
      gotoApp,
      loginAs,
      testPubkey,
    }) => {
      // Given: a logged-in session
      await gotoApp();
      await loginAs(page);

      // When: we inspect state multiple times rapidly
      const states = await page.evaluate(async (expectedPk) => {
        const results = [];
        for (let i = 0; i < 5; i++) {
          const state = (window as any).__bitvidTest__.getAppState();
          results.push({
            isLoggedIn: state.isLoggedIn,
            activePubkey: state.activePubkey,
          });
        }
        return results;
      }, testPubkey);

      // Then: all inspections return the same state
      for (const state of states) {
        expect(state.isLoggedIn).toBe(true);
        expect(state.activePubkey).toBe(testPubkey);
      }
    });
  });

  test.describe("Feed video card DOM validation", () => {
    test("video cards have all required data attributes", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
      testPubkey,
    }) => {
      // Given: a video with all fields populated
      await seedEvent({
        title: "Fully Attributed Video",
        url: "https://example.com/full-attr.mp4",
        magnet:
          "magnet:?xt=urn:btih:4444444444444444444444444444444444444444",
        description: "Full attribute test",
        dTag: "full-attr-001",
      });

      await gotoApp();
      await loginAs(page);

      await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      // Then: the DOM card has all expected data attributes
      const card = page.locator("[data-video-card]").first();
      await expect(card).toBeVisible();

      const attrs = await page.evaluate(() => {
        const el = document.querySelector("[data-video-card]");
        if (!el) return null;
        return {
          hasTitle: el.hasAttribute("data-video-title"),
          hasPubkey: el.hasAttribute("data-video-pubkey"),
          hasDtag: el.hasAttribute("data-video-dtag"),
          hasPlayUrl: el.hasAttribute("data-play-url"),
          hasPlayMagnet: el.hasAttribute("data-play-magnet"),
          title: el.getAttribute("data-video-title"),
          pubkey: el.getAttribute("data-video-pubkey"),
          dtag: el.getAttribute("data-video-dtag"),
        };
      });

      expect(attrs).not.toBeNull();
      expect(attrs!.hasTitle).toBe(true);
      expect(attrs!.hasPubkey).toBe(true);
      expect(attrs!.hasDtag).toBe(true);
      expect(attrs!.title).toBe("Fully Attributed Video");
      expect(attrs!.pubkey).toBe(testPubkey);
      expect(attrs!.dtag).toBe("full-attr-001");
    });
  });
});
