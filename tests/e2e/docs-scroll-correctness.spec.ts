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

<style>
  .test-spacer { height: 5000px; border: 1px solid red; }
</style>

<h2 id="section-1">Section 1</h2>

<div class="test-spacer">
Content for section 1...
</div>

<h2 id="section-2">Section 2</h2>

<div class="test-spacer">
Content for section 2...
</div>

<h2 id="section-3">Section 3</h2>

<div class="test-spacer">
Content for section 3...
</div>
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
    // We want Section 2 to be clearly above the 96px offset.
    // Scrolling it to the very top (0px) ensures it is < 96px.
    await page.evaluate(() => {
        const s2 = document.getElementById('section-2');
        s2.scrollIntoView({ block: 'start' });
        // Force a tiny scroll to kick the observer
        window.scrollBy(0, 1);

        const rect = s2.getBoundingClientRect();
        console.log(`PAGE LOG: After scroll s2, top=${rect.top}`);
    });

    // Explicitly wait for s2 to update its status to TRUE (it is now above the fold)
    await page.waitForFunction(() => {
       const status = window.__scrollSpyState.headingStatus.get('section-2');
       return status === true;
    }, null, { timeout: 15000 }).catch(() => console.log('PAGE LOG: Timed out waiting for s2 status update (TRUE)'));

    // Debug state
    await page.evaluate(() => {
        const state = window.__scrollSpyState;
        console.log('PAGE LOG: State after s2 scroll:', JSON.stringify({
            activeId: state.activeId,
            headingStatus: Array.from(state.headingStatus.entries())
        }));
    });

    // Now Section 2 should be active
    await expect(page.locator('#link-section-2')).toHaveAttribute('data-docs-section-current', 'true');
    await expect(page.locator('#link-section-1')).not.toHaveAttribute('data-docs-section-current', 'true');

    // Scroll back up to Section 1
    await page.evaluate(() => {
        const s1 = document.getElementById('section-1');
        s1.scrollIntoView({ block: 'start' });
        // block: 'start' puts s1 at top=0.
        // 0 <= 96 is True.

        const rect = s1.getBoundingClientRect();
        console.log(`PAGE LOG: After scroll s1, top=${rect.top}`);
    });

    await page.waitForTimeout(1000);

    // Debug state
    await page.evaluate(() => {
        const state = window.__scrollSpyState;
        console.log('PAGE LOG: State after s1 scroll:', JSON.stringify({
            activeId: state.activeId,
            headingStatus: Array.from(state.headingStatus.entries())
        }));
    });

    // Explicitly wait for s2 to update its status to false (it is now below the fold)
    await page.waitForFunction(() => {
       const status = window.__scrollSpyState.headingStatus.get('section-2');
       return status === false;
    }, null, { timeout: 5000 }).catch(() => console.log('PAGE LOG: Timed out waiting for s2 status update'));

    // Section 1 should be active
    await expect(page.locator('#link-section-1')).toHaveAttribute('data-docs-section-current', 'true');
    await expect(page.locator('#link-section-2')).not.toHaveAttribute('data-docs-section-current', 'true');
  });
});
