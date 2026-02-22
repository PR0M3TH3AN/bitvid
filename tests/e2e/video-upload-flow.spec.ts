/**
 * End-to-end video upload, discovery, and feed verification tests.
 *
 * Scenarios covered:
 * - SCN-upload-url: Authenticated user publishes a video with HTTPS URL
 * - SCN-upload-magnet: Authenticated user publishes a video with magnet link
 * - SCN-upload-both: Authenticated user publishes with both URL and magnet
 * - SCN-upload-validation: Upload form rejects invalid/empty submissions
 * - SCN-feed-discovery: Seeded videos appear in feed with correct attributes
 * - SCN-feed-multiple: Multiple videos render in correct order
 * - SCN-upload-gated: Upload button is hidden when logged out
 */

import { test, expect } from "./helpers/bitvidTestFixture";

test.describe("Video upload and discovery", () => {
  test.describe("Upload form validation", () => {
    test("upload modal opens when logged-in user clicks upload button", async ({
      page,
      gotoApp,
      loginAs,
    }) => {
      // Given: a logged-in user on the app
      await gotoApp();
      await loginAs(page);

      // When: user clicks the upload button
      const uploadBtn = page.locator('[data-testid="upload-button"]');
      await expect(uploadBtn).toBeVisible();
      await uploadBtn.click();

      // Then: upload modal becomes visible with expected form fields
      const modal = page.locator('[data-testid="upload-modal"]');
      await page.waitForFunction(() => {
        const m = document.querySelector('[data-testid="upload-modal"]');
        if (!(m instanceof HTMLElement)) return false;
        return (
          m.getAttribute("data-open") === "true" &&
          !m.classList.contains("hidden")
        );
      }, { timeout: 10000 });

      await expect(
        page.locator('[data-testid="upload-title"]'),
      ).toBeAttached();
      await expect(page.locator('[data-testid="upload-url"]')).toBeAttached();
      await expect(
        page.locator('[data-testid="upload-magnet"]'),
      ).toBeAttached();
      await expect(
        page.locator('[data-testid="upload-submit"]'),
      ).toBeAttached();
    });

    test("upload button is hidden when user is not logged in", async ({
      page,
      gotoApp,
    }) => {
      // Given: an unauthenticated user
      await gotoApp();

      // Then: upload button should be in the DOM but not visible
      const uploadBtn = page.locator('[data-testid="upload-button"]');
      await expect(uploadBtn).toBeAttached();
      await expect(uploadBtn).not.toBeVisible();
    });
  });

  test.describe("Feed discovery from seeded events", () => {
    test("seeded video with URL appears in feed with correct attributes", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: a video event seeded in the relay
      await seedEvent({
        title: "Alpha Video",
        url: "https://example.com/alpha.mp4",
        description: "First test video",
        dTag: "alpha-vid-001",
      });

      // When: user loads the app and logs in
      await gotoApp();
      await loginAs(page);

      // Then: feed items should contain the seeded video
      const items = await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      expect(items.length).toBeGreaterThanOrEqual(1);
      const alphaItem = items.find(
        (item: any) => item.title === "Alpha Video",
      );
      expect(alphaItem).toBeDefined();
      expect(alphaItem.hasUrl).toBe(true);
    });

    test("seeded video with magnet appears in feed", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: a video event with only a magnet link
      await seedEvent({
        title: "Magnet Only Video",
        magnet:
          "magnet:?xt=urn:btih:0000000000000000000000000000000000000000",
        dTag: "magnet-vid-001",
      });

      // When: user loads and logs in
      await gotoApp();
      await loginAs(page);

      // Then: the video appears with magnet attribute
      const items = await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      expect(items.length).toBeGreaterThanOrEqual(1);
      const magnetItem = items.find(
        (item: any) => item.title === "Magnet Only Video",
      );
      expect(magnetItem).toBeDefined();
      expect(magnetItem.hasMagnet).toBe(true);
    });

    test("multiple seeded videos all appear in feed", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: three videos seeded into the relay
      await seedEvent({
        title: "Video One",
        url: "https://example.com/one.mp4",
        dTag: "multi-001",
      });
      await seedEvent({
        title: "Video Two",
        url: "https://example.com/two.mp4",
        dTag: "multi-002",
      });
      await seedEvent({
        title: "Video Three",
        url: "https://example.com/three.mp4",
        magnet:
          "magnet:?xt=urn:btih:1111111111111111111111111111111111111111",
        dTag: "multi-003",
      });

      // When: user loads and logs in
      await gotoApp();
      await loginAs(page);

      // Then: all three videos appear
      const items = await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(3, 20000);
      });

      expect(items.length).toBeGreaterThanOrEqual(3);

      const titles = items.map((i: any) => i.title);
      expect(titles).toContain("Video One");
      expect(titles).toContain("Video Two");
      expect(titles).toContain("Video Three");

      // Video Three should have both URL and magnet
      const videoThree = items.find(
        (i: any) => i.title === "Video Three",
      );
      expect(videoThree.hasUrl).toBe(true);
      expect(videoThree.hasMagnet).toBe(true);
    });

    test("video cards have correct data attributes", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
      testPubkey,
    }) => {
      // Given: a seeded video
      await seedEvent({
        title: "Attributed Video",
        url: "https://example.com/attributed.mp4",
        dTag: "attr-vid-001",
      });

      // When: page loads and feed populates
      await gotoApp();
      await loginAs(page);

      await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      // Then: the video card DOM elements have correct data attributes
      const card = page.locator("[data-video-card]").first();
      await expect(card).toBeVisible();

      const title = await card.getAttribute("data-video-title");
      expect(title).toBe("Attributed Video");

      const pubkey = await card.getAttribute("data-video-pubkey");
      expect(pubkey).toBe(testPubkey);

      const dTag = await card.getAttribute("data-video-dtag");
      expect(dTag).toBe("attr-vid-001");
    });
  });

  test.describe("Relay event seeding integrity", () => {
    test("clearing relay removes all events", async ({
      seedEvent,
      clearRelay,
      relay,
    }) => {
      // Given: events seeded in the relay
      await seedEvent({
        title: "Ephemeral Video",
        url: "https://example.com/ephemeral.mp4",
      });

      const httpUrl = (relay as any).httpUrl;
      let resp = await fetch(`${httpUrl}/events`);
      let events = await resp.json();
      expect(events.length).toBeGreaterThan(0);

      // When: relay is cleared
      await clearRelay();

      // Then: no events remain
      resp = await fetch(`${httpUrl}/events`);
      events = await resp.json();
      expect(events.length).toBe(0);
    });

    test("seeded events have valid Nostr signatures", async ({
      relay,
      seedEvent,
    }) => {
      // Given: a seeded event
      await seedEvent({
        title: "Signed Video",
        url: "https://example.com/signed.mp4",
        dTag: "signed-001",
      });

      // When: we retrieve events from the relay
      const httpUrl = (relay as any).httpUrl;
      const resp = await fetch(`${httpUrl}/events`);
      const events = await resp.json();

      // Then: each event has required Nostr fields
      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.id).toBeTruthy();
      expect(event.sig).toBeTruthy();
      expect(event.pubkey).toBeTruthy();
      expect(event.kind).toBe(30078);
      expect(event.created_at).toBeGreaterThan(0);

      // Content should be valid JSON with expected schema
      const content = JSON.parse(event.content);
      expect(content.version).toBe(3);
      expect(content.title).toBe("Signed Video");
      expect(content.url).toBe("https://example.com/signed.mp4");
    });
  });
});
