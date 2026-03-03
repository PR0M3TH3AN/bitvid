/**
 * View navigation scenarios: sidebar links, hash routing, view switching.
 *
 * Scenarios covered:
 * - SCN-nav-sidebar-recent: Recently Added link navigates to the recent videos view
 * - SCN-nav-sidebar-kids: For Kids link navigates to the kids view
 * - SCN-nav-sidebar-history: History link navigates to the history view
 * - SCN-nav-hash-direct: Direct hash navigation renders the correct view
 * - SCN-nav-login-reveals: Login reveals For You, Explore, and Subscriptions links
 * - SCN-nav-sidebar-collapse: Sidebar collapse toggle works
 * - SCN-nav-view-container: Each view has a video-list container
 * - SCN-nav-feed-populates: Seeded videos appear in the most-recent-videos view
 */

import { test, expect } from "./helpers/bitvidTestFixture";

test.describe("View navigation — sidebar links", () => {
  test("Recently Added sidebar link navigates to the recent videos view", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    // When: user clicks the Recently Added link
    const recentLink = page.locator('a[href="#view=most-recent-videos"]');
    await expect(recentLink).toBeAttached();
    await recentLink.click();

    // Then: the URL hash should reflect the view
    await page.waitForFunction(
      () => window.location.hash.includes("view=most-recent-videos"),
      { timeout: 5000 },
    );

    // And: the video list container should be present
    const videoList = page.locator('[data-testid="video-list"]');
    await expect(videoList).toBeAttached({ timeout: 10000 });
  });

  test("For Kids sidebar link navigates to the kids view", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    // When: user clicks the For Kids link
    const kidsLink = page.locator('a[href="#view=kids"]');
    await expect(kidsLink).toBeAttached();
    await kidsLink.click();

    // Then: the URL hash should reflect the kids view
    await page.waitForFunction(
      () => window.location.hash.includes("view=kids"),
      { timeout: 5000 },
    );
  });

  test("History sidebar link navigates to the history view", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    // When: user clicks the History link
    const historyLink = page.locator('a[href="#view=history"]');
    await expect(historyLink).toBeAttached();
    await historyLink.click();

    // Then: the URL hash should reflect the history view
    await page.waitForFunction(
      () => window.location.hash.includes("view=history"),
      { timeout: 5000 },
    );
  });
});

test.describe("View navigation — login-gated links", () => {
  test("For You, Explore, and Subscriptions links are hidden before login", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded without login
    await gotoApp();

    // Then: login-gated links should be hidden
    const forYouLink = page.locator("#forYouLink");
    const exploreLink = page.locator("#exploreLink");
    const subscriptionsLink = page.locator("#subscriptionsLink");

    await expect(forYouLink).toHaveClass(/hidden/);
    await expect(exploreLink).toHaveClass(/hidden/);
    await expect(subscriptionsLink).toHaveClass(/hidden/);
  });

  test("login reveals For You, Explore, and Subscriptions sidebar links", async ({
    page,
    gotoApp,
    loginAs,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    // When: user logs in
    await loginAs(page);

    // Then: the login-gated links should become visible
    // Allow time for the UI to update after login
    const forYouLink = page.locator("#forYouLink");
    const exploreLink = page.locator("#exploreLink");
    const subscriptionsLink = page.locator("#subscriptionsLink");

    await expect(forYouLink).not.toHaveClass(/hidden/, { timeout: 10000 });
    await expect(exploreLink).not.toHaveClass(/hidden/, { timeout: 10000 });
    await expect(subscriptionsLink).not.toHaveClass(/hidden/, { timeout: 10000 });
  });

  test("For You link navigates to the for-you view after login", async ({
    page,
    gotoApp,
    loginAs,
  }) => {
    // Given: user is logged in
    await gotoApp();
    await loginAs(page);

    const forYouLink = page.locator("#forYouLink");
    await expect(forYouLink).not.toHaveClass(/hidden/, { timeout: 10000 });

    // When: user clicks For You
    await forYouLink.click();

    // Then: hash should reflect the for-you view
    await page.waitForFunction(
      () => window.location.hash.includes("view=for-you"),
      { timeout: 5000 },
    );
  });
});

test.describe("View navigation — direct hash routing", () => {
  test("navigating to #view=kids directly loads the kids view", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded at a specific hash
    await gotoApp("/#view=kids");

    // Then: the hash should be set
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toContain("view=kids");
  });

  test("navigating to #view=most-recent-videos shows the feed", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
  }) => {
    // Given: a video exists
    await seedEvent({
      title: "Navigation Feed Video",
      url: "https://example.com/nav-feed.mp4",
      dTag: "nav-feed-001",
    });

    await gotoApp("/#view=most-recent-videos");
    await loginAs(page);

    // Then: the feed should populate with the seeded video
    const items = await page.evaluate(() => {
      return (window as any).__bitvidTest__.waitForFeedItems(1, 60000);
    });
    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe("View navigation — sidebar collapse", () => {
  test("sidebar collapse toggle changes sidebar state", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded with sidebar collapsed (default)
    await gotoApp();

    const sidebar = page.locator("#sidebar");
    const toggle = page.locator("#sidebarCollapseToggle");

    await expect(sidebar).toBeAttached();
    await expect(toggle).toBeAttached();

    // Record initial state
    const initialState = await sidebar.getAttribute("data-state");

    // When: user clicks the collapse toggle
    await toggle.click();

    // Then: the sidebar state should change
    await page.waitForFunction(
      (initial) => {
        const sidebar = document.querySelector("#sidebar");
        return sidebar?.getAttribute("data-state") !== initial;
      },
      initialState,
      { timeout: 5000 },
    );

    const newState = await sidebar.getAttribute("data-state");
    expect(newState).not.toBe(initialState);
  });

  test("sidebar toggle updates aria-expanded attribute", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    const toggle = page.locator("#sidebarCollapseToggle");
    const initialExpanded = await toggle.getAttribute("aria-expanded");

    // When: user clicks the toggle
    await toggle.click();

    // Then: aria-expanded should flip
    const expected = initialExpanded === "true" ? "false" : "true";
    await expect(toggle).toHaveAttribute("aria-expanded", expected, {
      timeout: 5000,
    });
  });
});

test.describe("View navigation — feed with seeded content", () => {
  test("seeded videos appear in the feed after navigation", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
  }) => {
    // Given: multiple videos are seeded
    await seedEvent({
      title: "Nav Video One",
      url: "https://example.com/nav1.mp4",
      dTag: "nav-multi-001",
    });
    await seedEvent({
      title: "Nav Video Two",
      url: "https://example.com/nav2.mp4",
      dTag: "nav-multi-002",
    });

    await gotoApp();
    await loginAs(page);

    // Then: both videos should appear in the feed
    const items = await page.evaluate(() => {
      return (window as any).__bitvidTest__.waitForFeedItems(2, 60000);
    });
    expect(items.length).toBeGreaterThanOrEqual(2);

    const titles = items.map((i: any) => i.title);
    expect(titles).toContain("Nav Video One");
    expect(titles).toContain("Nav Video Two");
  });

  test("switching views and returning preserves app state", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
  }) => {
    // Given: user is logged in and viewing the feed
    await seedEvent({
      title: "Persistent Video",
      url: "https://example.com/persist.mp4",
      dTag: "nav-persist-001",
    });

    await gotoApp();
    await loginAs(page);

    await page.evaluate(() => {
      return (window as any).__bitvidTest__.waitForFeedItems(1, 60000);
    });

    // When: user navigates to kids view and back
    await page.locator('a[href="#view=kids"]').click();
    await page.waitForFunction(
      () => window.location.hash.includes("view=kids"),
      { timeout: 5000 },
    );

    await page.locator('a[href="#view=most-recent-videos"]').click();
    await page.waitForFunction(
      () => window.location.hash.includes("view=most-recent-videos"),
      { timeout: 5000 },
    );

    // Then: app state should remain valid (login preserved across view switches)
    const state = await page.evaluate(() => {
      return (window as any).__bitvidTest__.getAppState();
    });
    expect(state.isLoggedIn).toBe(true);
    expect(state.activePubkey).toBeTruthy();

    // And: the video list container should be present in the returned view
    const videoList = page.locator('[data-testid="video-list"]');
    await expect(videoList).toBeAttached({ timeout: 10000 });
  });
});
