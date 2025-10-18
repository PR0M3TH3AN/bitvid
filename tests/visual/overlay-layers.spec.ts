import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __testToast?: {
      show(message: string, options?: Record<string, unknown>): unknown;
    };
  }
}

test.describe("overlay layering tokens", () => {
  async function dismissDisclaimerModal(page: Page) {
    const modal = page.locator("#disclaimerModal");
    if ((await modal.count()) === 0) {
      return;
    }

    await page.evaluate(() => {
      try {
        window.localStorage?.setItem("hasSeenDisclaimer", "true");
      } catch (error) {
        console.warn("Failed to persist disclaimer state", error);
      }
      document
        .querySelectorAll<HTMLElement>("#disclaimerModal")
        .forEach((node) => {
          node.classList.add("hidden");
          node.setAttribute("data-open", "false");
        });
      document.documentElement?.classList.remove("modal-open");
      document.body?.classList.remove("modal-open");
    });

    await page.waitForFunction(() =>
      Array.from(
        document.querySelectorAll("#disclaimerModal")
      ).every((modalElement) => modalElement.classList.contains("hidden"))
    );
  }

  test("mobile sidebar shares desktop rail behavior", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/index.html", { waitUntil: "networkidle" });

    await dismissDisclaimerModal(page);

    await expect(page.locator("#mobileMenuBtn")).toHaveCount(0);

    const collapseToggle = page.locator("#sidebarCollapseToggle");
    await expect(collapseToggle).toBeVisible();

    const initialLayout = await page.evaluate(() => {
      const sidebar = document.getElementById("sidebar");
      const app = document.getElementById("app");
      if (!sidebar || !app) {
        throw new Error("Missing sidebar layout nodes");
      }

      const computeMargin = (widthVar) => {
        const probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        probe.style.width = `calc(var(${widthVar}) + var(--sidebar-content-gap))`;
        document.body.appendChild(probe);
        const width = parseFloat(window.getComputedStyle(probe).width);
        probe.remove();
        return width;
      };

      const marginLeft = parseFloat(window.getComputedStyle(app).marginLeft);
      const state = sidebar.classList.contains("sidebar-expanded")
        ? "expanded"
        : sidebar.classList.contains("sidebar-collapsed")
          ? "collapsed"
          : "unknown";

      return {
        state,
        marginLeft,
        collapsedMargin: computeMargin("--sidebar-width-collapsed"),
        expandedMargin: computeMargin("--sidebar-width-expanded"),
        overlayExists: Boolean(document.getElementById("sidebarOverlay")),
      };
    });

    expect(initialLayout.overlayExists).toBe(false);
    expect(initialLayout.state).toBe("collapsed");
    expect(Math.abs(initialLayout.marginLeft - initialLayout.collapsedMargin)).toBeLessThan(0.5);

    await collapseToggle.click();

    await page.waitForFunction(() =>
      document.getElementById("sidebar")?.classList.contains("sidebar-expanded")
    );

    const expandedLayout = await page.evaluate(() => {
      const sidebar = document.getElementById("sidebar");
      const app = document.getElementById("app");
      if (!sidebar || !app) {
        throw new Error("Missing sidebar layout nodes");
      }

      const computeMargin = (widthVar) => {
        const probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        probe.style.width = `calc(var(${widthVar}) + var(--sidebar-content-gap))`;
        document.body.appendChild(probe);
        const width = parseFloat(window.getComputedStyle(probe).width);
        probe.remove();
        return width;
      };

      const marginLeft = parseFloat(window.getComputedStyle(app).marginLeft);
      const state = sidebar.classList.contains("sidebar-expanded")
        ? "expanded"
        : sidebar.classList.contains("sidebar-collapsed")
          ? "collapsed"
          : "unknown";

      return {
        state,
        marginLeft,
        expectedMargin: computeMargin("--sidebar-width-expanded"),
      };
    });

    expect(expandedLayout.state).toBe("expanded");
    expect(Math.abs(expandedLayout.marginLeft - expandedLayout.expectedMargin)).toBeLessThan(0.5);

    const footerButton = page.locator("#footerDropdownButton");
    await expect(footerButton).toBeVisible();
    await footerButton.click();
    await expect(footerButton).toHaveAttribute("aria-expanded", "true");

    const dropupState = await page.evaluate(() => {
      const footerLinks = document.getElementById("footerLinksContainer");
      if (!footerLinks) {
        throw new Error("Missing footer links container");
      }
      return {
        state: footerLinks.getAttribute("data-state"),
        ariaHidden: footerLinks.getAttribute("aria-hidden"),
      };
    });

    expect(dropupState.state).toBe("expanded");
    expect(dropupState.ariaHidden).toBe("false");
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
