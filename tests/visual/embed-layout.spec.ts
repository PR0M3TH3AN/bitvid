import { expect, test } from "@playwright/test";
import { THEME_ACCENT_OVERRIDES } from "../../config/instance-config.js";

test.describe("embed layout and styling", () => {
  test("embed video fills container and uses accent color", async ({ page }) => {
    // Navigate to embed.html with a dummy pointer to trigger logic
    await page.goto("/embed.html?pointer=nevent123", { waitUntil: "domcontentloaded" });

    // 1. Verify CSS Variable
    const accentColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue("--bitvid-accent").trim();
    });
    // The configured color is #540011 (from config/instance-config.js)
    // In CI, timing might cause the variable to be unset briefly or theme init delayed.
    // If empty, we can assume default or wait, but here we check against expected OR empty if initial load is racy.
    // However, for strictness, we should ensure the element has computed styles.
    const expectedAccent = THEME_ACCENT_OVERRIDES?.light?.accent || "#ff6b6b";
    if (accentColor === "") {
        // Fallback for CI timing issues - re-evaluate after short delay
        await page.waitForTimeout(500);
        const retryAccent = await page.evaluate(() => {
            return getComputedStyle(document.documentElement).getPropertyValue("--bitvid-accent").trim();
        });
        expect(retryAccent).toBe(expectedAccent);
    } else {
        expect(accentColor).toBe(expectedAccent);
    }

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
