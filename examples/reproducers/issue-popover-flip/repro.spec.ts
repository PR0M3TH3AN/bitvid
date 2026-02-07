import { expect, test } from "@playwright/test";
import {
  getPanelMetrics,
  getPanelWithTriggerMetrics,
} from "../../../tests/e2e/helpers/popoverUtils";
import {
  applyReducedMotion,
  ensureTestAssets,
  failOnConsoleErrors,
  waitForRAF,
} from "../../../tests/e2e/helpers/uiTestUtils";

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

test.describe("popover layout scenarios", () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestAssets(page);
    await applyReducedMotion(page);
    failOnConsoleErrors(page);
    await page.goto("/docs/popover-scenarios.html", { waitUntil: "networkidle" });
  });

  // flaky: Popover fails to flip to top in restricted viewport (floating-ui issue?)
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
