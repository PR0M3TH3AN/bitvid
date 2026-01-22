import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.describe("sidebar bug reproduction", () => {
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
  }

  test("mobile sidebar margin mismatch", async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/index.html", { waitUntil: "networkidle" });

    await dismissDisclaimerModal(page);

    const initialLayout = await page.evaluate(() => {
      const sidebar = document.getElementById("sidebar");
      const app = document.getElementById("app");
      if (!sidebar || !app) {
        throw new Error("Missing sidebar layout nodes");
      }

      // Helper to compute expected margins from CSS variables
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
        `;
        document.head.appendChild(style);
      };

      ensureProbeStyles();

      const computeMargin = () => {
        const probe = document.createElement("div");
        probe.classList.add("sidebar-width-probe", "sidebar-width-probe--collapsed");
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
        collapsedMargin: computeMargin(),
      };
    });

    // Verify initial state
    expect(initialLayout.state).toBe("collapsed");

    // This expectation fails in the current codebase
    // There is a mismatch between the actual margin and the calculated margin from CSS variables
    expect(Math.abs(initialLayout.marginLeft - initialLayout.collapsedMargin)).toBeLessThan(0.5);
  });
});
