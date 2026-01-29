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
  test("mobile sidebar shares desktop rail behavior", async ({ page }) => {
    // Increase timeout for this visual test which is prone to flakiness in CI
    test.setTimeout(120_000);

    await page.setViewportSize({ width: 390, height: 844 });

    // Pre-suppress the disclaimer modal to avoid race conditions with app hydration
    await page.addInitScript(() => {
      window.localStorage.setItem("hasSeenDisclaimer", "true");
    });

    await page.goto("/index.html", { waitUntil: "networkidle" });

    // Wait for initial fade-in to complete so opacity doesn't interfere with visibility checks
    await page.waitForFunction(
      () => !document.getElementById("sidebar")?.classList.contains("fade-in")
    );

    // At 768px, we still shouldn't see the mobile FAB if we are in "desktop/tablet" mode,
    // or if we are, the test logic below assumes a sidebar collapse toggle exists.
    await expect(page.locator("#mobileMenuBtn")).toHaveCount(0);

    const collapseToggle = page.locator("#sidebarCollapseToggle");

    // Ensure the toggle is visible before proceeding.
    // If this fails, the sidebar is likely hidden on tablet, which would require
    // adjusting the viewport further or fixing the CSS.
    await expect(collapseToggle).toBeVisible();

    const initialLayout = await page.evaluate(() => {
      const sidebar = document.getElementById("sidebar");
      const app = document.getElementById("app");
      if (!sidebar || !app) {
        throw new Error("Missing sidebar layout nodes");
      }

      const ensureProbeStyles = () => {
        if (document.getElementById("sidebar-width-probe-style")) {
          return;
        }
        const style = document.createElement("style");
        style.id = "sidebar-width-probe-style";
        style.textContent = `
          .sidebar-width-probe {
            position: absolute;
            visibility: hidden;
          }

          .sidebar-width-probe--collapsed {
            width: calc(var(--sidebar-width-collapsed) + var(--sidebar-content-gap));
          }

          .sidebar-width-probe--expanded {
            width: calc(var(--sidebar-width-expanded) + var(--sidebar-content-gap));
          }
        `;
        document.head.appendChild(style);
      };

      ensureProbeStyles();

      const computeMargin = (widthVar) => {
        const variant =
          widthVar === "--sidebar-width-collapsed"
            ? "sidebar-width-probe--collapsed"
            : widthVar === "--sidebar-width-expanded"
              ? "sidebar-width-probe--expanded"
              : null;
        if (!variant) {
          throw new Error(`Unsupported sidebar width variable: ${widthVar}`);
        }

        const probe = document.createElement("div");
        probe.classList.add("sidebar-width-probe", variant);
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

    // Ensure the toggle is initialized
    await expect(collapseToggle).toHaveAttribute("data-state", /.*/);
    await collapseToggle.scrollIntoViewIfNeeded();
    await collapseToggle.click({ force: true });

    await page.waitForFunction(() => {
      const sidebar = document.getElementById("sidebar");
      return (
        sidebar?.classList.contains("sidebar-expanded") &&
        !sidebar?.classList.contains("sidebar-collapsed")
      );
    });

    // Wait for sidebar transition to complete
    await page.waitForTimeout(1000);

    // Ensure the footer button is scrolled into view (especially for mobile viewports)
    await page.evaluate(() => {
      const sidebar = document.getElementById("sidebar");
      if (sidebar) {
        sidebar.scrollTop = sidebar.scrollHeight;
      }
    });

    const expandedLayout = await page.evaluate(() => {
      const sidebar = document.getElementById("sidebar");
      const app = document.getElementById("app");
      if (!sidebar || !app) {
        throw new Error("Missing sidebar layout nodes");
      }

      const ensureProbeStyles = () => {
        if (document.getElementById("sidebar-width-probe-style")) {
          return;
        }
        const style = document.createElement("style");
        style.id = "sidebar-width-probe-style";
        style.textContent = `
          .sidebar-width-probe {
            position: absolute;
            visibility: hidden;
          }

          .sidebar-width-probe--collapsed {
            width: calc(var(--sidebar-width-collapsed) + var(--sidebar-content-gap));
          }

          .sidebar-width-probe--expanded {
            width: calc(var(--sidebar-width-expanded) + var(--sidebar-content-gap));
          }
        `;
        document.head.appendChild(style);
      };

      ensureProbeStyles();

      const computeMargin = (widthVar) => {
        const variant =
          widthVar === "--sidebar-width-collapsed"
            ? "sidebar-width-probe--collapsed"
            : widthVar === "--sidebar-width-expanded"
              ? "sidebar-width-probe--expanded"
              : null;
        if (!variant) {
          throw new Error(`Unsupported sidebar width variable: ${widthVar}`);
        }

        const probe = document.createElement("div");
        probe.classList.add("sidebar-width-probe", variant);
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
