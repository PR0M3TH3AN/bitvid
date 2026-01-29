import { expect, test } from "@playwright/test";
import { THEME_ACCENT_OVERRIDES } from "../../config/instance-config.js";

test.describe("embed layout and styling", () => {
  test("embed video fills container and uses accent color", async ({ page }) => {
    // Navigate to embed.html with a dummy pointer to trigger logic
    await page.goto("/embed.html?pointer=nevent123", { waitUntil: "domcontentloaded" });

    // 1. Verify CSS Variable
    // The configured color is #540011 (from config/instance-config.js)
    const expectedAccent = THEME_ACCENT_OVERRIDES?.light?.accent || "#ff6b6b";

    // Wait for the accent color to be applied by js/embed.js
    await expect.poll(async () => {
      return page.evaluate(() => {
        return getComputedStyle(document.documentElement).getPropertyValue("--bitvid-accent").trim();
      });
    }).toBe(expectedAccent);

    // 2. Verify Video Element Styling
    const video = page.locator("#embedVideo");
    await expect(video).toBeVisible();

    const objectFit = await video.evaluate((el) => {
      return window.getComputedStyle(el).objectFit;
    });
    expect(objectFit).toBe("cover");

    const backgroundColor = await video.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // Transparent is typically rgba(0, 0, 0, 0)
    expect(backgroundColor).toMatch(/rgba\(0,\s*0,\s*0,\s*0\)|transparent/);

    // 3. Verify Logo Styling
    const logoAccent = page.locator(".bv-logo__accent");
    const fill = await logoAccent.evaluate((el) => {
      return window.getComputedStyle(el).fill;
    });

    // #540011 in rgb is rgb(84, 0, 17)
    expect(fill).toBe("rgb(84, 0, 17)");
  });
});
