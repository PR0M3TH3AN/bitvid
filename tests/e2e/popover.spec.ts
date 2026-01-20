import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { applyReducedMotion, failOnConsoleErrors } from "./helpers/uiTestUtils";

test.describe("popover layout scenarios", () => {
  test.beforeEach(async ({ page }) => {
    await applyReducedMotion(page);
    failOnConsoleErrors(page);
    await page.goto("/docs/popover-scenarios.html", { waitUntil: "networkidle" });
  });

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

  test("keeps the bottom-right grid menu inside the viewport", async ({ page }) => {
    await page.locator('[data-test-trigger="grid-bottom-right"]').click();
    const panel = page.locator('[data-test-panel="grid-bottom-right"]');
    await expect(panel).toHaveAttribute("data-popover-state", "open");

    const metrics = await getPanelMetrics(panel);

    assertWithinViewport(metrics);
    expect(metrics.state).toBe("open");
    expect(metrics.placement.startsWith("top")).toBeTruthy();
    expect(metrics.popoverMaxWidth).toBe(metrics.tokenMaxWidth);
    expect(metrics.tokenMaxWidth.length).toBeGreaterThan(0);
  });

  test("opens the video modal menu without overflowing", async ({ page }) => {
    await page.locator('[data-test-open-modal]').click();
    await expect(page.locator('[data-test-modal]')).toBeVisible();

    await page.locator('[data-test-trigger="modal-menu"]').click();
    const panel = page.locator('[data-test-panel="modal-menu"]');
    await expect(panel).toHaveAttribute("data-popover-state", "open");

    const metrics = await getPanelMetrics(panel);

    assertWithinViewport(metrics);
    expect(metrics.state).toBe("open");
    expect(metrics.placement.includes("bottom")).toBeTruthy();
    expect(metrics.popoverMaxWidth).toBe(metrics.tokenMaxWidth);
    expect(metrics.tokenMaxWidth.length).toBeGreaterThan(0);
  });

  test("keeps scroll container menus in view after scrolling", async ({ page }) => {
    const scrollRegion = page.locator('[data-test-scroll-region]');
    await scrollRegion.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });

    await page.locator('[data-test-trigger="scroll-bottom"]').click();
    const panel = page.locator('[data-test-panel="scroll-bottom"]');
    await expect(panel).toHaveAttribute("data-popover-state", "open");

    const metrics = await getPanelMetrics(panel);

    assertWithinViewport(metrics);
    expect(metrics.state).toBe("open");
    expect(metrics.popoverMaxWidth).toBe(metrics.tokenMaxWidth);
    expect(metrics.tokenMaxWidth.length).toBeGreaterThan(0);
  });

  test("stress tests popover triggers without console errors", async ({ page }) => {
    await page.locator('[data-test-open-modal]').click();
    await expect(page.locator('[data-test-modal]')).toBeVisible();

    const triggers = [
      '[data-test-trigger="grid-bottom-right"]',
      '[data-test-trigger="modal-menu"]',
      '[data-test-trigger="scroll-bottom"]',
    ];

    for (let pass = 0; pass < 4; pass += 1) {
      const scrollRegion = page.locator('[data-test-scroll-region]');
      await scrollRegion.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });

      for (const selector of triggers) {
        await page.locator(selector).click();
        await page.waitForTimeout(60);
      }

      await page.click("body");
      await page.waitForTimeout(60);
      await expect(page.locator('[data-popover-state="open"]')).toHaveCount(0);
    }
  });
});

test.describe("popover demo alignments", () => {
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
    expect(metrics.inlineMaxWidth).toBe(metrics.tokenMaxWidth);

    const tolerance = 1.5;
    expect(Math.abs(metrics.rect.right - metrics.triggerRect.right)).toBeLessThanOrEqual(tolerance);
  });

  test("aligns the modal gear menu with the trigger's right edge", async ({ page }) => {
    await page.locator("[data-demo-open-modal]").click();
    await expect(page.locator("[data-demo-modal]"))
      .toBeVisible({ timeout: 5000 });

    const trigger = page.locator("[data-demo-modal-more]");
    await trigger.click();

    const panel = page.locator('[data-component="overlay-root"] [data-popover-state="open"]');
    await expect(panel).toBeVisible();

    const metrics = await getPanelWithTriggerMetrics(panel, trigger);

    assertWithinViewport(metrics);
    expect(metrics.state).toBe("open");
    expect(metrics.placement).toBe("bottom-end");
    expect(metrics.inlineMaxWidth).toBe(metrics.tokenMaxWidth);

    const tolerance = 1.5;
    expect(Math.abs(metrics.rect.right - metrics.triggerRect.right)).toBeLessThanOrEqual(tolerance);
  });
});
