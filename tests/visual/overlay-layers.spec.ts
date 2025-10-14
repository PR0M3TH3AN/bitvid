import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __testToast?: {
      show(message: string, options?: Record<string, unknown>): unknown;
    };
  }
}

test.describe("overlay layering tokens", () => {
  test("mobile nav overlay uses nav layer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/index.html", { waitUntil: "networkidle" });

    await page.waitForSelector("#mobileMenuBtn");
    await page.click("#mobileMenuBtn");
    await page.waitForFunction(() =>
      document.body.classList.contains("sidebar-open")
    );

    const overlayState = await page.evaluate(() => {
      const overlay = document.getElementById("sidebarOverlay");
      if (!overlay) {
        throw new Error("Missing sidebar overlay");
      }
      const styles = window.getComputedStyle(overlay);
      const navLayer = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--z-overlay-nav")
        .trim();

      return {
        opacity: styles.opacity,
        pointerEvents: styles.pointerEvents,
        zIndex: styles.zIndex,
        navLayer,
      };
    });

    expect(overlayState.opacity).toBe("1");
    expect(overlayState.pointerEvents).toBe("auto");
    expect(overlayState.zIndex).toBe(overlayState.navLayer);
  });

  test("toast stack honors overlay toast layer", async ({ page }) => {
    await page.goto("/torrent/beacon.html", { waitUntil: "networkidle" });

    await page.addScriptTag({
      type: "module",
      content: `
        import { createBeaconToast } from "/torrent/ui/toastService.js";
        window.__testToast = createBeaconToast(document);
      `,
    });

    await page.waitForFunction(() => Boolean(window.__testToast));

    await page.evaluate(() => {
      window.__testToast?.show("Layer check one");
      window.__testToast?.show("Layer check two");
    });

    await page.waitForTimeout(100);

    const toastState = await page.evaluate(() => {
      const container = document.getElementById("beacon-toast-container");
      if (!container) {
        throw new Error("Missing toast container");
      }

      const toastLayer = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--z-overlay-toast")
        .trim();

      return {
        zIndex: window.getComputedStyle(container).zIndex,
        toastLayer,
        childCount: container.querySelectorAll("[data-beacon-motion]").length,
      };
    });

    expect(toastState.childCount).toBeGreaterThanOrEqual(2);
    expect(toastState.zIndex).toBe(toastState.toastLayer);
  });
});
export {};
