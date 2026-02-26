import { chromium } from '@playwright/test';
import fs from 'fs';

const LOG_FILE = 'artifacts/debug_frontend.log';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];

  const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
  const log = (msg) => {
    console.log(msg);
    logStream.write(msg + '\n');
  };

  log(`[${new Date().toISOString()}] Starting debug session...`);

  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    const output = `[console:${type}] ${text}`;

    if (type === 'error') {
      log(output);
      errors.push(output);
    } else {
      // Log non-errors only to file to reduce noise, or log everything?
      // For debugging, everything is useful.
      log(output);
    }
  });

  page.on('pageerror', err => {
    const output = `[pageerror] ${err.message}\n${err.stack}`;
    log(output);
    errors.push(output);
  });

  page.on('requestfailed', request => {
    const failure = request.failure();
    const errorText = failure ? failure.errorText : 'Unknown error';
    const output = `[requestfailed] ${request.url()} - ${errorText}`;
    log(output);
    errors.push(output);
  });

  try {
    log(`Navigating to http://localhost:4173/dashboard/...`);
    await page.goto('http://localhost:4173/dashboard/', { waitUntil: 'networkidle', timeout: 10000 });
    log(`Navigation complete.`);
    // Give it a bit more time for any delayed errors
    await page.waitForTimeout(2000);
  } catch (e) {
    log(`[script:error] Navigation failed or timeout: ${e.message}`);
    errors.push(`Navigation failed: ${e.message}`);
  }

  await browser.close();
  // Don't close stream immediately as logs might still be flushing? No, synchronous write.
  await new Promise(resolve => logStream.end(resolve));

  if (errors.length > 0) {
    console.error(`\nFound ${errors.length} errors.`);
    process.exit(1);
  } else {
    console.log(`\nNo errors found.`);
    process.exit(0);
  }
})();
