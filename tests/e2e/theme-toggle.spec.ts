/**
 * Theme toggle scenarios: dark/light switching, persistence, ARIA attributes.
 *
 * Scenarios covered:
 * - SCN-theme-respects-preference: App respects prefers-color-scheme media query
 * - SCN-theme-toggle-switches: Clicking toggle switches between themes
 * - SCN-theme-round-trip: Double-click returns to original theme
 * - SCN-theme-persists: Theme preference survives page reload
 * - SCN-theme-icon-state: Icon state attribute updates with theme
 * - SCN-theme-stored-overrides-preference: localStorage overrides system preference
 */

import { test, expect } from "./helpers/bitvidTestFixture";

test.describe("Theme toggle", () => {
  test("app uses dark theme when prefers-color-scheme is dark", async ({
    page,
    gotoApp,
  }) => {
    // Given: the browser prefers dark color scheme
    await page.emulateMedia({ colorScheme: "dark" });

    await gotoApp();

    // Then: the <html> element should have data-theme="dark"
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(theme).toBe("dark");

    // And: the toggle should reflect dark state
    const toggle = page.locator("#themeToggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toHaveAttribute(
      "aria-label",
      "Switch to light theme",
    );
  });

  test("app uses light theme when prefers-color-scheme is light", async ({
    page,
    gotoApp,
  }) => {
    // Given: the browser prefers light color scheme
    await page.emulateMedia({ colorScheme: "light" });

    await gotoApp();

    // Then: the <html> element should have data-theme="light"
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(theme).toBe("light");

    // And: the toggle should reflect light state
    const toggle = page.locator("#themeToggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toHaveAttribute("aria-label", "Switch to dark theme");
  });

  test("clicking toggle switches theme", async ({ page, gotoApp }) => {
    // Given: the app is loaded with dark preference
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoApp();

    const toggle = page.locator("#themeToggle");

    // When: the user clicks the toggle
    await toggle.click();

    // Then: the theme should switch to light
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(theme).toBe("light");

    // And: aria attributes should update
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toHaveAttribute("aria-label", "Switch to dark theme");
  });

  test("double-click returns to original theme", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded with dark preference
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoApp();

    const toggle = page.locator("#themeToggle");

    // When: the user clicks the toggle twice
    await toggle.click();
    await toggle.click();

    // Then: the theme should return to dark
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(theme).toBe("dark");

    // And: aria-pressed should be true again
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  test("theme preference persists across page reload", async ({
    page,
    gotoApp,
  }) => {
    // Given: the user switches from dark to light
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoApp();

    await page.locator("#themeToggle").click();

    // Verify localStorage was written
    const storedBefore = await page.evaluate(() =>
      localStorage.getItem("bitvid:theme"),
    );
    expect(storedBefore).toBe("light");

    // When: the page reloads
    await page.reload();

    // Wait for theme controller to initialize
    await page.waitForFunction(
      () => document.documentElement.getAttribute("data-theme") !== null,
      { timeout: 10000 },
    );

    // Then: the theme should still be light (localStorage overrides system pref)
    const themeAfterReload = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(themeAfterReload).toBe("light");
  });

  test("icon state attribute updates with theme", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded with dark preference
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoApp();

    // Then: the icon should show dark state
    const iconWrapper = page.locator("[data-theme-toggle-icon]");
    await expect(iconWrapper).toHaveAttribute("data-theme-icon-state", "dark");

    // When: user toggles to light
    await page.locator("#themeToggle").click();

    // Then: the icon state should update to light
    await expect(iconWrapper).toHaveAttribute("data-theme-icon-state", "light");
  });

  test("stored theme overrides system preference", async ({
    page,
    gotoApp,
  }) => {
    // Given: the system prefers dark but localStorage has "light"
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => {
      localStorage.setItem("bitvid:theme", "light");
    });

    // When: the app loads
    await gotoApp();

    // Then: the stored preference wins over system preference
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(theme).toBe("light");
  });
});
