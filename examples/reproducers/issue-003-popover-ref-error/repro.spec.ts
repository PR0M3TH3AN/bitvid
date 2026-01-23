import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import {
  applyReducedMotion,
  failOnConsoleErrors,
} from "../../../tests/e2e/helpers/uiTestUtils";

// Function that might be causing reference error
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
      const tokenValue = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--popover-inline-safe-max")
        .trim();
      const popoverMaxWidth = window
        .getComputedStyle(node)
        .getPropertyValue("--popover-max-width")
        .trim();

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
        popoverMaxWidth,
        tokenMaxWidth: tokenValue,
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

test.describe("popover demo alignments (reproducer)", () => {
  test.beforeEach(async ({ page }) => {
    await applyReducedMotion(page);
    failOnConsoleErrors(page);
    await page.goto("/views/dev/popover-demo.html", { waitUntil: "networkidle" });
  });

  test("aligns the video card menu with the trigger's right edge", async ({ page }) => {
    const trigger = page.locator("[data-demo-card-more]");
    await trigger.click();

    const panel = page.locator('[data-component="overlay-root"] [data-popover-state="open"]');
    await expect(panel).toBeVisible();

    const metrics = await getPanelWithTriggerMetrics(panel, trigger);

    assertWithinViewport(metrics);
    expect(metrics.state).toBe("open");
    expect(metrics.placement).toBe("bottom-end");
    expect(metrics.popoverMaxWidth).toBe(metrics.tokenMaxWidth);
    expect(metrics).toHaveProperty("popoverMaxWidth");

    const tolerance = 1.5;
    expect(Math.abs(metrics.rect.right - metrics.triggerRect.right)).toBeLessThanOrEqual(tolerance);
  });
});
