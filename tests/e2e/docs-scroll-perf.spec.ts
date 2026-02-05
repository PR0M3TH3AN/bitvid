import { test, expect } from "@playwright/test";
import { waitForRAF } from "./helpers/uiTestUtils";

test.describe("Docs ScrollSpy", () => {
  test("updates active TOC section on scroll", async ({ page }) => {
    // Navigate to Getting Started docs
    await page.goto("/#view=docs&doc=getting-started");

    // Wait for content to load
    await expect(page.locator("#markdown-container h2").first()).toBeVisible();
    await waitForRAF(page);

    // Inject dummy TOC links because real TOC links are page-level and ignored by ScrollSpy
    await page.evaluate(() => {
        const container = document.createElement('div');
        container.id = "dummy-toc";
        container.innerHTML = `
            <a href="#watching-videos" data-docs-toc-item="true" id="link-watching">Watching Videos</a>
            <a href="#sharing-your-videos" data-docs-toc-item="true" id="link-sharing">Sharing Your Videos</a>
            <a href="#need-help" data-docs-toc-item="true" id="link-help">Need Help?</a>
        `;
        document.body.appendChild(container);

        // Ensure we can scroll all headings to the top
        const style = document.createElement("style");
        style.textContent = "body { padding-bottom: 1000px; }";
        document.head.appendChild(style);
    });

    // Trigger a re-render to pick up the new links and IDs
    // Navigate away and back
    await page.goto("/#view=docs&doc=overview");
    await expect(page.locator("#markdown-container h1")).toContainText("Overview"); // Verify nav
    await page.goto("/#view=docs&doc=getting-started");
    await expect(page.locator("#watching-videos")).toBeVisible(); // IDs should be present now due to fix

    const heading1 = page.locator("#watching-videos");
    const heading2 = page.locator("#sharing-your-videos");
    const heading3 = page.locator("#need-help");

    const link1 = page.locator("#link-watching");
    const link2 = page.locator("#link-sharing");
    const link3 = page.locator("#link-help");

    // Helper to check active state
    const expectActive = async (link) => {
      await expect(link).toHaveAttribute("data-docs-section-current", "true");
      await expect(link).toHaveClass(/text-text-strong/);
    };

    const expectInactive = async (link) => {
      await expect(link).not.toHaveAttribute("data-docs-section-current", "true");
    };

    // Scroll to Heading 1
    // We scroll so heading is near top.
    await page.evaluate(() => {
        const el = document.querySelector("#watching-videos");
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top - 50);
    });
    // Wait for scroll spy to update (IntersectionObserver is async)
    await page.waitForTimeout(500);

    await expectActive(link1);
    await expectInactive(link2);

    // Scroll to Heading 2
    await page.evaluate(() => {
        const el = document.querySelector("#sharing-your-videos");
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top - 80); // 80px from top ( < 96 )
    });
    await page.waitForTimeout(500);

    await expectActive(link2);
    await expectInactive(link1);
    await expectInactive(link3);

    // Scroll to Heading 3
    await page.evaluate(() => {
        const el = document.querySelector("#need-help");
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top - 50);
    });
    await page.waitForTimeout(500);

    await expectActive(link3);
    await expectInactive(link2);

    // Scroll back up to Heading 1
    await page.evaluate(() => {
        const el = document.querySelector("#watching-videos");
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top - 50);
    });
    await page.waitForTimeout(500);

    await expectActive(link1);
    await expectInactive(link3);
  });
});
