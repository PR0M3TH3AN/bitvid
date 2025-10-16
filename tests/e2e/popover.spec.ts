import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

async function getPanelMetrics(locator: Locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tokenValue = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--popover-inline-safe-max")
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
      inlineMaxWidth: node.style.maxWidth,
      tokenMaxWidth: tokenValue,
    };
  });
}

async function getBoundingRect(locator: Locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
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

const RIGHT_EDGE_TOLERANCE = 1;

test.describe("popover layout scenarios", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/docs/popover-scenarios.html", { waitUntil: "networkidle" });
  });

  test("keeps the bottom-right grid menu inside the viewport", async ({ page }) => {
    await page.locator('[data-test-trigger="grid-bottom-right"]').click();
    const panel = page.locator('[data-test-panel="grid-bottom-right"]');
    await expect(panel).toHaveAttribute("data-popover-state", "open");

    const metrics = await getPanelMetrics(panel);

    assertWithinViewport(metrics);
    expect(metrics.state).toBe("open");
    expect(metrics.placement.startsWith("top")).toBeTruthy();
    expect(metrics.inlineMaxWidth).toBe(metrics.tokenMaxWidth);
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
    expect(metrics.inlineMaxWidth).toBe(metrics.tokenMaxWidth);
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
    expect(metrics.inlineMaxWidth).toBe(metrics.tokenMaxWidth);
    expect(metrics.tokenMaxWidth.length).toBeGreaterThan(0);
  });
});

test.describe("popover QA demo alignment", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/views/dev/popover-demo.html", { waitUntil: "networkidle" });
  });

  test("aligns the video-card more menu with its trigger", async ({ page }) => {
    const trigger = page.locator("[data-demo-card-more]");
    await trigger.click();

    const panel = page
      .locator('#uiOverlay [data-popover-state="open"]')
      .filter({ hasText: "Video actions" });
    await expect(panel).toHaveAttribute("data-popover-state", "open");

    const metrics = await getPanelMetrics(panel);
    assertWithinViewport(metrics);
    expect(metrics.state).toBe("open");
    expect(metrics.placement).toBe("bottom-end");

    const triggerRect = await getBoundingRect(trigger);
    const alignmentDelta = Math.abs(metrics.rect.right - triggerRect.right);
    expect(alignmentDelta).toBeLessThanOrEqual(RIGHT_EDGE_TOLERANCE);
  });

  test("aligns the modal gear menu with its trigger", async ({ page }) => {
    await page.locator("[data-demo-open-modal]").click();
    await expect(page.locator("[data-demo-modal]")).toBeVisible();

    const trigger = page.locator("[data-demo-modal-more]");
    await trigger.click();

    const panel = page
      .locator('#uiOverlay [data-popover-state="open"]')
      .filter({ hasText: "Modal actions" });
    await expect(panel).toHaveAttribute("data-popover-state", "open");

    const metrics = await getPanelMetrics(panel);
    assertWithinViewport(metrics);
    expect(metrics.state).toBe("open");
    expect(metrics.placement).toBe("bottom-end");

    const triggerRect = await getBoundingRect(trigger);
    const alignmentDelta = Math.abs(metrics.rect.right - triggerRect.right);
    expect(alignmentDelta).toBeLessThanOrEqual(RIGHT_EDGE_TOLERANCE);
  });
});
