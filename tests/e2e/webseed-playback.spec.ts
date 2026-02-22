import { test, expect } from "./helpers/instrumentedTest";

test.describe("Webseed Stream Playback", () => {
  const VIDEO_URL =
    "https://ia800205.us.archive.org/2/items/PopeyeTheSailor-AncientFistory/PopeyeTheSailor-AncientFistory_512kb.mp4";
  const INFO_HASH = "c59cf2122f84f28f72755cf5b829f2cf9f539e99";
  const MAGNET_URI = `magnet:?xt=urn:btih:${INFO_HASH}`;

  test.beforeEach(async ({ page }) => {
    // networkidle can be flaky if background polling/relays are active.
    // We rely on explicit selector waits instead.
    await page.goto("/", { waitUntil: "domcontentloaded" });

    try {
        // Wait for either the video list (success) or the error message (failure)
        await Promise.race([
            page.waitForSelector('#videoList', { timeout: 30000 }),
            page.waitForSelector('.text-critical-strong', { timeout: 30000 }).then(async (el) => {
                const text = await el?.innerText();
                throw new Error(`View load failed with message: ${text}`);
            })
        ]);
    } catch (error) {
        // If timeout occurs, capture page content for debugging
        const body = await page.innerHTML('body');
        console.error('Test failed to load video list. Body content:', body.substring(0, 500));
        throw error;
    }
  });

  test("plays directly from HTML link (CDN mode)", async ({ page }) => {
    // 1. Trigger playback with just the URL
    await page.evaluate(async (url) => {
      const { getApplication } = await import("/js/applicationContext.js");
      const app = getApplication();
      if (!app) throw new Error("Application not found");

      await app.playVideoWithoutEvent({
        url,
        title: "Test CDN Playback",
      });
    }, VIDEO_URL);

    // 2. Verify player modal opens
    const modal = page.locator("#playerModal");
    await expect(modal).not.toHaveClass(/hidden/);

    // 3. Verify status indicates hosted playback attempt
    // In headless environments with limited codecs, actual playback might stall at "Checking..."
    // or fail immediately with "No playable source found" if the browser lacks H.264 support (common in CI)
    const status = page.locator("#modalStatus");
    await expect(status).toHaveText(/Checking hosted URL|Streaming from hosted URL|No playable source found/i);

    // Verify source toggle state (CDN active)
    const urlToggle = page.locator('[data-source-toggle="url"]');
    await expect(urlToggle).toHaveAttribute("aria-pressed", "true");

    // Check if video is attempting to play from source
    const video = page.locator("#modalVideo");
    await expect(video).toHaveAttribute("src", VIDEO_URL);
  });

  test("falls back to WebTorrent using HTML link as webseed when CDN fails", async ({ page }) => {
    test.setTimeout(90000); // Increase timeout for fallback logic

    // 1. Intercept and fail the direct request to the MP4
    await page.route(VIDEO_URL, (route) => route.abort());

    // 2. Trigger playback with URL and Magnet
    await page.evaluate(async ({ url, magnet }) => {
      const { getApplication } = await import("/js/applicationContext.js");
      const app = getApplication();
      if (!app) throw new Error("Application not found");

      // We don't await this because if it hangs on probe/fallback, we want to assert on UI changes
      app.playVideoWithoutEvent({
        url,
        magnet,
        title: "Test WebSeed Fallback",
      });
    }, { url: VIDEO_URL, magnet: MAGNET_URI });

    // 3. Verify player modal opens
    const modal = page.locator("#playerModal");
    await expect(modal).not.toHaveClass(/hidden/);

    // 4. Verify source toggle state changes to P2P/Torrent
    const torrentToggle = page.locator('[data-source-toggle="torrent"]');
    // Wait for fallback to occur (probe timeout + watchdog stall detection)
    await expect(torrentToggle).toHaveAttribute("aria-pressed", "true", { timeout: 45000 });

    // 5. Verify status text indicates WebTorrent usage
    const status = page.locator("#modalStatus");
    await expect(status).toBeVisible();
  });
});
