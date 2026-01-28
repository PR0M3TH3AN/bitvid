import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import {
  applyReducedMotion,
  failOnConsoleErrors,
} from "../../../tests/e2e/helpers/uiTestUtils";

async function getPanelMetrics(locator: Locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
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
      viewport: { width: viewportWidth, height: viewportHeight },
      placement: node.dataset.popoverPlacement || "",
      state: node.dataset.popoverState || "",
      popoverMaxWidth,
      tokenMaxWidth: tokenValue,
    };
  });
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

test.describe("popover layout scenarios (repro)", () => {
  test.beforeEach(async ({ page }) => {
    await applyReducedMotion(page);
    failOnConsoleErrors(page);
    await page.goto("/docs/popover-scenarios.html", { waitUntil: "networkidle" });
  });

  // UN-SKIPPED TEST
  test("keeps the bottom-right grid menu inside the viewport", async ({ page }) => {
    // Force a tall body to ensure there is space for the popover to flip to the top
    await page.addStyleTag({ content: "body { min-height: 2000px !important; }" });
    // Reduce viewport height to force the menu to flip to the top
    await page.setViewportSize({ width: 1280, height: 250 });

    const trigger = page.locator('[data-test-trigger="grid-bottom-right"]');
    // Scroll to bottom to ensure the element is near the viewport edge
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    await trigger.click();
    const panel = page.locator('[data-test-panel="grid-bottom-right"]');
    await expect(panel).toHaveAttribute("data-popover-state", "open");

    const metrics = await getPanelMetrics(panel);

    assertWithinViewport(metrics);
    expect(metrics.state).toBe("open");
    expect(metrics.placement.startsWith("top"), `Expected placement to start with 'top' but got '${metrics.placement}'`).toBeTruthy();
    expect(metrics.popoverMaxWidth).toBe(metrics.tokenMaxWidth);
    expect(metrics.tokenMaxWidth.length).toBeGreaterThan(0);
  });
});
