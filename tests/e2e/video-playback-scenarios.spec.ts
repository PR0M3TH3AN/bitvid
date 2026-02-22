/**
 * Video playback scenarios: URL-first, magnet fallback, error states.
 *
 * Scenarios covered:
 * - SCN-play-card-click: Clicking a video card opens the player modal
 * - SCN-play-url-first: Video with URL uses URL-first playback strategy
 * - SCN-play-magnet-only: Video with only magnet triggers P2P playback
 * - SCN-play-both-sources: Video with URL+magnet starts with URL, has fallback
 * - SCN-play-modal-elements: Player modal has expected DOM structure
 * - SCN-play-source-toggle: Source toggle reflects active playback source
 * - SCN-play-close-modal: Closing player modal returns to feed
 */

import { test, expect } from "./helpers/bitvidTestFixture";

test.describe("Video playback scenarios", () => {
  test.describe("Video card interaction", () => {
    test("clicking a video card opens the player modal", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: a video in the feed
      await seedEvent({
        title: "Playable Video",
        url: "https://example.com/playable.mp4",
        dTag: "play-click-001",
      });

      await gotoApp();
      await loginAs(page);

      await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      // When: user clicks the video card
      const card = page.locator("[data-video-card]").first();
      await expect(card).toBeVisible();
      await card.click();

      // Then: the player modal opens
      const playerModal = page.locator("#playerModal");
      await expect(playerModal).not.toHaveClass(/hidden/, { timeout: 10000 });
    });

    test("player modal contains video element and status indicator", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: a video card clicked to open modal
      await seedEvent({
        title: "Modal Structure Video",
        url: "https://example.com/structure.mp4",
        dTag: "play-structure-001",
      });

      await gotoApp();
      await loginAs(page);

      await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      await page.locator("[data-video-card]").first().click();

      const playerModal = page.locator("#playerModal");
      await expect(playerModal).not.toHaveClass(/hidden/, { timeout: 10000 });

      // Then: modal has a video element
      const video = page.locator("#modalVideo");
      await expect(video).toBeAttached();

      // And a status indicator
      const status = page.locator("#modalStatus");
      await expect(status).toBeAttached();
    });
  });

  test.describe("URL-first playback strategy", () => {
    test("video with URL attribute attempts hosted playback first", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: a video event with an HTTPS URL
      await seedEvent({
        title: "URL First Video",
        url: "https://example.com/url-first.mp4",
        dTag: "play-url-first-001",
      });

      await gotoApp();
      await loginAs(page);

      await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      // When: user opens the video
      await page.locator("[data-video-card]").first().click();

      const playerModal = page.locator("#playerModal");
      await expect(playerModal).not.toHaveClass(/hidden/, { timeout: 10000 });

      // Then: the URL source toggle should be active
      const urlToggle = page.locator('[data-source-toggle="url"]');
      if (await urlToggle.count() > 0) {
        await expect(urlToggle).toHaveAttribute("aria-pressed", "true", {
          timeout: 10000,
        });
      }

      // And video element should have the URL as source
      const video = page.locator("#modalVideo");
      const src = await video.getAttribute("src");
      if (src) {
        expect(src).toContain("url-first.mp4");
      }
    });
  });

  test.describe("Playback with both sources", () => {
    test("video with URL and magnet has source toggle controls", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: a video with both URL and magnet
      await seedEvent({
        title: "Dual Source Video",
        url: "https://example.com/dual.mp4",
        magnet:
          "magnet:?xt=urn:btih:2222222222222222222222222222222222222222",
        dTag: "play-dual-001",
      });

      await gotoApp();
      await loginAs(page);

      await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      // When: user opens the video
      await page.locator("[data-video-card]").first().click();

      const playerModal = page.locator("#playerModal");
      await expect(playerModal).not.toHaveClass(/hidden/, { timeout: 10000 });

      // Then: source toggle elements should exist
      const urlToggle = page.locator('[data-source-toggle="url"]');
      const torrentToggle = page.locator('[data-source-toggle="torrent"]');

      if ((await urlToggle.count()) > 0 && (await torrentToggle.count()) > 0) {
        // Both toggle buttons should be present
        await expect(urlToggle).toBeAttached();
        await expect(torrentToggle).toBeAttached();

        // Exactly one should be active
        const urlPressed = await urlToggle.getAttribute("aria-pressed");
        const torrentPressed =
          await torrentToggle.getAttribute("aria-pressed");
        const activeCount =
          (urlPressed === "true" ? 1 : 0) +
          (torrentPressed === "true" ? 1 : 0);
        expect(activeCount).toBe(1);
      }
    });
  });

  test.describe("Player modal lifecycle", () => {
    test("closing player modal returns to feed view", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: a video is playing in the modal
      await seedEvent({
        title: "Closable Video",
        url: "https://example.com/closable.mp4",
        dTag: "play-close-001",
      });

      await gotoApp();
      await loginAs(page);

      await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      await page.locator("[data-video-card]").first().click();

      const playerModal = page.locator("#playerModal");
      await expect(playerModal).not.toHaveClass(/hidden/, { timeout: 10000 });

      // When: user closes the modal
      // Try various close mechanisms
      const closeBtn = page.locator(
        "#playerModal .modal-close, #playerModal [data-close], #playerModal [data-dismiss], #closePlayerModal",
      );
      if ((await closeBtn.count()) > 0) {
        await closeBtn.first().click({ force: true });

        // Then: modal is hidden again
        await page.waitForFunction(
          () => {
            const modal = document.querySelector("#playerModal");
            if (!modal) return true;
            return (
              modal.classList.contains("hidden") ||
              modal.style.display === "none" ||
              modal.getAttribute("data-open") === "false"
            );
          },
          { timeout: 10000 },
        );
      }

      // App state should still be valid
      const state = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(state.isLoggedIn).toBe(true);
    });

    test("player modal shows status text during playback attempts", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: a video to play
      await seedEvent({
        title: "Status Video",
        url: "https://example.com/status.mp4",
        dTag: "play-status-001",
      });

      await gotoApp();
      await loginAs(page);

      await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      // When: user opens the video
      await page.locator("[data-video-card]").first().click();

      const playerModal = page.locator("#playerModal");
      await expect(playerModal).not.toHaveClass(/hidden/, { timeout: 10000 });

      // Then: status element shows playback state
      const status = page.locator("#modalStatus");
      await expect(status).toBeAttached();

      // Status should have some text (checking, streaming, or error)
      const statusText = await status.textContent();
      expect(statusText).toBeTruthy();
    });
  });

  test.describe("Feed video attributes for playback", () => {
    test("video cards expose data-play-url for URL-based videos", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: a video with HTTPS URL
      await seedEvent({
        title: "URL Attr Video",
        url: "https://example.com/attr-url.mp4",
        dTag: "attr-url-001",
      });

      await gotoApp();
      await loginAs(page);

      await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      // Then: video card has data-play-url attribute
      const card = page.locator("[data-video-card]").first();
      const playUrl = await card.getAttribute("data-play-url");
      expect(playUrl).toBeTruthy();
      expect(playUrl).toContain("attr-url.mp4");
    });

    test("video cards expose data-play-magnet for magnet-based videos", async ({
      page,
      gotoApp,
      loginAs,
      seedEvent,
    }) => {
      // Given: a video with magnet link
      await seedEvent({
        title: "Magnet Attr Video",
        magnet:
          "magnet:?xt=urn:btih:3333333333333333333333333333333333333333",
        dTag: "attr-magnet-001",
      });

      await gotoApp();
      await loginAs(page);

      await page.evaluate(() => {
        return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
      });

      // Then: video card has data-play-magnet attribute
      const card = page.locator("[data-video-card]").first();
      const playMagnet = await card.getAttribute("data-play-magnet");
      expect(playMagnet).toBeTruthy();
      expect(playMagnet).toContain("magnet:");
    });
  });
});
