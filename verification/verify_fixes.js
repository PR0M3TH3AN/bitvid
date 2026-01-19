
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to the index page locally
  await page.goto('file://' + process.cwd() + '/index.html');

  // Set viewport to simulate mobile for some checks
  await page.setViewportSize({ width: 375, height: 667 });

  // Wait for Tailwind classes to be effective (loaded from CSS)
  // We can't easily wait for CSS file load in file protocol without network idle,
  // but file protocol is fast.
  await page.waitForTimeout(1000);

  // Take screenshot of mobile view (to verify search bar width fix)
  await page.screenshot({ path: 'verification/mobile-view.png' });

  // Navigate to profile modal by finding a trigger (this is harder without a full app running)
  // But we can check if the profile modal component file has the right classes by reading it?
  // No, visual verification of static HTML file is better.

  // Let's just screenshot index.html in mobile view which had the w-[calc...] fix.

  await browser.close();
})();
