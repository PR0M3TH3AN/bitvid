import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  let errorCount = 0;

  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      console.log(`CONSOLE [${type.toUpperCase()}]: ${msg.text()}`);
      if (type === 'error') errorCount++;
    }
  });

  page.on('pageerror', exception => {
    console.log(`PAGE ERROR: ${exception}`);
    errorCount++;
  });

  page.on('requestfailed', request => {
    // Check if failure() is not null before accessing errorText
    const failure = request.failure();
    const errorText = failure ? failure.errorText : 'Unknown error';
    console.log(`REQUEST FAILED: ${request.url()} - ${errorText}`);
    errorCount++;
  });

  try {
    console.log('Navigating to http://localhost:4173/dashboard/ ...');
    await page.goto('http://localhost:4173/dashboard/');
    console.log('Page loaded. Waiting 5s for any async errors...');
    await page.waitForTimeout(5000);
  } catch (e) {
    console.error('Navigation failed:', e);
    errorCount++;
  }

  await browser.close();

  if (errorCount > 0) {
    console.log(`\nFound ${errorCount} errors.`);
    process.exit(1);
  } else {
    console.log('\nNo errors found.');
    process.exit(0);
  }
})();
