import { test, expect } from '@playwright/test';

test.describe('Docs ScrollSpy Correctness', () => {
  test('highlights active section on scroll', async ({ page }) => {
    // Monkeypatch requestIdleCallback to ensure setupScrollSpy runs even if busy (e.g. relay connection spam)
    await page.addInitScript(() => {
      window.requestIdleCallback = (cb) => setTimeout(cb, 100);
    });

    // 1. Mock TOC
    await page.route('**/content/docs/toc.json', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              title: "Test Doc",
              slug: "test-doc",
              path: "content/docs/test-doc.md"
            }
          ]
        })
      });
    });

    // 2. Mock Markdown with delay to allow us to inject sidebar links
    let fulfillMarkdown;
    const markdownPromise = new Promise(resolve => {
      fulfillMarkdown = resolve;
    });

    await page.route('**/content/docs/test-doc.md', async route => {
      await markdownPromise;
      const markdown = `
# Main Title

Introduction text...

<h2 id="section-1">Section 1</h2>

Content for section 1...
${'\n'.repeat(50)}

<h2 id="section-2">Section 2</h2>

Content for section 2...
${'\n'.repeat(50)}

<h2 id="section-3">Section 3</h2>

Content for section 3...
${'\n'.repeat(50)}
      `;

      await route.fulfill({
        status: 200,
        contentType: 'text/markdown',
        body: markdown
      });
    });

    // 3. Navigate to docs
    await page.goto('/#view=docs&doc=test-doc');

    // 4. Wait for initial sidebar to render (which means TOC loaded)
    await page.waitForSelector('#docsTocList');

    // 5. Inject "Section Links" into the sidebar
    // These links must match the structure expected by resolveSectionLinks:
    // [data-docs-toc-item] and href="#slug" (no view=...)
    await page.evaluate(() => {
       const sidebar = document.getElementById('docsTocList');
       // Append section links
       const sections = `
         <li><a class="toc-link" data-docs-toc-item="true" href="#section-1" id="link-section-1">Section 1</a></li>
         <li><a class="toc-link" data-docs-toc-item="true" href="#section-2" id="link-section-2">Section 2</a></li>
         <li><a class="toc-link" data-docs-toc-item="true" href="#section-3" id="link-section-3">Section 3</a></li>
       `;
       sidebar.insertAdjacentHTML('beforeend', sections);
    });

    // 6. Release Markdown
    fulfillMarkdown();

    // 7. Wait for headings to appear (markdown rendered)
    await page.waitForSelector('#section-1');

    // 8. Test ScrollSpy behavior

    // Initial state: Section 1 is likely active or nothing if we are at top (Intro).
    // Intro is above Section 1.
    // Headings: Section 1 (h2), Section 2 (h2), Section 3 (h2).
    // Intro has H1 but we didn't inject link for it.
    // If we are at top (0px), Section 1 is at ~something down.
    // All headings are below 96px.
    // Logic: if all intersecting (below), default to first?
    // `headings[0]?.id` -> section-1.

    // Wait for IO to settle.
    await page.waitForTimeout(500);

    // Check if Section 1 is active (default)
    await expect(page.locator('#link-section-1')).toHaveAttribute('data-docs-section-current', 'true');
    await expect(page.locator('#link-section-2')).not.toHaveAttribute('data-docs-section-current', 'true');

    // Scroll to Section 2
    // We scroll Section 2 to be near top.
    const section2 = page.locator('#section-2');
    await section2.scrollIntoViewIfNeeded();
    // Adjust scroll to be exactly slightly below 96px or above.

    // Let's scroll so Section 2 passes the 96px mark.
    // We can evaluate scroll.
    await page.evaluate(() => {
      const s2 = document.getElementById('section-2');
      // Scroll s2 to 50px from top (above 96px line)
      window.scrollTo(0, s2.offsetTop - 50);
    });

    // Wait for IO
    await page.waitForTimeout(1000);

    // Now Section 2 should be active
    // Because Section 2 is at 50px (above 96px).
    // Section 1 is way above.
    // Section 3 is below.
    // Last non-intersecting is Section 2.
    await expect(page.locator('#link-section-2')).toHaveAttribute('data-docs-section-current', 'true');
    await expect(page.locator('#link-section-1')).not.toHaveAttribute('data-docs-section-current', 'true');

    // Scroll back up to Section 1
    await page.evaluate(() => {
      const s1 = document.getElementById('section-1');
      // Scroll s1 to 50px from top
      window.scrollTo(0, s1.offsetTop - 50);
    });

    await page.waitForTimeout(500);

    // Section 1 should be active
    await expect(page.locator('#link-section-1')).toHaveAttribute('data-docs-section-current', 'true');
    await expect(page.locator('#link-section-2')).not.toHaveAttribute('data-docs-section-current', 'true');
  });
});
