import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

// Simplified helper functions extracted from tests/e2e/popover.spec.ts to reproduce the ReferenceError
// The error "ReferenceError: getPanelWithTriggerMetrics is not defined" occurs in the test context
// even though the function appears to be defined in the file.

test.describe("popover bug reproduction", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the demo page
    await page.goto("/views/dev/popover-demo.html", { waitUntil: "networkidle" });
  });

  // Re-declaration of the function, similar to how it is in the failing test file.
  // Note: The original test seems to define this function in the outer scope,
  // but something about how Playwright handles scope or compilation might be causing the issue.
  // However, the error 'ReferenceError: getPanelWithTriggerMetrics is not defined'
  // suggests it is not available when called.

  async function getPanelWithTriggerMetrics(panel: Locator, trigger: Locator) {
    const triggerHandle = await trigger.elementHandle();
    if (!triggerHandle) {
      throw new Error("Trigger element is not attached");
    }

    try {
      return await panel.evaluate((node, triggerElement) => {
        const rect = node.getBoundingClientRect();
        const triggerRect = triggerElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        return {
          rect: {
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
          triggerRect: {
            top: triggerRect.top,
            left: triggerRect.left,
            right: triggerRect.right,
            bottom: triggerRect.bottom,
            width: triggerRect.width,
            height: triggerRect.height,
          },
          viewport: { width: viewportWidth, height: viewportHeight },
          placement: node.dataset.popoverPlacement || "",
          state: node.dataset.popoverState || "",
        };
      }, triggerHandle);
    } finally {
      await triggerHandle.dispose();
    }
  }

  function assertWithinViewport(metrics: {
    rect: { top: number; left: number; right: number; bottom: number };
    viewport: { width: number; height: number };
  }) {
    const tolerance = 0.5;
    expect(metrics.rect.left).toBeGreaterThanOrEqual(-tolerance);
    expect(metrics.rect.top).toBeGreaterThanOrEqual(-tolerance);
    expect(metrics.rect.right).toBeLessThanOrEqual(metrics.viewport.width + tolerance);
    expect(metrics.rect.bottom).toBeLessThanOrEqual(metrics.viewport.height + tolerance);
  }

  test("aligns the video card menu with the trigger's right edge", async ({ page }) => {
    const trigger = page.locator("[data-demo-card-more]");
    await trigger.click();

    const panel = page.locator('[data-component="overlay-root"] [data-popover-state="open"]');
    await expect(panel).toBeVisible();

    // This is where the error happens in the original test
    const metrics = await getPanelWithTriggerMetrics(panel, trigger);

    assertWithinViewport(metrics);
    expect(metrics.state).toBe("open");
    expect(metrics.placement).toBe("bottom-end");

    const tolerance = 1.5;
    expect(Math.abs(metrics.rect.right - metrics.triggerRect.right)).toBeLessThanOrEqual(tolerance);
  });
});
