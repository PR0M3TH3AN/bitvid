import { expect, test } from "@playwright/test";

test("mobile sidebar layout regression", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html", { waitUntil: "networkidle" });

  // Dismiss disclaimer
  await page.evaluate(() => {
    window.localStorage?.setItem("hasSeenDisclaimer", "true");
    document.getElementById("disclaimerModal")?.remove();
    document.documentElement.classList.remove("modal-open");
  });

  const toggle = page.locator("#sidebarCollapseToggle");
  await toggle.click({ force: true });

  await expect(page.locator("#sidebar")).toHaveClass(/sidebar-expanded/);

  const marginLeft = await page.evaluate(() => {
    const app = document.getElementById("app");
    return parseFloat(window.getComputedStyle(app!).marginLeft);
  });

  // It should be 0 on mobile even if expanded (overlay mode).
  expect(marginLeft).toBe(0);
});
