/**
 * Agent testability E2E tests.
 *
 * These tests demonstrate that bitvid is fully testable by Playwright CLI agents.
 * They exercise:
 *   1. Test harness installation and relay override
 *   2. Programmatic login (bypassing the UI)
 *   3. Seeding test data into a local mock relay
 *   4. Inspecting app state through the harness API
 *   5. Key data-testid selectors for UI interaction
 */

import { test, expect } from "./helpers/bitvidTestFixture";

test.describe("Agent testability infrastructure", () => {
  test("test harness installs when __test__=1 is set", async ({
    page,
    relay,
    gotoApp,
  }) => {
    await gotoApp();

    const harness = await page.evaluate(() => {
      const h = (window as any).__bitvidTest__;
      return h ? { version: h.version } : null;
    });

    expect(harness).not.toBeNull();
    expect(harness!.version).toBe(1);
  });

  test("relay overrides are applied via query params", async ({
    page,
    relay,
    gotoApp,
    relayUrl,
  }) => {
    await gotoApp();

    const state = await page.evaluate(() => {
      return (window as any).__bitvidTest__.getAppState();
    });

    // Relay overrides should include our test relay
    expect(state.relays).not.toBeNull();
    if (state.relays) {
      const allRelays = state.relays.all || [];
      expect(allRelays).toContain(relayUrl);
    }
  });

  test("programmatic login works via test harness", async ({
    page,
    relay,
    gotoApp,
    loginAs,
    testPubkey,
  }) => {
    await gotoApp();

    const pubkey = await loginAs(page);
    expect(pubkey).toBe(testPubkey);

    const state = await page.evaluate(() => {
      return (window as any).__bitvidTest__.getAppState();
    });

    expect(state.isLoggedIn).toBe(true);
    expect(state.activePubkey).toBe(testPubkey);
  });

  test("can seed events into mock relay and retrieve them", async ({
    relay,
    seedEvent,
    clearRelay,
  }) => {
    await clearRelay();

    await seedEvent({
      title: "Test Video Alpha",
      url: "https://example.com/alpha.mp4",
      dTag: "alpha-001",
    });

    await seedEvent({
      title: "Test Video Beta",
      url: "https://example.com/beta.mp4",
      magnet: "magnet:?xt=urn:btih:0000000000000000000000000000000000000000",
      dTag: "beta-001",
    });

    // Verify via HTTP API
    const httpUrl = (relay as any).httpUrl;
    const resp = await fetch(`${httpUrl}/events`);
    const events = await resp.json();
    expect(events.length).toBe(2);
  });

  test("relay health endpoint works", async ({ relay }) => {
    const httpUrl = (relay as any).httpUrl;
    const resp = await fetch(`${httpUrl}/health`);
    const health = await resp.json();
    expect(health.ok).toBe(true);
    expect(typeof health.eventCount).toBe("number");
    expect(typeof health.connectionCount).toBe("number");
  });
});

test.describe("Data-testid selectors are present", () => {
  test("critical UI elements have data-testid attributes", async ({
    page,
    relay,
    gotoApp,
  }) => {
    await gotoApp();

    // Header controls
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible();

    // Upload button is hidden until logged in — verify it exists in DOM
    const uploadBtn = page.locator('[data-testid="upload-button"]');
    await expect(uploadBtn).toBeAttached();
  });

  test("login modal has testid selectors", async ({
    page,
    relay,
    gotoApp,
  }) => {
    await gotoApp();

    // Open the login modal
    await page.locator('[data-testid="login-button"]').click();

    // Wait for modal to be visible
    await expect(page.locator('[data-testid="login-modal"]')).toBeVisible({
      timeout: 15000,
    });

    // Check provider buttons exist
    const providerButtons = page.locator(
      '[data-testid="login-provider-button"]',
    );
    // At least one provider button should be present
    await expect(providerButtons.first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe("App state inspection", () => {
  test("getAppState reports logged-out state by default", async ({
    page,
    relay,
    gotoApp,
  }) => {
    await gotoApp();

    const state = await page.evaluate(() => {
      return (window as any).__bitvidTest__.getAppState();
    });

    expect(state.isLoggedIn).toBe(false);
    expect(state.activePubkey).toBeNull();
  });

  test("logout clears active signer", async ({
    page,
    relay,
    gotoApp,
    loginAs,
  }) => {
    await gotoApp();
    await loginAs(page);

    let state = await page.evaluate(() => {
      return (window as any).__bitvidTest__.getAppState();
    });
    expect(state.isLoggedIn).toBe(true);

    await page.evaluate(() => {
      (window as any).__bitvidTest__.logout();
    });

    state = await page.evaluate(() => {
      return (window as any).__bitvidTest__.getAppState();
    });
    expect(state.isLoggedIn).toBe(false);
  });
});
