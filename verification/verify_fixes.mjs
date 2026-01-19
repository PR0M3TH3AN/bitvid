
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to the index page locally
  await page.goto('file://' + process.cwd() + '/index.html');

  // Set viewport to simulate mobile for some checks
  await page.setViewportSize({ width: 375, height: 667 });

  // Wait for Tailwind classes to be effective
  await page.waitForTimeout(1000);

  // Take screenshot of mobile view (to verify search bar width fix)
  // The search bar is hidden by default, we might need to reveal it or just check layout.
  // The class was: fixed bottom-6 right-6 z-50 hidden w-[calc(100%-var(--sidebar-mobile-gutter))]
  // We can try to make it visible.
  await page.evaluate(() => {
    const el = document.getElementById('mobileSearchContainer');
    if (el) el.classList.remove('hidden');
  });

  await page.screenshot({ path: 'verification/mobile-view.png' });

  await browser.close();
})();
