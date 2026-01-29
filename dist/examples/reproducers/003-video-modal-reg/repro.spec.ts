import { expect, test } from "@playwright/test";

test("video modal mobile regression", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/components/video-modal.html", { waitUntil: "networkidle" });

  await page.evaluate(() => {
    const modal = document.getElementById("playerModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.removeAttribute("hidden");
      modal.setAttribute("data-ds", "new");
    }
  });

  const modal = page.locator("#playerModal");
  await expect(modal).toBeVisible();

  // Wait a bit for layout
  await page.waitForTimeout(100);

  // Check height which was failing (1561 vs 1554)
  const box = await modal.boundingBox();
  expect(box?.height).toBe(1554);
});
