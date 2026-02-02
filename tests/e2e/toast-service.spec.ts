import { expect, test } from "@playwright/test";
import { applyReducedMotion, failOnConsoleErrors } from "./helpers/uiTestUtils";

test.describe("toast service in full DOM", () => {
  test("renders, expires, and dismisses toasts", async ({ page }) => {
    await applyReducedMotion(page);
    failOnConsoleErrors(page);
    await page.goto("/docs/kitchen-sink.html", { waitUntil: "networkidle" });

    await page.addScriptTag({
      type: "module",
      content: `
        import { createBeaconToast } from "/torrent/ui/toastService.js";
        window.__toast = createBeaconToast(document);
      `,
    });

    // Wait for module to load and initialize __toast to prevent race conditions
    await page.waitForFunction(() => (window as any).__toast);

    await page.evaluate(() => {
      window.__toast?.success("Sticky toast", { sticky: true });
      window.__toast?.info("Transient toast", { duration: 800 });
    });

    const container = page.locator("#beacon-toast-container");
    await expect(container).toBeVisible();

    const toastNodes = container.locator("div[role='status']");
    expect(await toastNodes.count()).toBeGreaterThanOrEqual(2);

    await page.waitForTimeout(900);

    await expect(container.locator("div[role='status']", { hasText: "Transient toast" }))
      .toHaveCount(0);
    await expect(container.locator("div[role='status']", { hasText: "Sticky toast" }))
      .toHaveCount(1);

    await container.locator("button.notification-dismiss").first().click();
    await expect(container.locator("div[role='status']")).toHaveCount(0);
  });
});
