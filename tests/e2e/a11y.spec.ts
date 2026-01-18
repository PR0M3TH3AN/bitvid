import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Checks', () => {
  test('Kitchen Sink should not have any automatically detectable accessibility issues', async ({ page }) => {
    await page.goto('/docs/kitchen-sink.html');

    // Wait for content to load if necessary
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      // Exclude specific known issues if necessary (e.g. 3rd party widgets)
      // .exclude('#some-element')
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Violations found in Kitchen Sink:');
      accessibilityScanResults.violations.forEach(violation => {
        console.log(`\nRule: ${violation.id}`);
        console.log(`Description: ${violation.description}`);
        console.log(`Impact: ${violation.impact}`);
        violation.nodes.forEach(node => {
          console.log(`  Target: ${node.target}`);
          console.log(`  HTML: ${node.html}`);
          console.log(`  Failure Summary: ${node.failureSummary}`);
        });
      });
    }

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Index page should not have any automatically detectable accessibility issues', async ({ page }) => {
    await page.goto('/index.html');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Violations found in Index:');
      accessibilityScanResults.violations.forEach(violation => {
        console.log(`\nRule: ${violation.id}`);
        console.log(`Description: ${violation.description}`);
        console.log(`Impact: ${violation.impact}`);
        violation.nodes.forEach(node => {
            console.log(`  Target: ${node.target}`);
            console.log(`  HTML: ${node.html}`);
            console.log(`  Failure Summary: ${node.failureSummary}`);
        });
      });
    }

    // We might want to be lenient initially or strict. Let's start strict and see.
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
