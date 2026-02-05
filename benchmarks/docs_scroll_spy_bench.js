import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const filePath = `file://${path.join(__dirname, 'docs_scroll_spy.html')}`;

  console.log(`Loading ${filePath}`);
  await page.goto(filePath);

  // --- LEGACY ---
  console.log('Running Legacy Benchmark...');
  await page.evaluate(() => window.startLegacy());

  await page.evaluate(async () => {
      return new Promise(resolve => {
          let scrollY = 0;
          let steps = 0;
          const maxSteps = 200;
          const stepSize = 200;
          function step() {
              scrollY += stepSize;
              window.scrollTo(0, scrollY);
              steps++;
              if (steps < maxSteps) {
                  requestAnimationFrame(step);
              } else {
                  resolve();
              }
          }
          step();
      });
  });

  // Wait for RAFs to flush
  await page.waitForTimeout(500);

  const legacyMetrics = await page.evaluate(() => window.getMetrics());
  console.log('Legacy Metrics:', legacyMetrics);

  await page.evaluate(() => window.stopLegacy());
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.waitForTimeout(1000);

  // --- OPTIMIZED ---
  console.log('Running Optimized Benchmark...');
  await page.evaluate(() => window.startOptimized());

  await page.evaluate(async () => {
      return new Promise(resolve => {
          let scrollY = 0;
          let steps = 0;
          const maxSteps = 200;
          const stepSize = 200;
          function step() {
              scrollY += stepSize;
              window.scrollTo(0, scrollY);
              steps++;
              if (steps < maxSteps) {
                  requestAnimationFrame(step);
              } else {
                  resolve();
              }
          }
          step();
      });
  });

   // Wait for IO to flush
  await page.waitForTimeout(500);

  const optimizedMetrics = await page.evaluate(() => window.getMetrics());
  console.log('Optimized Metrics:', optimizedMetrics);

  await browser.close();
})();
